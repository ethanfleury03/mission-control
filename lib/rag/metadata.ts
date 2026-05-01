import { hasChatProvider } from './config';
import { extractJsonObject, runChatCompletion } from './providers';
import { METADATA_EXTRACTOR_PROMPT } from './prompts/metadata-extractor';
import { QUERY_PARSER_PROMPT } from './prompts/query-parser';
import {
  DOCUMENT_TYPES,
  PRODUCT_FAMILIES,
  QUERY_INTENTS,
  type DocumentType,
  type MetadataExtraction,
  type ParsedSupportQuery,
  type ProductFamily,
  type QueryIntent,
} from './types';

const PRODUCT_PATTERNS: Array<{ family: ProductFamily; patterns: RegExp[] }> = [
  { family: 'DuraFlex', patterns: [/\bdura\s*-?\s*flex\b/i, /\bd\s*[-_ ]?\s*flex\b/i, /\bdflex\b/i, /\bduraflex\b/i] },
  { family: 'DuraCore', patterns: [/\bdura\s*-?\s*core\b/i, /\bduracore\b/i] },
  { family: 'DuraBolt', patterns: [/\bdura\s*-?\s*bolt\b/i, /\bdurabolt\b/i] },
  { family: 'Dura-Printer', patterns: [/\bdura\s*-?\s*printer\b/i, /\bdura\s+printer\b/i, /\bmcs\b/i] },
  { family: 'AnyJet', patterns: [/\bany\s*-?\s*jet\b/i, /\barrow\s*any\s*-?\s*002\b/i, /\bany-?002\b/i] },
  { family: 'Cutter', patterns: [/\bcutter\b/i, /\bdigital\s+die\s*cutter\b/i, /\bdie\s*cutter\b/i, /\bez\s*-?\s*cut\b/i, /\bvr\s*series\b/i, /\bvr[-\s]?\d{2,}\b/i] },
  { family: 'RIP', patterns: [/\brip\b/i, /\bworkflow\b/i, /\bjob\s*submission\b/i] },
];

