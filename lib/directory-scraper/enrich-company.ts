import { randomUUID } from 'crypto';
import type { CancelSignal } from './extract-directory-entries';
import type { Page } from 'playwright';
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

async function extractCompanyWebsiteFromDetail(page: Page, detailUrl: string): Promise<string> {
  try {
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

  const result: CompanyResult = {
    id: existingId ?? randomUUID(),
    companyName: entry.name,
    directoryListingUrl: entry.url,
    companyWebsite: '',
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
    if (entry.detailUrl) {
      result.companyWebsite = await extractCompanyWebsiteFromDetail(page, entry.detailUrl);
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
