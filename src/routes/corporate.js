const express = require('express');
const { z } = require('zod');
const prisma = require('../db');

const router = express.Router();

// Tagli ammessi per rispettare la normativa Welfare (valore unico per campagna).
const ALLOWED_TAGLI = [50, 100, 150, 200, 250, 500];

// ---------------------------------------------------------------------------
// POST /api/corporate/campaigns
// L'azienda si registra e carica la lista dei dipendenti con un taglio unico.
// ---------------------------------------------------------------------------
const createCampaignSchema = z.object({
  name: z.string().min(1),
  vatNumber: z.string().min(1),
  email: z.string().email(),
  logoUrl: z.string().url().optional(),
  taglioUnico: z.number().refine((v) => ALLOWED_TAGLI.includes(v), {
    message: `Il taglio deve essere uno tra: ${ALLOWED_TAGLI.join(', ')}`,
  }),
  employees: z.array(z.object({ email: z.string().email(), name: z.string().optional() })).min(1),
});

router.post('/campaigns', async (req, res, next) => {
  try {
    const data = createCampaignSchema.parse(req.body);

    const company = await prisma.company.create({
      data: {
        name: data.name,
        vatNumber: data.vatNumber,
        email: data.email,
        logoUrl: data.logoUrl,
        taglioUnico: data.taglioUnico,
        employees: {
          create: data.employees.map((e) => ({ email: e.email, name: e.name })),
        },
      },
      include: { employees: true },
    });

    // TODO integrazione fatturazione elettronica: qui si genera la fattura
    // cumulativa verso l'azienda per il totale (taglioUnico * numero dipendenti).
    // Vedi il commento nel README sulla fatturazione.

    res.status(201).json(company);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/corporate/campaigns/:companyId/summary
// Riepilogo per l'azienda: stato di ogni dipendente e totale fee da fatturare.
// ---------------------------------------------------------------------------
router.get('/campaigns/:companyId/summary', async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.companyId },
      include: {
        employees: {
          include: {
            proposal: { include: { voucher: true, structure: true } },
          },
        },
      },
    });
    if (!company) return res.status(404).json({ error: 'Azienda non trovata' });

    const totalFee = company.employees.reduce((sum, e) => {
      return sum + (e.proposal?.voucher?.feeAmount || 0);
    }, 0);

    res.json({ company, totalFee: Math.round(totalFee * 100) / 100 });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/corporate/employees/:employeeId/link-proposal
// Collega la proposta creata da un dipendente (con budget = taglioUnico
// dell'azienda) al proprio profilo employee, per il riepilogo aziendale.
// ---------------------------------------------------------------------------
router.post('/employees/:employeeId/link-proposal', async (req, res, next) => {
  try {
    const { proposalId } = z.object({ proposalId: z.string() }).parse(req.body);
    const employee = await prisma.employee.update({
      where: { id: req.params.employeeId },
      data: { proposalId },
    });
    res.json(employee);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
