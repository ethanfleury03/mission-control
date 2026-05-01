import { createQueryRecord, insertQueryResults, updateQueryRecord } from './db';
import { hasChatProvider } from './config';
import { parseSupportQueryWithModel } from './metadata';
import { chatCompletion } from './providers';
import { searchManuals } from './retrieval';
import type {
  ChunkCandidate,
  DocumentType,
  ParsedSupportQuery,
  ProductFamily,
  RagAnswer,
  RagCitation,
  RagFilters,
  RagSearchDebug,
  SearchManualsInput,
  SupportSearchCall,
} from './types';

interface SupportAgentInput {
  query: string;
  filters?: RagFilters;
  includeDebug?: boolean;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode?: 'answer' | 'escalation_summary' | 'refine';
}

interface SearchPlanItem {
  query: string;
  documentType?: string;
  reason: string;
}

const MAX_AGENT_SEARCHES = Number.parseInt(process.env.RAG_AGENT_MAX_SEARCHES || '3', 10);

export async function runSupportAgent(input: SupportAgentInput): Promise<RagAnswer> {
  const workingQuery = buildWorkingQuery(input.query, input.conversationHistory);
  const parsedQuery = await parseSupportQueryWithModel(workingQuery, {
    productFamily: input.filters?.productFamily,
    documentType: input.filters?.documentType,
    version: input.filters?.softwareVersion || input.filters?.version,
  });
  const decision = decideNextStep(input.query, parsedQuery, input.filters || {}, input.mode);

  if (isSensitiveSecretRequest(input.query)) {
    return persistAgentAnswer({
      query: input.query,
      parsedQuery,
      answer: [
        'I can’t provide or infer secret/service passwords.',
        '',
        'I also won’t present a password as documented unless an indexed, appropriate Arrow source explicitly supports a safe access procedure. Use the normal Arrow escalation path for credential or access-control issues.',
        '',
        'Sources: No safe source citation returned.',
        'Confidence: Low — sensitive request, not enough safe indexed evidence.',
      ].join('\n'),
      citations: [],
      confidence: 0.1,
      debug: emptyDebug(parsedQuery, decision),
      mode: 'refusal',
    });
  }

  if (decision.askFollowupFirst && input.mode !== 'escalation_summary') {
    return persistAgentAnswer({
      query: input.query,
      parsedQuery,
      answer: buildFollowupAnswer(decision.followupQuestions),
      citations: [],
      confidence: 0.18,
      debug: emptyDebug(parsedQuery, decision),
      needsFollowup: true,
      followupQuestions: decision.followupQuestions,
      mode: 'followup',
    });
  }

  const { searchCalls, finalContext, combinedDebug } = await runSearchPlan({
    query: workingQuery,
    parsedQuery,
    filters: input.filters || {},
    mode: input.mode || 'answer',
  });
  const citations = buildCitations(finalContext, workingQuery);
  const confidence = calculateAgentConfidence({
    parsedQuery,
    finalContext,
    searchCalls,
    filters: input.filters || {},
  });

  const answer =
    input.mode === 'escalation_summary'
      ? await generateEscalationSummary({
          query: input.query,
          parsedQuery,
          context: finalContext,
          citations,
          confidence,
          conversationHistory: input.conversationHistory || [],
        })
      : await generateSupportAnswer({
          query: input.query,
          workingQuery,
          parsedQuery,
          context: finalContext,
          citations,
          confidence,
          followupQuestions: decision.followupQuestions,
          searchCalls,
        });

  return persistAgentAnswer({
    query: input.query,
    parsedQuery,
    answer,
    citations,
    confidence,
    debug: {
      ...combinedDebug,
      searchCalls,
      decision,
    },
    needsFollowup: confidence < 0.45 && decision.followupQuestions.length > 0,
    followupQuestions: decision.followupQuestions,
    mode: input.mode === 'escalation_summary' ? 'escalation_summary' : 'answer',
  });
}

