import { seedGeoDemoData } from '../lib/geo-intelligence/seed-db';
import { prisma } from '../lib/prisma';

async function main() {
  const result = await seedGeoDemoData();
  // eslint-disable-next-line no-console
  console.log(
    [
      'Geo local seed complete:',
      `${result.seededDealers} demo dealer(s)`,
      `${result.seededContacts} demo contact snapshot(s)`,
      `${result.mappableRecords} mappable`,
      `${result.unmappableRecords} unmappable`,
    ].join(' '),
  );
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
