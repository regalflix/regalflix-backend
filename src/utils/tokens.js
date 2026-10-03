const crypto = require('crypto');

// Token lunghi e casuali per i "magic link": niente login per le strutture,
// niente password da ricordare per chi segue lo stato del proprio regalo.
function generateToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Codice breve e leggibile per il buono (da mostrare su schermo/QR),
// distinto dal token lungo usato nel link di attivazione.
function generateVoucherCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente 0/O/1/I per evitare ambiguità
  let code = 'RGX-';
  for (let i = 0; i < 7; i++) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
}

module.exports = { generateToken, generateVoucherCode };
