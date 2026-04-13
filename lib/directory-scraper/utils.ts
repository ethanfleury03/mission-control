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
  if (companyDomain && domain === companyDomain) score -= 80;
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

  const scored = social.map((u) => {
    let score = 0;
    try {
      const path = new URL(u).pathname.toLowerCase();
      if (path.includes(companySlug.toLowerCase())) score += 50;
      if (path.includes('/company/') || path.includes('/in/')) score += 5;
    } catch { /* ignore */ }
    return { u, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.u);
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
  return !!d && d === companyDomain;
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
      reasonParts.push('Email and phone; email on company domain');
    } else if (listingEmail && listingPhone) {
      score = 'high';
      reasonParts.push('Email and phone on directory listing');
    } else {
      score = 'medium';
      reasonParts.push('Email and phone; verify email domain');
    }
  } else if (hasEmail && emailOnCompany) {
    score = 'high';
    reasonParts.push('Email on official company domain');
  } else if (hasEmail && listingEmail) {
    score = 'high';
    reasonParts.push('Email found on directory/detail page');
  } else if (hasEmail) {
    score = 'medium';
    reasonParts.push('Email found (generic or third-party domain — verify)');
  } else if (hasPhone && hasWebsite && !listingPhone) {
    score = 'medium';
    reasonParts.push('Phone found on company site');
  } else if (hasPhone && listingPhone) {
    score = 'medium';
    reasonParts.push('Phone on listing');
  } else if (hasContactPage) {
    score = 'medium';
    reasonParts.push('Contact page URL found; limited direct contact');
  } else if (hasSocial) {
    score = 'low';
    reasonParts.push('Social profiles only');
  } else {
    score = 'low';
    reasonParts.push('No email, phone, or contact page detected');
  }

  if (!hasWebsite && (hasEmail || hasPhone)) {
    reasonParts.push('No company website resolved');
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
