'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Eye, FileText, RefreshCw, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

const WORK_BOARD_URL = '/api/work';
const BLOG_CONTEXT = 'blog:content';

type KanbanStatus = 'queue' | 'ongoing' | 'need_human' | 'completed';

type WorkItem = {
  id: string;
  title: string;
  description: string | null;
  status: KanbanStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, any>;
};

const STAGES = [
  'Intake',
  'Run ID creation',
  'Content/preview generation',
  'Schema validation',
  'Featured image package/generation',
  'Styled here.now preview publish',
  'Human approval wait',
  'WordPress publish handoff',
  'Publish result parse',
  'Status report back',
] as const;

type Stage = (typeof STAGES)[number];

const stageColors: Record<Stage, string> = {
  Intake: 'border-cyan-500/30',
  'Run ID creation': 'border-sky-500/30',
  'Content/preview generation': 'border-blue-500/30',
  'Schema validation': 'border-indigo-500/30',
  'Featured image package/generation': 'border-violet-500/30',
  'Styled here.now preview publish': 'border-fuchsia-500/30',
  'Human approval wait': 'border-rose-500/30',
  'WordPress publish handoff': 'border-amber-500/30',
  'Publish result parse': 'border-emerald-500/30',
  'Status report back': 'border-green-500/30',
};

const normalizeStage = (value: unknown): Stage => {
  if (typeof value !== 'string') return 'Intake';
  const match = STAGES.find(s => s.toLowerCase() === value.toLowerCase());
  return match ?? 'Intake';
};

const deriveStatusFromStage = (stage: Stage): KanbanStatus => {
  if (stage === 'Human approval wait') return 'need_human';
  if (stage === 'Status report back') return 'completed';
  if (stage === 'Intake' || stage === 'Run ID creation') return 'queue';
  return 'ongoing';
};