async function runSearchPlan(input: {
  query: string;
  parsedQuery: ParsedSupportQuery;
  filters: RagFilters;
  mode: 'answer' | 'escalation_summary' | 'refine';
}): Promise<{ searchCalls: SupportSearchCall[]; finalContext: ChunkCandidate[]; combinedDebug: RagSearchDebug }> {
  const plan = buildSearchPlan(input.query, input.parsedQuery, input.filters, input.mode).slice(0, MAX_AGENT_SEARCHES);
  const searchCalls: SupportSearchCall[] = [];
  const allResults = new Map<string, ChunkCandidate>();
  let lastDebug: RagSearchDebug | null = null;

  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index];
    const manualSearch = await searchManuals(toSearchManualsInput(item, input.parsedQuery, input.filters));
    const chunks = manualSearch.chunks.map((chunk) => ({
      ...chunk,
      rerankReason: chunk.rerankReason || item.reason,
    }));
    const topScore = chunks[0]?.rerankScore || chunks[0]?.combinedScore || 0;
    const weak = isWeakResult(chunks, input.parsedQuery, input.filters);
    const call: SupportSearchCall = {
      id: `search_${index + 1}`,
      query: item.query,
      filters: manualSearch.filters,
      intent: input.parsedQuery.intent,
      resultCount: chunks.length,
      topScore,
      weak,
      reason: item.reason,
      results: chunks,
    };
    searchCalls.push(call);
    lastDebug = manualSearch.debug;

    for (const chunk of chunks) {
      const existing = allResults.get(chunk.id);
      if (!existing || scoreChunk(chunk) > scoreChunk(existing)) {
        allResults.set(chunk.id, chunk);
      }
    }

    if (!weak && index > 0) break;
    if (!weak && input.parsedQuery.intent !== 'comparison') break;
  }

  const finalContext = selectFinalContext([...allResults.values()], input.parsedQuery, input.filters);
  const combinedDebug: RagSearchDebug = {
    parsedQuery: input.parsedQuery,
    filtersApplied: input.filters,
    vectorResults: searchCalls.flatMap((call) => call.results.filter((result) => result.vectorScore > 0)).slice(0, 40),
    keywordResults: searchCalls.flatMap((call) => call.results.filter((result) => result.keywordScore > 0)).slice(0, 40),
    mergedResults: [...allResults.values()].sort((a, b) => scoreChunk(b) - scoreChunk(a)).slice(0, 40),
    rerankedResults: [...allResults.values()].sort((a, b) => scoreChunk(b) - scoreChunk(a)).slice(0, 40),
    finalContext,
    searchCalls,
    decision: {
      searched: searchCalls.length,
      lastFilters: lastDebug?.filtersApplied || input.filters,
    },
  };

  return { searchCalls, finalContext, combinedDebug };
}

