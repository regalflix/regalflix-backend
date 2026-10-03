// Popola il database con qualche struttura di esempio, utile per testare
// subito il flusso in locale senza dover creare tutto a mano.
// Esegui con: npm run seed

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const structures = await Promise.all([
    prisma.structure.upsert({
      where: { id: 'seed-tenuta-san-biagio' },
      update: {},
      create: {
        id: 'seed-tenuta-san-biagio',
        name: 'Tenuta San Biagio',
        email: 'info@tenutasanbiagio.it',
        address: 'Trevi (PG)',
        category: 'ristorazione',
      },
    }),
    prisma.structure.upsert({
      where: { id: 'seed-eremo-carceri' },
      update: {},
      create: {
        id: 'seed-eremo-carceri',
        name: 'Eremo delle Carceri',
        email: 'ospitalita@eremosubasio.it',
        address: 'Assisi (PG)',
        category: 'cose-da-fare',
      },
    }),
    prisma.structure.upsert({
      where: { id: 'seed-cantina-montelago' },
      update: {},
      create: {
        id: 'seed-cantina-montelago',
        name: 'Cantina Montelago',
        email: 'booking@montelago.it',
        address: 'Radda (SI)',
        category: 'ristorazione',
      },
    }),
  ]);

  console.log(`Seed completato: ${structures.length} strutture di esempio create.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
