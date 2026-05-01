import fs from 'node:fs/promises';
import path from 'node:path';

import { runRagQuery } from '../lib/rag/answer';
import { parseSupportQuery } from '../lib/rag/metadata';
import { searchRag } from '../lib/rag/retrieval';
import { loadLocalEnv } from './rag-env';

interface EvalQuestion {
  id: string;
  question: string;
  expectedProduct?: string;
  expectedIntent?: string;
  expectedDocTitleIncludes?: string[];
  expectedDocType?: string;
  mustAskFollowup?: boolean;
  mustCite?: boolean;
  shouldRefuse?: boolean;
  wrongProductMustNotAppear?: string[];
  mode?: 'answer' | 'escalation_summary';
}

type EvalMode = 'all' | 'retrieval' | 'agent';

async function main() {
  loadLocalEnv();
  const mode = readMode();
  const questionsPath = path.join(process.cwd(), 'eval/questions.json');
  const questions = JSON.parse(await fs.readFile(questionsPath, 'utf8')) as EvalQuestion[];
  await fs.mkdir(path.join(process.cwd(), 'eval'), { recursive: true });

  const results = [];
  for (const item of questions) {
    console.log(`Evaluating ${item.id}: ${item.question}`);
    const parsed = parseSupportQuery(item.question);
    const result: Record<string, unknown> = {
      id: item.id,
      question: item.question,
      expected: item,
      parsed,
      retrieval: null,
      agent: null,
      failures: [] as string[],
      hints: [] as string[],
    };

    if (mode === 'all' || mode === 'retrieval') {
      result.retrieval = await runRetrievalEval(item, result.failures as string[], result.hints as string[]);
    }
    if (mode === 'all' || mode === 'agent') {
      result.agent = await runAgentEval(item, result.failures as string[], result.hints as string[]);
    }

    if (item.expectedProduct && parsed.product_family !== item.expectedProduct) {
      (result.failures as string[]).push(`Parsed product ${parsed.product_family || 'none'} did not match ${item.expectedProduct}.`);
    }
    if (item.expectedIntent && parsed.intent !== item.expectedIntent) {
      (result.failures as string[]).push(`Parsed intent ${parsed.intent} did not match ${item.expectedIntent}.`);
    }
    results.push(result);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    summary: {
      total: results.length,
      passed: results.filter((result) => (result.failures as string[]).length === 0).length,
      failed: results.filter((result) => (result.failures as string[]).length > 0).length,
    },
    results,
  };
  const jsonPath = path.join(process.cwd(), 'eval/rag-report.json');
  const markdownPath = path.join(process.cwd(), 'eval/rag-report.md');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(markdownPath, renderMarkdown(report));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);

  if (report.summary.failed > 0) process.exit(1);
}