function buildSearchPlan(
  query: string,
  parsed: ParsedSupportQuery,
  filters: RagFilters,
  mode: 'answer' | 'escalation_summary' | 'refine',
): SearchPlanItem[] {
  const product = filters.productFamily || parsed.product_family;
  const baseTerms = [
    product,
    parsed.product_model,
    parsed.software_version,
    ...parsed.error_codes,
    ...parsed.part_numbers,
    ...parsed.symptoms,
  ].filter(Boolean);
  const primary = [query, ...baseTerms].join(' ');
  const docType = filters.documentType || parsed.document_type || docTypeForAgentIntent(parsed.intent);
  const items: SearchPlanItem[] = [
    {
      query: primary,
      documentType: docType || undefined,
      reason: 'targeted search from parsed product, intent, symptoms, versions, and UI filters',
    },
  ];

  if (['print_quality', 'maintenance', 'troubleshooting'].includes(parsed.intent)) {
    items.push({
      query: [product, ...parsed.symptoms, 'troubleshooting maintenance service procedure printhead nozzle hydration declog'].filter(Boolean).join(' '),
      documentType: parsed.intent === 'print_quality' ? 'print_quality' : 'service_procedure',
      reason: 'alternate support-procedure search for symptoms and recovery steps',
    });
  }

  if (parsed.intent === 'connectivity' || /\bconnect|network|usb|ethernet|rip|job\b/i.test(query)) {
    items.push({
      query: [product, 'connectivity network USB Ethernet RIP job submission connection setup'].filter(Boolean).join(' '),
      documentType: 'connectivity',
      reason: 'alternate connectivity/job-submission search',
    });
  }

  if (['release_notes', 'software_release_notes', 'software'].includes(parsed.intent) || /\bwhat changed|release notes|latest\b/i.test(query)) {
    items.push({
      query: [product, parsed.software_version, 'software release notes changelog version history latest'].filter(Boolean).join(' '),
      documentType: 'software_release_notes',
      reason: 'release-note/version search with recency preference',
    });
  }

  if (parsed.intent === 'installation') {
    items.push({
      query: [product, 'installation commissioning setup guide required checks common mistakes'].filter(Boolean).join(' '),
      documentType: 'installation_guide',
      reason: 'installation guide search',
    });
  }

  if (mode === 'escalation_summary') {
    items.push({
      query: [product, ...parsed.symptoms, ...parsed.error_codes, 'troubleshooting escalation support procedure'].filter(Boolean).join(' '),
      documentType: 'troubleshooting_guide',
      reason: 'escalation context search',
    });
  }

  return dedupePlan(items);
}

function toSearchManualsInput(item: SearchPlanItem, parsed: ParsedSupportQuery, filters: RagFilters): SearchManualsInput {
  return {
    query: item.query,
    productFamily: filters.productFamily || parsed.product_family || undefined,
    productModel: filters.productModel || parsed.product_model || undefined,
    documentType: filters.documentType || item.documentType || undefined,
    softwareVersion: filters.softwareVersion || filters.version || parsed.software_version || undefined,
    intent: parsed.intent,
    restrictDocumentIds: filters.documentIds || (filters.documentId ? [filters.documentId] : undefined),
    topK: 8,
  };
}

function decideNextStep(
  originalQuery: string,
  parsed: ParsedSupportQuery,
  filters: RagFilters,
  mode?: string,
): { askFollowupFirst: boolean; followupQuestions: string[]; reason: string } {
  if (mode === 'escalation_summary') {
    return { askFollowupFirst: false, followupQuestions: parsed.followup_questions, reason: 'summary requested' };
  }

  const hasProduct = Boolean(filters.productFamily || parsed.product_family);
  const documentLookup = /\b(find|where|which document|manual|source|procedure|release notes|part number|printhead identification)\b/i.test(originalQuery);
  const hasSpecificEntity =
    documentLookup ||
    parsed.error_codes.length > 0 ||
    parsed.part_numbers.length > 0 ||
    parsed.software_version ||
    parsed.symptoms.some((symptom) => !['not working', 'not connecting'].includes(symptom));
  const vagueIssue = /\b(printer|machine|system|it)\s+(won'?t|will not|not|isn'?t).*(work|connect|print)|\bnot working\b/i.test(originalQuery);

  const questions = [...parsed.followup_questions];
  if (!hasProduct && ['troubleshooting', 'connectivity', 'print_quality'].includes(parsed.intent) && !documentLookup) {
    return {
      askFollowupFirst: true,
      followupQuestions: questions.length > 0 ? questions : ['Which system is this on — DuraFlex, DuraCore, DuraBolt, AnyJet, a cutter, or RIP/workflow software?'],
      reason: 'product is required to avoid mixing similar product lines',
    };
  }

  if (!hasProduct && ['release_notes', 'software_release_notes'].includes(parsed.intent)) {
    return {
      askFollowupFirst: true,
      followupQuestions: ['Which product family are the release notes for — DuraFlex, DuraCore, DuraBolt, AnyJet, cutter, or RIP/workflow software?'],
      reason: 'versioned release notes require product family',
    };
  }

  if (vagueIssue && !hasSpecificEntity) {
    return {
      askFollowupFirst: true,
      followupQuestions: questions.length > 0 ? questions : ['Which product is this, and is the issue with connectivity, print quality, software/RIP, or mechanical operation?'],
      reason: 'issue is too broad for safe documented troubleshooting',
    };
  }

  return {
    askFollowupFirst: false,
    followupQuestions: questions,
    reason: hasSpecificEntity ? 'specific searchable entity found' : 'query can be searched with available filters',
  };
}

