const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { generateToken, generateVoucherCode } = require('../utils/tokens');
const { calcFee, voucherExpiryFrom, structureDeadlineFrom } = require('../utils/pricing');
const email = require('../services/email');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/proposals
// Crea una nuova proposta di regalo (form "Crea il tuo regalo" del sito).
// ---------------------------------------------------------------------------
const createProposalSchema = z.object({
  amount: z.number().positive(),
  occasion: z.string().optional(),
  eventDate: z.string().datetime().optional(), // ISO string dal <input type="date">
  description: z.string().optional(),
  message: z.string().optional(),
  senderName: z.string().min(1),
  senderEmail: z.string().email(),
  recipientEmail: z.string().email().optional().or(z.literal('')),
  structureEmail: z.string().email(),
  structureName: z.string().optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const data = createProposalSchema.parse(req.body);

    // Trova la struttura per email, oppure la crea al volo: chiunque può
    // essere proposto, anche una struttura non ancora partner (come da flusso).
    let structure = await prisma.structure.findFirst({ where: { email: data.structureEmail } });
    if (!structure) {
      structure = await prisma.structure.create({
        data: { email: data.structureEmail, name: data.structureName || data.structureEmail },
      });
    }

    const now = new Date();
    const proposal = await prisma.proposal.create({
      data: {
        amount: data.amount,
        occasion: data.occasion,
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
        description: data.description,
        message: data.message,
        senderName: data.senderName,
        senderEmail: data.senderEmail,
        recipientEmail: data.recipientEmail || null, // vuoto = regalo per se stessi
        structureId: structure.id,
        structureToken: generateToken(),
        structureTokenExpires: structureDeadlineFrom(now),
        senderToken: generateToken(),
      },
      include: { structure: true },
    });

    await email.sendStructureNotification(proposal);
    await email.sendSenderTrackingLink(proposal);

    res.status(201).json({
      id: proposal.id,
      trackingUrl: `/stato/${proposal.senderToken}`,
      status: proposal.status,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/proposals/track/:senderToken
// Il privato segue lo stato della propria richiesta (nessun login).
// ---------------------------------------------------------------------------
router.get('/track/:senderToken', async (req, res, next) => {
  try {
    const proposal = await prisma.proposal.findUnique({
      where: { senderToken: req.params.senderToken },
      include: { structure: true, voucher: true },
    });
    if (!proposal) return res.status(404).json({ error: 'Richiesta non trovata' });
    res.json(proposal);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/proposals/respond/:structureToken
// La struttura apre il link rapido e vede i dettagli della proposta.
// ---------------------------------------------------------------------------
router.get('/respond/:structureToken', async (req, res, next) => {
  try {
    const proposal = await prisma.proposal.findUnique({
      where: { structureToken: req.params.structureToken },
      include: { structure: true },
    });
    if (!proposal) return res.status(404).json({ error: 'Proposta non trovata o scaduta' });
    if (proposal.status !== 'PENDING') {
      return res.status(409).json({ error: 'Questa proposta ha già ricevuto una risposta', status: proposal.status });
    }
    if (new Date() > proposal.structureTokenExpires) {
      await prisma.proposal.update({ where: { id: proposal.id }, data: { status: 'EXPIRED' } });
      return res.status(410).json({ error: 'Il termine di 48 ore per rispondere è scaduto' });
    }
    res.json(proposal);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/proposals/respond/:structureToken
// La struttura accetta, modifica o rifiuta — senza login, tramite il token.
// ---------------------------------------------------------------------------
const respondSchema = z.object({
  action: z.enum(['accept', 'modify', 'decline']),
  finalAmount: z.number().positive().optional(),
  note: z.string().optional(),
});

router.post('/respond/:structureToken', async (req, res, next) => {
  try {
    const body = respondSchema.parse(req.body);
    const proposal = await prisma.proposal.findUnique({
      where: { structureToken: req.params.structureToken },
      include: { structure: true },
    });
    if (!proposal) return res.status(404).json({ error: 'Proposta non trovata' });
    if (proposal.status !== 'PENDING') {
      return res.status(409).json({ error: 'Proposta già gestita' });
    }

    if (body.action === 'decline') {
      const updated = await prisma.proposal.update({
        where: { id: proposal.id },
        data: { status: 'DECLINED', structureNote: body.note, respondedAt: new Date() },
        include: { structure: true },
      });
      await email.sendDeclineNotice(updated);
      return res.json({ status: 'DECLINED' });
    }

    if (body.action === 'modify') {
      if (!body.finalAmount) return res.status(400).json({ error: 'finalAmount richiesto per una modifica' });
      const updated = await prisma.proposal.update({
        where: { id: proposal.id },
        data: { status: 'MODIFIED', finalAmount: body.finalAmount, structureNote: body.note, respondedAt: new Date() },
        include: { structure: true },
      });
      await email.sendModificationNotice(updated);
      return res.json({ status: 'MODIFIED' });
    }

    // action === 'accept'
    const finalAmount = body.finalAmount || proposal.amount;
    const result = await acceptAndIssueVoucher(proposal.id, finalAmount);
    res.json({ status: 'ACCEPTED', voucherCode: result.voucher.code });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/proposals/accept-modification/:senderToken
// Il privato accetta la controproposta della struttura ("RISISTEMARE" -> ok).
// ---------------------------------------------------------------------------
router.post('/accept-modification/:senderToken', async (req, res, next) => {
  try {
    const proposal = await prisma.proposal.findUnique({ where: { senderToken: req.params.senderToken } });
    if (!proposal) return res.status(404).json({ error: 'Richiesta non trovata' });
    if (proposal.status !== 'MODIFIED') return res.status(409).json({ error: 'Nessuna modifica da confermare' });

    const result = await acceptAndIssueVoucher(proposal.id, proposal.finalAmount);
    res.json({ status: 'ACCEPTED', voucherCode: result.voucher.code });
  } catch (err) {
    next(err);
  }
});

// Funzione condivisa: conferma la proposta ed emette il buono con fee calcolata.
async function acceptAndIssueVoucher(proposalId, finalAmount) {
  const proposal = await prisma.proposal.update({
    where: { id: proposalId },
    data: { status: 'ACCEPTED', finalAmount, respondedAt: new Date() },
    include: { structure: true },
  });

  const now = new Date();
  const voucher = await prisma.voucher.create({
    data: {
      code: generateVoucherCode(),
      recipientToken: generateToken(),
      proposalId: proposal.id,
      issuedAt: now,
      expiresAt: voucherExpiryFrom(now),
      feeAmount: calcFee(finalAmount), // 3%, nessun minimo
    },
  });

  const isSelfGift = !proposal.recipientEmail;
  await email.sendVoucherToRecipient(voucher, proposal, isSelfGift);

  return { proposal, voucher };
}

module.exports = router;
