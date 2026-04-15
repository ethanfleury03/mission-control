import type { Account } from './types';

/** Minimum data to create a useful HubSpot contact. */
export function isEligibleForHubSpotPush(account: Account): boolean {
  const email = (account.email ?? '').trim();
  const phone = (account.phone ?? '').trim();
  const website = (account.website ?? '').trim();
  if (email) return true;
  if (phone && website) return true;
  return false;
}

export function hubspotEligibilityReason(account: Account): string | null {
  if (isEligibleForHubSpotPush(account)) return null;
  return 'Add an email, or both phone and website, before pushing to HubSpot.';
}