async function generateSupportAnswer(input: {
  query: string;
  workingQuery: string;
  parsedQuery: ParsedSupportQuery;
  context: ChunkCandidate[];
  citations: RagCitation[];
  confidence: number;
  followupQuestions: string[];
  searchCalls: SupportSearchCall[];
}): Promise<string> {
  if (input.context.length === 0) {
    return buildNoEvidenceAnswer(input.followupQuestions);
  }

  const canUseLlm = hasChatProvider('answer');
  if (!canUseLlm) return buildExtractiveAnswer(input);

  try {
    const result = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: [
            'You are an Arrow Systems technical support assistant.',
            'Use only the provided source chunks for technical claims.',
            'Cite every technical claim with the document title/filename and page range.',
            'Do not invent part numbers, passwords, specs, firmware steps, or procedures.',
            'Distinguish DuraFlex, DuraCore, DuraBolt, AnyJet, Cutter, RIP, and Dura-Printer/MCS.',
            'If evidence is weak, say so and ask targeted follow-up questions.',
            'Warn/escalate for electrical work, hardware disassembly, firmware flashing, printhead-damaging procedures, or ink/chemical handling.',
            'Before finalizing, self-check that sources match product/version, citations are present, unsupported claims are removed, and confidence is not overstated.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              userQuestion: input.query,
              workingQuery: input.workingQuery,
              parsedQuery: input.parsedQuery,
              answerFormat: answerFormatForIntent(input.parsedQuery.intent),
              confidenceGuidance: confidenceExplanation(input.confidence, input.parsedQuery, input.context),
              followupQuestions: input.followupQuestions,
              searchesPerformed: input.searchCalls.map((call) => ({
                query: call.query,
                filters: call.filters,
                resultCount: call.resultCount,
                topScore: call.topScore,
                weak: call.weak,
                reason: call.reason,
              })),
              sources: input.context.map((chunk, index) => ({
                sourceId: `S${index + 1}`,
                documentTitle: chunk.documentTitle,
                filename: chunk.filename,
                productFamily: chunk.productFamily,
                documentType: chunk.documentType,
                version: chunk.version,
                softwareVersion: chunk.softwareVersion,
                revisionDate: chunk.revisionDate,
                pages: `${chunk.pageStart}-${chunk.pageEnd}`,
                text: chunk.text,
              })),
            },
            null,
            2,
          ),
        },
      ],
      temperature: 0.05,
      maxTokens: 2200,
    });
    return ensureSourcesSection(result.content, input.citations, input.confidence);
  } catch (error) {
    console.warn('[rag] agent answer generation failed:', error instanceof Error ? error.message : error);
    return buildExtractiveAnswer(input);
  }
}

async function generateEscalationSummary(input: {
  query: string;
  parsedQuery: ParsedSupportQuery;
  context: ChunkCandidate[];
  citations: RagCitation[];
  confidence: number;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<string> {
  const canUseLlm = hasChatProvider('answer');
  if (!canUseLlm) return buildFallbackEscalationSummary(input);

  try {
    const result = await chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'Create a concise Arrow Systems support escalation summary. Use only the conversation and provided source chunks. Do not invent facts. Include source citations.',
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              latestUserRequest: input.query,
              parsedQuery: input.parsedQuery,
              conversationHistory: input.conversationHistory.slice(-8),
              sources: input.context.map((chunk, index) => ({
                sourceId: `S${index + 1}`,
                documentTitle: chunk.documentTitle,
                filename: chunk.filename,
                pages: `${chunk.pageStart}-${chunk.pageEnd}`,
                text: chunk.text.slice(0, 1200),
              })),
              requiredFormat: [
                'Product:',
                'Model/version:',
                'Symptom:',
                'Error codes:',
                'Steps already tried:',
                'Relevant docs checked:',
                'Findings:',
                'Recommended next action:',
                'Open questions:',
                'Source citations:',
              ],
            },
            null,
            2,
          ),
        },
      ],
      temperature: 0.05,
      maxTokens: 1400,
    });
    return ensureSourcesSection(result.content, input.citations, input.confidence);
  } catch {
    return buildFallbackEscalationSummary(input);
  }
}

