// ---------------------------------------------------------------------------
// Lead Generation – Domain Types
// ---------------------------------------------------------------------------

// ── Markets ─────────────────────────────────────────────────────────────────

export type MarketStatus = 'active' | 'building' | 'planned' | 'archived';

export interface Market {
  id: string;
  slug: string;
  name: string;
  description: string;
  countries: string[];
  targetPersonas: string[];
  solutionAreas: string[];
  status: MarketStatus;
  notes: string;
  companyCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Accounts / Companies ────────────────────────────────────────────────────

export type AccountStatus = 'active' | 'inactive' | 'prospect' | 'archived';
export type ReviewState =
  | 'new'
  | 'needs_review'
  | 'qualified'
  | 'rejected'
  | 'watching'
  | 'routed';

/** Internal triage before HubSpot — not CRM deal stages. */
export type LeadPipelineStage =
  | 'discovered'
  | 'triaged_ok'
  | 'triaged_hold'
  | 'rejected'
  | 'pushed_to_hubspot'
  | 'push_failed';
export type CompanySizeBand = 'small' | 'mid-market' | 'enterprise' | 'unknown';
export type RevenueBand =
  | 'under_1m'
  | '1m_10m'
  | '10m_50m'
  | '50m_200m'
  | '200m_plus'
  | 'unknown';
export type SourceType =
  | 'internal_scraper'
  | 'licensed_data'
  | 'manual_upload'
  | 'research_import'
  | 'social_signal'
  | 'demo';

export interface Account {
  id: string;
  marketId: string;
  name: string;
  domain: string;
  website: string;
  /** Primary contact email when known (e.g. from directory scraper import). */
  email: string;
  /** Primary phone when known. */
  phone: string;
  country: string;
  region: string;
  industry: string;
  subindustry: string;
  companySizeBand: CompanySizeBand;
  revenueBand: RevenueBand;
  description: string;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl: string;
  status: AccountStatus;
  fitScore: number;
  fitSummary: string;
  assignedOwner: string;
  reviewState: ReviewState;
  /** Defaults to `discovered` when omitted (e.g. older mock rows). */
  leadPipelineStage?: LeadPipelineStage;
  hubspotContactId?: string | null;
  hubspotPushedAt?: string | null;
  hubspotPushedBy?: string;
  hubspotLastPushError?: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

// ── Account Signals ─────────────────────────────────────────────────────────

export type SignalType =
  | 'compliance_need'
  | 'packaging_expansion'
  | 'equipment_upgrade'
  | 'regulatory_change'
  | 'market_expansion'
  | 'sustainability_initiative'
  | 'custom';

export interface AccountSignal {
  id: string;
  accountId: string;
  signalType: SignalType;
  signalValue: string;
  confidence: number;
  source: string;
  notes: string;
  createdAt: string;
}

// ── Product Fit ─────────────────────────────────────────────────────────────

export type ProductFamily =
  | 'digital_label_narrow'
  | 'digital_label_wide'
  | 'print_and_cut'
  | 'digital_finishing'
  | 'flexible_packaging'
  | 'industrial_security_vdp'
  | 'corrugated_overjet'
  | 'arrow_materials';

export interface ProductFit {
  id: string;
  accountId: string;
  productFamily: ProductFamily;
  fitScore: number;
  rationale: string;
  primaryFlag: boolean;
}

// ── Contacts ────────────────────────────────────────────────────────────────

export type Seniority = 'c_level' | 'vp' | 'director' | 'manager' | 'individual';
export type BuyingRole =
  | 'decision_maker'
  | 'influencer'
  | 'champion'
  | 'evaluator'
  | 'user'
  | 'unknown';

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  title: string;
  email: string;
  linkedinUrl: string;
  seniority: Seniority;
  buyingRole: BuyingRole;
  confidence: number;
}

// ── Review / Feedback ───────────────────────────────────────────────────────

export type ReviewVerdict =
  | 'qualified'
  | 'rejected'
  | 'needs_more_info'
  | 'watching';

export type RejectReason =
  | 'wrong_industry'
  | 'too_small'
  | 'wrong_geography'
  | 'weak_packaging_relevance'
  | 'duplicate'
  | 'insufficient_evidence';

export interface ReviewFeedback {
  id: string;
  accountId: string;
  verdict: ReviewVerdict;
  reasonCode: RejectReason | null;
  note: string;
  reviewer: string;
  createdAt: string;
}

// ── Ingestion ───────────────────────────────────────────────────────────────

export type IngestionSourceType =
  | 'internal_scraper'
  | 'licensed_b2b'
  | 'manual_upload'
  | 'research_import'
  | 'social_signal';

export type IngestionSourceStatus = 'active' | 'inactive' | 'planned' | 'error';
export type IngestionRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface IngestionSource {
  id: string;
  name: string;
  type: IngestionSourceType;
  status: IngestionSourceStatus;
  description: string;
  configSummary: string;
}

export interface IngestionRun {
  id: string;
  sourceId: string;
  status: IngestionRunStatus;
  startedAt: string;
  completedAt: string | null;
  itemsSeen: number;
  itemsCreated: number;
  itemsUpdated: number;
  notes: string;
}

export interface IngestionItem {
  id: string;
  runId: string;
  rawCompanyName: string;
  rawDomain: string;
  rawCountry: string;
  matchStatus: 'matched' | 'new' | 'duplicate' | 'rejected';
  matchedAccountId: string | null;
  confidence: number;
  rawPayload: Record<string, unknown>;
}

// ── Social Signals (future) ─────────────────────────────────────────────────

export type SocialSignalCategory =
  | 'compliance_concern'
  | 'packaging_change'
  | 'production_bottleneck'
  | 'sustainability_pressure'
  | 'label_quality_issue'
  | 'equipment_search'
  | 'regulatory_update'
  | 'market_trend';

export type SocialSourceType =
  | 'linkedin'
  | 'reddit'
  | 'industry_forum'
  | 'news_feed'
  | 'trade_publication'
  | 'government_database';

export interface SocialSignal {
  id: string;
  category: SocialSignalCategory;
  sourceType: SocialSourceType;
  title: string;
  summary: string;
  url: string;
  confidence: number;
  matchedAccountId: string | null;
  detectedAt: string;
  processedAt: string | null;
}

export interface SocialSignalClassification {
  id: string;
  signalId: string;
  category: SocialSignalCategory;
  confidence: number;
  rationale: string;
}

export interface SocialEntityMatch {
  id: string;
  signalId: string;
  accountId: string;
  matchConfidence: number;
  matchMethod: string;
}

export interface SocialAction {
  id: string;
  signalId: string;
  actionType: 'notify_owner' | 'boost_score' | 'add_to_review' | 'log_only';
  status: 'pending' | 'executed' | 'skipped';
  executedAt: string | null;
}

export interface SocialTrend {
  id: string;
  category: SocialSignalCategory;
  trendDirection: 'rising' | 'stable' | 'declining';
  signalCount: number;
  periodStart: string;
  periodEnd: string;
  summary: string;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export interface ScoreDimension {
  key: string;
  label: string;
  maxPoints: number;
  score: number;
  rationale: string;
}

export interface FitScoreBreakdown {
  accountId: string;
  totalScore: number;
  dimensions: ScoreDimension[];
  recommendedBundle: string;
  aiExplanation: string | null;
  calculatedAt: string;
}

// ── Data Model Entity Catalog (for Schema Hub UI) ──────────────────────────

export interface DataModelEntity {
  name: string;
  description: string;
  status: 'implemented' | 'typed' | 'planned';
  fieldCount: number;
  category: 'core' | 'enrichment' | 'ingestion' | 'social' | 'feedback';
}

// ── Lead Generation Sub-Page Navigation ─────────────────────────────────────

export type LeadGenPage =
  | 'dashboard'
  | 'overview'
  | 'markets'
  | 'market-detail'
  | 'accounts'
  | 'account-detail'
  | 'review-queue'
  | 'data-model'
  | 'ingestion'
  | 'social-signals';
