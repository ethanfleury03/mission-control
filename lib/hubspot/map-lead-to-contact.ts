import type { Account, Market } from '@/lib/lead-generation/types';

/**
 * HubSpot CRM v3 contact properties.
 * Use these internal names in HubSpot (Settings → Properties) or change to match your portal.
 */
export const HS_PROPS = {
  missionControlAccountId: 'mission_control_account_id',
  missionControlMarket: 'mission_control_market',
  leadSourceDetail: 'lead_source_detail',
  website: 'website',
  phone: 'phone',
  company: 'company',
} as const;

export type HubSpotContactProperties = Record<string, string>;

/**
 * HubSpot often requires an email to create a net-new contact. When we only have phone+website,
 * use a deterministic placeholder so the row stays pushable; reps should replace in HubSpot.
 */
export function placeholderEmailForAccount(accountId: string): string {
  const safe = accountId.replace(/[^a-z0-9]/gi, '').slice(0, 40) || 'account';
  return `lead_${safe}@leadgen.placeholder`;
}

export function mapAccountToHubSpotProperties(account: Account, market: Market | null): HubSpotContactProperties {
  let email = (account.email ?? '').trim();
  const phone = (account.phone ?? '').trim();
  const website = (account.website ?? '').trim();
  if (!email && phone && website) {
    email = placeholderEmailForAccount(account.id);
  }

  const props: HubSpotContactProperties = {
    firstname: account.name.split(/\s+/)[0]?.slice(0, 100) || 'Unknown',
    lastname: account.name.split(/\s+/).slice(1).join(' ').slice(0, 100) || 'Lead',
    [HS_PROPS.missionControlAccountId]: account.id,
    [HS_PROPS.missionControlMarket]: market?.name ?? market?.slug ?? '',
    [HS_PROPS.leadSourceDetail]: (account.sourceUrl ?? '').slice(0, 500),
  };
  if (phone) props[HS_PROPS.phone] = phone.slice(0, 40);
  const web = website;
  if (web) props[HS_PROPS.website] = web.startsWith('http') ? web : `https://${web}`;
  if (account.name) props[HS_PROPS.company] = account.name.slice(0, 200);
  if (email) {
    props.email = email;
  }
  return props;
}