const DOC_TYPE_PATTERNS: Array<{ type: DocumentType; patterns: RegExp[] }> = [
  { type: 'installation_guide', patterns: [/\binstall(?:ation)?\b/i, /\bcommission(?:ing)?\b/i, /\bsetup\b/i] },
  { type: 'troubleshooting_guide', patterns: [/\btroubleshoot(?:ing)?\b/i, /\berror\b/i, /\bfault\b/i, /\balarm\b/i] },
  { type: 'service_procedure', patterns: [/\bservice\b/i, /\bprocedure\b/i, /\bdeclog\b/i, /\bhydration\b/i, /\bdehydration\b/i, /\bmaintenance\b/i] },
  { type: 'software_release_notes', patterns: [/\brelease\s*notes?\b/i, /\bversion\s+history\b/i, /\bchangelog\b/i, /\br\d+(?:\.\d+)+\b/i] },
  { type: 'spare_parts', patterns: [/\bspare\s*parts?\b/i, /\bparts?\s*list\b/i, /\bpart\s*(?:number|#)\b/i] },
  { type: 'technical_bulletin', patterns: [/\btechnical\s*bulletin\b/i, /\btech\s*bulletin\b/i, /\btb[-\s]?\d+\b/i] },
  { type: 'databook', patterns: [/\bdata\s*book\b/i, /\bdatabook\b/i, /\bdesign\s+guide\b/i, /\belectrical\s+databook\b/i, /\bsoftware\s+databook\b/i] },
  { type: 'system_requirements', patterns: [/\bsystem\s*requirements?\b/i, /\brequirements?\b/i] },
  { type: 'print_quality', patterns: [/\bprint\s*quality\b/i, /\bartefacts?\b/i, /\bartifacts?\b/i, /\bbanding\b/i, /\bmissing\s*nozzles?\b/i, /\bnozzle\b/i] },
  { type: 'print_quality', patterns: [/\bcalibrat(?:e|ion)\b/i, /\bregistration\b/i] },
  { type: 'connectivity', patterns: [/\bconnect(?:ing|ion|ivity)?\b/i, /\bnetwork\b/i, /\busb\b/i, /\bethernet\b/i, /\bip\s*address\b/i] },
  { type: 'job_submission', patterns: [/\bjob\s*submission\b/i, /\bsubmit\s+job\b/i, /\bqueue\b/i, /\brip\b/i] },
  { type: 'user_manual', patterns: [/\buser\s*manual\b/i, /\boperator\s*manual\b/i, /\bguide\b/i] },
];

const INTENT_PATTERNS: Array<{ intent: QueryIntent; patterns: RegExp[] }> = [
  { intent: 'comparison', patterns: [/\bcompare\b/i, /\bdifference\b/i, /\bacross\s+versions?\b/i] },
  { intent: 'troubleshooting', patterns: [/\berror\b/i, /\bissue\b/i, /\bproblem\b/i, /\bnot\s+working\b/i, /\bfails?\b/i, /\btroubleshoot(?:ing)?\b/i] },
  { intent: 'installation', patterns: [/\binstall(?:ation)?\b/i, /\bcommission(?:ing)?\b/i, /\bsetup\b/i] },
  { intent: 'parts', patterns: [/\bpart\b/i, /\bspare\b/i, /\bsku\b/i, /\bprinthead\s+(?:id|identification)\b/i] },
  { intent: 'release_notes', patterns: [/\brelease\s*notes?\b/i, /\bwhat\s+changed\b/i, /\br\d+(?:\.\d+)+\b/i, /\bversion\b/i] },
  { intent: 'system_requirements', patterns: [/\bsystem\s*requirements?\b/i, /\brequired\s+(?:pc|computer|os|windows)\b/i] },
  { intent: 'job_submission', patterns: [/\bjob\s*submission\b/i, /\bsubmit\s+(?:a\s+)?job\b/i, /\bprint\s+queue\b/i] },
  { intent: 'software', patterns: [/\bsoftware\b/i, /\brip\b/i, /\bworkflow\b/i, /\bfeature\b/i] },
  { intent: 'connectivity', patterns: [/\bconnect\b/i, /\bnetwork\b/i, /\busb\b/i, /\bip\b/i] },
  { intent: 'print_quality', patterns: [/\bbanding\b/i, /\bnozzle\b/i, /\bprint\s*quality\b/i, /\bdehydration\b/i] },
  { intent: 'calibration', patterns: [/\bcalibrat(?:e|ion)\b/i, /\bregistration\b/i, /\balignment\b/i] },
  { intent: 'maintenance', patterns: [/\bmaintenance\b/i, /\bdeclog\b/i, /\bhydration\b/i, /\bdehydration\b/i, /\bclean(?:ing)?\b/i] },
  { intent: 'sales_product_info', patterns: [/\bspec\b/i, /\bcapabilit/i, /\bsupports?\b/i] },
];

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function detectProductFamily(text: string): ProductFamily {
  for (const candidate of PRODUCT_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(text))) return candidate.family;
  }
  return 'General';
}

function productConfidence(text: string, family: ProductFamily): number {
  if (family === 'General') return 0.25;
  const lower = text.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]+/g, '');
  const familyToken = family.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const filenameBoost = compact.slice(0, 300).includes(familyToken) ? 0.15 : 0;
  const aliasHits = PRODUCT_PATTERNS.find((item) => item.family === family)?.patterns.filter((pattern) => pattern.test(text)).length || 0;
  return Math.min(0.98, 0.55 + aliasHits * 0.15 + filenameBoost);
}

export function detectDocumentType(text: string): DocumentType {
  for (const candidate of DOC_TYPE_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(text))) return candidate.type;
  }
  return 'unknown';
}

