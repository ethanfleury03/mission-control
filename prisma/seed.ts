/**
 * Prisma seed — explicit local demo data for Lead Gen and Geo Intelligence.
 * Run: `npm run db:push && npm run db:seed`
 */
import { seedLeadGenDemoDataIfEmpty } from '../lib/lead-generation/seed-db';
import { seedGeoDemoData } from '../lib/geo-intelligence/seed-db';

async function main() {
  const [leadGen, geo] = await Promise.all([seedLeadGenDemoDataIfEmpty(), seedGeoDemoData()]);
  // eslint-disable-next-line no-console
  console.log(
    `Lead Gen demo seed: upserted ${leadGen.seededMarkets} market(s); created ${leadGen.seededAccounts} demo account(s).`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `Geo demo seed: created ${geo.seededDealers} dealer(s), ${geo.seededContacts} mock contact snapshot(s) (${geo.mappableRecords} mappable / ${geo.unmappableRecords} unmappable).`,
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
