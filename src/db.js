const { PrismaClient } = require('@prisma/client');

// Un'unica istanza condivisa del client Prisma, come raccomandato in produzione
// per evitare di esaurire le connessioni al database.
const prisma = new PrismaClient();

module.exports = prisma;