export function BlogsTab() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'boss' | 'operator'>('boss');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    niche: '',
    topic: '',
    primary_keyword: '',
    target_words: 1800,
    run_id: '',
    approval_state: 'pending',
  });

  const loadBoard = useCallback(async () => {
    const res = await fetch(`${WORK_BOARD_URL}/board?contextKey=${encodeURIComponent(BLOG_CONTEXT)}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const all: WorkItem[] = [];
    for (const col of data.columns || []) {
      for (const item of col.items || []) {
        all.push({ ...item, metadata: item.metadata || {} });
      }
    }
    setItems(all);
    setLoading(false);
  }, []);

  const reconcile = useCallback(async () => {
    await fetch('/api/blogs/reconcile', { method: 'POST' });
  }, []);

  useEffect(() => {
    loadBoard();
    const id = setInterval(async () => {
      await reconcile();
      await loadBoard();
    }, 7000);
    return () => clearInterval(id);
  }, [loadBoard, reconcile]);

  const kpis = useMemo(() => {
    const awaiting = items.filter(i => normalizeStage(i.metadata?.current_stage) === 'Human approval wait').length;
    const published = items.filter(i => normalizeStage(i.metadata?.current_stage) === 'Status report back').length;
    const blocked = items.filter(i => !!i.metadata?.error_summary).length;
    const planned = items.filter(i => ['queue', 'ongoing', 'need_human'].includes(i.status)).length;
    return { planned, blocked, awaiting, published };
  }, [items]);

  const byStage = useMemo(() => {
    return STAGES.map(stage => ({
      stage,
      items: items.filter(i => normalizeStage(i.metadata?.current_stage) === stage),
    }));
  }, [items]);

  const patchItem = useCallback(async (item: WorkItem, patch: Partial<WorkItem> & { metadata?: Record<string, any> }) => {
    setSavingId(item.id);
    try {
      const res = await fetch(`${WORK_BOARD_URL}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: patch.title ?? item.title,
          description: patch.description ?? item.description,
          status: patch.status ?? item.status,
          priority: patch.priority ?? item.priority,
          metadata: { ...item.metadata, ...(patch.metadata || {}) },
        }),
      });
      if (res.ok) await loadBoard();
    } finally {
      setSavingId(null);
    }
  }, [loadBoard]);

  const moveStage = async (item: WorkItem, stage: Stage) => {
    await patchItem(item, {
      status: deriveStatusFromStage(stage),
      metadata: { current_stage: stage, next_action: stage === 'Human approval wait' ? 'Awaiting human decision' : '' },
    });
  };

  const approve = async (item: WorkItem) => {
    setSavingId(item.id);
    try {
      const res = await fetch('/api/blogs/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (res.ok) await loadBoard();
    } finally {
      setSavingId(null);
    }
  };

  const revise = async (item: WorkItem) => {
    await patchItem(item, {
      status: 'ongoing',
      metadata: { approval_state: 'revise', current_stage: 'Content/preview generation', next_action: 'Revise and regenerate preview' },
    });
  };

  const retryRun = async (item: WorkItem) => {
    setSavingId(item.id);
    try {
      const res = await fetch('/api/blogs/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (res.ok) await loadBoard();
    } finally {
      setSavingId(null);
    }
  };

  const saveBlog = async (item: WorkItem) => {
    await patchItem(item, {
      status: 'completed',
      metadata: {
        approval_state: 'saved',
        saved_blog: true,
        saved_at: new Date().toISOString(),
        publish_status: 'not_published',
        next_action: 'Saved for later publish',
      },
    });
  };

  const deleteRun = async (item: WorkItem) => {
    const ok = typeof window !== 'undefined' ? window.confirm(`Delete run \"${item.title}\"? This cannot be undone.`) : true;
    if (!ok) return;
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/work/items/${item.id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedId === item.id) setSelectedId(null);
        await loadBoard();
      }
    } finally {
      setSavingId(null);
    }
  };

  const createItem = async () => {
    setStartError(null);
    const res = await fetch('/api/blogs/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStartError(data?.error || 'Failed to start blog run');
      return;
    }
    setForm({
      title: '',
      niche: '',
      topic: '',
      primary_keyword: '',
      target_words: 1800,
      run_id: '',
      approval_state: 'pending',
    });
    if (data?.itemId) setSelectedId(data.itemId);
    await loadBoard();
  };

  const approvalItems = items.filter(i => normalizeStage(i.metadata?.current_stage) === 'Human approval wait');

  const bossPriority = useMemo(() => {
    const blocked = items.filter(i => !!i.metadata?.error_summary);
    const waiting = approvalItems;
    const publishReady = items.filter(i => normalizeStage(i.metadata?.current_stage) === 'WordPress publish handoff' && i.metadata?.approval_state === 'approved');
    return { blocked, waiting, publishReady };
  }, [items, approvalItems]);

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.find(i => i.id === selectedId)) {
      setSelectedId(approvalItems[0]?.id || items[0]?.id || null);
    }
  }, [items, approvalItems, selectedId]);

  const selected = items.find(i => i.id === selectedId) || null;
  const selectedHtml = (selected?.metadata?.content_html as string) || '';
  const selectedMarkdown = (selected?.metadata?.content_markdown as string) || (selected?.description || '');
  const selectedQualityPass = !selected ? false : (selected.metadata?.quality_gate ? selected.metadata.quality_gate === 'pass' : true);
  const selectedQualityReasons = (selected?.metadata?.quality_reasons as string[] | undefined) || [];

  const libraryItems = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    return items
      .filter(i => !!i.metadata?.content_markdown || !!i.metadata?.content_html || normalizeStage(i.metadata?.current_stage) === 'Status report back')
      .filter(i => !q || i.title.toLowerCase().includes(q) || String(i.metadata?.topic || '').toLowerCase().includes(q) || String(i.metadata?.run_id || '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [items, libraryQuery]);

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary tracking-wide">BLOGS • FUNCTIONAL PIPELINE</h2>
        <div className="flex gap-2 items-center">
          <div className="inline-flex rounded border border-white/10 overflow-hidden">
            <button onClick={() => setViewMode('boss')} className={cn('px-2 py-1.5 text-xs inline-flex items-center gap-1', viewMode === 'boss' ? 'bg-accent-cyan/15 text-accent-cyan' : 'text-text-secondary')}><Eye className="w-3.5 h-3.5"/>Boss</button>
            <button onClick={() => setViewMode('operator')} className={cn('px-2 py-1.5 text-xs inline-flex items-center gap-1 border-l border-white/10', viewMode === 'operator' ? 'bg-accent-cyan/15 text-accent-cyan' : 'text-text-secondary')}><SlidersHorizontal className="w-3.5 h-3.5"/>Operator</button>
          </div>
          <button onClick={async () => { await reconcile(); await loadBoard(); }} className="px-2 py-1.5 text-xs border border-white/10 rounded text-text-secondary hover:text-text-primary inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5"/>Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-10 gap-4 min-h-[70vh]">
        <div className="xl:col-span-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <MetricCard icon={FileText} label="Planned" value={String(kpis.planned)} tone="cyan" />
            <MetricCard icon={AlertTriangle} label="Blocked" value={String(kpis.blocked)} tone="yellow" />
            <MetricCard icon={Clock3} label="Awaiting" value={String(kpis.awaiting)} tone="red" />
            <MetricCard icon={CheckCircle2} label="Published" value={String(kpis.published)} tone="green" />
          </div>

          <div className="bg-bg-secondary border border-white/10 rounded-lg p-3">
            <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Run Builder</h3>
            <p className="text-[11px] text-text-muted mb-2">All fields optional. Leave blanks and AI will auto-fill from your input or fallback topic queue.</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title (optional)" className="px-2 py-1.5 bg-black border border-white/15 rounded text-xs text-white placeholder:text-gray-400" />
              <input value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))} placeholder="Niche (optional)" className="px-2 py-1.5 bg-black border border-white/15 rounded text-xs text-white placeholder:text-gray-400" />
              <input value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} placeholder="Topic (optional)" className="px-2 py-1.5 bg-black border border-white/15 rounded text-xs text-white placeholder:text-gray-400" />
              <input value={form.primary_keyword} onChange={e => setForm(f => ({ ...f, primary_keyword: e.target.value }))} placeholder="Primary keyword (optional)" className="px-2 py-1.5 bg-black border border-white/15 rounded text-xs text-white placeholder:text-gray-400" />
              <input type="number" value={form.target_words} onChange={e => setForm(f => ({ ...f, target_words: Number(e.target.value || 0) }))} placeholder="Target words (optional)" className="px-2 py-1.5 bg-black border border-white/15 rounded text-xs text-white placeholder:text-gray-400 col-span-2" />
            </div>
            {startError ? <p className="text-[11px] text-red-300 mt-2">{startError}</p> : null}
            <div className="mt-2 flex justify-end">
              <button onClick={createItem} className="px-3 py-1.5 text-xs rounded border border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan">Start Blog Run</button>
            </div>
          </div>

          <div className="bg-bg-secondary border border-white/10 rounded-lg p-3">
            <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Run Control</h3>
            <p className="text-xs text-text-muted mb-2">Pick a run, review content on the right, decide fast.</p>
            <div className="space-y-2 max-h-80 overflow-auto">
              {items.map(item => (
                <button key={item.id} onClick={() => setSelectedId(item.id)} className={cn('w-full text-left rounded border p-2', selectedId === item.id ? 'border-accent-cyan/40 bg-accent-cyan/10' : 'border-white/10 bg-bg-tertiary/50')}>
                  <p className="text-sm text-text-primary truncate">{item.title}</p>
                  <p className="text-[11px] text-text-muted">{item.metadata?.run_id || item.id}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    <Badge tone={item.metadata?.error_summary ? 'red' : 'green'}>{item.metadata?.error_summary ? 'blocked' : 'ok'}</Badge>
                    <Badge tone="cyan">{item.metadata?.approval_state || 'pending'}</Badge>
                  </div>
                </button>
              ))}
              {items.length === 0 && <p className="text-xs text-text-muted">No runs yet.</p>}
            </div>
          </div>

          <div className="bg-bg-secondary border border-white/10 rounded-lg p-3">
            <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Decision Actions</h3>
            {selected ? (
              <div className="space-y-2">
                <p className="text-xs text-text-muted">{selected.metadata?.next_action || 'No pending action'}</p>
                {selected.metadata?.quality_gate === 'fail' ? (
                  <p className="text-[11px] text-amber-300">Quality gate failed: {selectedQualityReasons.join(' • ') || 'revise required'}</p>
                ) : null}
                <div className="flex gap-2 flex-wrap">
                  <button disabled={savingId === selected.id} onClick={() => retryRun(selected)} className="flex-1 min-w-[90px] px-2 py-1.5 text-xs rounded border border-cyan-500/30 text-cyan-300">Retry</button>
                  <button disabled={savingId === selected.id} onClick={() => revise(selected)} className="flex-1 min-w-[90px] px-2 py-1.5 text-xs rounded border border-amber-500/30 text-amber-300">Revise</button>
                  <button disabled={savingId === selected.id} onClick={() => saveBlog(selected)} className="flex-1 min-w-[90px] px-2 py-1.5 text-xs rounded border border-purple-500/30 text-purple-300">Save Blog</button>
                  <button disabled={savingId === selected.id || !selectedQualityPass} onClick={() => approve(selected)} className="flex-1 min-w-[120px] px-2 py-1.5 text-xs rounded border border-green-500/30 text-green-300 disabled:opacity-40">Approve + Publish</button>
                  <button disabled={savingId === selected.id} onClick={() => deleteRun(selected)} className="flex-1 min-w-[90px] px-2 py-1.5 text-xs rounded border border-red-500/30 text-red-300">Delete</button>
                </div>
                <select
                  value={normalizeStage(selected.metadata?.current_stage)}
                  onChange={e => moveStage(selected, normalizeStage(e.target.value))}
                  className="w-full text-xs bg-bg-primary border border-white/10 rounded px-2 py-1"
                  disabled={savingId === selected.id}
                >
                  {STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                </select>
              </div>
            ) : <p className="text-xs text-text-muted">Select a run.</p>}
          </div>

          <div className="bg-bg-secondary border border-white/10 rounded-lg p-3">
            <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Blog Library</h3>
            <input value={libraryQuery} onChange={e => setLibraryQuery(e.target.value)} placeholder="Search old blogs" className="w-full px-2 py-1.5 mb-2 bg-black border border-white/15 rounded text-xs text-white placeholder:text-gray-400" />
            <div className="space-y-2 max-h-56 overflow-auto">
              {libraryItems.map(item => (
                <button key={item.id} onClick={() => setSelectedId(item.id)} className={cn('w-full text-left rounded border p-2', selectedId === item.id ? 'border-accent-cyan/40 bg-accent-cyan/10' : 'border-white/10 bg-bg-tertiary/50')}>
                  <p className="text-xs text-text-primary truncate">{item.title}</p>
                  <p className="text-[11px] text-text-muted truncate">{item.metadata?.run_id || item.id}</p>
                </button>
              ))}
              {libraryItems.length === 0 && <p className="text-xs text-text-muted">No generated blogs yet.</p>}
            </div>
          </div>
        </div>

        <div className="xl:col-span-7">
          <div className="bg-[#dcdcdc] border border-white/10 rounded-lg h-full flex flex-col min-h-[70vh] overflow-hidden">
            <div className="bg-[#0e0e0e] text-white px-4 py-2 border-b border-black/40">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wide opacity-90">
                <span>arrsys.com</span>
                <span>{selected ? 'Blog Preview (Light Mode)' : 'Preview Ready'}</span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {!selected ? (
                <div className="h-full min-h-[56vh] max-w-4xl mx-auto bg-white border border-[#d6d6d6] flex items-center justify-center">
                  <div className="text-center text-[#9a9a9a] text-sm">Select a blog run to load page preview</div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto bg-white border border-[#d6d6d6] shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
                  <div className="h-8 bg-[#141414] text-[10px] text-white flex items-center px-4 tracking-wide uppercase">Home · Company · Products · Industries · Color Label Printers</div>

                  {selected.metadata?.featured_image_url ? (
                    <img src={String(selected.metadata.featured_image_url)} alt="Featured" className="w-full max-h-[420px] object-cover" />
                  ) : (
                    <div className="w-full h-[280px] bg-[#f1f1f1] border-b border-[#e2e2e2] flex items-center justify-center text-[#a1a1a1] text-sm">Featured image area</div>
                  )}

                  <div className="grid grid-cols-12 gap-0">
                    <aside className="col-span-3 border-r border-[#ececec] bg-[#fafafa] p-3">
                      <div className="text-[11px] font-semibold text-[#444] mb-2">Table of Contents</div>
                      <div className="space-y-1 text-[11px] text-[#7a7a7a]">
                        <p>1. Introduction</p>
                        <p>2. Key Points</p>
                        <p>3. Practical Steps</p>
                        <p>4. Conclusion</p>
                      </div>
                    </aside>

                    <main className="col-span-9 p-5">
                      <h1 className="text-[38px] leading-tight font-semibold text-[#9d1f1f] mb-3">{selected.title}</h1>
                      <p className="text-[12px] text-[#7a7a7a] mb-4">{selected.metadata?.run_id || selected.id} • {normalizeStage(selected.metadata?.current_stage)}</p>

                      {selectedHtml ? (
                        <article className="prose max-w-none prose-headings:text-[#333] prose-p:text-[#2e2e2e] prose-li:text-[#2e2e2e]" dangerouslySetInnerHTML={{ __html: selectedHtml }} />
                      ) : (
                        <pre className="whitespace-pre-wrap text-[15px] text-[#2d2d2d] leading-7 font-sans">{selectedMarkdown || 'No generated content found yet.'}</pre>
                      )}
                    </main>
                  </div>
                </div>
              )}
            </div>

            {selected && (
              <div className="p-3 border-t border-black/10 bg-white/80 flex items-center justify-between gap-2">
                <div className="text-xs text-[#555]">Preview: {selected.metadata?.preview_url || 'n/a'} {selected.metadata?.wp_url ? `• WP: ${selected.metadata.wp_url}` : ''}</div>
                <div className="flex gap-2">
                  <button disabled={savingId === selected.id} onClick={() => revise(selected)} className="px-3 py-1.5 text-xs rounded border border-amber-500/30 text-amber-700">Revise</button>
                  <button disabled={savingId === selected.id || !selectedQualityPass} onClick={() => approve(selected)} className="px-3 py-1.5 text-xs rounded border border-green-500/30 text-green-700 disabled:opacity-40">Approve</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

function DecisionPanel({ title, items, empty }: { title: string; items: WorkItem[]; empty: string }) {
  return (
    <div className="bg-bg-secondary border border-white/10 rounded-lg p-3">
      <h4 className="text-xs uppercase tracking-wide text-text-secondary mb-2">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">{empty}</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-auto">
          {items.slice(0, 8).map(item => (
            <div key={item.id} className="rounded border border-white/10 p-2 bg-bg-tertiary/60">
              <p className="text-sm text-text-primary">{item.title}</p>
              <p className="text-[11px] text-text-muted mt-1">{item.metadata?.run_id || item.id}</p>
              {item.metadata?.error_summary ? <p className="text-[11px] text-red-300 mt-1">{item.metadata.error_summary}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: 'cyan' | 'yellow' | 'red' | 'green' }) {
  const toneClass = {
    cyan: 'text-accent-cyan border-accent-cyan/20 bg-accent-cyan/5',
    yellow: 'text-accent-yellow border-accent-yellow/20 bg-accent-yellow/5',
    red: 'text-accent-red border-accent-red/20 bg-accent-red/5',
    green: 'text-accent-green border-accent-green/20 bg-accent-green/5',
  }[tone];

  return (
    <div className={`rounded-lg border ${toneClass} p-3`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: 'red' | 'green' | 'yellow' | 'cyan' }) {
  const cls = {
    red: 'text-red-300 border-red-500/30 bg-red-500/10',
    green: 'text-green-300 border-green-500/30 bg-green-500/10',
    yellow: 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10',
    cyan: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10',
  }[tone];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>;
}
