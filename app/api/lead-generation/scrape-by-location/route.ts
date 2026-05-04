import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 900;

type LeadStatus = 'email_found' | 'no_email' | 'needs_review';
type DuplicateStatus = 'unique' | 'possible_duplicate' | 'duplicate';

interface ScrapeLead {
  id: string;
  business: string;
  category: string;
  city: string;
  phone: string;
  website: string;
  email: string;
  contactPage: string;
  rating: string;
  sourceQuery: string;
  confidence: number;
  status: LeadStatus;
  duplicateStatus: DuplicateStatus;
  address: string;
  notes: string;
  placeId: string;
  mapsUrl: string;
  sourceProvider: string;
}

const EMAIL_RE = /(?<![\w.+-])([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})(?![\w.+-])/gi;
const CONTACT_WORDS = ['contact', 'contact-us', 'about', 'team', 'staff', 'quote', 'appointment', 'services'];

function env(name: string, fallback = '') {
  return (process.env[name] ?? fallback).trim();
}

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function domainOf(url: string) {
  try {
    const host = new URL(normalizeUrl(url)).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D+/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function extractEmails(html: string) {
  const emails = new Set<string>();
  for (const match of html.matchAll(EMAIL_RE)) {
    const email = (match[1] ?? '').toLowerCase();
    if (!email.match(/\.(png|jpe?g|gif|webp|svg|css|js)$/i)) emails.add(email);
  }
  return [...emails].sort();
}

function firstArray(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ['data', 'results', 'businesses', 'places', 'items']) {
    const value = obj[key];
    if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = firstArray(value);
      if (nested.length) return nested;
    }
  }
  if (['business_id', 'google_id', 'place_id', 'name', 'phone_number', 'full_address'].some((key) => key in obj)) return [obj];
  return [];
}

