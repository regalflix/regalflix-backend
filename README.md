# REGALFLIX — Backend

API che gestisce l'intero flusso REGALFLIX: proposta del privato, risposta della
struttura (accetta / modifica / rifiuta), emissione del buono, attivazione da
parte del destinatario, promemoria automatici e scadenza a 12 mesi. Include
anche gli endpoint per le campagne Corporate & Welfare.

> **Nota sulla cartella `frontend/`**: contiene la bozza grafica del sito
> (`index.html`), lo stesso file pubblicato come anteprima nella chat. Oggi è
> ancora "finto": i pulsanti dei moduli (Crea il tuo regalo, Ho un buono, ecc.)
> mostrano solo un messaggio di conferma, senza chiamare nessuna API. La
> sezione **7. Collegare il sito a queste API** più sotto spiega esattamente
> come sostituire quelle funzioni finte con delle vere chiamate al backend
> di questo progetto.

Questo backend non era ancora collegato al sito quando li abbiamo costruiti:
qui trovi il pezzo di infrastruttura mancante, più il file del sito stesso
per averli entrambi in un unico posto.

## Stack

- **Node.js + Express** — server e API REST
- **PostgreSQL + Prisma** — database e modello dati
- **Nodemailer (SMTP)** — email transazionali, compatibile con qualsiasi provider (Postmark, SendGrid, Brevo, Amazon SES...)
- **node-cron** — promemoria e scadenze automatiche

## 1. Requisiti

- Node.js 18 o superiore
- Un database PostgreSQL (anche gratuito: Render, Railway, Supabase, Neon)
- Un account su un provider di email transazionali (consigliato: **Postmark**, ottima deliverability; in alternativa Brevo o SendGrid)

## 2. Avvio in locale

```bash
cd regalflix-backend
npm install

cp .env.example .env
# apri .env e compila DATABASE_URL, le credenziali SMTP, APP_BASE_URL

npx prisma migrate dev --name init   # crea le tabelle sul database
npm run seed                         # (facoltativo) inserisce 3 strutture di esempio

npm run dev                          # avvia il server su http://localhost:3000
```

Se non compili le variabili `SMTP_*`, il server non si rompe: stampa il
contenuto delle email in console invece di inviarle davvero. Comodo per
testare il flusso end-to-end senza un provider email ancora attivo.

Verifica che sia vivo: `curl http://localhost:3000/health` → `{"ok":true}`

## 3. Struttura del progetto

```
regalflix-backend/
  prisma/
    schema.prisma       modello dati (Structure, Proposal, Voucher, Company, Employee)
    seed.js              dati di esempio
  src/
    index.js             avvio del server Express
    db.js                 client Prisma condiviso
    routes/
      proposals.js        creazione proposta, risposta struttura, tracking privato
      vouchers.js          visualizzazione/attivazione buono, fruizione offline
      corporate.js         campagne aziendali e riepilogo
    services/
      email.js             invio email + tutti i template
    jobs/
      reminders.js         scadenze 48h, promemoria a 3 mesi, scadenza buoni 12 mesi
    utils/
      tokens.js             generazione magic link e codice buono
      pricing.js             calcolo fee 3% (nessun minimo) e date di scadenza
    middleware/
      errorHandler.js        gestione errori centralizzata
```

## 4. Endpoint principali

| Metodo | Percorso | A cosa serve |
|---|---|---|
| POST | `/api/proposals` | Il privato crea una proposta di regalo |
| GET | `/api/proposals/track/:senderToken` | Il privato segue lo stato della richiesta |
| GET | `/api/proposals/respond/:structureToken` | La struttura apre il link e vede la proposta |
| POST | `/api/proposals/respond/:structureToken` | La struttura accetta / modifica / rifiuta |
| POST | `/api/proposals/accept-modification/:senderToken` | Il privato accetta la controproposta |
| GET | `/api/vouchers/:recipientToken` | Il destinatario apre il buono |
| POST | `/api/vouchers/:recipientToken/activate` | Il destinatario sceglie data e note |
| POST | `/api/vouchers/:recipientToken/redeemed-offline` | "Ho già usufruito in struttura" |
| POST | `/api/corporate/campaigns` | L'azienda registra una campagna Welfare |
| GET | `/api/corporate/campaigns/:companyId/summary` | Riepilogo dipendenti + fee da fatturare |

