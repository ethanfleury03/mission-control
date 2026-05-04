'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Copy,
  Database,
  FileSearch,
  FileText,
  FolderUp,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { DOCUMENT_TYPES, PRODUCT_FAMILIES } from '@/lib/rag/types';
import { cn } from '../lib/utils';

type AdminView = 'chat' | 'dashboard' | 'ingest' | 'manuals' | 'jobs' | 'feedback' | 'settings';
type DetailTab = 'metadata' | 'quality' | 'pages' | 'chunks' | 'search' | 'questions';

interface RagDocument {
  id: string;
  filename: string;
  title: string;
  productFamily: string;
  productModel: string;
  documentType: string;
  version: string;
  softwareVersion: string;
  revisionDate: string | null;
  pageCount: number;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  chunkCount?: number;
  extractionQualityScore?: number;
  embeddingCount?: number;
  pages?: RagPage[];
  chunks?: RagChunk[];
}

interface RagPage {
  id: string;
  pageNumber: number;
  rawText: string;
  ocrText: string;
  combinedText: string;
  hasImages: boolean;
  hasTables: boolean;
  extractionQualityScore: number;
  metadata: Record<string, unknown>;
}

interface RagChunk {
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
  productFamily: string;
  documentType: string;
  metadata: Record<string, unknown>;
}