function stringField(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function parsePlace(item: Record<string, unknown>, keyword: string, region: string): ScrapeLead {
  const business = stringField(item, ['business_name', 'name', 'title', 'display_name']);
  const category = stringField(item, ['category', 'type', 'primary_category']);
  const website = stringField(item, ['website', 'site', 'url', 'domain']);
  const placeId = stringField(item, ['place_id', 'business_id', 'google_id', 'id']);
  const address = stringField(item, ['full_address', 'address', 'formatted_address']);
  const sourceQuery = `${keyword} in ${region}`;
  const confidence = Math.min(98, Math.max(45, 55 + (website ? 10 : 0) + (placeId ? 10 : 0) + (address ? 10 : 0) + (category ? 8 : 0)));

  return {
    id: placeId || `${business}-${sourceQuery}-${Math.random().toString(36).slice(2)}`,
    business,
    category,
    city: stringField(item, ['city']),
    phone: stringField(item, ['phone', 'phone_number', 'telephone', 'formatted_phone_number']),
    website,
    email: '',
    contactPage: '',
    rating: stringField(item, ['rating', 'stars']),
    sourceQuery,
    confidence,
    status: website ? 'needs_review' : 'no_email',
    duplicateStatus: 'unique',
    address,
    notes: website ? 'Fetched from Local Business Data. Website enrichment pending.' : 'Fetched from Local Business Data. No website returned.',
    placeId,
    mapsUrl: stringField(item, ['maps_url', 'google_maps_url', 'place_link']),
    sourceProvider: 'Local Business Data',
  };
}

async function fetchPlaces(keyword: string, region: string, maxResults: number) {
  const key = env('RAPIDAPI_KEY');
  const host = env('RAPIDAPI_HOST', 'local-business-data.p.rapidapi.com');
  const endpoint = env('RAPIDAPI_ENDPOINT', '/search');
  if (!key) throw new Error('RAPIDAPI_KEY is missing on the server.');

  const url = new URL(endpoint.startsWith('http') ? endpoint : `https://${host}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`);
  url.searchParams.set('query', `${keyword} in ${region}`);
  url.searchParams.set('limit', String(maxResults));
  url.searchParams.set('language', env('RAPIDAPI_LANGUAGE', 'en'));
  url.searchParams.set('region', env('RAPIDAPI_REGION', 'us'));
  url.searchParams.set('extract_emails_and_contacts', env('RAPIDAPI_EXTRACT_EMAILS_AND_CONTACTS', 'false'));

  const response = await fetch(url, {
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': host,
      'content-type': 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 401) throw new Error('RapidAPI rejected the key. Check the server secret.');
  if (response.status === 403) throw new Error('RapidAPI returned 403 Forbidden. Subscribe the RapidAPI app to Local Business Data.');
  if (response.status === 429) throw new Error('RapidAPI returned 429 Too Many Requests. Wait for the quota to reset or reduce max results.');
  if (!response.ok) throw new Error(`RapidAPI request failed with HTTP ${response.status}.`);

  const payload = await response.json();
  return firstArray(payload).slice(0, maxResults).map((item) => parsePlace(item, keyword, region));
}

function findContactUrl(homeUrl: string, html: string) {
  const $ = cheerio.load(html);
  const candidates: string[] = [];
  $('a[href]').each((_, element) => {
    const href = String($(element).attr('href') ?? '');
    const label = `${$(element).text()} ${href}`.toLowerCase();
    if (CONTACT_WORDS.some((word) => label.includes(word))) {
      try {
        candidates.push(new URL(href, homeUrl).toString());
      } catch {
        // Ignore malformed contact links.
      }
    }
  });

  for (const path of ['/contact', '/contact-us', '/about', '/about-us', '/team', '/services']) {
    try {
      candidates.push(new URL(path, homeUrl).toString());
    } catch {
      // Ignore malformed home URLs.
    }
  }

  const homeDomain = domainOf(homeUrl);
  return [...new Set(candidates)].find((candidate) => domainOf(candidate) === homeDomain) ?? '';
}

async function enrichLead(lead: ScrapeLead): Promise<ScrapeLead> {
  const homeUrl = normalizeUrl(lead.website);
  if (!homeUrl) return { ...lead, status: 'no_email', notes: 'No website returned by Local Business Data.' };

  try {
    const homeResponse = await fetch(homeUrl, {
      headers: { 'user-agent': 'MissionControlLeadGen/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    const homeHtml = await homeResponse.text();
    const emails = new Set(extractEmails(homeHtml));
    const contactUrl = findContactUrl(homeResponse.url, homeHtml);

    if (contactUrl) {
      try {
        const contactResponse = await fetch(contactUrl, {
          headers: { 'user-agent': 'MissionControlLeadGen/1.0' },
          signal: AbortSignal.timeout(10_000),
        });
        if (contactResponse.ok) {
          extractEmails(await contactResponse.text()).forEach((email) => emails.add(email));
        }
      } catch {
        // Contact pages fail often; homepage results are still useful.
      }
    }

    const emailList = [...emails].sort();
    const email = emailList[0] ?? '';
    return {
      ...lead,
      website: homeResponse.url || lead.website,
      email,
      contactPage: contactUrl,
      status: email ? 'email_found' : 'no_email',
      confidence: Math.min(99, lead.confidence + (email ? 12 : 0) + (contactUrl ? 4 : 0)),
      notes: email
        ? `Found ${emailList.length} email${emailList.length === 1 ? '' : 's'} during website enrichment.`
        : contactUrl
          ? 'Found a likely contact page, but no visible email during shallow enrichment.'
          : 'Website opened, but no contact page or visible email was found.',
    };
  } catch {
    return {
      ...lead,
      status: 'needs_review',
      notes: 'Website enrichment failed or timed out. Lead may still be usable from Places data.',
    };
  }
}

function completeness(lead: ScrapeLead) {
  return (lead.phone ? 2 : 0) + (lead.website ? 2 : 0) + (lead.email ? 3 : 0) + (lead.rating ? 1 : 0) + (lead.address ? 1 : 0);
}

function dedupeLeads(leads: ScrapeLead[]) {
  const byKey = new Map<string, ScrapeLead>();
  const ordered = [...leads].sort((a, b) => completeness(b) - completeness(a));
  for (const lead of ordered) {
    const keys = [
      lead.placeId && `place:${lead.placeId}`,
      domainOf(lead.website) && `domain:${domainOf(lead.website)}`,
      normalizePhone(lead.phone) && `phone:${normalizePhone(lead.phone)}`,
      normalizeText(`${lead.business} ${lead.address}`) && `nameaddr:${normalizeText(`${lead.business} ${lead.address}`)}`,
    ].filter(Boolean) as string[];

    const existingKey = keys.find((key) => byKey.has(key));
    if (existingKey) {
      const existing = byKey.get(existingKey)!;
      keys.forEach((key) => byKey.set(key, { ...existing, duplicateStatus: 'possible_duplicate' }));
      continue;
    }
    keys.forEach((key) => byKey.set(key, lead));
  }

  const unique = new Map<string, ScrapeLead>();
  byKey.forEach((lead) => unique.set(lead.id, lead));
  return [...unique.values()].sort((a, b) => b.confidence - a.confidence);
}

export async function POST(request: NextRequest) {
  let body: {
    keywords?: unknown;
    regions?: unknown;
    maxResults?: unknown;
    enrichWebsites?: unknown;
    dedupe?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const keywords = Array.isArray(body.keywords) ? body.keywords.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 25) : [];
  const regions = Array.isArray(body.regions) ? body.regions.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 25) : [];
  const maxResults = Math.min(25, Math.max(1, Number(body.maxResults ?? 10) || 10));
  const enrichWebsites = body.enrichWebsites !== false;
  const shouldDedupe = body.dedupe !== false;

  if (keywords.length === 0 || regions.length === 0) {
    return NextResponse.json({ error: 'At least one keyword and one region are required.' }, { status: 400 });
  }
  if (keywords.length * regions.length > 75) {
    return NextResponse.json({ error: 'Too many searches for an interactive run. Keep keyword × region count at 75 or below.' }, { status: 400 });
  }

  const raw: ScrapeLead[] = [];
  const errors: string[] = [];
  for (const region of regions) {
    for (const keyword of keywords) {
      try {
        raw.push(...await fetchPlaces(keyword, region, maxResults));
      } catch (error) {
        errors.push(`${keyword} in ${region}: ${error instanceof Error ? error.message : String(error)}`);
        if (String(error).includes('403') || String(error).includes('429') || String(error).includes('RAPIDAPI_KEY')) {
          break;
        }
      }
    }
    if (errors.some((error) => error.includes('403') || error.includes('429') || error.includes('RAPIDAPI_KEY'))) break;
  }

  const baseLeads = shouldDedupe ? dedupeLeads(raw) : raw;
  const leads = enrichWebsites
    ? await Promise.all(baseLeads.slice(0, 250).map((lead) => enrichLead(lead)))
    : baseLeads;

  return NextResponse.json({
    leads,
    errors,
    stats: {
      searches: keywords.length * regions.length,
      raw: raw.length,
      deduped: baseLeads.length,
      enriched: leads.filter((lead) => lead.status === 'email_found').length,
      needsReview: leads.filter((lead) => lead.status !== 'email_found').length,
      truncatedEnrichment: enrichWebsites && baseLeads.length > 250,
    },
  });
}
