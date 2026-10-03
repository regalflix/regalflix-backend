// Commissione REGALFLIX: 3% del valore confermato del buono, SENZA minimo
// (il minimo di 5€ del documento originale è stato rimosso su richiesta).
const FEE_RATE = 0.03;

function calcFee(amount) {
  const fee = amount * FEE_RATE;
  return Math.round(fee * 100) / 100; // arrotondato ai centesimi
}

// Validità del buono: 12 mesi solari dalla data di emissione.
function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function voucherExpiryFrom(issuedAt) {
  return addMonths(issuedAt, 12);
}

// SLA della struttura: 48 ore per rispondere a una proposta.
function structureDeadlineFrom(sentAt) {
  const d = new Date(sentAt);
  d.setHours(d.getHours() + 48);
  return d;
}

module.exports = { FEE_RATE, calcFee, addMonths, voucherExpiryFrom, structureDeadlineFrom };
