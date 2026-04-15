// ---------------------------------------------------------------------------
// Lead Generation – Configuration & Constants
// ---------------------------------------------------------------------------

import type { ProductFamily, SocialSignalCategory, DataModelEntity } from './types';

export const SCORING_DIMENSIONS = [
  { key: 'industry_fit', label: 'Industry Fit', maxPoints: 30 },
  { key: 'use_case_fit', label: 'Use-Case Fit', maxPoints: 25 },
  { key: 'compliance_intensity', label: 'Compliance Intensity', maxPoints: 15 },
  { key: 'technical_feasibility', label: 'Technical Feasibility', maxPoints: 15 },
  { key: 'commercial_readiness', label: 'Commercial Readiness', maxPoints: 10 },
  { key: 'channel_accessibility', label: 'Channel Accessibility', maxPoints: 5 },
] as const;

export const PRODUCT_FAMILIES: { key: ProductFamily; label: string; description: string }[] = [
  { key: 'digital_label_narrow', label: 'Digital Label (Narrow)', description: 'Aqua 330R II, Nova 250R+ — short-run labels, food-safe inks' },
  { key: 'digital_label_wide', label: 'Digital Label (Wide)', description: 'Aqua 800M — wide-format label printing' },
  { key: 'print_and_cut', label: 'Print & Cut', description: 'EZCut inline — integrated label converting' },
  { key: 'digital_finishing', label: 'Digital Finishing', description: 'Eco-300, laser finishing — post-press enhancement' },
  { key: 'flexible_packaging', label: 'Flexible Packaging', description: 'Hybrid Pro M — films, pouches, BOPP, PET' },
  { key: 'industrial_security_vdp', label: 'Industrial / Security / VDP', description: 'Variable data, serialization, anti-counterfeit' },
  { key: 'corrugated_overjet', label: 'Corrugated / OverJet', description: 'OverJet Pro 700 — direct-to-corrugated' },
  { key: 'arrow_materials', label: 'Arrow Materials', description: 'Substrates, inks, and consumables' },
];

export const PILOT_COUNTRIES = ['Canada', 'India', 'Italy', 'Mexico'] as const;

export const TARGET_INDUSTRIES = [
  'Food & Beverage',
  'Coffee',
  'Pharma / Nutraceutical',
  'Chemical',
  'Flexible Packaging',
  'Label Converters',
  'Corrugated / Packaging',
  'Industrial Manufacturing',
  'Cosmetics & Personal Care',
  'Government & Military',
  'Aviation',
  'Building Materials & Decor',
] as const;

export const REVIEW_STATE_LABELS: Record<string, string> = {
  new: 'New',
  needs_review: 'Needs Review',
  qualified: 'Qualified',
  rejected: 'Rejected',
  watching: 'Watching',
  routed: 'Routed',
};

/** Internal triage / HubSpot handoff — not HubSpot deal stages. */
export const LEAD_PIPELINE_STAGE_LABELS: Record<string, string> = {
  discovered: 'Discovered',
  triaged_ok: 'Triaged · OK',
  triaged_hold: 'Triaged · Hold',
  rejected: 'Rejected',
  pushed_to_hubspot: 'In HubSpot',
  push_failed: 'Push failed',
};

export const LEAD_PIPELINE_STAGE_COLORS: Record<string, string> = {
  discovered: 'bg-neutral-100 text-neutral-700',
  triaged_ok: 'bg-emerald-100 text-emerald-800',
  triaged_hold: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-800',
  pushed_to_hubspot: 'bg-sky-100 text-sky-800',
  push_failed: 'bg-orange-100 text-orange-900',
};

export const REVIEW_STATE_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  needs_review: 'bg-amber-100 text-amber-800',
  qualified: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  watching: 'bg-purple-100 text-purple-800',
  routed: 'bg-cyan-100 text-cyan-800',
};

export const REJECT_REASONS: { code: string; label: string }[] = [
  { code: 'wrong_industry', label: 'Wrong Industry' },
  { code: 'too_small', label: 'Too Small' },
  { code: 'wrong_geography', label: 'Wrong Geography' },
  { code: 'weak_packaging_relevance', label: 'Weak Packaging Relevance' },
  { code: 'duplicate', label: 'Duplicate' },
  { code: 'insufficient_evidence', label: 'Insufficient Evidence' },
];

