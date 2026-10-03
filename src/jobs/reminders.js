// Job da eseguire una volta al giorno (via cron esterno o node-cron, vedi src/index.js).
// Si occupa di tre cose, esattamente come da documento di progetto:
//  1) far scadere le proposte non risposte entro 48 ore dalla struttura;
//  2) inviare un promemoria al destinatario 3 mesi prima della scadenza del buono (a 9 mesi dall'emissione);
//  3) far scadere i buoni emessi da più di 12 mesi e mai usati.

const prisma = require('../db');
const email = require('../services/email');

async function expireStalePendingProposals() {
  const now = new Date();
  const stale = await prisma.proposal.findMany({
    where: { status: 'PENDING', structureTokenExpires: { lt: now } },
    include: { structure: true },
  });

  for (const proposal of stale) {
    await prisma.proposal.update({ where: { id: proposal.id }, data: { status: 'EXPIRED' } });
    await email.sendDeclineNotice({ ...proposal, structureNote: 'Nessuna risposta entro 48 ore.' });
  }

  return stale.length;
}

async function sendUpcomingExpiryReminders() {
  const now = new Date();
  const candidates = await prisma.voucher.findMany({
    where: {
      status: { in: ['ISSUED', 'ACTIVATED'] },
      expiresAt: { gt: now },
    },
    include: { proposal: { include: { structure: true } } },
  });

  let sent = 0;
  for (const voucher of candidates) {
    const monthsToExpiry = (voucher.expiresAt - now) / (1000 * 60 * 60 * 24 * 30);
    const alreadyRemindedRecently =
      voucher.lastReminderAt && now - voucher.lastReminderAt < 1000 * 60 * 60 * 24 * 25; // non più di 1 volta/mese

    // Promemoria principale: quando mancano circa 3 mesi (buono emesso da 9 mesi).
    if (monthsToExpiry <= 3 && !alreadyRemindedRecently) {
      const label = monthsToExpiry <= 1 ? 'scade tra meno di un mese' : `scade tra circa ${Math.ceil(monthsToExpiry)} mesi`;
      await email.sendVoucherReminder(voucher, voucher.proposal, label);
      await prisma.voucher.update({
        where: { id: voucher.id },
        data: { lastReminderAt: now, remindersSent: { increment: 1 } },
      });
      sent++;
    }
  }
  return sent;
}

async function expireOldVouchers() {
  const now = new Date();
  const result = await prisma.voucher.updateMany({
    where: { status: { in: ['ISSUED', 'ACTIVATED'] }, expiresAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

async function runDailyJob() {
  const expiredProposals = await expireStalePendingProposals();
  const remindersSent = await sendUpcomingExpiryReminders();
  const expiredVouchers = await expireOldVouchers();

  console.log(
    `[reminders job] proposte scadute: ${expiredProposals} — promemoria inviati: ${remindersSent} — buoni scaduti: ${expiredVouchers}`
  );
}

module.exports = { runDailyJob };

// Permette anche di lanciarlo manualmente: `npm run jobs:reminders`
if (require.main === module) {
  runDailyJob()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
