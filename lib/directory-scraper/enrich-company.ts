import type { Page } from 'playwright';
import type { CompanyResult, DirectoryEntry } from './types';
import { extractContactFromSite } from './extract-contact-info';
import { extractEmails, extractPhones, extractSocialLinks, normalizeUrl, scoreResult, sleep } from './utils';
import { v4 as uuid } from 'uuid';

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
          if (host !== pageHost && !host.includes('facebook') && !host.includes('twitter') &&
              !host.includes('linkedin') && !host.includes('instagram') && !host.includes('youtube') &&
              !host.includes('google') && !host.includes('yelp') && !host.includes('bbb.org') &&
              u.protocol.startsWith('http')) {
            const text = (a.textContent ?? '').toLowerCase();
            const rel = (a.getAttribute('rel') ?? '').toLowerCase();
            if (text.includes('website') || text.includes('visit') || text.includes('home') ||
                rel.includes('external') || a.closest('[class*="website"], [class*="link"], [class*="url"]')) {
              return a.href;
            }
          }
        } catch { /* skip malformed urls */ }
      }
      for (const a of links) {
        try {
          const u = new URL(a.href);
          const host = u.hostname.replace(/^www\./, '');
          if (host !== pageHost && u.protocol.startsWith('http') &&
              !host.includes('facebook') && !host.includes('twitter') &&
              !host.includes('linkedin') && !host.includes('instagram') &&
              !host.includes('youtube') && !host.includes('google') &&
              !host.includes('yelp') && !host.includes('bbb.org') &&
              !host.includes('maps.') && u.pathname === '/') {
            return a.href;
          }
        } catch { /* skip */ }
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
  signal: () => boolean,
): Promise<CompanyResult> {
  const result: CompanyResult = {
    id: uuid(),
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
  };

  try {
    // Try to find company website from directory detail page
    if (entry.detailUrl) {
      result.companyWebsite = await extractCompanyWebsiteFromDetail(page, entry.detailUrl);
    }

    if (signal()) {
      result.status = 'done';
      return result;
    }

    // Extract contact info from directory detail page itself
    let text = '';
    let html = '';
    try {
      text = await page.evaluate(() => document.body?.innerText ?? '');
      html = await page.content();
    } catch { /* page may have navigated */ }

    const detailEmails = extractEmails(text, html);
    const detailPhones = extractPhones(text, html);
    const allHrefs: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map((a) => (a as HTMLAnchorElement).href)
    ).catch(() => []);
    const detailSocial = extractSocialLinks(allHrefs);

    result.email = detailEmails[0] ?? '';
    result.phone = detailPhones[0] ?? '';
    result.socialLinks = detailSocial.join(', ');

    // If user wants enrichment and we have a company website, visit it
    if (visitWebsite && result.companyWebsite && !signal()) {
      const contact = await extractContactFromSite(page, result.companyWebsite, signal);
      if (contact.emails.length && !result.email) result.email = contact.emails[0];
      if (contact.phones.length && !result.phone) result.phone = contact.phones[0];
      if (contact.addresses.length) result.address = contact.addresses[0];
      if (contact.contactPageUrls.length) result.contactPageUrl = contact.contactPageUrls[0];
      if (contact.socialLinks.length && !result.socialLinks) {
        result.socialLinks = contact.socialLinks.join(', ');
      }
      result.rawContact = contact;
    }

    const scored = scoreResult(result);
    result.confidence = scored.score;
    result.notes = scored.reason;
    result.status = 'done';
  } catch (err: any) {
    result.status = 'failed';
    result.error = err?.message ?? 'Unknown error during enrichment';
    result.notes = `Enrichment failed: ${result.error}`;
  }

  return result;
}
