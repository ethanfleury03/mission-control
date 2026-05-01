export const PRODUCT_FAMILIES = [
  'DuraFlex',
  'DuraCore',
  'DuraBolt',
  'Dura-Printer',
  'AnyJet',
  'Cutter',
  'RIP',
  'General',
] as const;

export const DOCUMENT_TYPES = [
  'installation_guide',
  'user_manual',
  'troubleshooting_guide',
  'service_procedure',
  'software_release_notes',
  'spare_parts',
  'technical_bulletin',
  'databook',
  'system_requirements',
  'print_quality',
  'connectivity',
  'job_submission',
  'unknown',
] as const;

export const QUERY_INTENTS = [
  'troubleshooting',
  'installation',
  'parts',
  'spare_parts',
  'release_notes',
  'software_release_notes',
  'software',
  'system_requirements',
  'job_submission',
  'connectivity',
  'print_quality',
  'maintenance',
  'calibration',
  'sales_product_info',
  'general_product_info',
  'comparison',
  'unknown',
] as const;

export type ProductFamily = (typeof PRODUCT_FAMILIES)[number];
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type QueryIntent = (typeof QUERY_INTENTS)[number];

export interface RagDocument {
  id: string;
  filename: string;
  originalPath: string | null;
  sourcePath: string | null;
  title: string;
  productFamily: ProductFamily;
  productModel: string;
  documentType: DocumentType;
  version: string;
  softwareVersion: string;
  revisionDate: string | null;
  sourceHash: string;
  pageCount: number;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  chunkCount?: number;
  extractionQualityScore?: number;
  embeddingCount?: number;
}

export interface RagPage {
  id: string;
  documentId: string;
  pageNumber: number;
  rawText: string;
  ocrText: string;
  combinedText: string;
  hasImages: boolean;
  hasTables: boolean;
  extractionQualityScore: number;
  metadata: Record<string, unknown>;
}

export interface RagChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  filename: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  headingPath: string;
  text: string;
  tokenCount: number;
  productFamily: ProductFamily;
  productModel: string;
  documentType: DocumentType;
  version: string;
  softwareVersion: string;
  revisionDate: string | null;
  metadata: Record<string, unknown>;
}

export interface RagCitation {
  document_id: string;
  document_title: string;
  filename: string;
  page_start: number;
  page_end: number;
  chunk_id: string;
  quoted_text: string;
}

export interface ParsedSupportQuery {
  intent: QueryIntent;
  product_family: ProductFamily | '';
  product_model: string;
  software_version: string;
  error_codes: string[];
  part_numbers: string[];
  symptoms: string[];
  document_type: DocumentType | '';
  urgency?: 'normal' | 'urgent' | 'safety';
  missing_info?: string[];
  can_attempt_answer?: boolean;
  needs_followup: boolean;
  followup_questions: string[];
  confidence: number;
  parser_model?: string;
  parser_provider?: string;
  llm_parse_error?: string;
}

export interface MetadataExtraction {
  title: string;
  product_family: ProductFamily;
  product_model: string;
  document_type: DocumentType;
  version: string;
  software_version: string;
  revision_date: string | null;
  confidence: number;
  product_family_confidence?: number;
  document_type_confidence?: number;
  version_confidence?: number;
  revision_date_confidence?: number;
  signals?: string[];
  extractor_model?: string;
  extractor_provider?: string;
  llm_parse_error?: string;
}

export interface ChunkCandidate extends RagChunk {
  vectorScore: number;
  keywordScore: number;
  metadataBoost?: number;
  deterministicScore?: number;
  llmRerankScore?: number;
  finalScore?: number;
  directlyAnswers?: boolean;
  productMatches?: boolean;
  documentTypeMatches?: boolean;
  versionMatches?: boolean;
  combinedScore: number;
  rerankScore: number;
  rerankReason: string;
}

export interface RagFilters {
  documentId?: string;
  documentIds?: string[];
  productFamily?: string;
  productModel?: string;
  documentType?: string;
  version?: string;
  softwareVersion?: string;
}

export interface RagSearchDebug {
  parsedQuery: ParsedSupportQuery;
  filtersApplied: RagFilters;
  vectorResults: ChunkCandidate[];
  keywordResults: ChunkCandidate[];
  mergedResults: ChunkCandidate[];
  rerankedResults: ChunkCandidate[];
  finalContext: ChunkCandidate[];
  searchCalls?: SupportSearchCall[];
  decision?: Record<string, unknown>;
}

export interface RagAnswer {
  queryId: string;
  answer: string;
  citations: RagCitation[];
  confidence: number;
  parsedQuery: ParsedSupportQuery;
  debug: RagSearchDebug;
  needsFollowup?: boolean;
  followupQuestions?: string[];
  mode?: 'answer' | 'followup' | 'escalation_summary' | 'refusal';
}

export interface SearchManualsInput {
  query: string;
  productFamily?: string;
  productModel?: string;
  documentType?: string;
  softwareVersion?: string;
  intent?: string;
  topK?: number;
  restrictDocumentIds?: string[];
}

export interface SupportSearchCall {
  id: string;
  query: string;
  filters: RagFilters;
  intent?: string;
  resultCount: number;
  topScore: number;
  weak: boolean;
  reason: string;
  results: ChunkCandidate[];
}

export interface IngestionResult {
  batchId?: string;
  jobId: string;
  documentId: string | null;
  filename: string;
  status: 'completed' | 'completed_with_warnings' | 'needs_metadata_review' | 'skipped_duplicate' | 'failed';
  message: string;
  pageCount: number;
  chunkCount: number;
  productFamily?: string;
  documentType?: string;
  version?: string;
  warnings?: string[];
}
