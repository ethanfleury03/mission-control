import type { Page } from 'playwright';
import type { ContactInfo } from './types';
import {
  extractEmails,
  extractPhones,
  extractSocialLinksForCompany,
  normalizeUrl,
  pickBestEmail,
  sleep,
} from './utils';
import type { CancelSignal } from './extract-directory-entries';

const CONTACT_PATH_HINTS = ['/contact', '/about', '/team', '/sales', '/get-in-touch', '/reach-us', '/support'];

async function extractFromPage(page: Page, companyDomain?: string): Promise<ContactInfo> {
  const text = await page.evaluate(() => document.body?.innerText ?? '');
  const html = await page.content();
  const allHrefs: string[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => (a as HTMLAnchorElement).href),
  );

  const emails = extractEmails(text, html);
  const bestEmail = pickBestEmail(emails, companyDomain);

  return {
    emails: bestEmail ? [bestEmail, ...emails.filter((e) => e !== bestEmail)] : emails,
    phones: extractPhones(text, html),
    addresses: extractAddressBlocks(text),
    contactPageUrls: findContactLinks(allHrefs, page.url()),
    socialLinks: extractSocialLinksForCompany(allHrefs, companyDomain),
  };
}

function extractAddressBlocks(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const candidates: string[] = [];
  const zipRe = /\b\d{5}(-\d{4})?\b/;
  const stateRe = /\b[A-Z]{2}\b/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (zipRe.test(line) && stateRe.test(line) && line.length < 200) {
      const block = lines.slice(Math.max(0, i - 1), i + 1).join(', ');
      candidates.push(block.trim());
    }
  }
  return [...new Set(candidates)].slice(0, 3);
}

function findContactLinks(hrefs: string[], baseUrl: string): string[] {
  const baseDomain = getDomain(baseUrl);
  return hrefs.filter((h) => {
    try {
      const u = new URL(h);
      if (getDomain(u.href) !== baseDomain) return false;
      const lower = u.pathname.toLowerCase();
      return CONTACT_PATH_HINTS.some((hint) => lower.includes(hint));
    } catch {
      return false;
    }
  }).slice(0, 5);
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function mergeContacts(a: ContactInfo, b: ContactInfo): ContactInfo {
  const emails = [...new Set([...a.emails, ...b.emails])];
  return {
    emails,
    phones: [...new Set([...a.phones, ...b.phones])],
    addresses: [...new Set([...a.addresses, ...b.addresses])],
    contactPageUrls: [...new Set([...a.contactPageUrls, ...b.contactPageUrls])],
    socialLinks: [...new Set([...a.socialLinks, ...b.socialLinks])],
  };
}

export async function extractContactFromSite(
  page: Page,
  siteUrl: string,
  signal: CancelSignal,
  companyDomain?: string,
): Promise<ContactInfo> {
  let merged: ContactInfo = { emails: [], phones: [], addresses: [], contactPageUrls: [], socialLinks: [] };

  try {
    await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await sleep(500);
    merged = mergeContacts(merged, await extractFromPage(page, companyDomain));
  } catch {
    // homepage failed; continue with whatever we have
  }

  if (await Promise.resolve(signal())) return merged;

  const contactLinks = merged.contactPageUrls.slice(0, 2);

  if (contactLinks.length === 0) {
    for (const hint of ['/contact', '/about']) {
      const candidate = normalizeUrl(hint, siteUrl);
      if (candidate && !contactLinks.includes(candidate)) contactLinks.push(candidate);
    }
  }

  for (const link of contactLinks.slice(0, 3)) {
    if (await Promise.resolve(signal())) break;
    try {
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await sleep(400);
      merged = mergeContacts(merged, await extractFromPage(page, companyDomain));
    } catch {
      // single page failure is ok
    }
  }

  const domain = companyDomain ?? getDomain(siteUrl);
  const bestEmail = pickBestEmail(merged.emails, domain);
  const socialRanked = extractSocialLinksForCompany(
    merged.socialLinks.map((s) => s),
    domain,
  );
  return {
    ...merged,
    emails: bestEmail ? [bestEmail, ...merged.emails.filter((e) => e !== bestEmail)] : merged.emails,
    socialLinks: socialRanked.length ? socialRanked : merged.socialLinks,
  };
}