async function persistAgentAnswer(input: {
  query: string;
  parsedQuery: ParsedSupportQuery;
  answer: string;
  citations: RagCitation[];
  confidence: number;
  debug: RagSearchDebug;
  needsFollowup?: boolean;
  followupQuestions?: string[];
  mode?: RagAnswer['mode'];
}): Promise<RagAnswer> {
  const queryId = await createQueryRecord({
    userQuery: input.query,
    parsedIntent: {
      ...input.parsedQuery,
      agentDebug: {
        decision: input.debug.decision,
        searchCalls: input.debug.searchCalls?.map((call) => ({
          id: call.id,
          query: call.query,
          filters: call.filters,
          resultCount: call.resultCount,
          topScore: call.topScore,
          weak: call.weak,
          reason: call.reason,
        })),
        finalContext: input.debug.finalContext.map((chunk) => ({
          chunkId: chunk.id,
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle,
          pages: `${chunk.pageStart}-${chunk.pageEnd}`,
          vectorScore: chunk.vectorScore,
          keywordScore: chunk.keywordScore,
          metadataBoost: chunk.metadataBoost,
          deterministicScore: chunk.deterministicScore,
          llmRerankScore: chunk.llmRerankScore,
          finalScore: chunk.finalScore || chunk.rerankScore,
          reason: chunk.rerankReason,
        })),
        citations: input.citations,
      },
    },
    answer: '',
    confidence: input.confidence,
  });
  await updateQueryRecord({ queryId, answer: input.answer, confidence: input.confidence });
  await insertQueryResults({ queryId, results: input.debug.finalContext.slice(0, 20) });
  return {
    queryId,
    answer: input.answer,
    citations: input.citations,
    confidence: input.confidence,
    parsedQuery: input.parsedQuery,
    debug: input.debug,
    needsFollowup: input.needsFollowup,
    followupQuestions: input.followupQuestions,
    mode: input.mode,
  };
}

function buildWorkingQuery(query: string, history: SupportAgentInput['conversationHistory'] = []): string {
  const recent = history
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');
  return recent ? `${recent}\nuser: ${query}` : query;
}

function isSensitiveSecretRequest(query: string): boolean {
  return /\b(secret|password|service password|admin password|bypass|unlock code|backdoor)\b/i.test(query);
}

function emptyDebug(parsedQuery: ParsedSupportQuery, decision: Record<string, unknown>): RagSearchDebug {
  return {
    parsedQuery,
    filtersApplied: {},
    vectorResults: [],
    keywordResults: [],
    mergedResults: [],
    rerankedResults: [],
    finalContext: [],
    searchCalls: [],
    decision,
  };
}

function isWeakResult(chunks: ChunkCandidate[], parsed: ParsedSupportQuery, filters: RagFilters): boolean {
  if (chunks.length === 0) return true;
  const top = chunks[0];
  const topScore = scoreChunk(top);
  const requiredProduct = filters.productFamily || parsed.product_family;
  const sameProduct = !requiredProduct || top.productFamily === requiredProduct || top.productFamily === 'General';
  const exactEntity = [...parsed.error_codes, ...parsed.part_numbers, ...parsed.symptoms].some((entity) =>
    top.text.toLowerCase().includes(entity.toLowerCase()),
  );
  return topScore < 0.2 || !sameProduct || (topScore < 0.38 && !exactEntity);
}

