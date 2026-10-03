const express = require('express');
const { z } = require('zod');
const prisma = require('../db');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/vouchers/:recipientToken
// Il destinatario apre il biglietto digitale.
// ---------------------------------------------------------------------------
router.get('/:recipientToken', async (req, res, next) => {
  try {
    const voucher = await prisma.voucher.findUnique({
      where: { recipientToken: req.params.recipientToken },
      include: { proposal: { include: { structure: true } } },
    });
    if (!voucher) return res.status(404).json({ error: 'Buono non trovato' });
    res.json(voucher);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/vouchers/:recipientToken/activate
// Il destinatario clicca ATTIVA: sceglie data, allergie/intolleranze, note.
// ---------------------------------------------------------------------------
const activateSchema = z.object({
  activationDate: z.string().datetime(),
  allergies: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/:recipientToken/activate', async (req, res, next) => {
  try {
    const body = activateSchema.parse(req.body);
    const voucher = await prisma.voucher.findUnique({ where: { recipientToken: req.params.recipientToken } });
    if (!voucher) return res.status(404).json({ error: 'Buono non trovato' });
    if (voucher.status === 'EXPIRED') return res.status(410).json({ error: 'Il buono è scaduto' });

    const updated = await prisma.voucher.update({
      where: { id: voucher.id },
      data: {
        status: 'ACTIVATED',
        activationDate: new Date(body.activationDate),
        allergies: body.allergies,
        notes: body.notes,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/vouchers/:recipientToken/redeemed-offline
// Bottone "HO GIÀ USUFRUITO DEL BUONO DIRETTAMENTE IN STRUTTURA": interrompe
// i promemoria automatici.
// ---------------------------------------------------------------------------
router.post('/:recipientToken/redeemed-offline', async (req, res, next) => {
  try {
    const voucher = await prisma.voucher.findUnique({ where: { recipientToken: req.params.recipientToken } });
    if (!voucher) return res.status(404).json({ error: 'Buono non trovato' });

    const updated = await prisma.voucher.update({
      where: { id: voucher.id },
      data: { status: 'REDEEMED_OFFLINE' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/vouchers/:code/mark-fee-paid
// Uso interno/amministrativo: segna la fee come liquidata dalla struttura.
// ---------------------------------------------------------------------------
router.post('/code/:code/mark-fee-paid', async (req, res, next) => {
  try {
    const voucher = await prisma.voucher.findUnique({ where: { code: req.params.code } });
    if (!voucher) return res.status(404).json({ error: 'Buono non trovato' });
    const updated = await prisma.voucher.update({ where: { id: voucher.id }, data: { feePaid: true } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