Tutte le richieste che accettano un body vanno inviate come JSON
(`Content-Type: application/json`).

## 5. Promemoria e scadenze automatiche

Il job `src/jobs/reminders.js` fa tre cose ogni giorno:
1. scade le proposte non risposte entro 48 ore dalla struttura;
2. invia un promemoria al destinatario quando mancano ~3 mesi alla scadenza del buono;
3. scade i buoni superati i 12 mesi.

Due modi per eseguirlo, scegline uno in produzione:

**Opzione A — Cron esterno dell'hosting (consigliata).** Su Render/Railway
puoi creare un "Cron Job" separato dal servizio web che esegue
`npm run jobs:reminders` una volta al giorno. È più economico e affidabile di
tenere un processo sempre acceso solo per questo.

**Opzione B — Cron interno al processo.** Imposta `ENABLE_INTERNAL_CRON=true`
nel `.env`: il server esegue il job da solo ogni giorno alle 8:00. Più semplice
da configurare, ma richiede che il servizio web resti sempre attivo (non va
bene con hosting che "addormentano" il processo quando non riceve traffico).

## 6. Deploy online — percorso 100% gratuito

I piani gratuiti in questo settore cambiano spesso (Heroku non ne ha più uno
utilizzabile, Railway oggi dà solo un credito una tantum). Al momento la
combinazione più stabile e davvero senza costi è questa:

**A) Database — Neon (piano gratuito permanente, no carta di credito)**
1. Crea un account su [neon.tech](https://neon.tech) e un nuovo progetto Postgres.
2. Copia la "Connection string" che ti mostra: sarà la tua `DATABASE_URL`.

**B) Server — Render (Free Web Service)**
1. Crea un account su [render.com](https://render.com), collega il repository GitHub di questo progetto.
2. Crea un nuovo **Web Service**, piano **Free**.
   - Build command: `npm install && npx prisma migrate deploy`
   - Start command: `npm start`
3. Nelle variabili d'ambiente incolla quelle di `.env.example`, con la `DATABASE_URL` di Neon del punto A.
4. Nota: il piano gratuito di Render "addormenta" il servizio dopo un periodo di inattività; la prima richiesta dopo la pausa impiega 30-60 secondi a rispondere. Va benissimo per una fase di test o un lancio piccolo; se in futuro il traffico cresce si passa a un piano a pagamento senza cambiare nulla nel codice.

**C) Email — Brevo (piano gratuito, alcune centinaia di email/giorno)**
1. Crea un account su [brevo.com](https://www.brevo.com), genera le credenziali SMTP.
2. Incollale nelle variabili `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` su Render.

**D) Job giornaliero (promemoria/scadenze) — GitHub Actions, gratuito**
Render fa pagare i "Cron Job" separati dal servizio web gratuito. La cartella
`.github/workflows/reminders.yml` di questo progetto è già pronta per farlo
girare gratis con GitHub Actions: basta mettere il progetto su un repository
GitHub e impostare gli stessi "secrets" (istruzioni dentro il file). Il job
gira da solo una volta al giorno, senza bisogno di un server sempre acceso.

Con questa combinazione il costo totale per partire è **0€**, con l'unico
compromesso dei 30-60 secondi di "risveglio" di Render dopo un'inattività.

## 6bis. Deploy online — esempio alternativo (Render con database a pagamento)

Se in futuro preferisci un database gestito direttamente da Render invece di
Neon (più comodo da amministrare in un unico posto, ma il piano gratuito di
Postgres su Render scade dopo alcune settimane):