export const SOCIAL_SIGNAL_CATEGORIES: { key: SocialSignalCategory; label: string }[] = [
  { key: 'compliance_concern', label: 'Compliance Concern' },
  { key: 'packaging_change', label: 'Packaging Change' },
  { key: 'production_bottleneck', label: 'Production Bottleneck' },
  { key: 'sustainability_pressure', label: 'Sustainability Pressure' },
  { key: 'label_quality_issue', label: 'Label Quality Issue' },
  { key: 'equipment_search', label: 'Equipment Search' },
  { key: 'regulatory_update', label: 'Regulatory Update' },
  { key: 'market_trend', label: 'Market Trend' },
];

export const DATA_MODEL_ENTITIES: DataModelEntity[] = [
  { name: 'markets', description: 'Industry verticals / market segments for company grouping', status: 'typed', fieldCount: 12, category: 'core' },
  { name: 'accounts', description: 'Company records — firmographics, source, fit scoring', status: 'typed', fieldCount: 23, category: 'core' },
  { name: 'account_signals', description: 'Business signals detected for an account (compliance, expansion, etc.)', status: 'typed', fieldCount: 8, category: 'enrichment' },
  { name: 'product_fit', description: 'Per-account product family fit assessment', status: 'typed', fieldCount: 6, category: 'enrichment' },
  { name: 'contacts', description: 'Buying committee contacts (licensed data only)', status: 'typed', fieldCount: 10, category: 'core' },
  { name: 'review_feedback', description: 'Human review verdicts and rejection reasons', status: 'typed', fieldCount: 7, category: 'feedback' },
  { name: 'activities', description: 'Pipeline activity tracking (contacted, meeting, demo, quote)', status: 'planned', fieldCount: 10, category: 'feedback' },
  { name: 'sales_feedback', description: 'Sales outcome data for active learning loop', status: 'planned', fieldCount: 8, category: 'feedback' },
  { name: 'routing_rules', description: 'Territory and segment routing configuration', status: 'planned', fieldCount: 6, category: 'feedback' },
  { name: 'ai_explanations', description: 'LLM-generated fit explanations citing auditable drivers', status: 'planned', fieldCount: 7, category: 'enrichment' },
  { name: 'ingestion_sources', description: 'Configured data ingestion sources', status: 'typed', fieldCount: 6, category: 'ingestion' },
  { name: 'ingestion_runs', description: 'Per-source import execution records', status: 'typed', fieldCount: 9, category: 'ingestion' },
  { name: 'ingestion_items', description: 'Individual records from an ingestion run', status: 'typed', fieldCount: 9, category: 'ingestion' },
  { name: 'social_signals', description: 'Problem signals from external monitoring', status: 'typed', fieldCount: 10, category: 'social' },
  { name: 'social_signal_classifications', description: 'AI classification of social signals', status: 'typed', fieldCount: 5, category: 'social' },
  { name: 'social_entity_matches', description: 'Linking social signals to accounts', status: 'typed', fieldCount: 5, category: 'social' },
  { name: 'social_actions', description: 'Actions triggered by social signals', status: 'typed', fieldCount: 5, category: 'social' },
  { name: 'social_trends', description: 'Aggregated trend data from social signals', status: 'typed', fieldCount: 7, category: 'social' },
];

export const INGESTION_PIPELINE_STAGES = [
  { key: 'extract', label: 'Extract', description: 'Pull raw data from source' },
  { key: 'normalize', label: 'Normalize', description: 'Standardize fields, domains, countries' },
  { key: 'dedupe', label: 'Deduplicate', description: 'Match against existing accounts' },
  { key: 'enrich', label: 'Enrich', description: 'Add firmographics & technographics' },
  { key: 'score', label: 'Score', description: 'Calculate fit score and qualification' },
  { key: 'review', label: 'Review', description: 'Route to human review queue' },
  { key: 'load', label: 'Load', description: 'Commit to account database' },
];
