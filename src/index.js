require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const proposalsRouter = require('./routes/proposals');
const vouchersRouter = require('./routes/vouchers');
const corporateRouter = require('./routes/corporate');
const errorHandler = require('./middleware/errorHandler');
const { runDailyJob } = require('./jobs/reminders');

const app = express();

// crossOriginResourcePolicy: di default Helmet blocca le richieste provenienti
// da altri siti (utile per proteggere immagini/file statici, ma qui le API
// DEVONO essere chiamabili dal sito REGALFLIX, che vive su un dominio diverso).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || '*', // in produzione: metti l'URL esatto del sito
  })
);
app.use(express.json());

// Limite di richieste di base, a protezione degli endpoint pubblici (form del sito).
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/proposals', proposalsRouter);
app.use('/api/vouchers', vouchersRouter);
app.use('/api/corporate', corporateRouter);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`REGALFLIX backend in ascolto sulla porta ${PORT}`);
});

// Esegue il job di promemoria/scadenze una volta al giorno, alle 8:00.
// In alternativa, su molti hosting conviene usare un vero "cron job" esterno
// che chiama `npm run jobs:reminders` invece di tenere il processo sempre attivo:
// vedi il README per l'opzione consigliata su Render/Railway.
if (process.env.ENABLE_INTERNAL_CRON === 'true') {
  cron.schedule('0 8 * * *', () => {
    runDailyJob().catch((err) => console.error('Errore nel job giornaliero:', err));
  });
}
