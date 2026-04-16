/**
 * Prisma seed — explicit local demo data for Lead Gen.
 * Run: `npm run db:seed` (after `npm run db:push` and `.env` with DATABASE_URL).
 */
import { seedLeadGenDemoDataIfEmpty } from '../lib/lead-generation/seed-db';

async function main() {
  const r = await seedLeadGenDemoDataIfEmpty();
  // eslint-disable-next-line no-console
  console.log(
    `Lead Gen demo seed: upserted ${r.seededMarkets} market(s); created ${r.seededAccounts} demo account(s).`,
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
