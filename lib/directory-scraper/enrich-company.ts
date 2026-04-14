import { randomUUID } from 'crypto';
import type { CancelSignal } from './extract-directory-entries';
import type { Page } from 'playwright';
import { assertPublicHttpUrl } from './validate-scrape-url';
import type { CompanyResult, DirectoryEntry } from './types';
import { extractContactFromSite } from './extract-contact-info';
import { gotoDomContentLoaded } from './navigation-timeout';
import {
  extractEmails,
  extractPhones,
  extractSocialLinksForCompany,
  normalizeDomain,
  pickBestEmail,
  scoreResult,
  sleep,
  stripSharedDirectoryListingContact,
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
    await gotoDomContentLoaded(page, detailUrl, 20_000);
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
  onLog?: (message: string) => void | Promise<void>,
): Promise<CompanyResult> {
  const log = async (message: string) => {
    if (onLog) await Promise.resolve(onLog(message));
  };

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
      await log('Step: open member/detail page for listing scrape');
      const scraped = await extractCompanyWebsiteFromDetail(page, detailUrl);
      if (scraped.trim() && !preferSerperWebsite) {
        result.companyWebsite = scraped;
      }
      await log(
        scraped.trim() && !preferSerperWebsite
          ? `Step: detail page suggested website → ${scraped.slice(0, 60)}…`
          : preferSerperWebsite
            ? 'Step: keeping Serper website (not overwriting from detail page)'
            : 'Step: no website extracted from detail page',
      );
    } else {
      await log(
        samePage && detailUrl
          ? 'Step: detail URL same as listing — loading listing once for contact scrape'
          : 'Step: load directory listing page for contact scrape',
      );
      try {
        assertPublicHttpUrl(listingUrl, 'Directory listing page');
        await gotoDomContentLoaded(page, listingUrl, 20_000);
        await sleep(400);
        await log('Step: listing page loaded');
      } catch {
        await log('Step: listing page load failed (reading tab if any)');
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

    const sanitized = stripSharedDirectoryListingContact(listingUrl, result.companyWebsite, {
      email: result.email,
      phone: result.phone,
      address: result.address,
      socialLinks: result.socialLinks,
      notes: result.notes,
    });
    if (sanitized.stripped) {
      result.email = sanitized.email;
      result.phone = sanitized.phone;
      result.address = sanitized.address;
      result.socialLinks = sanitized.socialLinks;
      result.notes = sanitized.notes;
      await log(
        'Step: cleared likely directory-wide phone/email/social (company site host ≠ listing host)',
      );
    }

    const listingHadEmail = !!result.email;
    const listingHadPhone = !!result.phone;

    if (visitWebsite && result.companyWebsite && !(await Promise.resolve(signal()))) {
      assertPublicHttpUrl(result.companyWebsite, 'Company website');
      const companyDomain = normalizeDomain(result.companyWebsite);
      await log(`Step: crawl company website for contact (${companyDomain})`);
      const contact = await extractContactFromSite(page, result.companyWebsite, signal, companyDomain, (m) =>
        log(m),
      );
      if (contact.emails.length) {
        const merged = pickBestEmail([...contact.emails, result.email].filter(Boolean), companyDomain);
        result.email = merged;
      }
      if (contact.phones.length && !result.phone) result.phone = contact.phones[0];
      if (contact.addresses.length) result.address = contact.addresses[0];
      if (contact.contactPageUrls.length) result.contactPageUrl = contact.contactPageUrls[0];
      if (contact.socialLinks.length) {
        const mergedSocial = [...new Set([...contact.socialLinks])];
        result.socialLinks = extractSocialLinksForCompany(mergedSocial, companyDomain).join(', ');
      }
      result.rawContact = contact;
      await log(
        `Step: company site crawl done (email ${result.email ? 'yes' : 'no'}, phone ${result.phone ? 'yes' : 'no'})`,
      );
    } else if (visitWebsite && !result.companyWebsite) {
      await log('Step: skip company website crawl (no website URL for this row)');
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
