import type { CompanyResult, ConfidenceScore } from './types';

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g;
const SOCIAL_DOMAINS = ['linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'youtube.com', 'github.com'];
const NOISE_EMAILS = new Set(['noreply@', 'no-reply@', 'mailer-daemon@', 'postmaster@', 'webmaster@']);
const NOISE_EMAIL_DOMAINS = new Set(['example.com', 'sentry.io', 'wixpress.com', 'w3.org', 'schema.org', 'googleapis.com', 'google.com', 'gstatic.com', 'cloudflare.com']);

export function extractEmails(text: string, html?: string): string[] {
  const combined = `${text}\n${html ?? ''}`;
  const raw = combined.match(EMAIL_RE) ?? [];
  const cleaned = raw
    .map((e) => e.toLowerCase().trim())
    .filter((e) => {
      if (e.endsWith('.png') || e.endsWith('.jpg') || e.endsWith('.svg')) return false;
      if (NOISE_EMAILS.has(e.split('@')[0] + '@')) return false;
      const domain = e.split('@')[1];
      if (NOISE_EMAIL_DOMAINS.has(domain)) return false;
      return true;
    });
  return [...new Set(cleaned)];
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

export function extractSocialLinks(urls: string[]): string[] {
  return [...new Set(
    urls.filter((u) => {
      try {
        const host = new URL(u).hostname.replace(/^www\./, '');
        return SOCIAL_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
      } catch {
        return false;
      }
    })
  )];
}

export function normalizeDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
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

export function scoreResult(result: CompanyResult): { score: ConfidenceScore; reason: string } {
  const hasEmail = !!result.email;
  const hasPhone = !!result.phone;
  const hasContactPage = !!result.contactPageUrl;
  const hasSocial = !!result.socialLinks;
  const hasWebsite = !!result.companyWebsite;

  if (hasEmail && hasPhone) {
    return { score: 'high', reason: 'Email and phone found' };
  }
  if (hasEmail && hasWebsite) {
    return { score: 'high', reason: 'Email found on company domain' };
  }
  if (hasEmail) {
    return { score: 'high', reason: 'Email found' };
  }
  if (hasPhone && hasWebsite) {
    return { score: 'medium', reason: 'Phone found on company domain' };
  }
  if (hasContactPage || hasPhone) {
    return { score: 'medium', reason: hasPhone ? 'Phone found' : 'Contact page found' };
  }
  if (hasSocial) {
    return { score: 'low', reason: 'Social links only' };
  }
  return { score: 'low', reason: 'Minimal contact info' };
}

export function dedupeCompanies(entries: { name: string; url: string }[]): { name: string; url: string }[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.name.toLowerCase().trim()}|${normalizeDomain(e.url)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
