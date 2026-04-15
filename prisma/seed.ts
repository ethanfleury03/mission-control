/**
 * Prisma seed — Lead Gen demo markets + accounts (idempotent).
 * Run: `npm run db:seed` (after `npm run db:push` and `.env` with DATABASE_URL).
 */
import { seedLeadGenIfEmpty } from '../lib/lead-generation/seed-db';

async function main() {
  const r = await seedLeadGenIfEmpty();
  // eslint-disable-next-line no-console
  console.log(
    `Lead Gen: upserted ${r.seededMarkets} demo market(s); created ${r.seededAccounts} demo account(s) (accounts only if table was empty).`,
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