function selectFinalContext(chunks: ChunkCandidate[], parsed: ParsedSupportQuery, filters: RagFilters): ChunkCandidate[] {
  const requiredProduct = filters.productFamily || parsed.product_family;
  return chunks
    .map((chunk) => ({
      ...chunk,
      rerankScore: Number(Math.min(1, scoreChunk(chunk) + finalSelectionBoost(chunk, parsed, requiredProduct)).toFixed(4)),
    }))
    .sort((a, b) => {
      if (parsed.intent === 'release_notes' || parsed.intent === 'software_release_notes') {
        const dateDelta = dateValue(b.revisionDate) - dateValue(a.revisionDate);
        if (dateDelta !== 0) return dateDelta;
      }
      return scoreChunk(b) - scoreChunk(a);
    })
    .filter((chunk) => !requiredProduct || chunk.productFamily === requiredProduct || chunk.productFamily === 'General')
    .slice(0, 8);
}

function finalSelectionBoost(chunk: ChunkCandidate, parsed: ParsedSupportQuery, requiredProduct: string): number {
  let boost = 0;
  if (requiredProduct && chunk.productFamily === requiredProduct) boost += 0.08;
  if (parsed.document_type && chunk.documentType === parsed.document_type) boost += 0.05;
  if (parsed.software_version && chunk.softwareVersion.toLowerCase() === parsed.software_version.toLowerCase()) boost += 0.08;
  return boost;
}

function buildCitations(chunks: ChunkCandidate[], query: string): RagCitation[] {
  const seen = new Set<string>();
  const citations: RagCitation[] = [];
  for (const chunk of chunks) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    citations.push({
      document_id: chunk.documentId,
      document_title: chunk.documentTitle,
      filename: chunk.filename,
      page_start: chunk.pageStart,
      page_end: chunk.pageEnd,
      chunk_id: chunk.id,
      quoted_text: bestExcerpt(chunk.text, query),
    });
    if (citations.length >= 6) break;
  }
  return citations;
}

function calculateAgentConfidence(input: {
  parsedQuery: ParsedSupportQuery;
  finalContext: ChunkCandidate[];
  searchCalls: SupportSearchCall[];
  filters: RagFilters;
}): number {
  if (input.finalContext.length === 0) return 0.08;
  const top = input.finalContext[0];
  const topScore = scoreChunk(top);
  const requiredProduct = input.filters.productFamily || input.parsedQuery.product_family;
  const exactProduct = requiredProduct && top.productFamily === requiredProduct;
  const exactDocType = input.parsedQuery.document_type && top.documentType === input.parsedQuery.document_type;
  const exactEntity = [...input.parsedQuery.error_codes, ...input.parsedQuery.part_numbers, ...input.parsedQuery.symptoms].some((entity) =>
    top.text.toLowerCase().includes(entity.toLowerCase()),
  );
  let confidence = topScore * 0.65 + Math.min(0.2, input.finalContext.length * 0.025);
  if (exactProduct) confidence += 0.12;
  if (exactDocType) confidence += 0.06;
  if (exactEntity) confidence += 0.08;
  if (input.searchCalls.every((call) => call.weak)) confidence -= 0.18;
  if (input.parsedQuery.missing_info && input.parsedQuery.missing_info.length > 0) confidence -= 0.08;
  return Number(Math.max(0.08, Math.min(0.94, confidence)).toFixed(2));
}

function buildFollowupAnswer(questions: string[]): string {
  return [
    'I need one or two details before I can safely search the right Arrow manuals.',
    '',
    ...questions.slice(0, 3).map((question) => `- ${question}`),
    '',
    'Confidence: Low — the issue is ambiguous enough that searching now could mix product lines or procedures.',
  ].join('\n');
}

