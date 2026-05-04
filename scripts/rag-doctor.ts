import { collectRagHealth } from '../lib/rag/health';
import { extractJsonObject, runChatCompletion } from '../lib/rag/providers';
import { loadLocalEnv } from './rag-env';

async function main() {
  loadLocalEnv();
  const health = await collectRagHealth();
  const icon = health.ready ? 'READY' : health.ok ? 'CONFIGURED' : 'NOT READY';
  console.log(`RAG doctor: ${icon}`);
  console.log(`Checked: ${health.checkedAt}`);
  console.log(`Database: ${health.databaseUrl.safeDisplay || 'not set'}`);
  console.log(`Chat provider: ${health.config.chatProvider} configured with model ${health.config.chatModel}`);
  console.log(`Query parser: ${health.config.queryParserModel}`);
  console.log(`Metadata extractor: ${health.config.metadataModel}`);
  console.log(`Reranker: ${health.config.rerankProvider} / ${health.config.rerankModel}`);
  console.log(`Embeddings: ${health.config.embeddingProvider} ${health.config.embeddingModel}`);
  if (health.config.longContextConfigured) console.log(`Long context model: ${health.config.longContextModel}`);
  console.log('');

  for (const check of health.checks) {
    const status = check.ok ? 'PASS' : check.severity === 'error' ? 'FAIL' : 'WARN';
    console.log(`${status.padEnd(4)} ${check.name}: ${check.message}`);
    if (check.detail) console.log(`     ${check.detail}`);
  }

  console.log('');
  console.log(
    `Indexed content: ${health.summary.documents} document(s), ${health.summary.chunks} chunk(s), ${health.summary.embeddings} embedding(s).`,
  );

  if (health.nextSteps.length > 0) {
    console.log('');
    console.log('Next steps:');
    for (const step of health.nextSteps) console.log(`- ${step}`);
  }

  if (health.config.longContextModel.includes(':free')) {
    console.log('');
    console.log('Warning: RAG_LONG_CONTEXT_MODEL uses a free endpoint. Do not send confidential manuals unless approved.');
  }

  if (process.env.RAG_DOCTOR_LIVE_MODEL_TEST === 'true') {
    await runLiveModelChecks();
  }

  if (!health.ready) process.exit(1);
}

async function runLiveModelChecks() {
  console.log('');
  console.log('Live model checks:');
  const checks = [
    {
      task: 'query_parser' as const,
      messages: [
        { role: 'system' as const, content: 'Return JSON only: {"intent":"connectivity","product_family":"DuraFlex"}' },
        { role: 'user' as const, content: 'How do I connect to a DuraFlex printer?' },
      ],
      responseFormat: 'json' as const,
    },
    {
      task: 'metadata_extractor' as const,
      messages: [
        { role: 'system' as const, content: 'Return JSON only: {"title":"DuraFlex Test","product_family":"DuraFlex","document_type":"user_manual"}' },
        { role: 'user' as const, content: 'Filename: DuraFlex User Manual.pdf' },
      ],
      responseFormat: 'json' as const,
    },
    {
      task: 'answer' as const,
      messages: [
        { role: 'system' as const, content: 'Reply with exactly: ok' },
        { role: 'user' as const, content: 'ping' },
      ],
      responseFormat: 'text' as const,
    },
    ...(process.env.RAG_RERANK_MODEL?.trim()
      ? [
          {
            task: 'reranker' as const,
            messages: [
              { role: 'system' as const, content: 'Return JSON only: {"results":[{"id":"a","score":1,"reason":"exact","directAnswer":true,"productMatch":true,"docTypeMatch":true,"versionMatch":true}]}' },
              { role: 'user' as const, content: 'query: DuraFlex connect\ncandidate a: DuraFlex connection steps' },
            ],
            responseFormat: 'json' as const,
          },
        ]
      : []),
  ];

  for (const check of checks) {
    try {
      const result = await runChatCompletion({
        task: check.task,
        messages: check.messages,
        responseFormat: check.responseFormat,
        temperature: 0,
        maxTokens: 120,
      });
      if (check.responseFormat === 'json' && !extractJsonObject(result.content)) {
        console.log(`WARN ${check.task}: model responded but JSON could not be parsed (${result.provider}/${result.model}).`);
      } else {
        console.log(`PASS ${check.task}: ${result.provider}/${result.model}`);
      }
    } catch (error) {
      console.log(`FAIL ${check.task}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
