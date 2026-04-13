import type { CompanyResult, ConfidenceScore } from './types';

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g;
const SOCIAL_DOMAINS = ['linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'youtube.com', 'github.com'];

const NOISE_LOCALPARTS = new Set([
  'noreply',
  'no-reply',
  'mailer-daemon',
  'postmaster',
  'webmaster',
  'donotreply',
  'do-not-reply',
  'privacy',
  'legal',
  'abuse',
  'hostmaster',
  'admin',
  'sales@marketplace',
]);

const NOISE_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'sentry.io',
  'wixpress.com',
  'w3.org',
  'schema.org',
  'googleapis.com',
  'google.com',
  'gstatic.com',
  'cloudflare.com',
  'gravatar.com',
  'facebookmail.com',
  'twitter.com',
  'linkedin.com',
  'mailchimp.com',
  'sendgrid.net',
  'hubspot.com',
  'salesforce.com',
  'zendesk.com',
  'intercom.io',
  'freshdesk.com',
]);

const GENERIC_LOCALPARTS = new Set([
  'info',
  'contact',
  'hello',
  'support',
  'sales',
  'office',
  'team',
  'enquiries',
  'inquiries',
  'help',
  'service',
  'customerservice',
  'media',
  'press',
  'marketing',
  'hr',
  'jobs',
  'careers',
  'billing',
]);

export function extractEmails(text: string, html?: string): string[] {
  const combined = `${text}\n${html ?? ''}`;
  const raw = combined.match(EMAIL_RE) ?? [];
  const cleaned = raw
    .map((e) => e.toLowerCase().trim())
    .filter((e) => {
      if (e.endsWith('.png') || e.endsWith('.jpg') || e.endsWith('.svg')) return false;
      const [local, domain] = e.split('@');
      if (!domain) return false;
      if (NOISE_EMAIL_DOMAINS.has(domain)) return false;
      const lp = local.toLowerCase();
      for (const n of NOISE_LOCALPARTS) {
        if (lp.startsWith(n)) return false;
      }
      return true;
    });
  return [...new Set(cleaned)];
}

/** Lower score = better (for sorting). */
export function emailQualityScore(email: string, companyDomain?: string): number {
  const [local, domain] = email.split('@');
  if (!domain) return 1000;
  let score = 100;
  if (GENERIC_LOCALPARTS.has(local.toLowerCase())) score += 40;
  if (companyDomain && (domain === companyDomain || domain.endsWith('.' + companyDomain))) score -= 80;
  if (NOISE_EMAIL_DOMAINS.has(domain)) score += 500;
  return score;
}

export function rankEmails(emails: string[], companyDomain?: string): string[] {
  return [...emails].sort((a, b) => emailQualityScore(a, companyDomain) - emailQualityScore(b, companyDomain));
}

export function pickBestEmail(emails: string[], companyDomain?: string): string {
  const ranked = rankEmails(emails, companyDomain);
  return ranked[0] ?? '';
}

export function extractPhones(text: string, html?: string): string[] {
  const combined = `${text}\n${html ?? ''}`;
  const telMatches: string[] = [];
  const telRe = /href=["']tel:([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = telRe.exec(combined)) !== null) {
    telMatches.push(m[1].replace(/\s/g, ''));
  }
  const regexMatches = (combined.match(PHONE_RE) ?? [])
    .map((p) => p.replace(/[\s\-().]/g, ''))
    .filter((p) => p.length >= 7 && p.length <= 16);
  const all = [...telMatches, ...regexMatches].map((p) => p.trim());
  return [...new Set(all)];
}

function isSocialHost(host: string): boolean {
  return SOCIAL_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
}

export function extractSocialLinks(urls: string[]): string[] {
  return [...new Set(
    urls.filter((u) => {
      try {
        const host = new URL(u).hostname.replace(/^www\./, '');
        return isSocialHost(host);
      } catch {
        return false;
      }
    }),
  )];
}

/**
 * Prefer social URLs that appear to belong to the company site (same handle path or linked from company domain).
 */