function documentTypeConfidence(text: string, type: DocumentType): number {
  if (type === 'unknown') return 0.25;
  const aliasHits = DOC_TYPE_PATTERNS.find((item) => item.type === type)?.patterns.filter((pattern) => pattern.test(text)).length || 0;
  return Math.min(0.96, 0.5 + aliasHits * 0.16);
}

export function detectIntent(text: string): QueryIntent {
  for (const candidate of INTENT_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(text))) return candidate.intent;
  }
  return 'unknown';
}

export function documentTypeForIntent(intent: QueryIntent): DocumentType | '' {
  switch (intent) {
    case 'installation':
      return 'installation_guide';
    case 'parts':
    case 'spare_parts':
      return 'spare_parts';
    case 'release_notes':
    case 'software_release_notes':
      return 'software_release_notes';
    case 'system_requirements':
      return 'system_requirements';
    case 'job_submission':
      return 'job_submission';
    case 'connectivity':
      return 'connectivity';
    case 'print_quality':
    case 'calibration':
      return 'print_quality';
    case 'maintenance':
      return 'service_procedure';
    case 'troubleshooting':
      return 'troubleshooting_guide';
    case 'software':
      return 'job_submission';
    default:
      return '';
  }
}

export function parseSupportQuery(query: string, overrides: { productFamily?: string; documentType?: string; version?: string } = {}): ParsedSupportQuery {
  const normalized = normalizeWhitespace(query);
  const productFamily = (overrides.productFamily as ProductFamily | undefined) || detectProductFamily(normalized);
  const intent = detectIntent(normalized);
  const explicitDocType = overrides.documentType as DocumentType | undefined;
  const documentType = explicitDocType || documentTypeForIntent(intent) || detectDocumentType(normalized);
  const softwareVersion = overrides.version || extractVersion(normalized).value;
  const errorCodes = [...new Set([...normalized.matchAll(/\b(?:E|ERR|ERROR|FAULT|ALARM)[-_ ]?[A-Z0-9]{2,8}\b/gi)].map((match) => match[0].toUpperCase()))];
  const partNumbers = [
    ...new Set(
      [...normalized.matchAll(/\b(?:P\/?N|PART(?:\s*NO\.?)?|PN)[:#\s-]*([A-Z0-9][A-Z0-9._/-]{3,})\b/gi)]
        .map((match) => match[1]?.toUpperCase())
        .filter(Boolean) as string[],
    ),
  ];
  const symptoms = extractSymptoms(normalized);
  const followupQuestions = buildFollowupQuestions({
    query: normalized,
    productFamily,
    intent,
    errorCodes,
    symptoms,
  });

  return {
    intent,
    product_family: productFamily === 'General' && !overrides.productFamily ? '' : productFamily,
    product_model: extractProductModel(normalized, productFamily),
    software_version: softwareVersion,
    error_codes: errorCodes,
    part_numbers: partNumbers,
    symptoms,
    document_type: documentType === 'unknown' ? '' : documentType,
    urgency: detectUrgency(normalized),
    missing_info: inferMissingInfo({
      query: normalized,
      productFamily,
      intent,
      softwareVersion,
      symptoms,
      errorCodes,
    }),
    can_attempt_answer: followupQuestions.length === 0,
    needs_followup: followupQuestions.length > 0,
    followup_questions: followupQuestions,
    confidence: productFamily !== 'General' || intent !== 'unknown' ? 0.72 : 0.35,
  };
}

export async function parseSupportQueryWithModel(
  query: string,
  overrides: { productFamily?: string; documentType?: string; version?: string } = {},
): Promise<ParsedSupportQuery> {
  const fallback = parseSupportQuery(query, overrides);
  if (process.env.RAG_DISABLE_LLM_QUERY_PARSER === 'true' || !hasChatProvider('query_parser')) {
    return fallback;
  }

  try {
    const result = await runChatCompletion({
      task: 'query_parser',
      responseFormat: 'json',
      temperature: 0,
      maxTokens: 900,
      messages: [
        { role: 'system', content: QUERY_PARSER_PROMPT },
        {
          role: 'user',
          content: JSON.stringify(
            {
              query,
              overrides,
              deterministicFallback: fallback,
            },
            null,
            2,
          ),
        },
      ],
    });
    const parsed = extractJsonObject<Partial<ParsedSupportQuery>>(result.content);
    if (!parsed) {
      return {
        ...fallback,
        llm_parse_error: `Query parser model ${result.model} returned malformed JSON.`,
        parser_model: result.model,
        parser_provider: result.provider,
      };
    }
    return normalizeParsedSupportQuery(parsed, fallback, overrides, result.model, result.provider);
  } catch (error) {
    return {
      ...fallback,
      llm_parse_error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function extractDocumentMetadata(filename: string, firstPages: string): MetadataExtraction {
  const combined = `${filename}\n${firstPages.slice(0, 8000)}`;
  const productFamily = detectProductFamily(combined);
  const documentType = detectDocumentType(combined);
  const title = titleFromFilename(filename);
  const versionResult = extractVersion(combined);
  const dateResult = extractDate(combined);
  const product_family_confidence = productConfidence(combined, productFamily);
  const document_type_confidence = documentTypeConfidence(combined, documentType);
  const version_confidence = versionResult.confidence;
  const revision_date_confidence = dateResult.confidence;
  const confidence = Number(
    ((product_family_confidence * 0.35) +
      (document_type_confidence * 0.35) +
      (version_confidence * 0.15) +
      (revision_date_confidence * 0.15)).toFixed(2),
  );

  return {
    title,
    product_family: productFamily,
    product_model: extractProductModel(combined, productFamily),
    document_type: documentType,
    version: versionResult.value,
    software_version: versionResult.value,
    revision_date: dateResult.value,
    confidence,
    product_family_confidence,
    document_type_confidence,
    version_confidence,
    revision_date_confidence,
    signals: buildMetadataSignals({
      filename,
      productFamily,
      documentType,
      version: versionResult.value,
      revisionDate: dateResult.value,
      productConfidence: product_family_confidence,
      documentTypeConfidence: document_type_confidence,
    }),
  };
}

export async function extractDocumentMetadataWithModel(filename: string, firstPages: string): Promise<MetadataExtraction> {
  const fallback = extractDocumentMetadata(filename, firstPages);
  if (process.env.RAG_DISABLE_LLM_METADATA_EXTRACTOR === 'true' || !hasChatProvider('metadata_extractor')) {
    return fallback;
  }

  try {
    const result = await runChatCompletion({
      task: 'metadata_extractor',
      responseFormat: 'json',
      temperature: 0,
      maxTokens: 900,
      messages: [
        { role: 'system', content: METADATA_EXTRACTOR_PROMPT },
        {
          role: 'user',
          content: JSON.stringify(
            {
              filename,
              firstPages: firstPages.slice(0, 9000),
              deterministicFallback: fallback,
            },
            null,
            2,
          ),
        },
      ],
    });
    const parsed = extractJsonObject<Partial<MetadataExtraction>>(result.content);
    if (!parsed) {
      return {
        ...fallback,
        llm_parse_error: `Metadata extractor model ${result.model} returned malformed JSON.`,
        extractor_model: result.model,
        extractor_provider: result.provider,
        signals: [...(fallback.signals || []), 'LLM metadata extraction returned malformed JSON; deterministic metadata used.'],
      };
    }
    return normalizeMetadataExtraction(parsed, fallback, result.model, result.provider);
  } catch (error) {
    return {
      ...fallback,
      llm_parse_error: error instanceof Error ? error.message : String(error),
      signals: [...(fallback.signals || []), `LLM metadata extraction failed; deterministic metadata used: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractProductModel(text: string, productFamily: ProductFamily): string {
  if (productFamily === 'AnyJet') {
    const anyJet = text.match(/\b(?:Arrow\s*)?Any[-\s]?(\d{3})\b/i);
    if (anyJet) return `Any-${anyJet[1]}`;
  }
  if (productFamily === 'Cutter') {
    const vr = text.match(/\bVR[-\s]?([A-Z0-9]+)\b/i);
    if (vr) return `VR-${vr[1].toUpperCase()}`;
    if (/\bez\s*-?\s*cut\b/i.test(text)) return 'EZCut';
  }
  const model = text.match(/\b(?:model|printer|system)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._/-]{2,})\b/i);
  return model?.[1] ?? '';
}

function extractVersion(text: string): { value: string; confidence: number } {
  const release = text.match(/\bR\s?(\d+(?:\.\d+){1,4})\b/i);
  if (release) return { value: `R${release[1]}`, confidence: 0.92 };
  const version = text.match(/\b(?:version|ver\.?|v)\s*[:\-]?\s*(\d+(?:\.\d+){1,4})\b/i);
  if (version) return { value: version[1], confidence: 0.82 };
  const filenameVersion = text.slice(0, 250).match(/\b(\d+\.\d+(?:\.\d+){0,3})\b/);
  if (filenameVersion) return { value: filenameVersion[1], confidence: 0.58 };
  return { value: '', confidence: 0 };
}

function extractDate(text: string): { value: string | null; confidence: number } {
  const iso = text.match(/\b(20\d{2}|19\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    const year = iso[1];
    const month = iso[2].padStart(2, '0');
    const day = iso[3].padStart(2, '0');
    return { value: `${year}-${month}-${day}`, confidence: 0.92 };
  }

  const us = text.match(/\b(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[-/](20\d{2}|19\d{2})\b/);
  if (us) {
    const month = us[1].padStart(2, '0');
    const day = us[2].padStart(2, '0');
    return { value: `${us[3]}-${month}-${day}`, confidence: 0.82 };
  }
  const named = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([12]?\d|3[01]),?\s+(20\d{2}|19\d{2})\b/i);
  if (named) {
    const month = monthNumber(named[1]);
    const day = named[2].padStart(2, '0');
    return { value: `${named[3]}-${month}-${day}`, confidence: 0.75 };
  }
  return { value: null, confidence: 0 };
}

function monthNumber(value: string): string {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const index = months.findIndex((month) => value.toLowerCase().startsWith(month));
  return String(Math.max(1, index + 1)).padStart(2, '0');
}

function buildMetadataSignals(input: {
  filename: string;
  productFamily: ProductFamily;
  documentType: DocumentType;
  version: string;
  revisionDate: string | null;
  productConfidence: number;
  documentTypeConfidence: number;
}): string[] {
  const signals: string[] = [];
  signals.push(`Filename analyzed: ${input.filename}`);
  signals.push(`Product ${input.productFamily} confidence ${input.productConfidence.toFixed(2)}`);
  signals.push(`Document type ${input.documentType} confidence ${input.documentTypeConfidence.toFixed(2)}`);
  if (input.version) signals.push(`Version detected: ${input.version}`);
  if (input.revisionDate) signals.push(`Revision date detected: ${input.revisionDate}`);
  if (input.productFamily === 'General') signals.push('Product family needs manual review.');
  if (input.documentType === 'unknown') signals.push('Document type needs manual review.');
  return signals;
}

function normalizeParsedSupportQuery(
  parsed: Partial<ParsedSupportQuery>,
  fallback: ParsedSupportQuery,
  overrides: { productFamily?: string; documentType?: string; version?: string },
  model: string,
  provider: string,
): ParsedSupportQuery {
  const product = normalizeProductFamily(overrides.productFamily || parsed.product_family) || fallback.product_family;
  const intent = normalizeIntent(parsed.intent) || fallback.intent;
  const docType = normalizeDocumentType(overrides.documentType || parsed.document_type) || fallback.document_type;
  const softwareVersion = overrides.version || stringValue(parsed.software_version) || fallback.software_version;
  const followupQuestions = stringArray(parsed.followup_questions).slice(0, 3);
  const missingInfo = stringArray(parsed.missing_info);
  const needsFollowup = typeof parsed.needs_followup === 'boolean' ? parsed.needs_followup : fallback.needs_followup;

  return {
    intent,
    product_family: product === 'General' && !overrides.productFamily ? '' : product,
    product_model: stringValue(parsed.product_model) || fallback.product_model,
    software_version: softwareVersion,
    error_codes: stringArray(parsed.error_codes).length > 0 ? stringArray(parsed.error_codes) : fallback.error_codes,
    part_numbers: stringArray(parsed.part_numbers).length > 0 ? stringArray(parsed.part_numbers) : fallback.part_numbers,
    symptoms: stringArray(parsed.symptoms).length > 0 ? stringArray(parsed.symptoms) : fallback.symptoms,
    document_type: docType === 'unknown' ? '' : docType,
    urgency: normalizeUrgency(parsed.urgency) || fallback.urgency,
    missing_info: missingInfo.length > 0 ? missingInfo : fallback.missing_info,
    can_attempt_answer: typeof parsed.can_attempt_answer === 'boolean' ? parsed.can_attempt_answer : !needsFollowup,
    needs_followup: needsFollowup,
    followup_questions: followupQuestions.length > 0 ? followupQuestions : fallback.followup_questions,
    confidence: clampConfidence(parsed.confidence, fallback.confidence),
    parser_model: model,
    parser_provider: provider,
  };
}

function normalizeMetadataExtraction(
  parsed: Partial<MetadataExtraction>,
  fallback: MetadataExtraction,
  model: string,
  provider: string,
): MetadataExtraction {
  const productFamily = normalizeProductFamily(parsed.product_family) || fallback.product_family;
  const documentType = normalizeDocumentType(parsed.document_type) || fallback.document_type;
  const version = stringValue(parsed.version) || fallback.version;
  const softwareVersion = stringValue(parsed.software_version) || version || fallback.software_version;
  const revisionDate = normalizeDateValue(parsed.revision_date) ?? fallback.revision_date;
  const productConfidence = clampConfidence(parsed.product_family_confidence, fallback.product_family_confidence ?? fallback.confidence);
  const docTypeConfidence = clampConfidence(parsed.document_type_confidence, fallback.document_type_confidence ?? fallback.confidence);
  const versionConfidence = clampConfidence(parsed.version_confidence, fallback.version_confidence ?? (version ? 0.7 : 0));
  const revisionConfidence = clampConfidence(parsed.revision_date_confidence, fallback.revision_date_confidence ?? (revisionDate ? 0.7 : 0));
  const confidence = clampConfidence(
    parsed.confidence,
    Number(((productConfidence * 0.35) + (docTypeConfidence * 0.35) + (versionConfidence * 0.15) + (revisionConfidence * 0.15)).toFixed(2)),
  );

  return {
    title: stringValue(parsed.title) || fallback.title,
    product_family: productFamily,
    product_model: stringValue(parsed.product_model) || fallback.product_model,
    document_type: documentType,
    version,
    software_version: softwareVersion,
    revision_date: revisionDate,
    confidence,
    product_family_confidence: productConfidence,
    document_type_confidence: docTypeConfidence,
    version_confidence: versionConfidence,
    revision_date_confidence: revisionConfidence,
    signals: [
      ...(fallback.signals || []),
      ...stringArray(parsed.signals),
      `LLM metadata extraction used ${provider}/${model}.`,
    ],
    extractor_model: model,
    extractor_provider: provider,
  };
}

function normalizeProductFamily(value: unknown): ProductFamily | '' {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return PRODUCT_FAMILIES.includes(trimmed as ProductFamily) ? (trimmed as ProductFamily) : '';
}

function normalizeDocumentType(value: unknown): DocumentType | '' {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return DOCUMENT_TYPES.includes(trimmed as DocumentType) ? (trimmed as DocumentType) : '';
}

function normalizeIntent(value: unknown): QueryIntent | '' {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return QUERY_INTENTS.includes(trimmed as QueryIntent) ? (trimmed as QueryIntent) : '';
}

function normalizeUrgency(value: unknown): 'normal' | 'urgent' | 'safety' | undefined {
  return value === 'normal' || value === 'urgent' || value === 'safety' ? value : undefined;
}

function normalizeDateValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))];
}

function clampConfidence(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return Number(Math.max(0, Math.min(1, fallback)).toFixed(2));
  return Number(Math.max(0, Math.min(1, numeric)).toFixed(2));
}

function extractSymptoms(text: string): string[] {
  const symptomPatterns = [
    /\bbanding\b/gi,
    /\bmissing\s+nozzles?\b/gi,
    /\bdehydration\b/gi,
    /\bnot\s+connecting\b/gi,
    /\bprinthead\b/gi,
    /\bdeclog\b/gi,
    /\bPPU\b/g,
    /\binline\s+degasser\b/gi,
    /\bwon'?t\s+connect\b/gi,
    /\bnot\s+working\b/gi,
    /\bcalibration\b/gi,
  ];
  return [...new Set(symptomPatterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0].toLowerCase())))];
}

function detectUrgency(text: string): 'normal' | 'urgent' | 'safety' {
  if (/\b(electrical|shock|burn|fire|smoke|chemical|ink spill|leak|disassembl|firmware flash|flash firmware)\b/i.test(text)) {
    return 'safety';
  }
  if (/\b(down|production stopped|urgent|asap|customer waiting|line down)\b/i.test(text)) return 'urgent';
  return 'normal';
}

function inferMissingInfo(input: {
  query: string;
  productFamily: ProductFamily;
  intent: QueryIntent;
  softwareVersion: string;
  symptoms: string[];
  errorCodes: string[];
}): string[] {
  const missing: string[] = [];
  if (input.productFamily === 'General') missing.push('product family');
  if (['release_notes', 'software_release_notes', 'software', 'job_submission'].includes(input.intent) && !input.softwareVersion) {
    missing.push('software version');
  }
  if (['troubleshooting', 'connectivity', 'print_quality'].includes(input.intent) && input.errorCodes.length === 0 && !/\berror|alarm|fault\b/i.test(input.query)) {
    missing.push('error code or alarm text if shown');
  }
  if (input.intent === 'connectivity' && !/\b(network|ethernet|usb|rip|gui|job|ip)\b/i.test(input.query)) {
    missing.push('connection type');
  }
  if (input.intent === 'print_quality' && !/\bink|media|substrate|printhead|nozzle|recent|maintenance\b/i.test(input.query)) {
    missing.push('ink/media and recent maintenance');
  }
  return missing;
}

function buildFollowupQuestions(input: {
  query: string;
  productFamily: ProductFamily;
  intent: QueryIntent;
  errorCodes: string[];
  symptoms: string[];
}): string[] {
  const questions: string[] = [];
  if (input.productFamily === 'General') {
    questions.push('Which product is involved: DuraFlex, DuraCore, DuraBolt, AnyJet, cutter, RIP, or another system?');
  }
  if (input.intent === 'connectivity' && !/\b(network|ethernet|usb|rip|gui|job|ip)\b/i.test(input.query)) {
    questions.push('Is the connection issue network/Ethernet, USB, RIP/job submission, or printer GUI access?');
  }
  if (input.intent === 'troubleshooting' && input.errorCodes.length === 0 && input.symptoms.length === 0) {
    questions.push('What exact error code, alarm text, or visible symptom is shown?');
  }
  if (input.intent === 'print_quality' && !/\bink|media|nozzle|band|head|maintenance|recent\b/i.test(input.query)) {
    questions.push('What ink/media is loaded, and was there recent maintenance or downtime?');
  }
  return questions.slice(0, 3);
}
