/** HubSpot CRM API — server-side only. */

export function hubspotAccessToken(): string | null {
  const t = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  return t || null;
}

export function hubspotPortalId(): string | null {
  return process.env.HUBSPOT_PORTAL_ID?.trim() || null;
}

export function hubspotPushDisabled(): boolean {
  return process.env.DISABLE_HUBSPOT_PUSH === '1' || process.env.DISABLE_HUBSPOT_PUSH === 'true';
}

export function hubspotContactUrl(contactId: string): string | null {
  const portal = hubspotPortalId();
  if (!portal) return null;
  return `https://app.hubspot.com/contacts/${portal}/contact/${contactId}`;
}
