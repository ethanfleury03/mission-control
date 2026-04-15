import { prismaAccountToDomain, prismaMarketToDomain } from '@/lib/lead-generation/db-mappers';
import { seedLeadGenIfEmpty } from '@/lib/lead-generation/seed-db';
import { isEligibleForHubSpotPush, hubspotEligibilityReason } from '@/lib/lead-generation/push-eligibility';
import { mapAccountToHubSpotProperties } from '@/lib/hubspot/map-lead-to-contact';
import { hubspotPushDisabled } from '@/lib/hubspot/config';
import { createContact, patchContact, searchContactIdByEmail, searchContactIdByPhone, HubSpotApiError } from '@/lib/hubspot/client';
import { prisma } from '@/lib/prisma';
import type { Account } from '@/lib/lead-generation/types';
import type { LeadGenAccount as PrismaLeadGenAccount } from '@prisma/client';

export type PushLeadGenAccountResult =
  | { ok: true; contactId: string; account: Account }
  | { ok: false; status: number; message: string };

/**
 * Create/update HubSpot contact for a DB row. Idempotent via stored hubspotContactId, then email search, then phone search.
 */
export async function pushLeadGenAccountById(accountId: string): Promise<PushLeadGenAccountResult> {
  await seedLeadGenIfEmpty();

  if (hubspotPushDisabled()) {
    return { ok: false, status: 503, message: 'HubSpot push is disabled (DISABLE_HUBSPOT_PUSH)' };
  }

  const row = await prisma.leadGenAccount.findUnique({ where: { id: accountId } });
  if (!row) return { ok: false, status: 404, message: 'Not found' };

  const account = prismaAccountToDomain(row);
  const marketRow = await prisma.leadGenMarket.findUnique({ where: { id: row.marketId } });
  const marketCount = marketRow
    ? await prisma.leadGenAccount.count({ where: { marketId: row.marketId } })
    : 0;
  const marketDomain = marketRow ? prismaMarketToDomain(marketRow, marketCount) : null;

  if (!isEligibleForHubSpotPush(account)) {
    return { ok: false, status: 400, message: hubspotEligibilityReason(account) ?? 'Not eligible for push' };
  }

  const props = mapAccountToHubSpotProperties(account, marketDomain);

  try {
    let contactId = await resolveHubSpotContactId(row, account);

    if (contactId) {
      await patchContact(contactId, props);
    } else {
      const created = await createContact(props);
      contactId = created.id;
    }

    const updated = await prisma.leadGenAccount.update({
      where: { id: accountId },
      data: {
        hubspotContactId: contactId,
        hubspotPushedAt: new Date(),
        hubspotPushedBy: 'mission-control',
        hubspotLastPushError: '',
        leadPipelineStage: 'pushed_to_hubspot',
      },
    });

    return { ok: true, contactId, account: prismaAccountToDomain(updated) };
  } catch (e) {
    const message = e instanceof HubSpotApiError ? e.message : e instanceof Error ? e.message : String(e);
    await prisma.leadGenAccount.update({
      where: { id: accountId },
      data: {
        hubspotLastPushError: message.slice(0, 2000),
        leadPipelineStage: 'push_failed',
      },
    });
    return { ok: false, status: 502, message };
  }
}

async function resolveHubSpotContactId(row: PrismaLeadGenAccount, account: Account): Promise<string | null> {
  if (row.hubspotContactId) return row.hubspotContactId;

  const email = (account.email ?? '').trim().toLowerCase();
  if (email) {
    const byEmail = await searchContactIdByEmail(email);
    if (byEmail) return byEmail;
  }

  const phone = (account.phone ?? '').trim();
  if (phone) {
    const byPhone = await searchContactIdByPhone(phone);
    if (byPhone) return byPhone;
  }

  return null;
}