1. Crea un account su [render.com](https://render.com) (o Railway, che è molto simile).
2. Crea un database **PostgreSQL** gestito: copia la `Internal Database URL` che ti danno.
3. Crea un nuovo **Web Service**, collegato al repository Git di questo progetto.
   - Build command: `npm install && npx prisma migrate deploy`
   - Start command: `npm start`
4. Nelle variabili d'ambiente del servizio, incolla tutte quelle di `.env.example` con i valori veri (compresa la `DATABASE_URL` copiata al punto 2).
5. Crea un secondo servizio di tipo **Cron Job** (a pagamento su Render), comando `npm run jobs:reminders`, pianificato una volta al giorno — oppure usa comunque GitHub Actions come al punto D sopra, che resta gratis.
6. Registrati su [Postmark](https://postmarkapp.com) (o Brevo/SendGrid), verifica il dominio email, copia le credenziali SMTP nelle variabili d'ambiente.

Da questo momento le API sono raggiungibili su un URL pubblico tipo
`https://regalflix-backend.onrender.com`.

## 7. Collegare il sito (la bozza grafica) a queste API

Oggi il file HTML del sito, quando premi "Invia la richiesta" nel modale
"Crea il tuo regalo", mostra solo un messaggio finto (`submitCreateGift`).
Per collegarlo davvero, sostituisci quella funzione con una vera chiamata
all'API. Esempio:

```javascript
async function submitCreateGift(evt){
  evt.preventDefault();

  const payload = {
    amount: cgSelectedValue,
    occasion: cgSelectedOccasione,
    eventDate: document.getElementById('cgEventDate').value
      ? new Date(document.getElementById('cgEventDate').value).toISOString()
      : undefined,
    description: document.getElementById('cgDesc').value,
    message: document.getElementById('cgMessage').value,
    senderName: document.getElementById('cgYourName').value,
    senderEmail: document.getElementById('cgYourEmail').value,
    recipientEmail: document.getElementById('cgRecipient').value || undefined,
    structureEmail: document.getElementById('cgStructEmail').value,
    structureName: document.getElementById('cgStructName').value || undefined,
  };

  try {
    const res = await fetch('https://TUO-DOMINIO-BACKEND/api/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Richiesta non riuscita');
    const data = await res.json();

    document.getElementById('createGiftForm').style.display = 'none';
    document.getElementById('cgSuccess').style.display = 'block';
    // volendo, salva data.trackingUrl per mostrare un link "segui la tua richiesta"
  } catch (err) {
    alert('Qualcosa è andato storto, riprova tra poco.');
  }

  return false;
}
```

La stessa logica va applicata a `submitVoucher` (nel modale legato alle
schede struttura) e a `submitRedeem` ("Ho un buono"): sostituire il finto
`setTimeout`/messaggio statico con una vera `fetch` verso l'endpoint
corrispondente.

Andranno inoltre create tre pagine sul sito (oggi non esistono, perché finora
tutto restava dentro la stessa pagina):
- `/struttura/:token` — la pagina che la struttura apre dall'email, con i tre pulsanti Accetta/Modifica/Rifiuta (chiama `GET` e poi `POST` su `/api/proposals/respond/:structureToken`)
- `/buono/:token` — la pagina del buono per il destinatario (chiama `/api/vouchers/:recipientToken`)
- `/stato/:token` — la pagina di tracking per il privato (chiama `/api/proposals/track/:senderToken`)

## 8. Cosa NON è ancora incluso (prossimi passi)

- **Pagamenti**: il documento di progetto prevede che l'esperienza si paghi
  direttamente tra privato e struttura — questo backend rispetta quella
  scelta e non maneggia mai quel pagamento. Gestisce solo la fee dovuta dalla
  struttura a REGALFLIX (`Voucher.feeAmount`), che va poi riscossa (bonifico,
  o in futuro Stripe Connect se vorrete automatizzarla).
- **Fatturazione elettronica**: i punti nel codice dove andrebbe generata la
  fattura sono segnalati con `TODO` nei commenti; l'emissione vera richiede
  un servizio esterno (es. un gestionale con API, o l'intervento manuale del
  commercialista finché i volumi sono bassi).
- **Autenticazione dell'area Corporate**: oggi la creazione di una campagna
  è un endpoint pubblico; prima di andare online va aggiunto un controllo di
  accesso (anche solo un link con token, come per le strutture).
- **Generazione del PDF/QR code del buono**: il buono oggi è un `code`
  testuale; se lo volete anche come immagine/PDF scannerizzabile serve una
  libreria di generazione QR (es. `qrcode` su npm) da aggiungere all'endpoint
  di emissione.