async function runRetrievalEval(item: EvalQuestion, failures: string[], hints: string[]) {
  try {
    const debug = await searchRag({ query: item.question, topK: 8, includeDebug: true });
    const topFive = debug.rerankedResults.slice(0, 5).map(summarizeResult);
    const finalContext = debug.finalContext.map(summarizeResult);
    const expectedDocInTop5 = matchesExpectedDoc(topFive, item.expectedDocTitleIncludes);
    const expectedDocInFinal = matchesExpectedDoc(finalContext, item.expectedDocTitleIncludes);
    const wrongProducts = findWrongProducts([...topFive, ...finalContext], item.wrongProductMustNotAppear || []);

    if (item.expectedDocTitleIncludes?.length && !expectedDocInTop5) {
      failures.push(`Expected doc title keywords not found in retrieval top 5: ${item.expectedDocTitleIncludes.join(', ')}.`);
      hints.push('Use Search Debugger: check metadata filters, extraction quality, keyword query, and reranker reason.');
    }
    if (item.expectedDocTitleIncludes?.length && !expectedDocInFinal) {
      failures.push(`Expected doc title keywords not found in final context: ${item.expectedDocTitleIncludes.join(', ')}.`);
      hints.push('Expected document may be retrieved but dropped by final context selection.');
    }
    if (item.expectedDocType && !finalContext.some((doc) => doc.documentType === item.expectedDocType)) {
      failures.push(`Expected doc type ${item.expectedDocType} was not present in final context.`);
    }
    if (wrongProducts.length > 0) {
      failures.push(`Wrong product appeared in retrieval: ${wrongProducts.join(', ')}.`);
    }

    return {
      ok: true,
      parsedQuery: debug.parsedQuery,
      filtersApplied: debug.filtersApplied,
      expectedDocInTop5,
      expectedDocInFinal,
      topFive,
      finalContext,
    };
  } catch (error) {
    failures.push(`Retrieval error: ${error instanceof Error ? error.message : String(error)}`);
    hints.push('Run npm run rag:doctor to check Postgres/pgvector and indexed chunks.');
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runAgentEval(item: EvalQuestion, failures: string[], hints: string[]) {
  try {
    const response = await runRagQuery({
      query: item.question,
      includeDebug: true,
      mode: item.mode === 'escalation_summary' ? 'escalation_summary' : 'answer',
    });
    const askedFollowup = Boolean(response.needsFollowup || response.mode === 'followup' || /which product|follow-up|follow up/i.test(response.answer));
    const refused = response.mode === 'refusal' || /can't provide|couldn.t find|not enough/i.test(response.answer);
    const cited = response.citations.length > 0 || /Source:/i.test(response.answer);

    if (item.mustAskFollowup && !askedFollowup) failures.push('Agent should have asked a follow-up question.');
    if (item.mustAskFollowup === false && askedFollowup && !item.shouldRefuse) failures.push('Agent asked a follow-up when it was expected to answer/search.');
    if (item.mustCite && !cited) failures.push('Agent answer did not include citations.');
    if (item.shouldRefuse && !refused) failures.push('Agent should have refused or clearly avoided unsupported/sensitive answer.');
    if (!item.shouldRefuse && response.confidence > 0.72 && response.citations.length === 0) {
      failures.push('Agent reported high confidence without citations.');
    }
    if (response.debug.searchCalls?.some((call) => call.weak) && response.confidence > 0.72) {
      failures.push('Agent confidence appears overstated for weak retrieval results.');
    }
    if (failures.length > 0) hints.push('Inspect the stored query/debug trace in Search Debugger and Feedback.');

    return {
      ok: true,
      queryId: response.queryId,
      mode: response.mode,
      confidence: response.confidence,
      citationCount: response.citations.length,
      askedFollowup,
      refused,
      searchCalls: response.debug.searchCalls?.map((call) => ({
        query: call.query,
        filters: call.filters,
        resultCount: call.resultCount,
        topScore: call.topScore,
        weak: call.weak,
        reason: call.reason,
      })) || [],
      finalContext: response.debug.finalContext.map(summarizeResult),
    };
  } catch (error) {
    failures.push(`Agent error: ${error instanceof Error ? error.message : String(error)}`);
    hints.push('Run npm run rag:doctor and verify provider keys if you expect LLM answers.');
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function readMode(): EvalMode {
  if (process.argv.includes('--retrieval')) return 'retrieval';
  if (process.argv.includes('--agent')) return 'agent';
  return 'all';
}

function summarizeResult(result: {
  documentTitle: string;
  filename: string;
  pageStart: number;
  pageEnd: number;
  productFamily: string;
  documentType: string;
  rerankScore: number;
  rerankReason?: string;
}) {
  return {
    documentTitle: result.documentTitle,
    filename: result.filename,
    pages: `${result.pageStart}-${result.pageEnd}`,
    productFamily: result.productFamily,
    documentType: result.documentType,
    rerankScore: result.rerankScore,
    reason: result.rerankReason,
  };
}

function matchesExpectedDoc(
  docs: Array<{ documentTitle: string; filename: string }>,
  expected: string[] | undefined,
): boolean {
  if (!expected?.length) return true;
  const haystack = docs.map((doc) => `${doc.documentTitle} ${doc.filename}`.toLowerCase()).join('\n');
  return expected.some((term) => haystack.includes(term.toLowerCase()));
}

function findWrongProducts(docs: Array<{ productFamily: string }>, blocked: string[]): string[] {
  if (blocked.length === 0) return [];
  return [...new Set(docs.map((doc) => doc.productFamily).filter((product) => blocked.includes(product)))];
}

function renderMarkdown(report: { generatedAt: string; mode: string; summary: Record<string, number>; results: Array<Record<string, unknown>> }): string {
  const lines = [
    '# RAG Evaluation Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    `Summary: ${report.summary.passed}/${report.summary.total} passed`,
    '',
  ];

  for (const result of report.results) {
    const failures = result.failures as string[];
    const hints = result.hints as string[];
    lines.push(`## ${failures.length === 0 ? 'PASS' : 'FAIL'} ${result.id}`);
    lines.push('');
    lines.push(`Question: ${result.question}`);
    if (failures.length > 0) {
      lines.push('');
      lines.push('Failures:');
      for (const failure of failures) lines.push(`- ${failure}`);
    }
    if (hints.length > 0) {
      lines.push('');
      lines.push('Debugging hints:');
      for (const hint of [...new Set(hints)]) lines.push(`- ${hint}`);
    }
    const retrieval = result.retrieval as { topFive?: Array<Record<string, unknown>>; finalContext?: Array<Record<string, unknown>> } | null;
    if (retrieval?.topFive) {
      lines.push('');
      lines.push('Top retrieval docs:');
      for (const doc of retrieval.topFive) {
        lines.push(`- ${doc.documentTitle} (${doc.productFamily}, ${doc.documentType}), pages ${doc.pages}, score ${doc.rerankScore}`);
      }
    }
    const agent = result.agent as { confidence?: number; citationCount?: number; queryId?: string } | null;
    if (agent) {
      lines.push('');
      lines.push(`Agent: confidence ${agent.confidence ?? 'n/a'}, citations ${agent.citationCount ?? 'n/a'}, query ${agent.queryId ?? 'n/a'}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
