// ---------------------------------------------------------------------------
// Lead Generation – Seed / Demo Data
// ---------------------------------------------------------------------------
// These are synthetic examples for development and internal demonstration.
// They are NOT real companies. Marked as sourceType: 'demo' throughout.
// ---------------------------------------------------------------------------

import type {
  Market,
  Account,
  AccountSignal,
  ProductFit,
  ReviewFeedback,
  IngestionSource,
  IngestionRun,
  FitScoreBreakdown,
} from './types';

// ── Markets ─────────────────────────────────────────────────────────────────

export const SEED_MARKETS: Market[] = [
  {
    id: 'mkt-coffee',
    slug: 'coffee',
    name: 'Coffee',
    description: 'Coffee roasters, brands, and private-label producers requiring high-quality label and flexible packaging for bags, pods, and capsules.',
    countries: ['Canada', 'Italy', 'Mexico', 'India'],
    targetPersonas: ['Packaging Manager', 'Brand Manager', 'Operations Director', 'Procurement Lead'],
    solutionAreas: ['Digital Label (Narrow)', 'Flexible Packaging', 'Print & Cut', 'Digital Finishing'],
    status: 'active',
    notes: 'Priority market per leadership. Strong fit for short-run, high-mix label needs and flexible pouches.',
    companyCount: 8,
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2025-04-10T00:00:00Z',
  },
  {
    id: 'mkt-food-bev',
    slug: 'food-beverage',
    name: 'Food & Beverage',
    description: 'Food manufacturers, beverage brands, and CPG companies with labeling and packaging needs across multiple SKUs.',
    countries: ['Canada', 'India', 'Italy', 'Mexico'],
    targetPersonas: ['Packaging Director', 'QA/Compliance Manager', 'Plant Manager', 'Marketing Director'],
    solutionAreas: ['Digital Label (Narrow)', 'Digital Label (Wide)', 'Flexible Packaging', 'Print & Cut'],
    status: 'active',
    notes: 'Broad market. Focus on companies with short-run needs, compliance-sensitive products, or in-housing intent.',
    companyCount: 7,
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2025-04-08T00:00:00Z',
  },
  {
    id: 'mkt-pharma',
    slug: 'pharma-nutraceutical',
    name: 'Pharma / Nutraceutical',
    description: 'Pharmaceutical, nutraceutical, and supplement companies with regulated labeling requirements, serialization, and compliance needs.',
    countries: ['Canada', 'India', 'Italy', 'Mexico'],
    targetPersonas: ['Regulatory Affairs', 'Packaging Engineer', 'Quality Director', 'Operations VP'],
    solutionAreas: ['Digital Label (Narrow)', 'Industrial / Security / VDP', 'Digital Finishing'],
    status: 'active',
    notes: 'High compliance intensity. Food-safe / aqueous inks and VDP serialization are key differentiators.',
    companyCount: 6,
    createdAt: '2025-02-01T00:00:00Z',
    updatedAt: '2025-04-05T00:00:00Z',
  },
  {
    id: 'mkt-chemical',
    slug: 'chemical',
    name: 'Chemical',
    description: 'Chemical manufacturers and distributors requiring GHS-compliant labeling, durable substrates, and variable data for hazard communication.',
    countries: ['Canada', 'India', 'Mexico'],
    targetPersonas: ['EHS Manager', 'Packaging Manager', 'Compliance Officer', 'Plant Manager'],
    solutionAreas: ['Digital Label (Narrow)', 'Industrial / Security / VDP', 'Arrow Materials'],
    status: 'active',
    notes: 'GHS labeling is a strong driver. Durable substrates (BS5609, chemical-resistant) important.',
    companyCount: 5,
    createdAt: '2025-02-01T00:00:00Z',
    updatedAt: '2025-04-01T00:00:00Z',
  },
  {
    id: 'mkt-flex-pkg',
    slug: 'flexible-packaging',
    name: 'Flexible Packaging',
    description: 'Flexible packaging converters and brand owners producing pouches, sachets, films, wraps, and stand-up bags.',
    countries: ['Canada', 'India', 'Italy', 'Mexico'],
    targetPersonas: ['Converting Director', 'Technical Manager', 'Sales Director', 'Plant Manager'],
    solutionAreas: ['Flexible Packaging', 'Digital Finishing', 'Arrow Materials'],
    status: 'building',
    notes: 'Hybrid Pro M is the primary solution. Focus on converters modernizing from analog and brands in-housing.',
    companyCount: 5,
    createdAt: '2025-03-01T00:00:00Z',
    updatedAt: '2025-04-10T00:00:00Z',
  },
  {
    id: 'mkt-label-conv',
    slug: 'label-converters',
    name: 'Label Converters',
    description: 'Commercial label converters looking to add digital capabilities, reduce setup times, and serve short-run customers.',
    countries: ['Canada', 'India', 'Italy', 'Mexico'],
    targetPersonas: ['Owner/GM', 'Production Manager', 'Sales Director', 'Technical Director'],
    solutionAreas: ['Digital Label (Narrow)', 'Digital Label (Wide)', 'Print & Cut', 'Digital Finishing'],
    status: 'building',
    notes: 'Core Arrow customer segment. Modernization from flexo/offset to digital is the primary driver.',
    companyCount: 5,
    createdAt: '2025-03-01T00:00:00Z',
    updatedAt: '2025-04-08T00:00:00Z',
  },
  {
    id: 'mkt-corrugated',
    slug: 'corrugated-packaging',
    name: 'Corrugated / Packaging',
    description: 'Corrugated box makers and packaging manufacturers interested in direct-to-board digital printing for e-commerce and retail.',
    countries: ['Canada', 'Mexico'],
    targetPersonas: ['Plant Manager', 'Sales Director', 'Operations VP', 'E-commerce Packaging Lead'],
    solutionAreas: ['Corrugated / OverJet', 'Digital Finishing'],
    status: 'planned',
    notes: 'OverJet Pro 700 is the primary solution. E-commerce personalization is a growth driver.',
    companyCount: 3,
    createdAt: '2025-03-15T00:00:00Z',
    updatedAt: '2025-04-01T00:00:00Z',
  },
  {
    id: 'mkt-industrial',
    slug: 'industrial-manufacturing',
    name: 'Industrial Manufacturing',
    description: 'Industrial companies with durable labeling needs including asset tags, safety labels, equipment decals, and compliance markings.',
    countries: ['Canada', 'India'],
    targetPersonas: ['EHS Manager', 'Procurement Director', 'Facilities Manager', 'Quality Manager'],
    solutionAreas: ['Digital Label (Narrow)', 'Industrial / Security / VDP', 'Arrow Materials'],
    status: 'planned',
    notes: 'Niche but high-value. Durable substrates and in-house production ROI are key selling points.',
    companyCount: 3,
    createdAt: '2025-04-01T00:00:00Z',
    updatedAt: '2025-04-10T00:00:00Z',
  },
];

