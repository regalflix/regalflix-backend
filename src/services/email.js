 const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || 'no-reply@regalflix.it';
const FROM_NAME = 'REGALFLIX';
const APP_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

const LEGAL_FOOTER = `
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5dfc9;font-size:11.5px;color:#7a7666;line-height:1.6;">
    Raschetti Srls — REGALFLIX® / VANGARD®<br>
    Via Parravicini 29, 23017 Morbegno (SO), Italia<br>
    P.IVA/C.F. 01082340140 — REA SO-81343
  </div>
`;

function wrapTemplate(title, bodyHtml, ctaLabel, ctaUrl) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1c1a14;">
    <div style="background:#132A21;color:#F3ECDC;padding:24px 28px;">
      <div style="font-style:italic;font-family:Georgia,serif;font-size:22px;">REGALFLIX</div>
    </div>
    <div style="padding:28px;background:#FFFDF7;">
      <h2 style="font-family:Georgia,serif;font-weight:normal;color:#132A21;">${title}</h2>
      ${bodyHtml}
      ${ctaUrl ? `
        <div style="margin:26px 0 6px;">
          <a href="${ctaUrl}" style="display:inline-block;background:#A23B2C;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:2px;font-weight:bold;">${ctaLabel}</a>
        </div>
        <div style="font-size:11.5px;color:#7a7666;">Se il pulsante non funziona, copia questo link: ${ctaUrl}</div>
      ` : ''}
      ${LEGAL_FOOTER}
    </div>
  </div>
  `;
}

async function sendMail({ to, subject, html }) {
  if (!process.env.BREVO_API_KEY) {
    console.log('--- EMAIL (BREVO_API_KEY non configurata, solo log) ---');
    console.log('A:', to, '\nOggetto:', subject);
    console.log('-----------------------------------------------');
    return;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${errText}`);
  }
}

async function sendStructureNotification(proposal) {
  const url = `${APP_URL}/struttura/${proposal.structureToken}`;
  const html = wrapTemplate(
    'Un cliente vuole regalare un\'esperienza da voi',
    `<p>Un cliente vuole spendere <b>${proposal.amount}€</b> per: ${proposal.description || 'un\'esperienza su misura'}.</p>
     <p>Avete <b>48 ore</b> per accettare, proporre una modifica o rifiutare — senza bisogno di registrarvi.</p>`,
    'Rispondi alla proposta',
    url
  );
  await sendMail({ to: proposal.structure.email, subject: 'REGALFLIX — Nuova proposta di regalo', html });
}

async function sendSenderTrackingLink(proposal) {
  const url = `${APP_URL}/stato/${proposal.senderToken}`;
  const html = wrapTemplate(
    'Richiesta inviata!',
    `<p>Abbiamo inoltrato la tua proposta a <b>${proposal.structure.name}</b>. Ti avviseremo appena risponde (di solito entro 48 ore).</p>`,
    'Segui lo stato della richiesta',
    url
  );
  await sendMail({ to: proposal.senderEmail, subject: 'REGALFLIX — Stai seguendo la tua richiesta', html });
}

async function sendModificationNotice(proposal) {
  const url = `${APP_URL}/conferma-modifica/${proposal.senderToken}`;
  const html = wrapTemplate(
    'La struttura ha proposto una modifica',
    `<p><b>${proposal.structure.name}</b> ha risposto: "${proposal.structureNote || ''}"</p>
     <p>Nuovo importo proposto: <b>${proposal.finalAmount}€</b>.</p>`,
    'Rivedi e conferma',
    url
  );
  await sendMail({ to: proposal.senderEmail, subject: 'REGALFLIX — La struttura ha una controproposta', html });
}

async function sendDeclineNotice(proposal) {
  const html = wrapTemplate(
    'La struttura non può accettare la proposta',
    `<p><b>${proposal.structure.name}</b> non può accettare questa volta.${proposal.structureNote ? ` Motivo: "${proposal.structureNote}"` : ''}</p>
     <p>Puoi creare una nuova proposta scegliendo un'altra struttura dalla vetrina.</p>`,
    'Crea un nuovo regalo',
    `${APP_URL}/#vetrina`
  );
  await sendMail({ to: proposal.senderEmail, subject: 'REGALFLIX — Aggiornamento sulla tua proposta', html });
}

async function sendVoucherToRecipient(voucher, proposal, isSelfGift) {
  const url = `${APP_URL}/buono/${voucher.recipientToken}`;
  const title = isSelfGift ? 'Il tuo regalo è pronto!' : 'Hai ricevuto un regalo REGALFLIX!';
  const intro = isSelfGift
    ? `<p>Il regalo che hai creato per te stesso da <b>${proposal.structure.name}</b> è pronto.</p>`
    : `<p><b>${proposal.senderName}</b> ti ha regalato un'esperienza da <b>${proposal.structure.name}</b>.</p>
       ${proposal.message ? `<p style="font-style:italic;">"${proposal.message}"</p>` : ''}`;
  const html = wrapTemplate(
    title,
    `${intro}<p>Il buono è valido 12 mesi, fino al ${voucher.expiresAt.toLocaleDateString('it-IT')}.</p>`,
    'Attiva il tuo buono',
    url
  );
  await sendMail({ to: proposal.recipientEmail || proposal.senderEmail, subject: 'REGALFLIX — ' + title, html });
}

async function sendVoucherReminder(voucher, proposal, monthsLeftLabel) {
  const url = `${APP_URL}/buono/${voucher.recipientToken}`;
  const html = wrapTemplate(
    'Non dimenticare il tuo regalo!',
    `<p>Il tuo buono da <b>${proposal.structure.name}</b> è ancora da usare (${monthsLeftLabel}).</p>`,
    'Attiva ora',
    url
  );
  await sendMail({ to: proposal.recipientEmail || proposal.senderEmail, subject: 'REGALFLIX — Promemoria: il tuo buono ti aspetta', html });
}

module.exports = {
  sendMail,
  sendStructureNotification,
  sendSenderTrackingLink,
  sendModificationNotice,
  sendDeclineNotice,
  sendVoucherToRecipient,
  sendVoucherReminder,
};