function buildNoEvidenceAnswer(followupQuestions: string[]): string {
  return [
    'I couldn’t find enough support evidence in the indexed manuals to answer that safely.',
    '',
    'Closest next step: confirm the exact product, model/software version, and any error code or symptom, then ingest the relevant manual or run the Search Debugger.',
    '',
    followupQuestions.length > 0 ? `Follow-up questions:\n${followupQuestions.map((question) => `- ${question}`).join('\n')}` : '',
    '',
    'Sources: No reliable source chunks returned.',
    'Confidence: Low — no exact source found in indexed manuals.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildExtractiveAnswer(input: {
  query: string;
  parsedQuery: ParsedSupportQuery;
  context: ChunkCandidate[];
  citations: RagCitation[];
  confidence: number;
  followupQuestions: string[];
}): string {
  const findings = input.context
    .slice(0, 4)
    .map((chunk, index) => {
      const pages = chunk.pageStart === chunk.pageEnd ? `page ${chunk.pageStart}` : `pages ${chunk.pageStart}-${chunk.pageEnd}`;
      return `${index + 1}. ${chunk.documentTitle} / ${chunk.filename}, ${pages}: ${bestExcerpt(chunk.text, input.query)}`;
    })
    .join('\n');

  return [
    headingForIntent(input.parsedQuery.intent),
    findings,
    '',
    'Step-by-step next actions',
    '1. Verify the cited document matches the exact product/model and software version.',
    '2. Follow only the cited procedure or collect the missing details listed below.',
    '3. Escalate to a trained technician if the step involves electrical work, disassembly, firmware flashing, printhead recovery risk, or ink/chemical handling.',
    '',
    input.followupQuestions.length > 0
      ? `What to collect if it still fails\n${input.followupQuestions.map((question) => `- ${question}`).join('\n')}`
      : 'What to collect if it still fails\n- Product model, software version, exact symptom/error, recent maintenance, ink/media, and photos/screenshots if relevant.',
    '',
    'Sources',
    formatSources(input.citations),
    '',
    `Confidence: ${confidenceLabel(input.confidence)} — ${confidenceExplanation(input.confidence, input.parsedQuery, input.context)}`,
  ].join('\n');
}

function buildFallbackEscalationSummary(input: {
  query: string;
  parsedQuery: ParsedSupportQuery;
  context: ChunkCandidate[];
  citations: RagCitation[];
  confidence: number;
}): string {
  return [
    `Product: ${input.parsedQuery.product_family || 'Unknown'}`,
    `Model/version: ${[input.parsedQuery.product_model, input.parsedQuery.software_version].filter(Boolean).join(' / ') || 'Unknown'}`,
    `Symptom: ${input.parsedQuery.symptoms.join(', ') || input.query}`,
    `Error codes: ${input.parsedQuery.error_codes.join(', ') || 'None provided'}`,
    'Steps already tried: Not provided',
    `Relevant docs checked: ${input.context.map((chunk) => `${chunk.documentTitle} pages ${chunk.pageStart}-${chunk.pageEnd}`).join('; ') || 'No relevant docs found'}`,
    `Findings: ${input.context[0] ? bestExcerpt(input.context[0].text, input.query) : 'No supported finding in indexed manuals.'}`,
    'Recommended next action: Confirm missing product/model/version details and route to trained support if hardware, electrical, firmware, or ink/chemical handling is involved.',
    `Open questions: ${(input.parsedQuery.missing_info || []).join(', ') || 'None captured'}`,
    `Source citations: ${formatSources(input.citations) || 'No citations available'}`,
    `Confidence: ${confidenceLabel(input.confidence)}`,
  ].join('\n');
}

