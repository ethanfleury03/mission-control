import { randomUUID } from 'crypto';
import type { CancelSignal } from './extract-directory-entries';
import type { Page } from 'playwright';
import { assertPublicHttpUrl } from './validate-scrape-url';
import type { CompanyResult, DirectoryEntry } from './types';
import { extractContactFromSite } from './extract-contact-info';
import {
  extractEmails,
  extractPhones,
  extractSocialLinksForCompany,
  normalizeDomain,
  pickBestEmail,
  scoreResult,
  sleep,
} from './utils';

/** True when detail URL is the same document as the listing (shared nav → same bogus external link for every row). */
function isSamePageAsListing(detailUrl: string | undefined, listingUrl: string): boolean {
  if (!detailUrl?.trim() || !listingUrl?.trim()) return true;
  try {
    const d = new URL(detailUrl.trim());
    const l = new URL(listingUrl.trim());
    const dh = d.hostname.replace(/^www\./i, '').toLowerCase();
    const lh = l.hostname.replace(/^www\./i, '').toLowerCase();
    const dp = d.pathname.replace(/\/+$/, '') || '/';
    const lp = l.pathname.replace(/\/+$/, '') || '/';
    return dh === lh && dp === lp && d.search === l.search;
  } catch {
    return detailUrl.trim() === listingUrl.trim();
  }
}

async function extractCompanyWebsiteFromDetail(page: Page, detailUrl: string): Promise<string> {
  try {
    assertPublicHttpUrl(detailUrl, 'Directory detail page');
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await sleep(500);
    const website = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const pageHost = window.location.hostname.replace(/^www\./, '');
      for (const a of links) {
        try {
          const u = new URL(a.href);
          const host = u.hostname.replace(/^www\./, '');
          if (
            host !== pageHost &&
            !host.includes('facebook') &&
            !host.includes('twitter') &&
            !host.includes('linkedin') &&
            !host.includes('instagram') &&
            !host.includes('youtube') &&
            !host.includes('google') &&
            !host.includes('yelp') &&
            !host.includes('bbb.org') &&
            u.protocol.startsWith('http')
          ) {
            const text = (a.textContent ?? '').toLowerCase();
            const rel = (a.getAttribute('rel') ?? '').toLowerCase();
            if (
              text.includes('website') ||
              text.includes('visit') ||
              text.includes('home') ||
              rel.includes('external') ||
              a.closest('[class*="website"], [class*="link"], [class*="url"]')
            ) {
              return a.href;
            }
          }
        } catch {
          /* skip malformed urls */
        }
      }
      for (const a of links) {
        try {
          const u = new URL(a.href);
          const host = u.hostname.replace(/^www\./, '');
          if (
            host !== pageHost &&
            u.protocol.startsWith('http') &&
            !host.includes('facebook') &&
            !host.includes('twitter') &&
            !host.includes('linkedin') &&
            !host.includes('instagram') &&
            !host.includes('youtube') &&
            !host.includes('google') &&
            !host.includes('yelp') &&
            !host.includes('bbb.org') &&
            !host.includes('maps.') &&
            u.pathname === '/'
          ) {
            return a.href;
          }
        } catch {
          /* skip */
        }
      }
      return '';
    });
    return website;
  } catch {
    return '';
  }
}

export async function enrichCompany(
  page: Page,
  entry: DirectoryEntry,
  visitWebsite: boolean,
  signal: CancelSignal,
  existingId?: string,
): Promise<CompanyResult> {
  const directoryHost = normalizeDomain(entry.url);

  const existingWeb = (entry.existingCompanyWebsite ?? '').trim();
  const preferSerperWebsite = entry.websiteDiscoveryMethod === 'serper' && Boolean(existingWeb);

  const result: CompanyResult = {
    id: existingId ?? randomUUID(),
    companyName: entry.name,
    directoryListingUrl: entry.url,
    companyWebsite: existingWeb,
    contactName: '',
    email: '',
    phone: '',
    address: '',
    contactPageUrl: '',
    socialLinks: '',
    notes: '',
    confidence: 'low',
    status: 'enriching',
    needsReview: false,
  };

  try {
    const listingUrl = entry.url;
    const detailUrl = entry.detailUrl?.trim();
    const samePage = isSamePageAsListing(detailUrl, listingUrl);

    if (detailUrl && !samePage) {
      const scraped = await extractCompanyWebsiteFromDetail(page, detailUrl);
      if (scraped.trim() && !preferSerperWebsite) {
        result.companyWebsite = scraped;
      }
    } else {
      try {
        assertPublicHttpUrl(listingUrl, 'Directory listing page');
        await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await sleep(400);
      } catch {
        /* listing load failed — still try to read whatever is in the tab */
      }
    }

    if (await Promise.resolve(signal())) {
      result.status = 'done';
      return result;
    }

    let text = '';
    let html = '';
    try {
      text = await page.evaluate(() => document.body?.innerText ?? '');
      html = await page.content();
    } catch {
      /* page may have navigated */
    }

    const detailEmails = extractEmails(text, html);
    const detailPhones = extractPhones(text, html);
    const allHrefs: string[] = await page
      .evaluate(() => Array.from(document.querySelectorAll('a[href]')).map((a) => (a as HTMLAnchorElement).href))
      .catch(() => []);

    const companyDomainEarly = result.companyWebsite ? normalizeDomain(result.companyWebsite) : undefined;
    result.email = pickBestEmail(detailEmails, companyDomainEarly);
    result.phone = detailPhones[0] ?? '';
    const detailSocial = extractSocialLinksForCompany(allHrefs, directoryHost);
    result.socialLinks = detailSocial.join(', ');

    const listingHadEmail = !!result.email;
    const listingHadPhone = !!result.phone;

    if (visitWebsite && result.companyWebsite && !(await Promise.resolve(signal()))) {
      assertPublicHttpUrl(result.companyWebsite, 'Company website');
      const companyDomain = normalizeDomain(result.companyWebsite);
      const contact = await extractContactFromSite(page, result.companyWebsite, signal, companyDomain);
      if (contact.emails.length) {
        const merged = pickBestEmail([...contact.emails, result.email].filter(Boolean), companyDomain);
        result.email = merged;
      }
      if (contact.phones.length && !result.phone) result.phone = contact.phones[0];
      if (contact.addresses.length) result.address = contact.addresses[0];
      if (contact.contactPageUrls.length) result.contactPageUrl = contact.contactPageUrls[0];
      if (contact.socialLinks.length) {
        const mergedSocial = [...new Set([...detailSocial, ...contact.socialLinks])];
        result.socialLinks = extractSocialLinksForCompany(mergedSocial, companyDomain).join(', ');
      }
      result.rawContact = contact;
    }

    const scored = scoreResult(result, {
      emailFromListing: listingHadEmail,
      phoneFromListing: listingHadPhone,
    });
    result.confidence = scored.score;
    result.notes = scored.reason;
    result.needsReview = scored.needsReview;
    result.status = 'done';
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during enrichment';
    result.status = 'failed';
    result.error = message;
    result.notes = `Enrichment failed: ${message}`;
    result.needsReview = true;
  }

  return result;
}