// ── Accounts / Companies ────────────────────────────────────────────────────

export const SEED_ACCOUNTS: Account[] = [
  // Coffee
  { id: 'acc-001', marketId: 'mkt-coffee', name: 'Northern Harvest Coffee Co.', domain: 'northernharvestcoffee.ca', website: 'https://northernharvestcoffee.ca', email: '', phone: '', country: 'Canada', region: 'Ontario', industry: 'Coffee', subindustry: 'Specialty Roaster', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Ontario-based specialty coffee roaster with 40+ SKUs, retail and DTC channels. Currently outsourcing label printing with 4-6 week lead times.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 92, fitSummary: 'High-mix SKU portfolio, short-run label needs, food-safe ink requirement. Strong fit for Aqua 330R II + EZCut.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-10T00:00:00Z', createdAt: '2025-01-20T00:00:00Z', updatedAt: '2025-04-10T00:00:00Z' },
  { id: 'acc-002', marketId: 'mkt-coffee', name: 'Torrefazione Milano Srl', domain: 'torrefazionemilano.it', website: 'https://torrefazionemilano.it', email: '', phone: '', country: 'Italy', region: 'Lombardy', industry: 'Coffee', subindustry: 'Roaster / Brand', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Italian coffee roaster producing espresso blends and single-origin for EU retail. Seasonal and limited-edition label runs.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 87, fitSummary: 'EU food-safety compliance, frequent label changeovers, premium finishing needs. Fit for Aqua 330R II + Eco-300.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-08T00:00:00Z', createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-04-08T00:00:00Z' },
  { id: 'acc-003', marketId: 'mkt-coffee', name: 'Café Oaxaca Orgánico', domain: 'cafeoaxaca.mx', website: 'https://cafeoaxaca.mx', email: '', phone: '', country: 'Mexico', region: 'Oaxaca', industry: 'Coffee', subindustry: 'Organic / Fair Trade', companySizeBand: 'small', revenueBand: '1m_10m', description: 'Organic coffee cooperative producing fair-trade certified beans. Expanding into branded retail packaging with pouches and bags.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 78, fitSummary: 'Flexible packaging for pouches, growing brand portfolio. Fit for Hybrid Pro M with food-safe inks.', assignedOwner: '', reviewState: 'needs_review', lastSeenAt: '2025-04-05T00:00:00Z', createdAt: '2025-02-15T00:00:00Z', updatedAt: '2025-04-05T00:00:00Z' },
  { id: 'acc-004', marketId: 'mkt-coffee', name: 'Mumbai Roasters Pvt Ltd', domain: 'mumbairoasters.in', website: 'https://mumbairoasters.in', email: '', phone: '', country: 'India', region: 'Maharashtra', industry: 'Coffee', subindustry: 'Specialty Roaster', companySizeBand: 'small', revenueBand: '1m_10m', description: 'Fast-growing Indian specialty coffee brand targeting metro consumers. Rapidly increasing SKU count.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 81, fitSummary: 'High SKU growth, BIS/FSSAI compliance needs, in-housing potential. Fit for Aqua 330R Lite.', assignedOwner: '', reviewState: 'new', lastSeenAt: '2025-04-03T00:00:00Z', createdAt: '2025-03-01T00:00:00Z', updatedAt: '2025-04-03T00:00:00Z' },
  { id: 'acc-005', marketId: 'mkt-coffee', name: 'Prairie Bean Roasters', domain: 'prairiebean.ca', website: 'https://prairiebean.ca', email: '', phone: '', country: 'Canada', region: 'Alberta', industry: 'Coffee', subindustry: 'Craft Roaster', companySizeBand: 'small', revenueBand: 'under_1m', description: 'Small-batch craft coffee roaster in Calgary. Currently hand-applying labels. Looking to scale.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 68, fitSummary: 'Early-stage, limited budget. Could benefit from entry-level digital label system as they scale.', assignedOwner: '', reviewState: 'watching', lastSeenAt: '2025-04-01T00:00:00Z', createdAt: '2025-03-10T00:00:00Z', updatedAt: '2025-04-01T00:00:00Z' },
  { id: 'acc-006', marketId: 'mkt-coffee', name: 'Cafés du Québec Inc.', domain: 'cafesduquebec.ca', website: 'https://cafesduquebec.ca', email: '', phone: '', country: 'Canada', region: 'Quebec', industry: 'Coffee', subindustry: 'Roaster / Private Label', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Quebec-based roaster serving private-label clients across grocery chains. Bilingual labeling (FR/EN) required.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 89, fitSummary: 'High-volume private label, bilingual requirements, multiple SKU variants. Strong fit for Aqua 330R II.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-09T00:00:00Z', createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-04-09T00:00:00Z' },
  { id: 'acc-007', marketId: 'mkt-coffee', name: 'Caffè Vesuvio SpA', domain: 'caffevesuvio.it', website: 'https://caffevesuvio.it', email: '', phone: '', country: 'Italy', region: 'Campania', industry: 'Coffee', subindustry: 'Traditional Roaster', companySizeBand: 'mid-market', revenueBand: '50m_200m', description: 'Large traditional Italian coffee company expanding into capsule and pod formats. Needs flexible packaging conversion.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 84, fitSummary: 'Capsule/pod packaging expansion, flexible film needs, EU compliance. Fit for Hybrid Pro M.', assignedOwner: '', reviewState: 'needs_review', lastSeenAt: '2025-04-07T00:00:00Z', createdAt: '2025-02-10T00:00:00Z', updatedAt: '2025-04-07T00:00:00Z' },
  { id: 'acc-008', marketId: 'mkt-coffee', name: 'Café Chiapas Premium', domain: 'cafechiapas.mx', website: 'https://cafechiapas.mx', email: '', phone: '', country: 'Mexico', region: 'Chiapas', industry: 'Coffee', subindustry: 'Single Origin', companySizeBand: 'small', revenueBand: '1m_10m', description: 'Single-origin coffee producer with export business. Spanish and English labeling needed.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 74, fitSummary: 'Export-oriented, multi-language labels, growing brand. Fit for Aqua 330R II with finishing.', assignedOwner: '', reviewState: 'new', lastSeenAt: '2025-04-02T00:00:00Z', createdAt: '2025-03-05T00:00:00Z', updatedAt: '2025-04-02T00:00:00Z' },

  // Food & Beverage
  { id: 'acc-010', marketId: 'mkt-food-bev', name: 'Great Lakes Provisions', domain: 'greatlakesprovisions.ca', website: 'https://greatlakesprovisions.ca', email: '', phone: '', country: 'Canada', region: 'Ontario', industry: 'Food & Beverage', subindustry: 'Condiments & Sauces', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Canadian condiment producer with 120+ SKUs across sauces, dressings, and marinades. Frequent seasonal label changes.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 90, fitSummary: 'High SKU count, seasonal changeovers, food-safe ink required. Strong fit for Aqua 330R II + EZCut.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-10T00:00:00Z', createdAt: '2025-01-20T00:00:00Z', updatedAt: '2025-04-10T00:00:00Z' },
  { id: 'acc-011', marketId: 'mkt-food-bev', name: 'Rajasthan Spice Works', domain: 'rajasthanspice.in', website: 'https://rajasthanspice.in', email: '', phone: '', country: 'India', region: 'Rajasthan', industry: 'Food & Beverage', subindustry: 'Spices & Seasonings', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Indian spice exporter with hundreds of pouch and sachet SKUs. FSSAI compliance essential.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 88, fitSummary: 'High-mix flexible packaging, FSSAI compliance, pouch production. Fit for Hybrid Pro M.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-09T00:00:00Z', createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-04-09T00:00:00Z' },
  { id: 'acc-012', marketId: 'mkt-food-bev', name: 'Salumi Toscani Srl', domain: 'salumitoscani.it', website: 'https://salumitoscani.it', email: '', phone: '', country: 'Italy', region: 'Tuscany', industry: 'Food & Beverage', subindustry: 'Cured Meats', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Tuscan cured meat producer with premium retail branding. Short-run specialty labels.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 82, fitSummary: 'Premium short-run labels, EU food contact compliance. Fit for Aqua 330R II + Eco-300.', assignedOwner: '', reviewState: 'needs_review', lastSeenAt: '2025-04-07T00:00:00Z', createdAt: '2025-02-10T00:00:00Z', updatedAt: '2025-04-07T00:00:00Z' },
  { id: 'acc-013', marketId: 'mkt-food-bev', name: 'Bebidas del Norte SA de CV', domain: 'bebidasnorte.mx', website: 'https://bebidasnorte.mx', email: '', phone: '', country: 'Mexico', region: 'Nuevo León', industry: 'Food & Beverage', subindustry: 'Beverages', companySizeBand: 'mid-market', revenueBand: '50m_200m', description: 'Mexican beverage company producing juice, agua fresca, and functional drinks. VDP for promotional campaigns.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 85, fitSummary: 'VDP for promotions, high-volume label production, food-safe inks. Fit for Aqua 800M.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-08T00:00:00Z', createdAt: '2025-02-05T00:00:00Z', updatedAt: '2025-04-08T00:00:00Z' },
  { id: 'acc-014', marketId: 'mkt-food-bev', name: 'Maple Ridge Organics', domain: 'mapleridgeorganics.ca', website: 'https://mapleridgeorganics.ca', email: '', phone: '', country: 'Canada', region: 'British Columbia', industry: 'Food & Beverage', subindustry: 'Organic / Natural', companySizeBand: 'small', revenueBand: '1m_10m', description: 'BC-based organic food brand with granola, nut butter, and snack bars. Growing SKU lineup.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 76, fitSummary: 'Growing brand, organic compliance, in-housing potential. Fit for Aqua 330R Lite as entry point.', assignedOwner: '', reviewState: 'new', lastSeenAt: '2025-04-04T00:00:00Z', createdAt: '2025-03-01T00:00:00Z', updatedAt: '2025-04-04T00:00:00Z' },
  { id: 'acc-015', marketId: 'mkt-food-bev', name: 'Chennai Fresh Foods Pvt Ltd', domain: 'chennaifresh.in', website: 'https://chennaifresh.in', email: '', phone: '', country: 'India', region: 'Tamil Nadu', industry: 'Food & Beverage', subindustry: 'Ready-to-Eat', companySizeBand: 'small', revenueBand: '1m_10m', description: 'South Indian ready-to-eat food brand with pouch packaging. Rapidly expanding retail distribution.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 79, fitSummary: 'Flexible packaging for pouches, FSSAI compliance, rapid growth. Potential Hybrid Pro M customer.', assignedOwner: '', reviewState: 'new', lastSeenAt: '2025-04-03T00:00:00Z', createdAt: '2025-03-05T00:00:00Z', updatedAt: '2025-04-03T00:00:00Z' },
  { id: 'acc-016', marketId: 'mkt-food-bev', name: 'Alimentos Puebla SA', domain: 'alimentospuebla.mx', website: 'https://alimentospuebla.mx', email: '', phone: '', country: 'Mexico', region: 'Puebla', industry: 'Food & Beverage', subindustry: 'Snacks', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Mexican snack food company producing chips, nuts, and dried fruits. High-volume flexible packaging needs.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 83, fitSummary: 'High-volume flexible packaging, multiple SKUs, food-safe compliance. Fit for Hybrid Pro M + finishing.', assignedOwner: '', reviewState: 'needs_review', lastSeenAt: '2025-04-06T00:00:00Z', createdAt: '2025-02-20T00:00:00Z', updatedAt: '2025-04-06T00:00:00Z' },

  // Pharma / Nutraceutical
  { id: 'acc-020', marketId: 'mkt-pharma', name: 'VitaHealth Supplements Inc.', domain: 'vitahealthsupps.ca', website: 'https://vitahealthsupps.ca', email: '', phone: '', country: 'Canada', region: 'Ontario', industry: 'Pharma / Nutraceutical', subindustry: 'Supplements', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Canadian supplement manufacturer. NHP-compliant labels, 200+ SKUs, frequent reformulation-driven label changes.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 91, fitSummary: 'High compliance, frequent label changes, serialization potential. Strong fit for Aqua 330R II + VDP.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-10T00:00:00Z', createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-04-10T00:00:00Z' },
  { id: 'acc-021', marketId: 'mkt-pharma', name: 'Ayurveda Wellness Labs', domain: 'ayurvedawellness.in', website: 'https://ayurvedawellness.in', email: '', phone: '', country: 'India', region: 'Karnataka', industry: 'Pharma / Nutraceutical', subindustry: 'Ayurvedic Products', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Indian ayurvedic health products company with regulatory labeling needs across FSSAI and AYUSH frameworks.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 86, fitSummary: 'Dual regulatory compliance, multi-language labels, serialization. Fit for Aqua 330R II + VDP.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-08T00:00:00Z', createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-04-08T00:00:00Z' },
  { id: 'acc-022', marketId: 'mkt-pharma', name: 'Farmacia Natural Srl', domain: 'farmacianatural.it', website: 'https://farmacianatural.it', email: '', phone: '', country: 'Italy', region: 'Emilia-Romagna', industry: 'Pharma / Nutraceutical', subindustry: 'Natural Pharmaceuticals', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Italian natural pharmaceutical company with EU-compliant supplement and OTC product labels.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 84, fitSummary: 'EU pharma compliance, short-run OTC labels, premium finishing. Fit for Aqua 330R II + Eco-300.', assignedOwner: '', reviewState: 'needs_review', lastSeenAt: '2025-04-06T00:00:00Z', createdAt: '2025-02-15T00:00:00Z', updatedAt: '2025-04-06T00:00:00Z' },
  { id: 'acc-023', marketId: 'mkt-pharma', name: 'NutraVida México', domain: 'nutravida.mx', website: 'https://nutravida.mx', email: '', phone: '', country: 'Mexico', region: 'Jalisco', industry: 'Pharma / Nutraceutical', subindustry: 'Supplements', companySizeBand: 'small', revenueBand: '1m_10m', description: 'Mexican supplement brand targeting health-conscious consumers. Growing retail presence and SKU count.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 77, fitSummary: 'Growing SKU portfolio, COFEPRIS compliance needs. Potential fit for Aqua 330R Lite.', assignedOwner: '', reviewState: 'new', lastSeenAt: '2025-04-03T00:00:00Z', createdAt: '2025-03-01T00:00:00Z', updatedAt: '2025-04-03T00:00:00Z' },
  { id: 'acc-024', marketId: 'mkt-pharma', name: 'Ontario BioPharm Corp.', domain: 'ontariobiopharm.ca', website: 'https://ontariobiopharm.ca', email: '', phone: '', country: 'Canada', region: 'Ontario', industry: 'Pharma / Nutraceutical', subindustry: 'Biopharmaceutical', companySizeBand: 'enterprise', revenueBand: '200m_plus', description: 'Large Canadian biopharma company with serialization mandates and track-and-trace requirements.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 88, fitSummary: 'Serialization mandate, variable data, compliance-intensive. Strong fit for VDP + security stack.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-09T00:00:00Z', createdAt: '2025-01-20T00:00:00Z', updatedAt: '2025-04-09T00:00:00Z' },
  { id: 'acc-025', marketId: 'mkt-pharma', name: 'Gujarat Pharma Packaging', domain: 'gujaratpharmapack.in', website: 'https://gujaratpharmapack.in', email: '', phone: '', country: 'India', region: 'Gujarat', industry: 'Pharma / Nutraceutical', subindustry: 'Pharma Packaging', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Contract pharma packaging company providing label and carton printing for generic drug manufacturers.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 82, fitSummary: 'High-volume pharma labels, serialization, BIS compliance. Fit for Aqua 330R II + VDP.', assignedOwner: '', reviewState: 'needs_review', lastSeenAt: '2025-04-05T00:00:00Z', createdAt: '2025-02-20T00:00:00Z', updatedAt: '2025-04-05T00:00:00Z' },

  // Chemical
  { id: 'acc-030', marketId: 'mkt-chemical', name: 'Northern Chemical Corp.', domain: 'northernchem.ca', website: 'https://northernchem.ca', email: '', phone: '', country: 'Canada', region: 'Alberta', industry: 'Chemical', subindustry: 'Industrial Chemicals', companySizeBand: 'mid-market', revenueBand: '50m_200m', description: 'Canadian industrial chemical company requiring GHS-compliant labeling across hundreds of hazardous products.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 88, fitSummary: 'GHS compliance mandate, durable substrates, high SKU count. Strong fit for Aqua 330R II + BS5609 materials.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-10T00:00:00Z', createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-04-10T00:00:00Z' },
  { id: 'acc-031', marketId: 'mkt-chemical', name: 'Mumbai Chemical Industries', domain: 'mumbaichemind.in', website: 'https://mumbaichemind.in', email: '', phone: '', country: 'India', region: 'Maharashtra', industry: 'Chemical', subindustry: 'Specialty Chemicals', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Indian specialty chemical maker with growing GHS compliance requirements for export markets.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 80, fitSummary: 'GHS export compliance, durable labels, growing SKU count. Fit for Aqua 330R II.', assignedOwner: '', reviewState: 'new', lastSeenAt: '2025-04-04T00:00:00Z', createdAt: '2025-03-01T00:00:00Z', updatedAt: '2025-04-04T00:00:00Z' },
  { id: 'acc-032', marketId: 'mkt-chemical', name: 'Químicos del Pacífico SA', domain: 'quimicospacifico.mx', website: 'https://quimicospacifico.mx', email: '', phone: '', country: 'Mexico', region: 'Jalisco', industry: 'Chemical', subindustry: 'Agricultural Chemicals', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Mexican agrichemical company needing GHS labels for pesticides and fertilizers.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 83, fitSummary: 'GHS agrichemical labeling, durable substrates, variable data. Fit for Aqua 330R II + VDP.', assignedOwner: '', reviewState: 'needs_review', lastSeenAt: '2025-04-06T00:00:00Z', createdAt: '2025-02-15T00:00:00Z', updatedAt: '2025-04-06T00:00:00Z' },
  { id: 'acc-033', marketId: 'mkt-chemical', name: 'Pacific Coast Solvents', domain: 'pacificcoastsolvents.ca', website: 'https://pacificcoastsolvents.ca', email: '', phone: '', country: 'Canada', region: 'British Columbia', industry: 'Chemical', subindustry: 'Solvents & Coatings', companySizeBand: 'small', revenueBand: '1m_10m', description: 'BC-based solvent distributor with GHS labeling needs for repackaged chemicals.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 75, fitSummary: 'GHS repackaging labels, chemical-resistant substrates. Potential fit for entry-level system.', assignedOwner: '', reviewState: 'new', lastSeenAt: '2025-04-02T00:00:00Z', createdAt: '2025-03-10T00:00:00Z', updatedAt: '2025-04-02T00:00:00Z' },
  { id: 'acc-034', marketId: 'mkt-chemical', name: 'Productos Químicos Monterrey', domain: 'pqmonterrey.mx', website: 'https://pqmonterrey.mx', email: '', phone: '', country: 'Mexico', region: 'Nuevo León', industry: 'Chemical', subindustry: 'Industrial Chemicals', companySizeBand: 'mid-market', revenueBand: '50m_200m', description: 'Large Mexican chemical manufacturer with hundreds of GHS-labeled products for domestic and US export.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 86, fitSummary: 'High-volume GHS labels, bilingual EN/ES, export compliance. Strong fit for Aqua 330R II + VDP.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-09T00:00:00Z', createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-04-09T00:00:00Z' },

  // Flexible Packaging
  { id: 'acc-040', marketId: 'mkt-flex-pkg', name: 'FlexPak Ontario Inc.', domain: 'flexpakontario.ca', website: 'https://flexpakontario.ca', email: '', phone: '', country: 'Canada', region: 'Ontario', industry: 'Flexible Packaging', subindustry: 'Converter', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Ontario flexible packaging converter producing pouches and wrappers for food brands. Transitioning from gravure to digital.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 91, fitSummary: 'Gravure-to-digital modernization, food-safe films, short-run capability. Strong fit for Hybrid Pro M.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-10T00:00:00Z', createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-04-10T00:00:00Z' },
  { id: 'acc-041', marketId: 'mkt-flex-pkg', name: 'NorteFlex Empaques SA', domain: 'norteflex.mx', website: 'https://norteflex.mx', email: '', phone: '', country: 'Mexico', region: 'Nuevo León', industry: 'Flexible Packaging', subindustry: 'Converter', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Mexican flexible packaging converter serving CPG brands. Growing demand for short-run and personalized packaging.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 89, fitSummary: 'Short-run flexible packaging, CPG brands, digital conversion. Fit for Hybrid Pro M + finishing.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-09T00:00:00Z', createdAt: '2025-02-10T00:00:00Z', updatedAt: '2025-04-09T00:00:00Z' },
  { id: 'acc-042', marketId: 'mkt-flex-pkg', name: 'Pune Pouch Packaging Pvt Ltd', domain: 'punepouchpack.in', website: 'https://punepouchpack.in', email: '', phone: '', country: 'India', region: 'Maharashtra', industry: 'Flexible Packaging', subindustry: 'Pouch Specialist', companySizeBand: 'small', revenueBand: '1m_10m', description: 'Indian pouch packaging specialist for FMCG brands. Looking to add digital printing for short-run orders.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 80, fitSummary: 'Pouch specialist, FMCG clients, digital adoption. Fit for Hybrid Pro M.', assignedOwner: '', reviewState: 'needs_review', lastSeenAt: '2025-04-05T00:00:00Z', createdAt: '2025-03-01T00:00:00Z', updatedAt: '2025-04-05T00:00:00Z' },
  { id: 'acc-043', marketId: 'mkt-flex-pkg', name: 'Imballaggi Flessibili Roma', domain: 'imballaggiflessibili.it', website: 'https://imballaggiflessibili.it', email: '', phone: '', country: 'Italy', region: 'Lazio', industry: 'Flexible Packaging', subindustry: 'Converter', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Italian flexible packaging converter. EU sustainability mandates driving interest in digital production.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 82, fitSummary: 'EU sustainability compliance, digital modernization, food-grade films. Fit for Hybrid Pro M.', assignedOwner: '', reviewState: 'new', lastSeenAt: '2025-04-04T00:00:00Z', createdAt: '2025-03-05T00:00:00Z', updatedAt: '2025-04-04T00:00:00Z' },
  { id: 'acc-044', marketId: 'mkt-flex-pkg', name: 'Alberta Wrap Solutions', domain: 'albertawrap.ca', website: 'https://albertawrap.ca', email: '', phone: '', country: 'Canada', region: 'Alberta', industry: 'Flexible Packaging', subindustry: 'Wrap & Film', companySizeBand: 'small', revenueBand: '1m_10m', description: 'Western Canadian wrap and film converter. Early digital adopter exploring short-run capabilities.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 73, fitSummary: 'Early digital exploration, small scale. Potential long-term Hybrid Pro M customer.', assignedOwner: '', reviewState: 'watching', lastSeenAt: '2025-04-01T00:00:00Z', createdAt: '2025-03-15T00:00:00Z', updatedAt: '2025-04-01T00:00:00Z' },

  // Label Converters
  { id: 'acc-050', marketId: 'mkt-label-conv', name: 'Maple Leaf Labels Ltd.', domain: 'mapleleaflabels.ca', website: 'https://mapleleaflabels.ca', email: '', phone: '', country: 'Canada', region: 'Ontario', industry: 'Label Converters', subindustry: 'Commercial Converter', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Mid-size Canadian label converter running flexo, looking to add digital line for short-run work.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 90, fitSummary: 'Flexo-to-digital expansion, short-run demand, food/pharma clients. Strong fit for Aqua 330R II + finishing.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-10T00:00:00Z', createdAt: '2025-01-20T00:00:00Z', updatedAt: '2025-04-10T00:00:00Z' },
  { id: 'acc-051', marketId: 'mkt-label-conv', name: 'Etichette Digitali Milano', domain: 'etichettedigitali.it', website: 'https://etichettedigitali.it', email: '', phone: '', country: 'Italy', region: 'Lombardy', industry: 'Label Converters', subindustry: 'Digital-First Converter', companySizeBand: 'small', revenueBand: '1m_10m', description: 'Young Italian digital-first label converter. Seeking to expand capacity with wider-format equipment.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 85, fitSummary: 'Digital-native, capacity expansion, wine/food labels. Fit for Aqua 800M.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-08T00:00:00Z', createdAt: '2025-02-05T00:00:00Z', updatedAt: '2025-04-08T00:00:00Z' },
  { id: 'acc-052', marketId: 'mkt-label-conv', name: 'Delhi Print Solutions Pvt Ltd', domain: 'delhiprintsolutions.in', website: 'https://delhiprintsolutions.in', email: '', phone: '', country: 'India', region: 'Delhi NCR', industry: 'Label Converters', subindustry: 'Commercial Converter', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Large Indian label converter serving FMCG and pharma. Modernizing from letterpress to digital.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 87, fitSummary: 'Modernization from letterpress, FMCG/pharma clients, high volumes. Fit for Aqua 330R II.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-09T00:00:00Z', createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-04-09T00:00:00Z' },
  { id: 'acc-053', marketId: 'mkt-label-conv', name: 'Etiquetas GDL SA de CV', domain: 'etiquetasgdl.mx', website: 'https://etiquetasgdl.mx', email: '', phone: '', country: 'Mexico', region: 'Jalisco', industry: 'Label Converters', subindustry: 'Commercial Converter', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Guadalajara-based label converter serving tequila, food, and pharma brands. Exploring digital capabilities.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 84, fitSummary: 'Tequila/spirits labels, food/pharma clients, digital exploration. Fit for Aqua 330R II + finishing.', assignedOwner: '', reviewState: 'needs_review', lastSeenAt: '2025-04-06T00:00:00Z', createdAt: '2025-02-20T00:00:00Z', updatedAt: '2025-04-06T00:00:00Z' },
  { id: 'acc-054', marketId: 'mkt-label-conv', name: 'West Coast Labels Inc.', domain: 'westcoastlabels.ca', website: 'https://westcoastlabels.ca', email: '', phone: '', country: 'Canada', region: 'British Columbia', industry: 'Label Converters', subindustry: 'Specialty Converter', companySizeBand: 'small', revenueBand: '1m_10m', description: 'BC specialty label converter focused on wine, craft beer, and cannabis labels.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 79, fitSummary: 'Specialty labels (wine/beer/cannabis), short-run, premium finishing. Fit for Aqua 330R II + Eco-300.', assignedOwner: '', reviewState: 'new', lastSeenAt: '2025-04-03T00:00:00Z', createdAt: '2025-03-01T00:00:00Z', updatedAt: '2025-04-03T00:00:00Z' },

  // Corrugated
  { id: 'acc-060', marketId: 'mkt-corrugated', name: 'PrairieBox Packaging Inc.', domain: 'prairiebox.ca', website: 'https://prairiebox.ca', email: '', phone: '', country: 'Canada', region: 'Manitoba', industry: 'Corrugated / Packaging', subindustry: 'Corrugated Converter', companySizeBand: 'mid-market', revenueBand: '50m_200m', description: 'Canadian corrugated converter exploring direct-to-board digital printing for e-commerce brands.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 83, fitSummary: 'E-commerce corrugated, digital personalization, direct-to-board. Fit for OverJet Pro 700.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-09T00:00:00Z', createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-04-09T00:00:00Z' },
  { id: 'acc-061', marketId: 'mkt-corrugated', name: 'Cajas del Norte SA', domain: 'cajasdelnorte.mx', website: 'https://cajasdelnorte.mx', email: '', phone: '', country: 'Mexico', region: 'Nuevo León', industry: 'Corrugated / Packaging', subindustry: 'Box Manufacturer', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Mexican box manufacturer serving e-commerce and retail. Interested in digital print enhancement.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 78, fitSummary: 'E-commerce packaging, digital enhancement, growing volume. Fit for OverJet Pro 700.', assignedOwner: '', reviewState: 'needs_review', lastSeenAt: '2025-04-05T00:00:00Z', createdAt: '2025-03-01T00:00:00Z', updatedAt: '2025-04-05T00:00:00Z' },
  { id: 'acc-062', marketId: 'mkt-corrugated', name: 'Eastern Corrugated Ltd.', domain: 'easterncorrugated.ca', website: 'https://easterncorrugated.ca', email: '', phone: '', country: 'Canada', region: 'Quebec', industry: 'Corrugated / Packaging', subindustry: 'Corrugated Converter', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Quebec corrugated company considering digital for small-batch retail display boxes.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 72, fitSummary: 'Small-batch retail displays, digital exploration. Potential OverJet Pro 700 customer.', assignedOwner: '', reviewState: 'new', lastSeenAt: '2025-04-02T00:00:00Z', createdAt: '2025-03-15T00:00:00Z', updatedAt: '2025-04-02T00:00:00Z' },

  // Industrial Manufacturing
  { id: 'acc-070', marketId: 'mkt-industrial', name: 'Ontario Safety Products Inc.', domain: 'ontariosafety.ca', website: 'https://ontariosafety.ca', email: '', phone: '', country: 'Canada', region: 'Ontario', industry: 'Industrial Manufacturing', subindustry: 'Safety Equipment', companySizeBand: 'mid-market', revenueBand: '10m_50m', description: 'Safety equipment manufacturer needing durable asset tags, warning labels, and compliance decals.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'active', fitScore: 85, fitSummary: 'Durable labeling, safety compliance, variable data for tracking. Fit for Nova 250R+ + laser finishing.', assignedOwner: '', reviewState: 'qualified', lastSeenAt: '2025-04-08T00:00:00Z', createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-04-08T00:00:00Z' },
  { id: 'acc-071', marketId: 'mkt-industrial', name: 'Hyderabad Industrial Tags', domain: 'hyderabadtags.in', website: 'https://hyderabadtags.in', email: '', phone: '', country: 'India', region: 'Telangana', industry: 'Industrial Manufacturing', subindustry: 'Industrial Labels', companySizeBand: 'small', revenueBand: '1m_10m', description: 'Indian industrial label printer producing asset tags and equipment labels for manufacturing sector.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 76, fitSummary: 'Durable industrial labels, growing demand for digital. Fit for Nova 250R+.', assignedOwner: '', reviewState: 'new', lastSeenAt: '2025-04-03T00:00:00Z', createdAt: '2025-03-10T00:00:00Z', updatedAt: '2025-04-03T00:00:00Z' },
  { id: 'acc-072', marketId: 'mkt-industrial', name: 'Alberta Heavy Equipment Labels', domain: 'albertaheavylabels.ca', website: 'https://albertaheavylabels.ca', email: '', phone: '', country: 'Canada', region: 'Alberta', industry: 'Industrial Manufacturing', subindustry: 'Equipment Labels', companySizeBand: 'small', revenueBand: '1m_10m', description: 'Specialty label printer for oil & gas and mining equipment. Extreme-durability requirements.', sourceType: 'demo', sourceName: 'Synthetic Seed', sourceUrl: '', status: 'prospect', fitScore: 71, fitSummary: 'Extreme-durability labels, variable data, niche market. Potential Nova 250R+ customer.', assignedOwner: '', reviewState: 'watching', lastSeenAt: '2025-04-01T00:00:00Z', createdAt: '2025-03-20T00:00:00Z', updatedAt: '2025-04-01T00:00:00Z' },
];

// ── Review Feedback ─────────────────────────────────────────────────────────

export const SEED_REVIEWS: ReviewFeedback[] = [
  { id: 'rev-001', accountId: 'acc-001', verdict: 'qualified', reasonCode: null, note: 'Strong fit. High SKU count, clear short-run need, proximity to Burlington Experience Center.', reviewer: 'System', createdAt: '2025-04-10T00:00:00Z' },
  { id: 'rev-002', accountId: 'acc-010', verdict: 'qualified', reasonCode: null, note: 'Excellent candidate. 120+ SKUs, seasonal changeovers, food-safe ink required.', reviewer: 'System', createdAt: '2025-04-10T00:00:00Z' },
  { id: 'rev-003', accountId: 'acc-005', verdict: 'watching', reasonCode: null, note: 'Too early stage currently. Revisit in 6 months.', reviewer: 'System', createdAt: '2025-04-01T00:00:00Z' },
];

// ── Account Signals ─────────────────────────────────────────────────────────

export const SEED_SIGNALS: AccountSignal[] = [
  { id: 'sig-001', accountId: 'acc-001', signalType: 'packaging_expansion', signalValue: 'Expanding from 40 to 60+ SKUs in 2025', confidence: 0.85, source: 'Research Import', notes: '', createdAt: '2025-03-15T00:00:00Z' },
  { id: 'sig-002', accountId: 'acc-020', signalType: 'compliance_need', signalValue: 'Health Canada NHP compliance updates', confidence: 0.9, source: 'Research Import', notes: '', createdAt: '2025-03-10T00:00:00Z' },
  { id: 'sig-003', accountId: 'acc-030', signalType: 'regulatory_change', signalValue: 'WHMIS 2015 GHS transition deadline approaching', confidence: 0.95, source: 'Research Import', notes: '', createdAt: '2025-02-20T00:00:00Z' },
  { id: 'sig-004', accountId: 'acc-040', signalType: 'equipment_upgrade', signalValue: 'Current gravure press approaching end-of-life', confidence: 0.7, source: 'Research Import', notes: '', createdAt: '2025-03-01T00:00:00Z' },
  { id: 'sig-005', accountId: 'acc-011', signalType: 'market_expansion', signalValue: 'Expanding export markets to Middle East', confidence: 0.75, source: 'Research Import', notes: '', createdAt: '2025-03-20T00:00:00Z' },
];

// ── Product Fit ─────────────────────────────────────────────────────────────

export const SEED_PRODUCT_FITS: ProductFit[] = [
  { id: 'pf-001', accountId: 'acc-001', productFamily: 'digital_label_narrow', fitScore: 92, rationale: 'Aqua 330R II ideal for high-mix short-run coffee labels with food-safe inks', primaryFlag: true },
  { id: 'pf-002', accountId: 'acc-001', productFamily: 'print_and_cut', fitScore: 85, rationale: 'EZCut integration eliminates separate die-cutting step', primaryFlag: false },
  { id: 'pf-003', accountId: 'acc-040', productFamily: 'flexible_packaging', fitScore: 91, rationale: 'Hybrid Pro M replaces aging gravure for short-run pouch production', primaryFlag: true },
  { id: 'pf-004', accountId: 'acc-020', productFamily: 'industrial_security_vdp', fitScore: 88, rationale: 'VDP stack enables serialization and track-and-trace for NHP compliance', primaryFlag: true },
  { id: 'pf-005', accountId: 'acc-030', productFamily: 'digital_label_narrow', fitScore: 88, rationale: 'Aqua 330R II with BS5609 materials for GHS-compliant chemical labels', primaryFlag: true },
];

// ── Ingestion Sources ───────────────────────────────────────────────────────

export const SEED_INGESTION_SOURCES: IngestionSource[] = [
  { id: 'isrc-001', name: 'Internal Web Scraper', type: 'internal_scraper', status: 'planned', description: 'Custom scraper for extracting company data from industry directories and trade associations.', configSummary: 'Playwright-based, Cheerio parsing. Shares infrastructure with Directory Scraper.' },
  { id: 'isrc-002', name: 'Licensed B2B Data Provider', type: 'licensed_b2b', status: 'planned', description: 'Licensed firmographic and contact data from approved B2B data providers (e.g., D&B, ZoomInfo).', configSummary: 'API integration. Requires data license agreement.' },
  { id: 'isrc-003', name: 'Manual CSV Upload', type: 'manual_upload', status: 'active', description: 'Import company lists from spreadsheets, trade show attendee lists, and research exports.', configSummary: 'CSV/XLSX upload with field mapping UI.' },
  { id: 'isrc-004', name: 'Research Import', type: 'research_import', status: 'active', description: 'Curated company records from manual research and industry analysis.', configSummary: 'Structured JSON import from research team output.' },
  { id: 'isrc-005', name: 'Social Signal Ingestion', type: 'social_signal', status: 'planned', description: 'Problem signal monitoring from LinkedIn, Reddit, industry forums, and trade publications.', configSummary: 'API + RSS + custom monitors. Requires social signal pipeline.' },
];

// ── Ingestion Runs ──────────────────────────────────────────────────────────

export const SEED_INGESTION_RUNS: IngestionRun[] = [
  { id: 'irun-001', sourceId: 'isrc-004', status: 'completed', startedAt: '2025-01-20T10:00:00Z', completedAt: '2025-01-20T10:05:00Z', itemsSeen: 20, itemsCreated: 20, itemsUpdated: 0, notes: 'Initial coffee market seed data import' },
  { id: 'irun-002', sourceId: 'isrc-004', status: 'completed', startedAt: '2025-02-01T14:00:00Z', completedAt: '2025-02-01T14:10:00Z', itemsSeen: 25, itemsCreated: 22, itemsUpdated: 3, notes: 'F&B + Pharma market seed data import' },
  { id: 'irun-003', sourceId: 'isrc-003', status: 'completed', startedAt: '2025-03-01T09:00:00Z', completedAt: '2025-03-01T09:15:00Z', itemsSeen: 15, itemsCreated: 10, itemsUpdated: 5, notes: 'Chemical + flex packaging CSV import from trade show list' },
];

// ── Score Breakdowns ────────────────────────────────────────────────────────

export const SEED_SCORE_BREAKDOWNS: FitScoreBreakdown[] = [
  {
    accountId: 'acc-001',
    totalScore: 92,
    dimensions: [
      { key: 'industry_fit', label: 'Industry Fit', maxPoints: 30, score: 28, rationale: 'Coffee roasting is a core served segment with strong label needs' },
      { key: 'use_case_fit', label: 'Use-Case Fit', maxPoints: 25, score: 24, rationale: 'Short-run, high-mix, seasonal changeovers, food-safe ink requirement' },
      { key: 'compliance_intensity', label: 'Compliance Intensity', maxPoints: 15, score: 12, rationale: 'Canadian food labeling, bilingual requirements' },
      { key: 'technical_feasibility', label: 'Technical Feasibility', maxPoints: 15, score: 14, rationale: 'Standard narrow-web substrates, no special facility requirements' },
      { key: 'commercial_readiness', label: 'Commercial Readiness', maxPoints: 10, score: 9, rationale: 'Mid-market company with budget capacity, actively outsourcing labels' },
      { key: 'channel_accessibility', label: 'Channel Accessibility', maxPoints: 5, score: 5, rationale: 'Ontario-based, near Burlington Experience Center' },
    ],
    recommendedBundle: 'Aqua 330R II + EZCut + Eco-300',
    aiExplanation: null,
    calculatedAt: '2025-04-10T00:00:00Z',
  },
  {
    accountId: 'acc-040',
    totalScore: 91,
    dimensions: [
      { key: 'industry_fit', label: 'Industry Fit', maxPoints: 30, score: 29, rationale: 'Flexible packaging converter is a direct-match segment' },
      { key: 'use_case_fit', label: 'Use-Case Fit', maxPoints: 25, score: 23, rationale: 'Gravure-to-digital transition, short-run pouch production' },
      { key: 'compliance_intensity', label: 'Compliance Intensity', maxPoints: 15, score: 13, rationale: 'Food-grade film compliance, water-based ink advantage' },
      { key: 'technical_feasibility', label: 'Technical Feasibility', maxPoints: 15, score: 13, rationale: 'Wide-web films match Hybrid Pro M specifications' },
      { key: 'commercial_readiness', label: 'Commercial Readiness', maxPoints: 10, score: 8, rationale: 'Mid-market, existing gravure investment reaching end-of-life' },
      { key: 'channel_accessibility', label: 'Channel Accessibility', maxPoints: 5, score: 5, rationale: 'Ontario-based, Experience Center accessible' },
    ],
    recommendedBundle: 'Hybrid Pro M + Digital Finishing',
    aiExplanation: null,
    calculatedAt: '2025-04-10T00:00:00Z',
  },
];

// ── Helper: Get accounts by market ──────────────────────────────────────────

export function getAccountsByMarket(marketId: string): Account[] {
  return SEED_ACCOUNTS.filter((a) => a.marketId === marketId);
}

export function getAccountById(id: string): Account | undefined {
  return SEED_ACCOUNTS.find((a) => a.id === id);
}

export function getMarketById(id: string): Market | undefined {
  return SEED_MARKETS.find((m) => m.id === id);
}

export function getMarketBySlug(slug: string): Market | undefined {
  return SEED_MARKETS.find((m) => m.slug === slug);
}

export function getReviewsByAccount(accountId: string): ReviewFeedback[] {
  return SEED_REVIEWS.filter((r) => r.accountId === accountId);
}

export function getSignalsByAccount(accountId: string): AccountSignal[] {
  return SEED_SIGNALS.filter((s) => s.accountId === accountId);
}

export function getProductFitsByAccount(accountId: string): ProductFit[] {
  return SEED_PRODUCT_FITS.filter((p) => p.accountId === accountId);
}

export function getScoreBreakdown(accountId: string): FitScoreBreakdown | undefined {
  return SEED_SCORE_BREAKDOWNS.find((s) => s.accountId === accountId);
}

export function getIngestionRunsBySource(sourceId: string): IngestionRun[] {
  return SEED_INGESTION_RUNS.filter((r) => r.sourceId === sourceId);
}