export function extractSocialLinksForCompany(urls: string[], companyDomain?: string): string[] {
  const social = extractSocialLinks(urls);
  if (!companyDomain || social.length === 0) return social;

  const companySlug = companyDomain.replace(/\.(com|co|io|net|org)$/i, '').split('.').pop() ?? companyDomain;
  const slug = companySlug.toLowerCase();
  const slugParts = slug.split(/[-_.]/).filter((p) => p.length >= 3);

  const scored = social.map((u) => {
    let score = 0;
    try {
      const path = new URL(u).pathname.toLowerCase();
      if (path.includes(slug)) score += 50;
      for (const part of slugParts) {
        if (part.length >= 4 && path.includes(part)) score += 12;
      }
      if (path.includes('/company/') || path.includes('/in/')) score += 5;
    } catch {
      /* ignore */
    }
    return { u, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const minScore = 8;
  const filtered = scored.filter((s) => s.score >= minScore);
  const list = (filtered.length ? filtered : scored.slice(0, 2)).map((s) => s.u);
  return [...new Set(list)];
}

export function normalizeDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

export function normalizeCompanyNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function companyDedupeKey(name: string, listingUrl: string, companyWebsite?: string): string {
  const nameKey = normalizeCompanyNameKey(name);
  const listingHost = normalizeDomain(listingUrl);
  let domainKey = '';
  if (companyWebsite) {
    try {
      domainKey = normalizeDomain(companyWebsite);
    } catch {
      /* ignore */
    }
  }
  if (domainKey && domainKey !== listingHost) {
    return `${nameKey}|site:${domainKey}`;
  }
  return `${nameKey}|dir:${listingHost}`;
}

export function normalizeUrl(raw: string, baseUrl?: string): string {
  if (!raw) return '';
  try {
    if (raw.startsWith('http')) return new URL(raw).href;
    if (baseUrl) return new URL(raw, baseUrl).href;
    return raw;
  } catch {
    return raw;
  }
}

export function emailMatchesCompanyDomain(email: string, companyDomain?: string): boolean {
  if (!companyDomain || !email) return false;
  const d = email.split('@')[1];
  if (!d) return false;
  if (d === companyDomain) return true;
  if (d.endsWith('.' + companyDomain)) return true;
  return false;
}

export function scoreResult(
  result: CompanyResult,
  opts?: { emailFromListing?: boolean; phoneFromListing?: boolean },
): { score: ConfidenceScore; reason: string; needsReview: boolean } {
  const hasEmail = !!result.email;
  const hasPhone = !!result.phone;
  const hasContactPage = !!result.contactPageUrl;
  const hasSocial = !!result.socialLinks;
  const hasWebsite = !!result.companyWebsite;
  const companyDomain = hasWebsite ? normalizeDomain(result.companyWebsite) : '';
  const emailOnCompany = hasEmail && emailMatchesCompanyDomain(result.email, companyDomain);
  const listingEmail = opts?.emailFromListing ?? false;
  const listingPhone = opts?.phoneFromListing ?? false;

  let score: ConfidenceScore = 'low';
  let reasonParts: string[] = [];

  if (hasEmail && hasPhone) {
    if (emailOnCompany) {
      score = 'high';
      reasonParts.push('Strong: email matches company website domain and phone is present');
    } else if (listingEmail && listingPhone) {
      score = 'high';
      reasonParts.push('Strong: email and phone both seen on the directory listing');
    } else {
      score = 'medium';
      reasonParts.push('Review: have email and phone but email domain does not match company site — confirm before outreach');
    }
  } else if (hasEmail && emailOnCompany) {
    score = 'high';
    reasonParts.push('Strong: email address uses the same domain as the company website');
  } else if (hasEmail && listingEmail) {
    score = 'high';
    reasonParts.push('Good: email taken from the directory or listing page');
  } else if (hasEmail) {
    score = 'medium';
    reasonParts.push('Review: email found but it is generic or not on the company domain — verify it is the right contact');
  } else if (hasPhone && hasWebsite && !listingPhone) {
    score = 'medium';
    reasonParts.push('Partial: phone on the company site; no email yet');
  } else if (hasPhone && listingPhone) {
    score = 'medium';
    reasonParts.push('Partial: phone on the listing; add email if possible');
  } else if (hasContactPage) {
    score = 'medium';
    reasonParts.push('Partial: found a contact-style page URL; may need manual follow-up');
  } else if (hasSocial) {
    score = 'low';
    reasonParts.push('Weak: only social profile links — no direct email or phone');
  } else {
    score = 'low';
    reasonParts.push('Weak: no email, phone, or contact page detected');
  }

  if (!hasWebsite && (hasEmail || hasPhone)) {
    reasonParts.push('Note: company website URL was not resolved');
  }

  const partial = !hasEmail || !hasPhone;
  const needsReview =
    score === 'low' ||
    (score === 'medium' && partial) ||
    Boolean(hasEmail && !emailOnCompany && !listingEmail && companyDomain);

  return {
    score,
    reason: reasonParts.join('. ') + '.',
    needsReview,
  };
}

export function dedupeDirectoryEntries(
  entries: { name: string; url: string; detailUrl?: string }[],
): { name: string; url: string; detailUrl?: string }[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = companyDedupeKey(e.name, e.url, undefined);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** @deprecated use dedupeDirectoryEntries */
export function dedupeCompanies(entries: { name: string; url: string }[]): { name: string; url: string }[] {
  return dedupeDirectoryEntries(entries);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