interface RagJob {
  id: string;
  documentId: string | null;
  filename: string;
  sourcePath: string;
  status: string;
  errorMessage: string;
  batchId: string;
  phase: string;
  progress: number;
  stats: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

interface DashboardStats {
  totals: {
    totalDocuments: number;
    totalPages: number;
    totalChunks: number;
    productsRepresented: number;
    lastSuccessfulIngestion: string | null;
  };
  products: Array<{ label: string; count: number }>;
  documentTypes: Array<{ label: string; count: number }>;
  recentJobs: RagJob[];
  failedJobs: RagJob[];
  warnings: {
    missingProduct: number;
    missingDocumentType: number;
    lowExtractionQuality: number;
    noEmbeddings: number;
    staleDocuments: number;
    needsMetadataReview: number;
  };
  health?: RagHealth;
}

interface RagHealth {
  ok: boolean;
  ready: boolean;
  checkedAt: string;
  databaseUrl: {
    present: boolean;
    isPostgres: boolean;
    isSqlite: boolean;
    safeDisplay: string;
  };
  checks: Array<{
    name: string;
    ok: boolean;
    severity: 'info' | 'warning' | 'error';
    message: string;
    detail?: string;
  }>;
  summary: {
    documents: number;
    chunks: number;
    embeddings: number;
    failedDocuments: number;
    stuckJobs: number;
  };
  config?: {
    chatProvider: string;
    chatModel: string;
    queryParserModel: string;
    metadataModel: string;
    rerankProvider: string;
    rerankModel: string;
    embeddingProvider: string;
    embeddingModel: string;
    openRouterKeyPresent: boolean;
    openAiKeyPresent: boolean;
    longContextModel: string;
    longContextConfigured: boolean;
  };
  nextSteps: string[];
}

interface QueueFile {
  id: string;
  file: File;
  hash: string;
  duplicateTitle: string;
  status: string;
  phase: string;
  progress: number;
  logs?: string[];
  startedAt?: string;
  finishedAt?: string;
  result?: IngestResult;
  error?: string;
}

interface IngestResult {
  batchId?: string;
  jobId: string;
  documentId: string | null;
  filename: string;
  status: string;
  message: string;
  pageCount: number;
  chunkCount: number;
  productFamily?: string;
  documentType?: string;
  version?: string;
  warnings?: string[];
}

const API_UPLOAD_LIMIT_BYTES = 30 * 1024 * 1024;
const INGEST_LIFECYCLE_STEPS = [
  { id: 'ready', label: 'Ready', description: 'File selected and duplicate check finished.' },
  { id: 'uploading', label: 'Uploading', description: 'Browser is sending the file to the RAG API.' },
  { id: 'server_processing', label: 'Server processing', description: 'The API is extracting text, detecting metadata, chunking, embedding, and indexing.' },
  { id: 'extracting', label: 'Extracting text', description: 'PDF/text content is being read page by page.' },
  { id: 'detecting_metadata', label: 'Detecting metadata', description: 'Product, document type, version, and revision hints are being detected.' },
  { id: 'chunking', label: 'Chunking', description: 'Pages are being split into support-ready chunks.' },
  { id: 'embedding', label: 'Embedding', description: 'Chunks are being embedded for vector search.' },
  { id: 'indexing', label: 'Indexing', description: 'Pages, chunks, metadata, and vectors are being written to Postgres.' },
  { id: 'complete', label: 'Complete or failed', description: 'Final status and warnings are available.' },
] as const;

interface DebugResult {
  parsedQuery: Record<string, unknown>;
  filtersApplied: Record<string, unknown>;
  vectorResults: SearchResult[];
  keywordResults: SearchResult[];
  mergedResults?: SearchResult[];
  rerankedResults: SearchResult[];
  finalContext: SearchResult[];
  expected?: {
    foundDocument: boolean;
    expectedInput?: string;
    document?: {
      id: string;
      title: string;
      filename: string;
      productFamily: string;
      documentType: string;
      chunkCount: number;
      extractionQualityScore?: number;
    };
    appearsIn?: Record<string, boolean>;
    likelyReason?: string;
    sampleChunks?: SearchResult[];
  } | null;
}

interface SearchResult {
  id: string;
  documentId: string;
  documentTitle: string;
  filename: string;
  pageStart: number;
  pageEnd: number;
  productFamily: string;
  documentType: string;
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
  text: string;
}

interface FeedbackRow {
  id: string;
  queryId: string | null;
  rating: string;
  notes: string;
  userQuery: string;
  answer: string;
  createdAt: string;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: SupportChatResponse;
}

interface SupportChatResponse {
  queryId: string;
  answer: string;
  citations: Array<{
    document_id: string;
    document_title: string;
    filename: string;
    page_start: number;
    page_end: number;
    chunk_id: string;
    quoted_text: string;
  }>;
  confidence: number;
  parsedQuery: Record<string, unknown>;
  debug: DebugResult & {
    searchCalls?: Array<{
      id: string;
      query: string;
      filters: Record<string, unknown>;
      resultCount: number;
      topScore: number;
      weak: boolean;
      reason: string;
    }>;
    decision?: Record<string, unknown>;
  };
  needsFollowup?: boolean;
  followupQuestions?: string[];
  mode?: string;
}

const NAV_ITEMS: Array<{ id: AdminView; label: string; description: string; icon: LucideIcon }> = [
  { id: 'chat', label: 'Support Chat', description: 'Ask cited support questions', icon: MessageSquare },
  { id: 'dashboard', label: 'Admin Dashboard', description: 'Health and warnings', icon: BarChart3 },
  { id: 'ingest', label: 'Ingest Manuals', description: 'Upload PDFs and docs', icon: Upload },
  { id: 'manuals', label: 'Manual Library', description: 'Search and manage docs', icon: Database },
  { id: 'jobs', label: 'Ingestion Jobs', description: 'Status and failures', icon: RefreshCw },
  { id: 'feedback', label: 'Feedback / Bad Answers', description: 'Review answer quality', icon: ThumbsDown },
  { id: 'settings', label: 'Settings', description: 'Read-only config', icon: Settings2 },
];

const PRODUCT_OPTIONS = ['', ...PRODUCT_FAMILIES];
const DOC_TYPE_OPTIONS = ['', ...DOCUMENT_TYPES];
const FOLDER_INPUT_PROPS = { webkitdirectory: '', directory: '', multiple: true } as Record<string, string | boolean>;

export function RagTab() {
  const [activeView, setActiveView] = useState<AdminView>('dashboard');
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [jobs, setJobs] = useState<RagJob[]>([]);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [docsResponse, jobsResponse, dashboardResponse] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/ingest/jobs'),
        fetch('/api/rag/dashboard'),
      ]);
      const [docsPayload, jobsPayload, dashboardPayload] = await Promise.all([
        docsResponse.json().catch(() => ({})),
        jobsResponse.json().catch(() => ({})),
        dashboardResponse.json().catch(() => ({})),
      ]);
      if (!dashboardResponse.ok) throw new Error(dashboardPayload.error || 'Could not load dashboard.');
      setDocuments(docsResponse.ok ? docsPayload.documents || [] : []);
      setJobs(jobsResponse.ok ? jobsPayload.jobs || [] : []);
      setDashboard(dashboardPayload);
      const loadWarnings = [docsResponse.ok ? '' : docsPayload.error, jobsResponse.ok ? '' : jobsPayload.error].filter(Boolean);
      if (loadWarnings.length > 0) setError(loadWarnings.join(' '));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load RAG admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const handler = () => setActiveView('ingest');
    window.addEventListener('rag-nav-ingest', handler);
    return () => window.removeEventListener('rag-nav-ingest', handler);
  }, []);

  return (
    <main className="flex-1 min-w-0 overflow-hidden bg-[#f6f7f9]">
      <div className="flex h-full min-h-0">
        <aside className="hidden w-72 shrink-0 border-r border-neutral-200 bg-white lg:flex lg:flex-col">
          <div className="border-b border-neutral-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-brand" />
              <div>
                <h1 className="text-sm font-semibold text-neutral-950">RAG Admin</h1>
                <p className="text-2xs text-neutral-500">Support manual knowledge base</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                    activeView === item.id
                      ? 'border-brand bg-brand text-white shadow-sm'
                      : 'border-transparent text-neutral-700 hover:border-neutral-200 hover:bg-neutral-50',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                      activeView === item.id ? 'border-white/25 bg-white/15' : 'border-neutral-200 bg-white',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{item.label}</span>
                    <span className={cn('block text-2xs leading-snug', activeView === item.id ? 'text-white/75' : 'text-neutral-500')}>
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-neutral-200 bg-white px-5 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-2xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Arrow Systems <ChevronRight className="h-3 w-3" /> RAG
                </div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-neutral-950">
                  {NAV_ITEMS.find((item) => item.id === activeView)?.label}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <MobileNav activeView={activeView} onChange={setActiveView} />
                <button
                  type="button"
                  onClick={() => setActiveView('ingest')}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-hover"
                >
                  <Upload className="h-4 w-4" />
                  Upload Manuals
                </button>
                <button
                  type="button"
                  onClick={() => void loadAll()}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 hover:border-brand/40 hover:text-brand"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh
                </button>
              </div>
            </div>
            {error ? <div className="mt-3"><Alert tone="error" text={error} /></div> : null}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {activeView === 'chat' ? (
              <SupportChatView documents={documents} />
            ) : activeView === 'dashboard' ? (
              <DashboardView stats={dashboard} jobs={jobs} onNavigate={setActiveView} />
            ) : activeView === 'ingest' ? (
              <IngestView onDone={loadAll} />
            ) : activeView === 'manuals' ? (
              <ManualLibraryView
                documents={documents}
                selectedDocumentId={selectedDocumentId}
                onSelectDocument={setSelectedDocumentId}
                onRefresh={loadAll}
              />
            ) : activeView === 'jobs' ? (
              <JobsView jobs={jobs} onRefresh={loadAll} />
            ) : activeView === 'feedback' ? (
              <FeedbackView />
            ) : (
              <SettingsView />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function DashboardView({
  stats,
  jobs,
  onNavigate,
}: {
  stats: DashboardStats | null;
  jobs: RagJob[];
  onNavigate: (view: AdminView) => void;
}) {
  const warnings = stats?.warnings;
  const warningItems = [
    { label: 'Missing product metadata', value: warnings?.missingProduct ?? 0 },
    { label: 'Missing document type', value: warnings?.missingDocumentType ?? 0 },
    { label: 'Low extraction quality', value: warnings?.lowExtractionQuality ?? 0 },
    { label: 'No embeddings', value: warnings?.noEmbeddings ?? 0 },
    { label: 'Stale revision date', value: warnings?.staleDocuments ?? 0 },
    { label: 'Needs metadata review', value: warnings?.needsMetadataReview ?? 0 },
  ];

  return (
    <div className="space-y-5">
      <HealthPanel health={stats?.health} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Ingested manuals" value={stats?.totals.totalDocuments ?? 0} icon={Database} />
        <MetricCard label="Pages indexed" value={stats?.totals.totalPages ?? 0} icon={FileText} />
        <MetricCard label="Chunks indexed" value={stats?.totals.totalChunks ?? 0} icon={FileSearch} />
        <MetricCard label="Products represented" value={stats?.totals.productsRepresented ?? 0} icon={Sparkles} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel title="Knowledge Base Health" action={<span className="text-xs text-neutral-500">Last success: {formatDate(stats?.totals.lastSuccessfulIngestion)}</span>}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {warningItems.map((item) => (
              <div key={item.label} className={cn('rounded-md border p-3', item.value > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50')}>
                <p className={cn('text-2xs font-semibold uppercase tracking-wider', item.value > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                  {item.label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-neutral-950">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton icon={Upload} label="Upload manuals" onClick={() => onNavigate('ingest')} primary />
            <ActionButton icon={Database} label="View library" onClick={() => onNavigate('manuals')} />
            <ActionButton icon={AlertCircle} label="Failed jobs" onClick={() => onNavigate('jobs')} />
          </div>
        </Panel>

        <Panel title="Documents By Type">
          <MiniBarList rows={stats?.documentTypes || []} />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Products Represented">
          <MiniBarList rows={stats?.products || []} />
        </Panel>
        <Panel title="Recent Ingestion Jobs">
          <JobList jobs={jobs.slice(0, 6)} compact />
        </Panel>
      </div>
    </div>
  );
}

function HealthPanel({ health }: { health?: RagHealth }) {
  if (!health) {
    return (
      <Panel title="RAG Readiness">
        <Alert tone="warning" text="Health status is loading or unavailable. Run npm run rag:doctor for a command-line readiness check." />
      </Panel>
    );
  }

  const blocking = health.checks.filter((check) => !check.ok && check.severity === 'error');
  const warnings = health.checks.filter((check) => !check.ok && check.severity !== 'error');
  return (
    <Panel
      title="RAG Readiness"
      action={<Badge tone={health.ready ? 'green' : health.ok ? 'amber' : 'red'}>{health.ready ? 'Ready' : health.ok ? 'Needs manuals' : 'Not configured'}</Badge>}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-2">
          {blocking.length > 0 ? (
            blocking.map((check) => <Alert key={check.name} tone="error" text={check.message} />)
          ) : warnings.length > 0 ? (
            warnings.map((check) => <Alert key={check.name} tone="warning" text={check.message} />)
          ) : (
            <Alert tone="info" text="Postgres, pgvector, storage, and provider configuration checks passed." />
          )}
          <div className="grid gap-2 md:grid-cols-3">
            <SummaryPill label="documents" value={health.summary.documents} />
            <SummaryPill label="chunks" value={health.summary.chunks} />
            <SummaryPill label="embeddings" value={health.summary.embeddings} />
          </div>
          {health.config ? (
            <div className="grid gap-2 text-xs text-neutral-600 md:grid-cols-2">
              <SummaryPill label="chat" value={`${health.config.chatProvider} / ${health.config.chatModel}`} />
              <SummaryPill label="embeddings" value={`${health.config.embeddingProvider} / ${health.config.embeddingModel}`} />
              <SummaryPill label="query parser" value={health.config.queryParserModel} />
              <SummaryPill label="metadata" value={health.config.metadataModel} />
            </div>
          ) : null}
        </div>
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-2xs font-semibold uppercase tracking-wider text-neutral-500">Next steps</p>
          {health.nextSteps.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-600">Run a small known-manual retrieval eval before bulk ingesting everything.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs leading-5 text-neutral-600">
              {health.nextSteps.slice(0, 4).map((step) => <li key={step}>- {step}</li>)}
            </ul>
          )}
          <p className="mt-3 break-all text-2xs text-neutral-500">{health.databaseUrl.safeDisplay || 'DATABASE_URL not set'}</p>
        </div>
      </div>
    </Panel>
  );
}

function SupportChatView({ documents }: { documents: RagDocument[] }) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState('');
  const [softwareVersion, setSoftwareVersion] = useState('');
  const [restrictToManual, setRestrictToManual] = useState(false);
  const [documentId, setDocumentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  async function ask(nextQuery = query, mode: 'answer' | 'refine' | 'escalation_summary' = 'answer') {
    const trimmed = nextQuery.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setNotice('');
    const userTurn: ChatTurn = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    const nextMessages = mode === 'answer' ? [...messages, userTurn] : messages;
    if (mode === 'answer') {
      setMessages(nextMessages);
      setQuery('');
    }
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          productFamily: product,
          softwareVersion,
          documentId: restrictToManual ? documentId : '',
          conversationHistory: nextMessages.slice(-8).map((message) => ({ role: message.role, content: message.content })),
          debug: true,
          mode,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not answer support question.');
      const assistantTurn: ChatTurn = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: payload.answer,
        response: payload,
      };
      setMessages((current) => [...current, assistantTurn]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'Could not answer support question.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback(response: SupportChatResponse, rating: 'good' | 'bad' | 'needs_review') {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryId: response.queryId, rating }),
    });
    setNotice(rating === 'bad' ? 'Marked as not answering the question.' : 'Feedback saved.');
  }

  const lastUserQuestion = [...messages].reverse().find((message) => message.role === 'user')?.content || query;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(22rem,0.8fr)_minmax(0,1.4fr)]">
      <aside className="space-y-5">
        <Panel title="Support Context">
          <div className="space-y-3">
            <SelectField label="Product" value={product} onChange={setProduct} options={PRODUCT_OPTIONS} />
            <TextField label="Software version" value={softwareVersion} onChange={setSoftwareVersion} placeholder="R6.0.2" />
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={restrictToManual} onChange={(event) => setRestrictToManual(event.target.checked)} />
              Restrict to selected manual
            </label>
            <SelectField
              label="Manual"
              value={documentId}
              onChange={setDocumentId}
              options={['', ...documents.map((doc) => doc.id)]}
              labels={{ '': 'Any indexed manual', ...Object.fromEntries(documents.map((doc) => [doc.id, doc.title])) }}
            />
            <Alert
              tone="info"
              text="The assistant searches manuals as a tool, may search more than once, and asks follow-up questions when the issue is too ambiguous."
            />
          </div>
        </Panel>

        <Panel title="Quick Actions">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void ask(lastUserQuestion || 'Refine the previous answer with another manual search.', 'refine')}
              disabled={messages.length === 0 || loading}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 hover:border-brand/40 hover:text-brand disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Search again / refine
            </button>
            <button
              type="button"
              onClick={() => void ask('Create support escalation summary.', 'escalation_summary')}
              disabled={messages.length === 0 || loading}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 hover:border-brand/40 hover:text-brand disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              Create support escalation summary
            </button>
          </div>
        </Panel>
      </aside>

      <section className="flex min-h-[42rem] flex-col rounded-md border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-neutral-950">Arrow Support Assistant</h3>
          <p className="mt-1 text-xs text-neutral-500">Grounded answers with citations, follow-up questions, and debug traces.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-neutral-50 p-4">
          {messages.length === 0 ? (
            <EmptyState
              title="Ask a support question"
              text="Try: “Find the DuraFlex declog procedure,” “What changed in DuraFlex R6.0.2?”, or “My labels have banding.”"
            />
          ) : (
            messages.map((message) => (
              <ChatBubble
                key={message.id}
                turn={message}
                onFeedback={(rating) => message.response && void submitFeedback(message.response, rating)}
              />
            ))
          )}
          {loading ? (
            <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching manuals and checking citations
            </div>
          ) : null}
        </div>
        <div className="border-t border-neutral-200 bg-white p-3">
          {notice ? <div className="mb-2"><Alert tone="info" text={notice} /></div> : null}
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void ask();
              }}
              placeholder="Describe the issue, error code, product, version, or document you want to find."
              className="min-h-20 resize-y rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
            />
            <button
              type="button"
              onClick={() => void ask()}
              disabled={!query.trim() || loading}
              className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Ask
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChatBubble({
  turn,
  onFeedback,
}: {
  turn: ChatTurn;
  onFeedback: (rating: 'good' | 'bad' | 'needs_review') => void;
}) {
  const isUser = turn.role === 'user';
  return (
    <article className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[min(52rem,92%)] rounded-md border px-4 py-3 shadow-sm', isUser ? 'border-brand bg-brand text-white' : 'border-neutral-200 bg-white text-neutral-900')}>
        {isUser ? (
          <div className="whitespace-pre-wrap text-sm leading-6">{turn.content}</div>
        ) : (
          <RagMarkdown content={turn.content} />
        )}
        {turn.response ? (
          <div className="mt-4 space-y-3 border-t border-neutral-200 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={turn.response.confidence >= 0.72 ? 'green' : turn.response.confidence >= 0.45 ? 'amber' : 'red'}>
                Confidence {turn.response.confidence.toFixed(2)}
              </Badge>
              {turn.response.mode ? <Badge>{turn.response.mode}</Badge> : null}
              <button type="button" onClick={() => void navigator.clipboard.writeText(turn.content)} className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-2xs font-semibold text-neutral-600">
                <Copy className="h-3 w-3" />
                Copy
              </button>
              <button type="button" onClick={() => onFeedback('good')} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-2xs font-semibold text-emerald-700">
                <ThumbsUp className="h-3 w-3" />
                Good
              </button>
              <button type="button" onClick={() => onFeedback('bad')} className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-2xs font-semibold text-red-700">
                <ThumbsDown className="h-3 w-3" />
                Did not answer
              </button>
            </div>
            <CitationCards response={turn.response} />
            <SearchTrace response={turn.response} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function RagMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-neutral-950 prose-p:my-2 prose-p:leading-6 prose-li:my-1 prose-ul:my-2 prose-ol:my-2 prose-strong:text-neutral-950">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-neutral-100 px-1 py-0.5 text-[0.85em] text-neutral-900">
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CitationCards({ response }: { response: SupportChatResponse }) {
  if (!response.citations?.length) {
    return <Alert tone="warning" text="No citations were returned. Treat this as low-confidence support guidance." />;
  }
  return (
    <div className="space-y-2">
      <p className="text-2xs font-semibold uppercase tracking-wider text-neutral-500">Sources</p>
      {response.citations.map((citation) => (
        <details key={citation.chunk_id} className="rounded-md border border-neutral-200 bg-neutral-50">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-neutral-800">
            {citation.document_title} · pages {citation.page_start}-{citation.page_end}
          </summary>
          <div className="space-y-2 px-3 pb-3 text-xs leading-5 text-neutral-700">
            <p>{citation.quoted_text}</p>
            <p className="font-mono text-2xs text-neutral-500">chunk {citation.chunk_id}</p>
            <a href={`/api/documents/${citation.document_id}/file`} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
              Open source document
            </a>
          </div>
        </details>
      ))}
    </div>
  );
}

function SearchTrace({ response }: { response: SupportChatResponse }) {
  const calls = response.debug?.searchCalls || [];
  if (calls.length === 0) return null;
  return (
    <details className="rounded-md border border-neutral-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-neutral-700">Search/debug trace</summary>
      <div className="space-y-2 px-3 pb-3">
        {calls.map((call) => (
          <div key={call.id} className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-700">
            <p className="font-semibold">{call.query}</p>
            <p className="mt-1 text-neutral-500">
              {call.resultCount} results · top {Number(call.topScore || 0).toFixed(2)} · {call.weak ? 'weak' : 'usable'} · {call.reason}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

function IngestView({ onDone }: { onDone: () => Promise<void> }) {
  const [queue, setQueue] = useState<QueueFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [duplicateBehavior, setDuplicateBehavior] = useState('skip');
  const [autoDetectMetadata, setAutoDetectMetadata] = useState(true);
  const [applyMetadataToAll, setApplyMetadataToAll] = useState(false);
  const [preset, setPreset] = useState({
    productFamily: '',
    documentType: '',
    version: '',
    softwareVersion: '',
    revisionDate: '',
    notes: '',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const summary = useMemo(() => {
    const pdfs = queue.filter((item) => item.file.name.toLowerCase().endsWith('.pdf')).length;
    const docx = queue.filter((item) => item.file.name.toLowerCase().endsWith('.docx')).length;
    const duplicates = queue.filter((item) => item.duplicateTitle).length;
    const large = queue.filter((item) => item.file.size > API_UPLOAD_LIMIT_BYTES).length;
    const bytes = queue.reduce((sum, item) => sum + item.file.size, 0);
    return { files: queue.length, pdfs, docx, duplicates, large, bytes };
  }, [queue]);
  const hasUploadableFiles = queue.length > 0;

  async function addFiles(files: FileList | File[]) {
    const accepted = Array.from(files).filter(isAcceptedFile);
    const next: QueueFile[] = [];
    for (const file of accepted) {
      const hash = await hashFile(file);
      const usesLargeUpload = file.size > API_UPLOAD_LIMIT_BYTES;
      next.push({
        id: `${hash}-${file.name}-${file.size}`,
        file,
        hash,
        duplicateTitle: '',
        status: 'ready',
        phase: usesLargeUpload ? 'Ready for large-file upload' : 'Ready',
        progress: 0,
        error: '',
        logs: [
          `${new Date().toLocaleTimeString()} - File selected (${formatBytes(file.size)}).`,
          ...(usesLargeUpload
            ? [`${new Date().toLocaleTimeString()} - This file will use direct Cloud Storage upload before RAG ingestion.`]
            : []),
        ],
      });
    }
    const deduped = [...queue, ...next].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);
    setQueue(deduped);
    void checkDuplicates(deduped);
  }

  async function checkDuplicates(files: QueueFile[]) {
    if (files.length === 0) return;
    const response = await fetch('/api/ingest/duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: files.map((item) => item.hash) }),
    });
    if (!response.ok) return;
    const payload = await response.json().catch(() => ({}));
    const duplicates = new Map((payload.duplicates || []).map((item: { hash: string; document: RagDocument }) => [item.hash, item.document.title]));
    setQueue((current) => current.map((item) => ({ ...item, duplicateTitle: String(duplicates.get(item.hash) || '') })));
  }

  async function startUpload() {
    if (queue.length === 0 || uploading) return;
    setUploading(true);
    const batchId = crypto.randomUUID();
    for (const item of queue) {
      if (item.status === 'running') continue;
      setQueue((current) => updateQueuedFile(current, item.id, {
        status: 'running',
        phase: item.file.size > API_UPLOAD_LIMIT_BYTES ? 'Creating large-file upload' : 'Uploading',
        progress: 12,
        startedAt: new Date().toISOString(),
        logs: appendQueueLog(item, 'Upload started.'),
      }));
      try {
        const result = item.file.size > API_UPLOAD_LIMIT_BYTES
          ? await uploadLargeFileViaGcs({
              item,
              batchId,
              duplicateBehavior,
              autoDetectMetadata,
              applyMetadataToAll,
              preset,
              setQueue,
            })
          : await uploadSmallFileViaApi({
              item,
              batchId,
              duplicateBehavior,
              autoDetectMetadata,
              applyMetadataToAll,
              preset,
              setQueue,
            });
        setQueue((current) =>
          updateQueuedFile(current, item.id, {
            status: result.status,
            phase: result.status === 'failed' ? 'Failed' : result.status === 'skipped_duplicate' ? 'Duplicate skipped' : 'Complete',
            progress: 100,
            result,
            error: result.status === 'failed' ? result.message : '',
            finishedAt: new Date().toISOString(),
            logs: appendQueueLog(item, `${result.status === 'failed' ? 'Failed' : 'Finished'}: ${result.message}${result.jobId ? ` Job ${result.jobId}.` : ''}`),
          }),
        );
      } catch (uploadError) {
        setQueue((current) =>
          updateQueuedFile(current, item.id, {
            status: 'failed',
            phase: 'Failed',
            progress: 100,
            error: humanUploadError(uploadError, item.file),
            finishedAt: new Date().toISOString(),
            logs: appendQueueLog(item, `Failed before a completed ingestion response: ${humanUploadError(uploadError, item.file)}`),
          }),
        );
      }
    }
    setUploading(false);
    await onDone();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-5">
        <section
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void addFiles(event.dataTransfer.files);
          }}
          className={cn(
            'flex min-h-64 flex-col items-center justify-center rounded-md border-2 border-dashed bg-white p-8 text-center transition-colors',
            dragging ? 'border-brand bg-brand/5' : 'border-neutral-300',
          )}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-brand/15 bg-brand/10 text-brand">
            <FolderUp className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-neutral-950">Drop manuals here</h3>
          <p className="mt-1 max-w-xl text-sm text-neutral-500">
            Upload PDFs, TXT, Markdown, DOCX, CSV, or TSV files. Multiple files and folder selection are supported where the browser allows it.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-hover">
              <Upload className="h-4 w-4" />
              Select files
            </button>
            <button type="button" onClick={() => folderInputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-xs font-semibold text-neutral-800 hover:border-brand/40 hover:text-brand">
              <FolderUp className="h-4 w-4" />
              Select folder
            </button>
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden" accept=".pdf,.txt,.md,.markdown,.docx,.csv,.tsv" onChange={(event) => event.target.files && void addFiles(event.target.files)} />
          <input ref={folderInputRef} type="file" className="hidden" accept=".pdf,.txt,.md,.markdown,.docx,.csv,.tsv" {...FOLDER_INPUT_PROPS} onChange={(event) => event.target.files && void addFiles(event.target.files)} />
        </section>

        <Panel title="Upload Queue" action={<span className="text-xs text-neutral-500">{summary.files} files · {formatBytes(summary.bytes)}</span>}>
      {queue.length === 0 ? (
            <EmptyState title="No files selected" text="Select one manual or a batch of manuals to review them before ingestion." actionLabel="Select files" onAction={() => fileInputRef.current?.click()} />
          ) : (
            <div className="space-y-3">
              {summary.large > 0 ? (
                <Alert
                  tone="info"
                  text={`${summary.large} large file(s) will bypass the Next/Cloud Run request-size limit by uploading directly to Cloud Storage, then the server will ingest them from there.`}
                />
              ) : null}
              <div className="grid gap-2 text-xs text-neutral-600 sm:grid-cols-4">
                <SummaryPill label="PDFs" value={summary.pdfs} />
                <SummaryPill label="DOCX" value={summary.docx} />
                <SummaryPill label="Duplicates" value={summary.duplicates} />
                <SummaryPill label="Large upload" value={summary.large} />
              </div>
              <SummaryPill label="Total size" value={formatBytes(summary.bytes)} />
              <div className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
                {queue.map((item) => (
                  <div key={item.id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-950">{item.file.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-2xs text-neutral-500">
                          <span>{formatBytes(item.file.size)}</span>
                          {item.duplicateTitle ? <Badge tone="amber">Duplicate: {item.duplicateTitle}</Badge> : null}
                          {item.result?.productFamily ? <Badge>{item.result.productFamily}</Badge> : null}
                          {item.result?.documentType ? <Badge>{humanDocType(item.result.documentType)}</Badge> : null}
                        </div>
                      </div>
                      <button type="button" onClick={() => setQueue((current) => current.filter((queued) => queued.id !== item.id))} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Remove file">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={item.progress} />
                      <div className="mt-1 flex items-center justify-between gap-3 text-2xs">
                        <span className="font-medium text-neutral-600">{item.phase}</span>
                        <span className={cn(item.status === 'failed' ? 'text-red-700' : 'text-neutral-500')}>{item.result?.message || item.error || item.status}</span>
                      </div>
                    </div>
                    <IngestionStepper item={item} />
                    <details className="mt-2 rounded-md border border-neutral-200 bg-neutral-50">
                      <summary className="cursor-pointer px-3 py-2 text-2xs font-semibold text-neutral-600">Ingestion details</summary>
                      <div className="space-y-2 px-3 pb-3 text-xs text-neutral-600">
                        <div className="grid gap-2 sm:grid-cols-4">
                          <SummaryPill label="Status" value={item.status} />
                          <SummaryPill label="Progress" value={`${item.progress}%`} />
                          <SummaryPill label="Job ID" value={item.result?.jobId || 'not created yet'} />
                          <SummaryPill label="Chunks" value={item.result?.chunkCount ?? '-'} />
                        </div>
                        {item.startedAt ? <p>Started: {new Date(item.startedAt).toLocaleString()}</p> : null}
                        {item.finishedAt ? <p>Finished: {new Date(item.finishedAt).toLocaleString()}</p> : null}
                        <ul className="space-y-1 font-mono text-2xs">
                          {(item.logs || []).map((log, index) => <li key={`${item.id}-log-${index}`}>{log}</li>)}
                        </ul>
                      </div>
                    </details>
                    {item.result?.warnings?.length ? (
                      <div className="mt-2 space-y-1">
                        {item.result.warnings.map((warning) => <Alert key={warning} tone="warning" text={warning} />)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <aside className="space-y-5">
        <Panel title="Batch Options">
          <div className="space-y-4">
            <SelectField label="Duplicate behavior" value={duplicateBehavior} onChange={setDuplicateBehavior} options={['skip', 'replace', 'new_version']} />
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={autoDetectMetadata} onChange={(event) => setAutoDetectMetadata(event.target.checked)} />
              Auto-detect metadata
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={applyMetadataToAll} onChange={(event) => setApplyMetadataToAll(event.target.checked)} />
              Apply selected metadata to all files
            </label>
            <div className="grid gap-3">
              <SelectField label="Product family" value={preset.productFamily} onChange={(value) => setPreset((prev) => ({ ...prev, productFamily: value }))} options={PRODUCT_OPTIONS} />
              <SelectField label="Document type" value={preset.documentType} onChange={(value) => setPreset((prev) => ({ ...prev, documentType: value }))} options={DOC_TYPE_OPTIONS} />
              <TextField label="Version" value={preset.version} onChange={(value) => setPreset((prev) => ({ ...prev, version: value }))} placeholder="R6.0.2" />
              <TextField label="Revision date" value={preset.revisionDate} onChange={(value) => setPreset((prev) => ({ ...prev, revisionDate: value }))} placeholder="YYYY-MM-DD" />
              <TextField label="Notes" value={preset.notes} onChange={(value) => setPreset((prev) => ({ ...prev, notes: value }))} placeholder="Optional admin note" />
            </div>
            <button type="button" onClick={() => void startUpload()} disabled={queue.length === 0 || !hasUploadableFiles || uploading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Start ingestion
            </button>
          </div>
        </Panel>
        <Panel title="Lifecycle">
          <ol className="space-y-2 text-xs text-neutral-600">
            {INGEST_LIFECYCLE_STEPS.map((step) => (
              <li key={step.id} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-brand" />
                <span>
                  <span className="font-semibold text-neutral-800">{step.label}</span>
                  <span className="block text-2xs text-neutral-500">{step.description}</span>
                </span>
              </li>
            ))}
          </ol>
          <Alert tone="info" text="Files over 30 MB use direct Cloud Storage upload first, then the RAG server reads the uploaded object and runs extraction, metadata detection, chunking, embedding, and indexing." />
        </Panel>
      </aside>
    </div>
  );
}

function IngestionStepper({ item }: { item: QueueFile }) {
  const activeIndex = ingestionStepIndex(item);
  return (
    <div className="mt-3 grid gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
      {INGEST_LIFECYCLE_STEPS.map((step, index) => {
        const state =
          item.status === 'failed' && index === activeIndex ? 'failed' :
          index < activeIndex ? 'done' :
          index === activeIndex ? 'active' :
          'pending';
        return (
          <div
            key={step.id}
            className={cn(
              'rounded-md border px-2 py-1.5 text-2xs',
              state === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
              state === 'active' ? 'border-brand/30 bg-brand/5 text-brand' :
              state === 'failed' ? 'border-red-200 bg-red-50 text-red-700' :
              'border-neutral-200 bg-white text-neutral-400',
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              {state === 'done' ? <CheckCircle2 className="h-3 w-3" /> : state === 'active' ? <Loader2 className="h-3 w-3 animate-spin" /> : state === 'failed' ? <AlertCircle className="h-3 w-3" /> : <span className="h-2 w-2 rounded-full bg-current opacity-40" />}
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ManualLibraryView({
  documents,
  selectedDocumentId,
  onSelectDocument,
  onRefresh,
}: {
  documents: RagDocument[];
  selectedDocumentId: string;
  onSelectDocument: (id: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState('');
  const [docType, setDocType] = useState('');
  const [status, setStatus] = useState('');
  const [quality, setQuality] = useState('');
  const [sort, setSort] = useState('newest');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProduct, setBulkProduct] = useState('');
  const [bulkDocType, setBulkDocType] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return documents
      .filter((doc) => !q || `${doc.title} ${doc.filename}`.toLowerCase().includes(q))
      .filter((doc) => !product || doc.productFamily === product)
      .filter((doc) => !docType || doc.documentType === docType)
      .filter((doc) => !status || doc.status === status)
      .filter((doc) => !quality || (quality === 'low' ? (doc.extractionQualityScore ?? 1) < 0.35 : (doc.extractionQualityScore ?? 0) >= 0.35))
      .sort((a, b) => sortDocuments(a, b, sort));
  }, [documents, docType, product, quality, query, sort, status]);

  const selected = selectedDocumentId || filtered[0]?.id || '';

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(36rem,1.3fr)]">
      <Panel title="Manual Library" action={<span className="text-xs text-neutral-500">{filtered.length} manuals</span>}>
        {documents.length === 0 ? (
          <EmptyState title="No manuals ingested yet" text="Upload your first support manual to start building the knowledge base." actionLabel="Upload Manuals" onAction={() => window.dispatchEvent(new CustomEvent('rag-nav-ingest'))} />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <SearchInput value={query} onChange={setQuery} placeholder="Search title or filename" />
              <SelectField label="Product" value={product} onChange={setProduct} options={PRODUCT_OPTIONS} />
              <SelectField label="Doc type" value={docType} onChange={setDocType} options={DOC_TYPE_OPTIONS} />
              <SelectField label="Status" value={status} onChange={setStatus} options={['', 'indexed', 'needs_metadata_review', 'completed_with_warnings']} />
              <SelectField label="Quality" value={quality} onChange={setQuality} options={['', 'low', 'good']} />
              <SelectField label="Sort" value={sort} onChange={setSort} options={['newest', 'revision_date', 'title', 'product', 'document_type', 'page_count', 'chunk_count']} />
            </div>
            {selectedIds.size > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <SelectField label={`${selectedIds.size} selected product`} value={bulkProduct} onChange={setBulkProduct} options={PRODUCT_OPTIONS} />
                  <SelectField label="Selected doc type" value={bulkDocType} onChange={setBulkDocType} options={DOC_TYPE_OPTIONS} />
                  <button
                    type="button"
                    onClick={() => void applyBulkMetadata([...selectedIds], { productFamily: bulkProduct, documentType: bulkDocType }, onRefresh).then(() => setSelectedIds(new Set()))}
                    disabled={!bulkProduct && !bulkDocType}
                    className="inline-flex h-9 items-center justify-center gap-2 self-end rounded-md bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    Apply metadata
                  </button>
                </div>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-md border border-neutral-200">
              <table className="w-full min-w-[56rem] text-left text-xs">
                <thead className="bg-neutral-50 text-2xs uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((doc) => selectedIds.has(doc.id))}
                        onChange={(event) => setSelectedIds(event.target.checked ? new Set(filtered.map((doc) => doc.id)) : new Set())}
                        aria-label="Select all filtered manuals"
                      />
                    </th>
                    <th className="px-3 py-2">Manual</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Version</th>
                    <th className="px-3 py-2">Quality</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white">
                  {filtered.map((doc) => (
                    <tr key={doc.id} className={cn('cursor-pointer hover:bg-neutral-50', selected === doc.id && 'bg-brand/5')} onClick={() => onSelectDocument(doc.id)}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(doc.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(doc.id);
                              else next.delete(doc.id);
                              return next;
                            });
                          }}
                          aria-label={`Select ${doc.title}`}
                        />
                      </td>
                      <td className="max-w-[18rem] px-3 py-3">
                        <p className="truncate font-semibold text-neutral-950">{doc.title}</p>
                        <p className="truncate text-2xs text-neutral-500">{doc.filename}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {metadataNeedsReview(doc) ? <Badge tone="amber">Needs metadata review</Badge> : null}
                          {qualityWarnings(doc).length > 0 ? <Badge tone="amber">Extraction warnings</Badge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3"><Badge tone={doc.productFamily === 'General' ? 'amber' : 'neutral'}>{doc.productFamily}</Badge></td>
                      <td className="px-3 py-3"><Badge>{humanDocType(doc.documentType)}</Badge></td>
                      <td className="px-3 py-3 text-neutral-600">{doc.softwareVersion || doc.version || 'Not set'}</td>
                      <td className="px-3 py-3"><QualityBadge value={doc.extractionQualityScore ?? 0} /></td>
                      <td className="px-3 py-3"><StatusBadge status={doc.status} /></td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          <button type="button" onClick={(event) => { event.stopPropagation(); onSelectDocument(doc.id); }} className="rounded-md border border-neutral-200 px-2 py-1 text-2xs font-semibold text-neutral-700">View</button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); void reindexDocument(doc.id, onRefresh); }} className="rounded-md border border-neutral-200 px-2 py-1 text-2xs font-semibold text-neutral-700">Re-index</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>
      <DocumentDetail documentId={selected} onRefresh={onRefresh} />
    </div>
  );
}

function DocumentDetail({ documentId, onRefresh }: { documentId: string; onRefresh: () => Promise<void> }) {
  const [document, setDocument] = useState<RagDocument | null>(null);
  const [tab, setTab] = useState<DetailTab>('metadata');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [edit, setEdit] = useState({ title: '', productFamily: '', productModel: '', documentType: '', version: '', softwareVersion: '', revisionDate: '', notes: '' });

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not load manual.');
      setDocument(payload.document);
      setEdit({
        title: payload.document.title || '',
        productFamily: payload.document.productFamily || '',
        productModel: payload.document.productModel || '',
        documentType: payload.document.documentType || '',
        version: payload.document.version || '',
        softwareVersion: payload.document.softwareVersion || '',
        revisionDate: payload.document.revisionDate || '',
        notes: typeof payload.document.metadata?.notes === 'string' ? payload.document.metadata.notes : '',
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load manual.');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMetadata() {
    if (!document) return;
    const response = await fetch(`/api/documents/${document.id}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...edit,
        revisionDate: edit.revisionDate || null,
        metadata: { ...document.metadata, notes: edit.notes },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Metadata saved.' : payload.error || 'Could not save metadata.');
    await load();
    await onRefresh();
  }

  async function redetect() {
    if (!document) return;
    const response = await fetch(`/api/documents/${document.id}/redetect-metadata`, { method: 'POST' });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Metadata re-detected.' : payload.error || 'Could not re-detect metadata.');
    await load();
    await onRefresh();
  }

  async function deleteDoc() {
    if (!document) return;
    const response = await fetch(`/api/documents/${document.id}`, { method: 'DELETE' });
    setMessage(response.ok ? 'Manual deleted.' : 'Could not delete manual.');
    await onRefresh();
  }

  if (!documentId) {
    return (
      <Panel title="Manual Detail">
        <EmptyState title="Select a manual" text="Choose a manual from the library to inspect metadata, pages, chunks, and search behavior." />
      </Panel>
    );
  }

  if (loading || !document) {
    return (
      <Panel title="Manual Detail">
        <div className="flex items-center gap-2 p-8 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading manual</div>
      </Panel>
    );
  }

  const warnings = extractDocumentWarnings(document);

  return (
    <Panel
      title={document.title}
      action={
        <div className="flex flex-wrap gap-2">
          <a href={`/api/documents/${document.id}/file`} target="_blank" rel="noreferrer" className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:text-brand">Open original</a>
          <button type="button" onClick={() => void redetect()} className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700">Re-detect</button>
          <button type="button" onClick={() => void reindexDocument(document.id, async () => { await load(); await onRefresh(); })} className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700">Re-index</button>
          <button type="button" onClick={() => void deleteDoc()} className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">Delete</button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone={document.productFamily === 'General' ? 'amber' : 'neutral'}>{document.productFamily}</Badge>
          <Badge>{humanDocType(document.documentType)}</Badge>
          <Badge>{document.pageCount} pages</Badge>
          <Badge>{document.chunks?.length ?? document.chunkCount ?? 0} chunks</Badge>
          <ConfidenceBadge label="Product" value={metadataConfidence(document, 'product_family_confidence')} />
          <ConfidenceBadge label="Doc type" value={metadataConfidence(document, 'document_type_confidence')} />
          <StatusBadge status={document.status} />
        </div>
        {message ? <Alert tone={message.includes('Could not') ? 'error' : 'info'} text={message} /> : null}
        {warnings.map((warning) => <Alert key={warning} tone="warning" text={warning} />)}

        <div className="flex flex-wrap gap-1 border-b border-neutral-200">
          {(['metadata', 'quality', 'pages', 'chunks', 'search', 'questions'] as DetailTab[]).map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={cn('border-b-2 px-3 py-2 text-xs font-semibold capitalize', tab === item ? 'border-brand text-brand' : 'border-transparent text-neutral-500 hover:text-neutral-900')}>
              {item}
            </button>
          ))}
        </div>

        {tab === 'metadata' ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <TextField label="Title" value={edit.title} onChange={(value) => setEdit((prev) => ({ ...prev, title: value }))} />
              <SelectField label="Product family" value={edit.productFamily} onChange={(value) => setEdit((prev) => ({ ...prev, productFamily: value }))} options={PRODUCT_OPTIONS} />
              <TextField label="Product model" value={edit.productModel} onChange={(value) => setEdit((prev) => ({ ...prev, productModel: value }))} />
              <SelectField label="Document type" value={edit.documentType} onChange={(value) => setEdit((prev) => ({ ...prev, documentType: value }))} options={DOC_TYPE_OPTIONS} />
              <TextField label="Version" value={edit.version} onChange={(value) => setEdit((prev) => ({ ...prev, version: value }))} />
              <TextField label="Software version" value={edit.softwareVersion} onChange={(value) => setEdit((prev) => ({ ...prev, softwareVersion: value }))} />
              <TextField label="Revision date" value={edit.revisionDate} onChange={(value) => setEdit((prev) => ({ ...prev, revisionDate: value }))} placeholder="YYYY-MM-DD" />
              <TextField label="Tags / notes" value={edit.notes} onChange={(value) => setEdit((prev) => ({ ...prev, notes: value }))} />
            </div>
            <ActionButton icon={CheckCircle2} label="Save metadata" onClick={() => void saveMetadata()} primary />
          </div>
        ) : tab === 'quality' ? (
          <QualityPanel document={document} />
        ) : tab === 'pages' ? (
          <PagesPanel pages={document.pages || []} />
        ) : tab === 'chunks' ? (
          <ChunksPanel chunks={document.chunks || []} />
        ) : tab === 'search' ? (
          <DocumentSearchPanel documentId={document.id} />
        ) : (
          <RelatedQuestions document={document} />
        )}
      </div>
    </Panel>
  );
}

function JobsView({ jobs, onRefresh }: { jobs: RagJob[]; onRefresh: () => Promise<void> }) {
  const completed = jobs.filter((job) => ['completed', 'completed_with_warnings', 'needs_metadata_review', 'skipped_duplicate'].includes(job.status)).length;
  const failed = jobs.filter((job) => job.status === 'failed').length;
  const running = jobs.filter((job) => ['running', 'extracting', 'embedding', 'indexing', 'chunking', 'detecting_metadata'].includes(job.status)).length;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Total jobs" value={jobs.length} icon={RefreshCw} />
        <MetricCard label="Complete" value={completed} icon={CheckCircle2} />
        <MetricCard label="Failed" value={failed} icon={AlertCircle} />
        <MetricCard label="Running" value={running} icon={Loader2} />
      </div>
      <Panel title="Ingestion Jobs" action={<ActionButton icon={RefreshCw} label="Refresh" onClick={onRefresh} />}>
        <JobList jobs={jobs} onRefresh={onRefresh} />
      </Panel>
    </div>
  );
}

function SearchDebuggerView({ documents }: { documents: RagDocument[] }) {
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [expectedDocument, setExpectedDocument] = useState('');
  const [expectedChunks, setExpectedChunks] = useState<SearchResult[]>([]);
  const [debug, setDebug] = useState<DebugResult | null>(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  async function run(overrides: Partial<{ product: string; documentType: string; documentId: string; query: string }> = {}) {
    const activeQuery = (overrides.query ?? query).trim();
    if (!activeQuery) return;
    setLoading(true);
    setExpectedChunks([]);
    const response = await fetch('/api/search/debug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: activeQuery,
        product: overrides.product ?? product,
        documentType: overrides.documentType ?? documentType,
        documentId: overrides.documentId ?? documentId,
        expectedDocumentId: expectedDocument,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setDebug(payload);
    setLoading(false);
  }

  async function askUsingResults() {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, product, documentType, documentId, debug: true }),
    });
    const payload = await response.json().catch(() => ({}));
    setAnswer(response.ok ? payload.answer : payload.error || 'Could not generate answer.');
  }

  return (
    <div className="space-y-5">
      <Panel title="Search Test Console">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_12rem_14rem_14rem_auto]">
          <SearchInput value={query} onChange={setQuery} placeholder="Ask a support question" />
          <SelectField label="Product" value={product} onChange={setProduct} options={PRODUCT_OPTIONS} />
          <SelectField label="Doc type" value={documentType} onChange={setDocumentType} options={DOC_TYPE_OPTIONS} />
          <SelectField label="Manual" value={documentId} onChange={setDocumentId} options={['', ...documents.map((doc) => doc.id)]} labels={{ '': 'Any manual', ...Object.fromEntries(documents.map((doc) => [doc.id, doc.title])) }} />
          <button type="button" onClick={() => void run()} disabled={!query.trim() || loading} className="inline-flex h-9 items-center justify-center gap-2 self-end rounded-md bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Run
          </button>
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <SelectField
            label="Expected document"
            value={expectedDocument}
            onChange={setExpectedDocument}
            options={['', ...documents.map((doc) => doc.id)]}
            labels={{ '': 'Optional expected manual', ...Object.fromEntries(documents.map((doc) => [doc.id, doc.title])) }}
          />
          <button type="button" onClick={() => void run({ product: '', documentType: '', documentId: '' })} disabled={!query.trim() || loading} className="inline-flex h-9 items-center justify-center gap-2 self-end rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 hover:border-brand/40 hover:text-brand">
            Search without filters
          </button>
          <button
            type="button"
            onClick={() => {
              const doc = documents.find((item) => item.id === expectedDocument);
              if (doc) void run({ query: `${doc.title} ${doc.filename}`, product: '', documentType: '', documentId: '' });
            }}
            disabled={!expectedDocument || loading}
            className="inline-flex h-9 items-center justify-center gap-2 self-end rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 hover:border-brand/40 hover:text-brand disabled:opacity-50"
          >
            Search exact title
          </button>
          <button
            type="button"
            onClick={() => {
              setExpectedChunks(debug?.expected?.sampleChunks || []);
            }}
            disabled={!debug?.expected?.sampleChunks?.length}
            className="inline-flex h-9 items-center justify-center gap-2 self-end rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 hover:border-brand/40 hover:text-brand disabled:opacity-50"
          >
            Show expected chunks
          </button>
        </div>
      </Panel>
      {debug ? (
        <>
          {debug.expected ? <ExpectedDocumentPanel expected={debug.expected} /> : null}
          <div className="grid gap-5 xl:grid-cols-2">
            <JsonPanel title="Parsed Query" value={debug.parsedQuery} />
            <JsonPanel title="Filters Applied" value={debug.filtersApplied} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <ResultsPanel title="Vector Results" results={debug.vectorResults} />
            <ResultsPanel title="Keyword Results" results={debug.keywordResults} />
            <ResultsPanel title="Merged Results" results={debug.mergedResults || []} />
            <ResultsPanel title="Reranked Results" results={debug.rerankedResults} />
          </div>
          <Panel title="Final Context" action={<ActionButton icon={Sparkles} label="Ask using these results" onClick={() => void askUsingResults()} primary />}>
            <ResultsList results={debug.finalContext} />
            {answer ? <div className="mt-4 whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-800">{answer}</div> : null}
          </Panel>
          {expectedChunks.length > 0 ? (
            <Panel title="All Chunks From Expected Document">
              <ResultsList results={expectedChunks} />
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function FeedbackView() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/feedback');
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setRows(payload.feedback || []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <Panel title="Feedback / Bad Answers" action={<ActionButton icon={RefreshCw} label={loading ? 'Loading' : 'Refresh'} onClick={load} />}>
      {rows.length === 0 ? <EmptyState title="No feedback yet" text="Good/bad answer ratings will appear here after support starts testing the assistant." /> : (
        <div className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
          {rows.map((row) => (
            <div key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-950">{row.userQuery || row.queryId || 'Feedback note'}</p>
                  {row.notes ? <p className="mt-1 text-xs text-neutral-500">{row.notes}</p> : null}
                </div>
                <StatusBadge status={row.rating} />
              </div>
              {row.answer ? <p className="mt-3 line-clamp-3 text-xs leading-5 text-neutral-600">{row.answer}</p> : null}
              <p className="mt-2 text-2xs text-neutral-500">{formatDate(row.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function SettingsView() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [health, setHealth] = useState<RagHealth | undefined>();
  useEffect(() => {
    fetch('/api/rag/settings')
      .then((response) => response.json())
      .then((payload) => {
        setSettings(payload.settings || null);
        setHealth(payload.health);
      })
      .catch(() => setSettings(null));
  }, []);
  const rows = settings ? Object.entries(settings) : [];
  return (
    <div className="space-y-5">
      <HealthPanel health={health} />
      <Panel title="RAG Settings" action={<Badge tone="amber">Read-only</Badge>}>
        <Alert tone="info" text="Live editing is disabled for now. Change these values in .env and restart the dev server." />
        <div className="mt-4 overflow-hidden rounded-md border border-neutral-200">
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-neutral-100">
              {rows.map(([key, value]) => (
                <tr key={key}>
                  <td className="w-64 bg-neutral-50 px-3 py-2 font-semibold text-neutral-700">{key}</td>
                  <td className="px-3 py-2 text-neutral-600">{String(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-6 text-neutral-500">
          Confidentiality warning: embeddings, reranking, OCR, and chat answers may send extracted manual text to the configured provider. Use approved paid/private providers for confidential Arrow manuals; avoid free endpoints unless explicitly approved.
        </p>
      </Panel>
    </div>
  );
}

function QualityPanel({ document }: { document: RagDocument }) {
  const pages = document.pages || [];
  const quality = document.metadata?.quality as Record<string, unknown> | undefined;
  const extractionWarnings = qualityWarnings(document);
  const lowTextPages = pages.filter((page) => page.extractionQualityScore < 0.25);
  const imagePages = pages.filter((page) => page.hasImages);
  const tablePages = pages.filter((page) => page.hasTables);
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <MetricCard label="Avg extraction" value={`${Math.round((Number(quality?.extractionQualityScore) || document.extractionQualityScore || average(pages.map((p) => p.extractionQualityScore))) * 100)}%`} icon={BarChart3} />
      <MetricCard label="Low/no text pages" value={Number(quality?.lowTextPageCount ?? lowTextPages.length)} icon={AlertCircle} />
      <MetricCard label="Pages with images" value={Number(quality?.pagesWithImages ? (quality.pagesWithImages as unknown[]).length : imagePages.length)} icon={FileText} />
      <MetricCard label="Pages with tables" value={Number(quality?.pagesWithTables ? (quality.pagesWithTables as unknown[]).length : tablePages.length)} icon={Database} />
      <MetricCard label="Avg chars/page" value={Number(quality?.averageCharsPerPage ?? 0)} icon={FileText} />
      <MetricCard label="Total text chars" value={Number(quality?.extractedTextCharCount ?? pages.reduce((sum, page) => sum + page.combinedText.length, 0))} icon={FileSearch} />
      <MetricCard label="Scanned likely" value={quality?.suspectedScannedPdf ? 'Yes' : 'No'} icon={AlertCircle} />
      <MetricCard label="OCR status" value={String(quality?.ocrStatus || 'not configured')} icon={RefreshCw} />
      <div className="md:col-span-4">
        {extractionWarnings.length > 0 ? (
          <div className="space-y-2">
            {extractionWarnings.map((warning) => <Alert key={warning} tone="warning" text={warning} />)}
          </div>
        ) : lowTextPages.length > 0 ? (
          <Alert tone="warning" text={`Pages ${lowTextPages.map((page) => page.pageNumber).join(', ')} may need OCR.`} />
        ) : (
          <Alert tone="info" text="No low-text pages detected." />
        )}
      </div>
    </div>
  );
}

function PagesPanel({ pages }: { pages: RagPage[] }) {
  const [query, setQuery] = useState('');
  const filtered = pages.filter((page) => !query || page.combinedText.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="space-y-3">
      <SearchInput value={query} onChange={setQuery} placeholder="Search within extracted pages" />
      <div className="max-h-[32rem] space-y-2 overflow-y-auto">
        {filtered.map((page) => (
          <details key={page.id} className="rounded-md border border-neutral-200 bg-neutral-50">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-neutral-800">
              Page {page.pageNumber} · quality {Math.round(page.extractionQualityScore * 100)}% {page.ocrText ? '· OCR text available' : ''}
            </summary>
            <div className="grid gap-3 p-3 lg:grid-cols-2">
              <TextBlock title="Raw / combined text" text={page.combinedText || 'No text extracted.'} />
              <TextBlock title="OCR text" text={page.ocrText || 'No OCR text captured yet.'} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function ChunksPanel({ chunks }: { chunks: RagChunk[] }) {
  return (
    <div className="max-h-[34rem] space-y-2 overflow-y-auto">
      {chunks.map((chunk) => (
        <details key={chunk.id} className="rounded-md border border-neutral-200 bg-neutral-50">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-neutral-800">
            Chunk {chunk.chunkIndex} · pages {chunk.pageStart}-{chunk.pageEnd} · {chunk.tokenCount} tokens · {chunk.metadata?.embeddingProvider ? 'embedded' : 'keyword-only'}
          </summary>
          <div className="space-y-2 p-3">
            {chunk.headingPath ? <p className="text-2xs font-semibold uppercase tracking-wider text-neutral-500">{chunk.headingPath}</p> : null}
            {Array.isArray(chunk.metadata?.qualityWarnings) && chunk.metadata.qualityWarnings.length > 0 ? (
              <div className="space-y-1">
                {(chunk.metadata.qualityWarnings as string[]).map((warning) => <Alert key={warning} tone="warning" text={warning} />)}
              </div>
            ) : null}
            <p className="whitespace-pre-wrap text-xs leading-5 text-neutral-700">{chunk.text}</p>
          </div>
        </details>
      ))}
    </div>
  );
}

function DocumentSearchPanel({ documentId }: { documentId: string }) {
  const [query, setQuery] = useState('');
  const [debug, setDebug] = useState<DebugResult | null>(null);
  async function run() {
    const response = await fetch('/api/search/debug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, documentId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setDebug(payload);
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <SearchInput value={query} onChange={setQuery} placeholder="Test a question against only this manual" />
        <ActionButton icon={Search} label="Test search" onClick={() => void run()} primary />
      </div>
      {debug ? <ResultsPanel title="Retrieved chunks from this manual" results={debug.finalContext} /> : null}
    </div>
  );
}

function RelatedQuestions({ document }: { document: RagDocument }) {
  const questions = [
    `What are the key procedures in ${document.title}?`,
    `Which support issues does ${document.title} help diagnose?`,
    `What should support ask before escalating a ${document.productFamily} issue?`,
    document.softwareVersion ? `What changed in ${document.productFamily} ${document.softwareVersion}?` : '',
    `Which pages in ${document.title} mention maintenance or troubleshooting?`,
  ].filter(Boolean);
  return (
    <div className="grid gap-2">
      {questions.map((question) => (
        <div key={question} className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{question}</div>
      ))}
    </div>
  );
}

function JobList({ jobs, compact, onRefresh }: { jobs: RagJob[]; compact?: boolean; onRefresh?: () => Promise<void> }) {
  if (jobs.length === 0) return <EmptyState title="No ingestion jobs yet" text="Upload manuals to create ingestion job history." />;
  return (
    <div className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
      {jobs.map((job) => (
        <div key={job.id} className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-950">{job.filename}</p>
              <p className="mt-1 text-2xs text-neutral-500">{formatDate(job.createdAt)} · {job.phase}</p>
            </div>
            <StatusBadge status={job.status} />
          </div>
          <div className="mt-3">
            <ProgressBar value={job.progress} />
            {job.errorMessage ? <p className="mt-1 text-xs text-red-700">{job.errorMessage}</p> : null}
          </div>
          {!compact ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {job.status === 'failed' ? <ActionButton icon={RefreshCw} label="Retry" onClick={async () => { await fetch(`/api/ingest/jobs/${job.id}/retry-failed`, { method: 'POST' }); await onRefresh?.(); }} /> : null}
              {['queued', 'pending', 'running'].includes(job.status) ? <ActionButton icon={X} label="Cancel" onClick={async () => { await fetch(`/api/ingest/jobs/${job.id}/cancel`, { method: 'POST' }); await onRefresh?.(); }} /> : null}
              {job.documentId ? <a className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:text-brand" href={`/api/documents/${job.documentId}/file`} target="_blank" rel="noreferrer">Open document</a> : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ResultsPanel({ title, results }: { title: string; results: SearchResult[] }) {
  return (
    <Panel title={title}>
      <ResultsList results={results} />
    </Panel>
  );
}

function ExpectedDocumentPanel({ expected }: { expected: NonNullable<DebugResult['expected']> }) {
  if (!expected.foundDocument) {
    return (
      <Panel title="Expected Document Check">
        <Alert tone="warning" text={expected.likelyReason || 'Expected document was not found in the manual library.'} />
      </Panel>
    );
  }
  const appearances = Object.entries(expected.appearsIn || {});
  return (
    <Panel title="Expected Document Check" action={<Badge tone={expected.appearsIn?.finalContext ? 'green' : 'amber'}>{expected.appearsIn?.finalContext ? 'Reached final context' : 'Missing from final context'}</Badge>}>
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-neutral-950">{expected.document?.title}</p>
          <p className="text-xs text-neutral-500">{expected.document?.filename} · {expected.document?.productFamily} · {humanDocType(expected.document?.documentType || '')} · {expected.document?.chunkCount ?? 0} chunks</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {appearances.map(([stage, present]) => <Badge key={stage} tone={present ? 'green' : 'red'}>{stage}: {present ? 'yes' : 'no'}</Badge>)}
        </div>
        <Alert tone={expected.appearsIn?.finalContext ? 'info' : 'warning'} text={expected.likelyReason || 'No diagnostic reason available.'} />
        <div className="flex flex-wrap gap-2">
          <FeedbackButton rating="expected_doc_missing" notes={`Expected document diagnostic: ${expected.document?.title || expected.expectedInput}`} label="Expected doc missing" />
          <FeedbackButton rating="wrong_product" notes={`Wrong product mixed in near expected document ${expected.document?.title || expected.expectedInput}`} label="Wrong product mixed in" />
          <FeedbackButton rating="bad_citation_page" notes={`Citation/page concern for expected document ${expected.document?.title || expected.expectedInput}`} label="Bad citation/page" />
        </div>
      </div>
    </Panel>
  );
}

function ResultsList({ results }: { results: SearchResult[] }) {
  if (results.length === 0) return <p className="text-sm text-neutral-400">No results.</p>;
  return (
    <div className="space-y-2">
      {results.slice(0, 12).map((result, index) => (
        <details key={`${result.id}-${index}`} className="rounded-md border border-neutral-200 bg-neutral-50">
          <summary className="cursor-pointer px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-neutral-950">{index + 1}. {result.documentTitle}</p>
                <p className="mt-1 text-2xs text-neutral-500">pages {result.pageStart}-{result.pageEnd} · {result.productFamily} · {humanDocType(result.documentType)}</p>
              </div>
              <div className="flex gap-1">
                <Badge>V {score(result.vectorScore)}</Badge>
                <Badge>K {score(result.keywordScore)}</Badge>
                <Badge>B {score(result.metadataBoost || 0)}</Badge>
                <Badge>D {score(result.deterministicScore || result.combinedScore)}</Badge>
                {result.llmRerankScore !== undefined ? <Badge>L {score(result.llmRerankScore)}</Badge> : null}
                <Badge>F {score(result.finalScore || result.rerankScore)}</Badge>
              </div>
            </div>
          </summary>
          <div className="space-y-2 px-3 pb-3">
            <p className="text-2xs text-neutral-500">{result.rerankReason || 'Hybrid retrieval result'}</p>
            <div className="flex flex-wrap gap-1">
              <Badge tone={result.productMatches === false ? 'red' : 'green'}>product {result.productMatches === false ? 'mismatch' : 'ok'}</Badge>
              <Badge tone={result.documentTypeMatches === false ? 'amber' : 'green'}>doc type {result.documentTypeMatches === false ? 'mismatch' : 'ok'}</Badge>
              <Badge tone={result.versionMatches === false ? 'amber' : 'green'}>version {result.versionMatches === false ? 'mismatch' : 'ok'}</Badge>
              <Badge tone={result.directlyAnswers ? 'green' : 'amber'}>{result.directlyAnswers ? 'direct evidence' : 'weak evidence'}</Badge>
            </div>
            <p className="whitespace-pre-wrap text-xs leading-5 text-neutral-700">{result.text}</p>
            <div className="flex gap-2">
              <FeedbackButton rating="relevant" notes={`Relevant result: ${result.documentTitle} pages ${result.pageStart}-${result.pageEnd}`} label="Result relevant" />
              <FeedbackButton rating="irrelevant" notes={`Irrelevant result: ${result.documentTitle} pages ${result.pageStart}-${result.pageEnd}`} label="Result irrelevant" />
              <FeedbackButton rating="expected_doc_missing" notes={`Expected document missing near result: ${result.documentTitle}`} label="Expected missing doc" />
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function FeedbackButton({ rating, notes, label }: { rating: string; notes: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => void fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, notes }),
      })}
      className="rounded-md border border-neutral-200 px-2 py-1 text-2xs font-semibold text-neutral-600 hover:border-brand/40 hover:text-brand"
    >
      {label}
    </button>
  );
}

function MobileNav({ activeView, onChange }: { activeView: AdminView; onChange: (view: AdminView) => void }) {
  return (
    <select value={activeView} onChange={(event) => onChange(event.target.value as AdminView)} className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 lg:hidden">
      {NAV_ITEMS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-neutral-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-neutral-950">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-neutral-950">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-brand/15 bg-brand/10 text-brand">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, primary }: { icon: LucideIcon; label: string; onClick: () => void | Promise<void>; primary?: boolean }) {
  return (
    <button type="button" onClick={() => void onClick()} className={cn('inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors', primary ? 'bg-brand text-white hover:bg-brand-hover' : 'border border-neutral-200 bg-white text-neutral-700 hover:border-brand/40 hover:text-brand')}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function SelectField({ label, value, onChange, options, labels }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[]; labels?: Record<string, string> }) {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-xs text-neutral-800 outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15">
        {options.map((option) => <option key={option || 'any'} value={option}>{labels?.[option] || option || 'Any'}</option>)}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 w-full rounded-md border border-neutral-200 px-3 text-xs text-neutral-800 outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15" />
    </label>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 w-full rounded-md border border-neutral-200 pl-9 pr-3 text-sm outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15" />
    </label>
  );
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'amber' | 'red' | 'green' }) {
  const toneClass =
    tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-700' :
    tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' :
    tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
    'border-neutral-200 bg-neutral-50 text-neutral-700';
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-2xs font-semibold', toneClass)}>{children}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'failed' || status === 'bad' ? 'red' : status.includes('warning') || status.includes('review') || status.includes('duplicate') ? 'amber' : 'green';
  return <Badge tone={tone}>{status || 'unknown'}</Badge>;
}

function QualityBadge({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  return <Badge tone={value < 0.35 ? 'amber' : 'green'}>{percent}%</Badge>;
}

function ConfidenceBadge({ label, value }: { label: string; value: number }) {
  if (!Number.isFinite(value)) return <Badge tone="amber">{label} confidence n/a</Badge>;
  return <Badge tone={value >= 0.75 ? 'green' : value >= 0.55 ? 'amber' : 'red'}>{label} confidence {Math.round(value * 100)}%</Badge>;
}

function Alert({ tone, text }: { tone: 'error' | 'warning' | 'info'; text: string }) {
  const className =
    tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' :
    tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' :
    'border-neutral-200 bg-neutral-50 text-neutral-700';
  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5', className)}>
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {text}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return <div className="h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function EmptyState({ title, text, actionLabel, onAction }: { title: string; text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
      <FileText className="h-8 w-8 text-neutral-300" />
      <h4 className="mt-3 text-sm font-semibold text-neutral-900">{title}</h4>
      <p className="mt-1 max-w-md text-xs leading-5 text-neutral-500">{text}</p>
      {actionLabel && onAction ? <button type="button" onClick={onAction} className="mt-4 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white">{actionLabel}</button> : null}
    </div>
  );
}

function MiniBarList({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (rows.length === 0) return <p className="text-sm text-neutral-400">No data yet.</p>;
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-700">{humanDocType(row.label)}</span>
            <span className="text-neutral-500">{row.count}</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-100"><div className="h-2 rounded-full bg-brand" style={{ width: `${(row.count / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <Panel title={title}>
      <pre className="max-h-80 overflow-auto rounded-md bg-neutral-950 p-3 text-xs leading-5 text-neutral-100">{JSON.stringify(value, null, 2)}</pre>
    </Panel>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-3 text-xs leading-5 text-neutral-700">{text}</pre>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2"><span className="font-semibold text-neutral-950">{value}</span> {label}</div>;
}

async function reindexDocument(id: string, onRefresh: () => Promise<void>) {
  await fetch(`/api/documents/${id}/reingest`, { method: 'POST' });
  await onRefresh();
}

async function applyBulkMetadata(
  ids: string[],
  patch: { productFamily?: string; documentType?: string },
  onRefresh: () => Promise<void>,
) {
  const body = Object.fromEntries(Object.entries(patch).filter(([, value]) => value));
  for (const id of ids) {
    await fetch(`/api/documents/${id}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  await onRefresh();
}

function updateQueuedFile(queue: QueueFile[], id: string, patch: Partial<QueueFile>): QueueFile[] {
  return queue.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function appendQueueLog(item: QueueFile, message: string): string[] {
  return [...(item.logs || []), `${new Date().toLocaleTimeString()} - ${message}`].slice(-12);
}

async function uploadSmallFileViaApi(input: {
  item: QueueFile;
  batchId: string;
  duplicateBehavior: string;
  autoDetectMetadata: boolean;
  applyMetadataToAll: boolean;
  preset: Record<string, string>;
  setQueue: Dispatch<SetStateAction<QueueFile[]>>;
}): Promise<IngestResult> {
  const { item, batchId, duplicateBehavior, autoDetectMetadata, applyMetadataToAll, preset, setQueue } = input;
  const form = new FormData();
  form.append('batchId', batchId);
  form.append('files', item.file);
  form.append('duplicateBehavior', duplicateBehavior);
  form.append('autoDetectMetadata', String(autoDetectMetadata));
  form.append('applyMetadataToAll', String(applyMetadataToAll));
  Object.entries(preset).forEach(([key, value]) => {
    if (value) form.append(key, value);
  });

  setQueue((current) => updateQueuedFile(current, item.id, {
    phase: 'Sending file to server',
    progress: 24,
    logs: appendQueueLog(item, 'Sending multipart upload to /api/ingest/files.'),
  }));
  setQueue((current) => updateQueuedFile(current, item.id, {
    phase: 'Server processing',
    progress: 36,
    logs: appendQueueLog(item, 'Upload reached the server. Waiting for extraction, metadata detection, chunking, embedding, and indexing to finish.'),
  }));
  const response = await fetch('/api/ingest/files', { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Upload failed with HTTP ${response.status}.`);
  return payload.results?.[0] as IngestResult;
}

async function uploadLargeFileViaGcs(input: {
  item: QueueFile;
  batchId: string;
  duplicateBehavior: string;
  autoDetectMetadata: boolean;
  applyMetadataToAll: boolean;
  preset: Record<string, string>;
  setQueue: Dispatch<SetStateAction<QueueFile[]>>;
}): Promise<IngestResult> {
  const { item, batchId, duplicateBehavior, autoDetectMetadata, applyMetadataToAll, preset, setQueue } = input;
  setQueue((current) => updateQueuedFile(current, item.id, {
    phase: 'Creating Cloud Storage upload',
    progress: 8,
    logs: appendQueueLog(item, 'Requesting a resumable Cloud Storage upload URL.'),
  }));

  const setupResponse = await fetch('/api/ingest/uploads/resumable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: item.file.name,
      contentType: item.file.type || 'application/octet-stream',
      sizeBytes: item.file.size,
    }),
  });
  const target = await setupResponse.json().catch(() => ({}));
  if (!setupResponse.ok) throw new Error(target.error || `Could not create large-file upload session (${setupResponse.status}).`);

  setQueue((current) => updateQueuedFile(current, item.id, {
    phase: 'Uploading to Cloud Storage',
    progress: 12,
    logs: appendQueueLog(item, `Large upload session created for ${target.gcsUri || 'Cloud Storage object'}.`),
  }));

  await uploadFileToResumableUrl({
    file: item.file,
    uploadUrl: String(target.uploadUrl || ''),
    onProgress: (percent) => {
      setQueue((current) => updateQueuedFile(current, item.id, {
        phase: 'Uploading to Cloud Storage',
        progress: Math.max(12, Math.min(54, Math.round(12 + percent * 0.42))),
      }));
    },
  });

  setQueue((current) => updateQueuedFile(current, item.id, {
    phase: 'Server processing',
    progress: 58,
    logs: appendQueueLog(item, 'Large upload finished. Server is downloading from Cloud Storage and starting RAG ingestion.'),
  }));

  const ingestResponse = await fetch('/api/ingest/gcs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batchId,
      filename: item.file.name,
      contentType: item.file.type || 'application/octet-stream',
      bucket: target.bucket,
      objectName: target.objectName,
      duplicateBehavior,
      autoDetectMetadata,
      applyMetadataToAll,
      metadataPreset: preset,
    }),
  });
  const payload = await ingestResponse.json().catch(() => ({}));
  const result = payload.results?.[0] as IngestResult | undefined;
  if (!ingestResponse.ok) throw new Error(result?.message || payload.error || `Large manual ingestion failed with HTTP ${ingestResponse.status}.`);
  if (!result) throw new Error('Large manual ingestion finished without a result payload.');
  return result;
}

function uploadFileToResumableUrl(input: {
  file: File;
  uploadUrl: string;
  onProgress: (percent: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!input.uploadUrl) {
      reject(new Error('Large-file upload URL was empty.'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', input.uploadUrl);
    xhr.setRequestHeader('Content-Type', input.file.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) input.onProgress(event.loaded / event.total * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress(100);
        resolve();
      } else {
        reject(new Error(`Cloud Storage upload failed with HTTP ${xhr.status}. ${xhr.responseText || ''}`.trim()));
      }
    };
    xhr.onerror = () => reject(new Error('Cloud Storage upload failed because the browser could not reach the upload URL.'));
    xhr.ontimeout = () => reject(new Error('Cloud Storage upload timed out.'));
    xhr.send(input.file);
  });
}

function ingestionStepIndex(item: QueueFile): number {
  const phase = `${item.phase} ${item.status} ${item.result?.status || ''}`.toLowerCase();
  if (/complete|failed|duplicate|review|warning/.test(phase)) return INGEST_LIFECYCLE_STEPS.length - 1;
  if (/index/.test(phase)) return 7;
  if (/embed/.test(phase)) return 6;
  if (/chunk/.test(phase)) return 5;
  if (/metadata/.test(phase)) return 4;
  if (/extract/.test(phase)) return 3;
  if (/server|processing/.test(phase)) return 2;
  if (/upload|sending/.test(phase)) return 1;
  return 0;
}

function isAcceptedFile(file: File): boolean {
  return /\.(pdf|txt|md|markdown|docx|csv|tsv)$/i.test(file.name);
}

async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function humanUploadError(error: unknown, file?: File): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/RAG_UPLOAD_BUCKET|Large-file uploads are not configured/i.test(message)) {
    return 'Large-file uploads are not configured on this environment yet. Set RAG_UPLOAD_BUCKET and redeploy.';
  }
  if (/Cloud Storage|CORS|forbidden|permission|denied/i.test(message)) {
    return `Large-file upload failed: ${message}`;
  }
  if (/failed to fetch|network|body|payload|413|request entity too large/i.test(message)) {
    return file && file.size > API_UPLOAD_LIMIT_BYTES
      ? 'The large-file upload did not complete. Check Cloud Storage bucket CORS/permissions, then retry.'
      : 'The upload did not reach a completed RAG API response. Try the large-file upload path or a smaller PDF.';
  }
  if (/database|pgvector|postgres/i.test(message)) return 'The RAG database is not connected. Set DATABASE_URL to PostgreSQL with pgvector and run the migration.';
  if (/pdf/i.test(message)) return 'PDF text extraction failed. Try OCR mode or upload a cleaner PDF.';
  return message || 'Upload failed. Review the ingestion job for details.';
}

function extractDocumentWarnings(document: RagDocument): string[] {
  const warnings: string[] = [];
  if (document.productFamily === 'General') warnings.push('We could not confidently detect product metadata. Please review metadata before relying on this manual.');
  if (document.documentType === 'unknown') warnings.push('We could not confidently detect document type. Please review metadata.');
  if (metadataConfidence(document, 'product_family_confidence') < 0.55) warnings.push('Product metadata confidence is low. Use batch edit or the metadata editor to correct it.');
  if (metadataConfidence(document, 'document_type_confidence') < 0.55) warnings.push('Document type confidence is low. Search filters may be less reliable until reviewed.');
  if ((document.extractionQualityScore ?? 1) < 0.35) warnings.push('Low quality extraction detected. OCR may be needed for scanned pages.');
  warnings.push(...qualityWarnings(document));
  if ((document.embeddingCount ?? 0) === 0) warnings.push('No embeddings found. Retrieval will be keyword-only for this manual.');
  return [...new Set(warnings)];
}

function metadataConfidence(document: RagDocument, key: string): number {
  const extraction = document.metadata?.metadataExtraction as Record<string, unknown> | undefined;
  const value = extraction?.[key];
  return typeof value === 'number' ? value : Number(value ?? 1);
}

function metadataNeedsReview(document: RagDocument): boolean {
  return (
    document.productFamily === 'General' ||
    document.documentType === 'unknown' ||
    metadataConfidence(document, 'product_family_confidence') < 0.55 ||
    metadataConfidence(document, 'document_type_confidence') < 0.55 ||
    document.status === 'needs_metadata_review'
  );
}

function qualityWarnings(document: RagDocument): string[] {
  const metadata = document.metadata || {};
  const quality = metadata.quality as Record<string, unknown> | undefined;
  const direct = Array.isArray(metadata.extractionWarnings) ? (metadata.extractionWarnings as string[]) : [];
  const nested = Array.isArray(quality?.extractionWarnings) ? (quality.extractionWarnings as string[]) : [];
  return [...new Set([...direct, ...nested])];
}

function sortDocuments(a: RagDocument, b: RagDocument, sort: string): number {
  if (sort === 'title') return a.title.localeCompare(b.title);
  if (sort === 'product') return a.productFamily.localeCompare(b.productFamily);
  if (sort === 'document_type') return a.documentType.localeCompare(b.documentType);
  if (sort === 'page_count') return b.pageCount - a.pageCount;
  if (sort === 'chunk_count') return (b.chunkCount ?? 0) - (a.chunkCount ?? 0);
  if (sort === 'revision_date') return dateValue(b.revisionDate) - dateValue(a.revisionDate);
  return dateValue(b.updatedAt) - dateValue(a.updatedAt);
}

function dateValue(value: string | null | undefined): number {
  if (!value) return 0;
  const date = new Date(value).getTime();
  return Number.isNaN(date) ? 0 : date;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function humanDocType(value: string): string {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function score(value: number): string {
  return Number(value || 0).toFixed(2);
}
