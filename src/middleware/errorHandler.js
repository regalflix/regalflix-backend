const { ZodError } = require('zod');

function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Dati non validi', details: err.errors });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Errore interno del server' });
}

module.exports = errorHandler;
