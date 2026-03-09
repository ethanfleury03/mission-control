'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FileText, Plus, RefreshCw, type LucideIcon } from 'lucide-react';
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
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '',
    requested_mode: 'dry_run',
    topic: '',
    run_id: '',
    current_stage: 'Intake' as Stage,
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

  useEffect(() => {
    loadBoard();
    const id = setInterval(loadBoard, 7000);
    return () => clearInterval(id);
  }, [loadBoard]);

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
    await patchItem(item, {
      status: 'ongoing',
      metadata: { approval_state: 'approved', current_stage: 'WordPress publish handoff', next_action: 'Dispatch to blog-publisher' },
    });
  };

  const revise = async (item: WorkItem) => {
    await patchItem(item, {
      status: 'ongoing',
      metadata: { approval_state: 'revise', current_stage: 'Content/preview generation', next_action: 'Revise and regenerate preview' },
    });
  };

  const createItem = async () => {
    const title = form.title.trim() || form.topic.trim() || 'Untitled Blog Run';
    const runId = form.run_id.trim() || `run_${Date.now()}`;
    const stage = form.current_stage;
    const res = await fetch(`${WORK_BOARD_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        status: deriveStatusFromStage(stage),
        priority: 0,
        metadata: {
          contextKey: BLOG_CONTEXT,
          source: 'blogs-ui',
          run_id: runId,
          topic: form.topic.trim() || title,
          requested_mode: form.requested_mode,
          current_stage: stage,
          status: 'pass',
          content_handoff_valid: 'Y',
          approval_state: form.approval_state,
          publish_target: 'wordpress',
          wp_post_id: '',
          wp_url: '',
          image_status: 'pending',
          error_summary: '',
          next_action: stage === 'Human approval wait' ? 'Awaiting human decision' : '',
        },
      }),
    });
    if (res.ok) {
      setShowCreate(false);
      setForm({ title: '', requested_mode: 'dry_run', topic: '', run_id: '', current_stage: 'Intake', approval_state: 'pending' });
      await loadBoard();
    }
  };

  const approvalItems = items.filter(i => normalizeStage(i.metadata?.current_stage) === 'Human approval wait');

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary tracking-wide">BLOGS • FUNCTIONAL PIPELINE</h2>
        <div className="flex gap-2">
          <button onClick={loadBoard} className="px-2 py-1.5 text-xs border border-white/10 rounded text-text-secondary hover:text-text-primary inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5"/>Refresh</button>
          <button onClick={() => setShowCreate(true)} className="px-2 py-1.5 text-xs border border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan rounded inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5"/>New Blog Run</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <MetricCard icon={FileText} label="Planned" value={String(kpis.planned)} tone="cyan" />
        <MetricCard icon={AlertTriangle} label="Blocked" value={String(kpis.blocked)} tone="yellow" />
        <MetricCard icon={Clock3} label="Awaiting Approval" value={String(kpis.awaiting)} tone="red" />
        <MetricCard icon={CheckCircle2} label="Published" value={String(kpis.published)} tone="green" />
      </div>

      <div className="bg-bg-secondary border border-white/10 rounded-lg p-4">
        <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">Approval Queue</h3>
        {approvalItems.length === 0 ? (
          <p className="text-xs text-text-muted">No cards waiting for human approval.</p>
        ) : (
          <div className="space-y-2">
            {approvalItems.map(item => (
              <div key={item.id} className="p-2 rounded border border-white/10 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-text-primary">{item.title}</p>
                  <p className="text-xs text-text-muted">{item.metadata?.run_id || item.id} • {item.metadata?.requested_mode || 'dry_run'}</p>
                </div>
                <div className="flex gap-2">
                  <button disabled={savingId === item.id} onClick={() => revise(item)} className="px-2 py-1 text-xs rounded border border-amber-500/30 text-amber-300">Revise</button>
                  <button disabled={savingId === item.id} onClick={() => approve(item)} className="px-2 py-1 text-xs rounded border border-green-500/30 text-green-300">Approve</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-text-muted">Loading blog pipeline…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {byStage.map(col => (
            <div key={col.stage} className={cn('rounded-lg border bg-bg-secondary p-3', stageColors[col.stage])}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs uppercase tracking-wide text-text-secondary">{col.stage}</h4>
                <span className="text-xs text-text-muted">{col.items.length}</span>
              </div>
              <div className="space-y-2 max-h-72 overflow-auto">
                {col.items.map(item => (
                  <div key={item.id} className="rounded border border-white/10 p-2 bg-bg-tertiary/60">
                    <p className="text-sm text-text-primary">{item.title}</p>
                    <p className="text-xs text-text-muted mt-1">run: {item.metadata?.run_id || 'n/a'}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.metadata?.error_summary ? <Badge tone="red">failed</Badge> : <Badge tone="green">pass</Badge>}
                      {item.metadata?.retry_count ? <Badge tone="yellow">retry {item.metadata.retry_count}</Badge> : null}
                      {item.metadata?.worker_unavailable ? <Badge tone="yellow">worker unavailable</Badge> : null}
                      <Badge tone="cyan">{item.metadata?.approval_state || 'pending'}</Badge>
                    </div>
                    <div className="mt-2 flex gap-1">
                      <select
                        value={normalizeStage(item.metadata?.current_stage)}
                        onChange={e => moveStage(item, normalizeStage(e.target.value))}
                        className="w-full text-xs bg-bg-primary border border-white/10 rounded px-2 py-1"
                        disabled={savingId === item.id}
                      >
                        {STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
                {col.items.length === 0 && <p className="text-xs text-text-muted">No items</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-secondary rounded-lg border border-white/10 p-4 w-[34rem]">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Create Blog Run</h3>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" className="px-2 py-1.5 bg-bg-tertiary border border-white/10 rounded text-sm" />
              <input value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} placeholder="Topic" className="px-2 py-1.5 bg-bg-tertiary border border-white/10 rounded text-sm" />
              <input value={form.run_id} onChange={e => setForm(f => ({ ...f, run_id: e.target.value }))} placeholder="run_id (optional)" className="px-2 py-1.5 bg-bg-tertiary border border-white/10 rounded text-sm" />
              <select value={form.requested_mode} onChange={e => setForm(f => ({ ...f, requested_mode: e.target.value }))} className="px-2 py-1.5 bg-bg-tertiary border border-white/10 rounded text-sm">
                <option value="dry_run">dry_run</option>
                <option value="draft">draft</option>
                <option value="publish">publish</option>
              </select>
              <select value={form.current_stage} onChange={e => setForm(f => ({ ...f, current_stage: normalizeStage(e.target.value) }))} className="px-2 py-1.5 bg-bg-tertiary border border-white/10 rounded text-sm">
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={form.approval_state} onChange={e => setForm(f => ({ ...f, approval_state: e.target.value }))} className="px-2 py-1.5 bg-bg-tertiary border border-white/10 rounded text-sm">
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="revise">revise</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-text-muted">Cancel</button>
              <button onClick={createItem} className="px-3 py-1.5 text-xs rounded border border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan">Create</button>
            </div>
          </div>
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