function ensureSourcesSection(answer: string, citations: RagCitation[], confidence: number): string {
  const hasSources = /\bSources?\b/i.test(answer);
  const hasConfidence = /\bConfidence\b/i.test(answer);
  return [
    answer.trim(),
    hasSources ? '' : `\nSources\n${formatSources(citations) || 'No citations available.'}`,
    hasConfidence ? '' : `\nConfidence: ${confidenceLabel(confidence)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatSources(citations: RagCitation[]): string {
  return citations
    .map((citation) => {
      const pages = citation.page_start === citation.page_end ? `page ${citation.page_start}` : `pages ${citation.page_start}-${citation.page_end}`;
      return `- Source: ${citation.document_title} / ${citation.filename}, ${pages}. Quote: "${citation.quoted_text}"`;
    })
    .join('\n');
}

function bestExcerpt(text: string, query: string): string {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const queryTerms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3);
  const best =
    sentences
      .map((sentence) => ({
        sentence,
        score: queryTerms.reduce((sum, term) => sum + (sentence.toLowerCase().includes(term) ? 1 : 0), 0),
      }))
      .sort((a, b) => b.score - a.score)[0]?.sentence ||
    sentences[0] ||
    text.replace(/\s+/g, ' ').trim();
  return best.length > 320 ? `${best.slice(0, 317).trim()}...` : best;
}

function answerFormatForIntent(intent: string): string[] {
  if (intent === 'installation') return ['Before you start', 'Required checks', 'Steps', 'Common mistakes', 'Sources', 'Confidence'];
  if (intent === 'release_notes' || intent === 'software_release_notes') return ['Short summary', 'Changes by category', 'Impact / who cares', 'Source release notes', 'Confidence'];
  if (intent === 'parts' || intent === 'spare_parts') return ['Part/procedure found', 'Exact source', 'Caveats', 'Confirm model/version if needed', 'Confidence'];
  return ['Likely issue / short answer', 'What the docs say', 'Step-by-step checks', 'What info to collect if it still fails', 'Sources', 'Confidence'];
}

function headingForIntent(intent: string): string {
  if (intent === 'installation') return 'Before you start';
  if (intent === 'release_notes' || intent === 'software_release_notes') return 'Short summary';
  if (intent === 'parts' || intent === 'spare_parts') return 'Part/procedure found';
  return 'Likely issue / short answer';
}

function confidenceExplanation(confidence: number, parsed: ParsedSupportQuery, context: ChunkCandidate[]): string {
  if (confidence >= 0.72) return `High: exact/relevant ${parsed.product_family || 'product'} source material was found.`;
  if (confidence >= 0.45) return 'Medium: relevant docs were found, but model/version or exact symptom may still need confirmation.';
  if (context.length > 0) return 'Low: only weak or general matching source material was found.';
  return 'Low: no exact source found in indexed manuals.';
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.72) return `High (${confidence.toFixed(2)})`;
  if (confidence >= 0.45) return `Medium (${confidence.toFixed(2)})`;
  return `Low (${confidence.toFixed(2)})`;
}

function docTypeForAgentIntent(intent: string): DocumentType | '' {
  switch (intent) {
    case 'installation':
      return 'installation_guide';
    case 'parts':
    case 'spare_parts':
      return 'spare_parts';
    case 'release_notes':
    case 'software_release_notes':
      return 'software_release_notes';
    case 'connectivity':
      return 'connectivity';
    case 'print_quality':
    case 'calibration':
      return 'print_quality';
    case 'maintenance':
      return 'service_procedure';
    case 'system_requirements':
      return 'system_requirements';
    case 'job_submission':
      return 'job_submission';
    case 'troubleshooting':
      return 'troubleshooting_guide';
    default:
      return '';
  }
}

function dedupePlan(items: SearchPlanItem[]): SearchPlanItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.query.toLowerCase()}|${item.documentType || ''}`;
    if (seen.has(key) || !item.query.trim()) return false;
    seen.add(key);
    return true;
  });
}

function scoreChunk(chunk: ChunkCandidate): number {
  return Math.max(chunk.rerankScore || 0, chunk.combinedScore || 0, chunk.vectorScore || 0, Math.min(1, (chunk.keywordScore || 0) * 3));
}

function dateValue(value: string | null): number {
  if (!value) return 0;
  const date = new Date(value).getTime();
  return Number.isNaN(date) ? 0 : date;
}
