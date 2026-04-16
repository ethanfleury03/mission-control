export function normalizeLeadGenDomain(input: string | null | undefined): string {
  if (!input) return '';
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/^www\./, '');
  domain = domain.replace(/\/.*$/, '');
  return domain;
}

export function normalizeLeadGenCompanyName(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|gmbh|sa|srl|limited)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLeadGenCountryKey(input: string | null | undefined): string {
  return (input ?? '').trim().toLowerCase();
}

export function buildLeadGenIdentity(input: {
  name?: string | null;
  domain?: string | null;
  website?: string | null;
}) {
  const normalizedDomain = normalizeLeadGenDomain(input.domain ?? input.website);
  const normalizedName = normalizeLeadGenCompanyName(input.name);
  return { normalizedDomain, normalizedName };
}
