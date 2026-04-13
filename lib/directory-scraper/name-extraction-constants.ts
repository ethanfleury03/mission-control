/** Keywords suggesting a member / directory roster (case-insensitive) */
export const ROSTER_KEYWORDS = [
  'members',
  'member directory',
  'directory',
  'companies',
  'partners',
  'exhibitors',
  'sponsors',
  'suppliers',
  'vendors',
  'businesses',
  'our members',
  'organization members',
  'company directory',
  'member',
  'roster',
  'coalition',
];

export const TABLE_HEADER_HINTS = [
  'company',
  'organization',
  'member',
  'exhibitor',
  'sponsor',
  'supplier',
  'business',
  'firm',
  'name',
];

export const MENU_JUNK = new Set([
  'about',
  'contact',
  'privacy',
  'terms',
  'login',
  'register',
  'sign in',
  'sign up',
  'read more',
  'home',
  'menu',
  'search',
  'cart',
  'skip to content',
  'cookie',
  'accept',
  'close',
]);

export const MAX_LOAD_MORE_CLICKS = 5;
export const MAX_CONTAINERS_FOR_AI = 8;
export const MAX_CANDIDATES_FOR_AI = 80;
export const MAX_EXTRACTION_CANDIDATES = 2500;
export const METHOD_PRIORITY: Record<string, number> = {
  jsonld: 100,
  microdata: 95,
  table: 85,
  'detail-link': 75,
  'repeated-block': 70,
  'link-list': 55,
  'plain-text': 45,
  'ai-classified': 40,
};
