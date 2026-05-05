'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Archive,
  Check,
  Clipboard,
  Inbox,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react';

import { cn } from '@/app/lib/utils';
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  TICKET_URGENCIES,
  TICKET_VISIBILITIES,
  type DeveloperTicketsResponse,
  type TicketCategory,
  type TicketCommentVisibility,
  type TicketDTO,
  type TicketStatus,
  type TicketUrgency,
  type TicketVisibility,
} from '@/lib/help-desk/types';

type DeveloperForm = {
  title: string;
  description: string;
  requestedDate: string;
  nextStep: string;
  urgency: TicketUrgency;
  category: TicketCategory;
  businessImpact: string;
  attachmentNote: string;
  team: string;
  visibility: TicketVisibility;
  status: TicketStatus;
  createdByName: string;
  createdByEmail: string;
};

type Notice = {
  tone: 'success' | 'error' | 'info';
  text: string;
};

type DetailTab = 'details' | 'comments' | 'ai' | 'activity';
type AIPlanFilter = 'all' | 'ready' | 'failed' | 'generating' | 'needs_plan';

const EMPTY_FORM: DeveloperForm = {
  title: '',
  description: '',
  requestedDate: '',
  nextStep: '',
  urgency: 'normal',
  category: 'other',
  businessImpact: '',
  attachmentNote: '',
  team: '',
  visibility: 'team',
  status: 'open',
  createdByName: '',
  createdByEmail: '',
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  needs_input: 'Needs Input',
  finished: 'Finished',
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug_fix: 'Bug / Fix',
  new_automation: 'New Automation',
  dashboard_report: 'Dashboard / Report',
  hubspot_crm: 'HubSpot / CRM',
  ai_prompt_workflow: 'AI Prompt / Workflow',
  data_issue: 'Data Issue',
  training_help: 'Training / Help',
  other: 'Other',
};

const URGENCY_LABELS: Record<TicketUrgency, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const VISIBILITY_LABELS: Record<TicketVisibility, string> = {
  private: 'Requester only',
  team: 'Team-visible',
  company: 'Company-visible',
};

const URGENCY_CLASSES: Record<TicketUrgency, string> = {
  low: 'border-stone-200 bg-stone-100 text-stone-700',
  normal: 'border-blue-100 bg-blue-50 text-brand',
  high: 'border-amber-200 bg-amber-50 text-amber-800',
  urgent: 'border-rose-100 bg-rose-50 text-brand',
};

const STATUS_CLASSES: Record<TicketStatus, string> = {
  open: 'border-blue-100 bg-blue-50 text-blue-700',
  in_progress: 'border-blue-100 bg-blue-50 text-brand',
  needs_input: 'border-violet-100 bg-violet-50 text-violet-700',
  finished: 'border-emerald-100 bg-emerald-50 text-emerald-700',
};

export function DeveloperOperationsListTab({
  currentEmail,
  currentName,
}: {
  currentEmail: string;
  currentName: string;
}) {
  const [tickets, setTickets] = useState<TicketDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [requesterFilter, setRequesterFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | TicketUrgency>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [aiPlanFilter, setAIPlanFilter] = useState<AIPlanFilter>('all');
  const [selectedTicket, setSelectedTicket] = useState<TicketDTO | null>(null);
  const [detailForm, setDetailForm] = useState<DeveloperForm>(EMPTY_FORM);
  const [detailTab, setDetailTab] = useState<DetailTab>('details');
  const [commentBody, setCommentBody] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<TicketCommentVisibility>('public');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<DeveloperForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const showNotice = useCallback((next: Notice) => {
    setNotice(next);
    window.setTimeout(() => {
      setNotice((current) => (current?.text === next.text ? null : current));
    }, 3200);
  }, []);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/tickets/developer', { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as Partial<DeveloperTicketsResponse> & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'Could not load developer tickets.');
      setTickets(data.tickets ?? []);
      setLastUpdatedAt(data.lastUpdatedAt ?? new Date().toISOString());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load developer tickets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const requesters = useMemo(() => {
    const seen = new Map<string, string>();
    for (const ticket of tickets) {
      seen.set(ticket.createdByEmail.toLowerCase(), ticket.createdByName || ticket.createdByEmail);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tickets]);

  const metrics = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return [
      { label: 'Total Queue', value: tickets.length, tone: 'rose', icon: 'O' },
      { label: 'Urgent', value: tickets.filter((ticket) => ticket.urgency === 'urgent').length, tone: 'amber', icon: '!' },
      { label: 'Needs Input', value: tickets.filter((ticket) => ticket.status === 'needs_input').length, tone: 'amber', icon: '?' },
      { label: 'AI Plans Ready', value: tickets.filter((ticket) => ticket.aiPlan?.status === 'ready').length, tone: 'violet', icon: '*' },
      {
        label: 'Done This Month',
        value: tickets.filter((ticket) => {
          if (!ticket.finishedAt) return false;
          const finishedAt = new Date(ticket.finishedAt).getTime();
          return Number.isFinite(finishedAt) && finishedAt >= monthStart;
        }).length,
        tone: 'emerald',
        icon: '+',
      },
    ];
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (requesterFilter !== 'all' && ticket.createdByEmail.toLowerCase() !== requesterFilter) return false;
      if (urgencyFilter !== 'all' && ticket.urgency !== urgencyFilter) return false;
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
      if (aiPlanFilter === 'needs_plan' && ticket.aiPlan) return false;
      if (aiPlanFilter !== 'all' && aiPlanFilter !== 'needs_plan' && ticket.aiPlan?.status !== aiPlanFilter) return false;
      if (!normalizedQuery) return true;
      return [
        ticket.title,
        ticket.description,
        ticket.createdByName,
        ticket.createdByEmail,
        ticket.team,
        ticket.nextStep,
        ticket.businessImpact,
        ticket.aiPlan?.summary ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [aiPlanFilter, query, requesterFilter, statusFilter, tickets, urgencyFilter]);

  const openTicket = useCallback(async (ticket: TicketDTO, tab: DetailTab = 'details') => {
    setSelectedTicket(ticket);
    setDetailForm(formFromTicket(ticket));
    setDetailTab(tab);
    setCommentBody('');
    setCommentVisibility('public');
    try {
      const response = await fetch(`/api/tickets/${ticket.id}`, { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as { ticket?: TicketDTO; error?: string };
      if (!response.ok || !data.ticket) throw new Error(data.error || 'Could not load ticket details.');
      const nextTicket = data.ticket;
      setSelectedTicket(nextTicket);
      setDetailForm(formFromTicket(nextTicket));
      setTickets((current) => upsertTicket(current, nextTicket));
    } catch (openError) {
      showNotice({ tone: 'error', text: openError instanceof Error ? openError.message : 'Could not load ticket details.' });
    }
  }, [showNotice]);

  const saveSelectedTicket = useCallback(async () => {
    if (!selectedTicket) return;
    const validation = validateForm(detailForm);
    if (validation) {
      showNotice({ tone: 'error', text: validation });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToPayload(detailForm)),
      });
      const data = (await response.json().catch(() => ({}))) as { ticket?: TicketDTO; error?: string };
      if (!response.ok || !data.ticket) throw new Error(data.error || 'Could not save ticket.');
      const nextTicket = data.ticket;
      setSelectedTicket(nextTicket);
      setDetailForm(formFromTicket(nextTicket));
      setTickets((current) => upsertTicket(current, nextTicket));
      setLastUpdatedAt(new Date().toISOString());
      showNotice({ tone: 'success', text: 'Ticket saved.' });
    } catch (saveError) {
      showNotice({ tone: 'error', text: saveError instanceof Error ? saveError.message : 'Could not save ticket.' });
    } finally {
      setSaving(false);
    }
  }, [detailForm, selectedTicket, showNotice]);

  const createTicket = useCallback(async () => {
    const validation = validateForm(createForm);
    if (validation) {
      showNotice({ tone: 'error', text: validation });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToPayload(createForm)),
      });
      const data = (await response.json().catch(() => ({}))) as { ticket?: TicketDTO; error?: string };
      if (!response.ok || !data.ticket) throw new Error(data.error || 'Could not create ticket.');
      const nextTicket = data.ticket;
      setTickets((current) => upsertTicket(current, nextTicket));
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      setLastUpdatedAt(new Date().toISOString());
      showNotice({ tone: 'success', text: 'Developer task created.' });
    } catch (createError) {
      showNotice({ tone: 'error', text: createError instanceof Error ? createError.message : 'Could not create ticket.' });
    } finally {
      setSaving(false);
    }
  }, [createForm, showNotice]);

  const addComment = useCallback(async () => {
    if (!selectedTicket || !commentBody.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/tickets/${selectedTicket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody, visibility: commentVisibility }),
      });
      const data = (await response.json().catch(() => ({}))) as { ticket?: TicketDTO; error?: string };
      if (!response.ok || !data.ticket) throw new Error(data.error || 'Could not add comment.');
      const nextTicket = data.ticket;
      setSelectedTicket(nextTicket);
      setTickets((current) => upsertTicket(current, nextTicket));
      setCommentBody('');
      setLastUpdatedAt(new Date().toISOString());
      showNotice({ tone: 'success', text: commentVisibility === 'internal' ? 'Internal note added.' : 'Public update added.' });
    } catch (commentError) {
      showNotice({ tone: 'error', text: commentError instanceof Error ? commentError.message : 'Could not add comment.' });
    } finally {
      setSaving(false);
    }
  }, [commentBody, commentVisibility, selectedTicket, showNotice]);

  const archiveSelectedTicket = useCallback(async () => {
    if (!selectedTicket) return;
    if (!window.confirm(`Archive "${selectedTicket.title}"?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/tickets/${selectedTicket.id}`, { method: 'DELETE' });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not archive ticket.');
      setTickets((current) => current.filter((ticket) => ticket.id !== selectedTicket.id));
      setSelectedTicket(null);
      setLastUpdatedAt(new Date().toISOString());
      showNotice({ tone: 'success', text: 'Ticket archived.' });
    } catch (archiveError) {
      showNotice({ tone: 'error', text: archiveError instanceof Error ? archiveError.message : 'Could not archive ticket.' });
    } finally {
      setSaving(false);
    }
  }, [selectedTicket, showNotice]);

  const generateAIPlan = useCallback(async () => {
    if (!selectedTicket) return;
    setGeneratingPlan(true);
    try {
      const response = await fetch(`/api/tickets/${selectedTicket.id}/ai-plan`, { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as { ticket?: TicketDTO; error?: string };
      if (!response.ok || !data.ticket) throw new Error(data.error || 'Could not generate AI plan.');
      const nextTicket = data.ticket;
      setSelectedTicket(nextTicket);
      setTickets((current) => upsertTicket(current, nextTicket));
      setDetailTab('ai');
      setLastUpdatedAt(new Date().toISOString());
      showNotice({ tone: nextTicket.aiPlan?.status === 'failed' ? 'error' : 'success', text: nextTicket.aiPlan?.status === 'failed' ? 'AI plan failed. Error saved on ticket.' : 'AI plan generated.' });
    } catch (planError) {
      showNotice({ tone: 'error', text: planError instanceof Error ? planError.message : 'Could not generate AI plan.' });
    } finally {
      setGeneratingPlan(false);
    }
  }, [selectedTicket, showNotice]);

  const copyPrompt = useCallback(async () => {
    const prompt = selectedTicket?.aiPlan?.suggestedPrompt;
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    showNotice({ tone: 'success', text: 'Prompt copied.' });
  }, [selectedTicket?.aiPlan?.suggestedPrompt, showNotice]);

  if (loading) {
    return (
      <main className="flex-1 min-w-0 overflow-y-auto bg-[linear-gradient(180deg,#fffaf6_0%,#f5eee8_100%)]">
        <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-4 px-4 py-5 lg:px-6">
          <div className="h-32 animate-pulse rounded-lg border border-stone-200 bg-white" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-lg border border-stone-200 bg-white" />
            ))}
          </div>
          <div className="h-[34rem] animate-pulse rounded-lg border border-stone-200 bg-white" />
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex-1 min-w-0 overflow-y-auto bg-[linear-gradient(180deg,#fffaf6_0%,#f5eee8_100%)]">
      <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-4 px-4 py-5 lg:px-6">
        {notice ? <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}

        <section className="rounded-lg border border-stone-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand">Ethan Developer View</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">Developer Operations List</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                Sort by urgency, requester, AI readiness, or blocked status.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreateForm({ ...EMPTY_FORM, createdByName: currentName, createdByEmail: currentEmail, title: 'Internal note' });
                setCreateOpen(true);
              }}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Internal Note
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-3 shadow-sm xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <span className="sr-only">Search tasks</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks..."
              className="h-11 w-full rounded-md border border-stone-200 bg-stone-50 pl-9 pr-3 text-sm text-stone-900 outline-none transition focus:border-brand/40 focus:bg-white focus:ring-2 focus:ring-brand/10"
            />
          </label>
          <FilterSelect value={requesterFilter} onChange={setRequesterFilter} label="Requester filter">
            <option value="all">All requesters</option>
            {requesters.map(([email, name]) => (
              <option key={email} value={email}>
                {name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={urgencyFilter} onChange={(value) => setUrgencyFilter(value as 'all' | TicketUrgency)} label="Urgency filter">
            <option value="all">All urgency</option>
            {TICKET_URGENCIES.map((urgency) => (
              <option key={urgency} value={urgency}>{URGENCY_LABELS[urgency]}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={statusFilter} onChange={(value) => setStatusFilter(value as 'all' | TicketStatus)} label="Status filter">
            <option value="all">All statuses</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={aiPlanFilter} onChange={(value) => setAIPlanFilter(value as AIPlanFilter)} label="AI plan filter">
            <option value="all">All AI plans</option>
            <option value="ready">Ready</option>
            <option value="failed">Failed</option>
            <option value="generating">Generating</option>
            <option value="needs_plan">Needs plan</option>
          </FilterSelect>
          <button
            type="button"
            onClick={() => void loadTickets()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:border-brand/30 hover:text-brand"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </section>

        {error ? (
          <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</section>
        ) : null}

        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-stone-950">All Developer Tasks</h2>
              <p className="mt-1 text-xs text-stone-500">{formatLastUpdated(lastUpdatedAt)}</p>
            </div>
            <p className="text-sm font-semibold text-brand">{filteredTickets.length} shown</p>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[62rem] border-separate border-spacing-y-2 text-left">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Requester</th>
                  <th className="px-3 py-2">Urgency</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">AI Plan</th>
                  <th className="px-3 py-2">Next Step</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-10 text-center text-sm text-stone-500">
                      No tasks match these filters.
                    </td>
                  </tr>
                ) : (
                  filteredTickets.map((ticket) => (
                    <DeveloperRow key={ticket.id} ticket={ticket} onOpen={() => void openTicket(ticket)} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedTicket ? (
        <DeveloperDetailDrawer
          ticket={selectedTicket}
          form={detailForm}
          tab={detailTab}
          commentBody={commentBody}
          commentVisibility={commentVisibility}
          saving={saving}
          generatingPlan={generatingPlan}
          onTabChange={setDetailTab}
          onFormChange={setDetailForm}
          onCommentChange={setCommentBody}
          onCommentVisibilityChange={setCommentVisibility}
          onClose={() => setSelectedTicket(null)}
          onSave={() => void saveSelectedTicket()}
          onArchive={() => void archiveSelectedTicket()}
          onAddComment={() => void addComment()}
          onGenerateAIPlan={() => void generateAIPlan()}
          onCopyPrompt={() => void copyPrompt()}
        />
      ) : null}

      {createOpen ? (
        <DeveloperCreateModal
          form={createForm}
          saving={saving}
          onChange={setCreateForm}
          onClose={() => {
            setCreateOpen(false);
            setCreateForm(EMPTY_FORM);
          }}
          onSubmit={() => void createTicket()}
        />
      ) : null}
    </main>
  );
}

function MetricCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: string }) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-100 bg-amber-50 text-brand'
      : tone === 'violet'
        ? 'border-violet-100 bg-violet-50 text-violet-700'
        : tone === 'emerald'
          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
          : 'border-rose-100 bg-rose-50 text-brand';
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">{value}</p>
        </div>
        <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-lg font-semibold', toneClass)}>
          {icon}
        </span>
      </div>
    </div>
  );
}

function DeveloperRow({ ticket, onOpen }: { ticket: TicketDTO; onOpen: () => void }) {
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className="group cursor-pointer"
    >
      <td className="rounded-l-lg border-y border-l border-stone-200 bg-white px-3 py-3 shadow-sm transition-colors group-hover:border-brand/30">
        <div className="flex items-center gap-3">
          <span className="h-12 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ticket.requesterColor }} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-stone-950">{ticket.title}</p>
            <p className="mt-1 truncate text-xs text-stone-500">{CATEGORY_LABELS[ticket.category]}{ticket.team ? ` - ${ticket.team}` : ''}</p>
          </div>
        </div>
      </td>
      <td className="border-y border-stone-200 bg-white px-3 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: ticket.requesterColor }} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-stone-700">{ticket.createdByName}</p>
            <p className="truncate text-[11px] text-stone-500">{ticket.createdByEmail}</p>
          </div>
        </div>
      </td>
      <td className="border-y border-stone-200 bg-white px-3 py-3 shadow-sm">
        <Badge className={URGENCY_CLASSES[ticket.urgency]}>{URGENCY_LABELS[ticket.urgency]}</Badge>
      </td>
      <td className="border-y border-stone-200 bg-white px-3 py-3 shadow-sm">
        <Badge className={STATUS_CLASSES[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge>
      </td>
      <td className="border-y border-stone-200 bg-white px-3 py-3 shadow-sm">
        <Badge className={aiPlanClass(ticket)}>
          {ticket.aiPlan ? aiPlanLabel(ticket.aiPlan.status) : 'Needs Plan'}
        </Badge>
      </td>
      <td className="rounded-r-lg border-y border-r border-stone-200 bg-white px-3 py-3 shadow-sm transition-colors group-hover:border-brand/30">
        <p className="line-clamp-2 max-w-sm text-sm leading-5 text-stone-600">{ticket.nextStep || ticket.latestComment?.body || 'No next step set'}</p>
      </td>
    </tr>
  );
}

function DeveloperDetailDrawer({
  ticket,
  form,
  tab,
  commentBody,
  commentVisibility,
  saving,
  generatingPlan,
  onTabChange,
  onFormChange,
  onCommentChange,
  onCommentVisibilityChange,
  onClose,
  onSave,
  onArchive,
  onAddComment,
  onGenerateAIPlan,
  onCopyPrompt,
}: {
  ticket: TicketDTO;
  form: DeveloperForm;
  tab: DetailTab;
  commentBody: string;
  commentVisibility: TicketCommentVisibility;
  saving: boolean;
  generatingPlan: boolean;
  onTabChange: (tab: DetailTab) => void;
  onFormChange: (form: DeveloperForm) => void;
  onCommentChange: (body: string) => void;
  onCommentVisibilityChange: (visibility: TicketCommentVisibility) => void;
  onClose: () => void;
  onSave: () => void;
  onArchive: () => void;
  onAddComment: () => void;
  onGenerateAIPlan: () => void;
  onCopyPrompt: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal>
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden border-l border-stone-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand">Developer Task</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-stone-950">{ticket.title}</h2>
            <p className="mt-1 text-xs text-stone-500">{ticket.createdByName} - opened {formatDate(ticket.createdAt)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-950" aria-label="Close drawer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-stone-200 px-5">
          {(['details', 'comments', 'ai', 'activity'] as DetailTab[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onTabChange(item)}
              className={cn(
                'border-b-2 px-4 py-3 text-sm font-semibold capitalize transition-colors',
                tab === item ? 'border-brand text-brand' : 'border-transparent text-stone-500 hover:text-stone-950',
              )}
            >
              {item === 'ai' ? 'AI Plan' : item}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'details' ? <DeveloperFormFields form={form} onChange={onFormChange} /> : null}
          {tab === 'comments' ? (
            <CommentsPanel
              ticket={ticket}
              body={commentBody}
              visibility={commentVisibility}
              saving={saving}
              onBodyChange={onCommentChange}
              onVisibilityChange={onCommentVisibilityChange}
              onAdd={onAddComment}
            />
          ) : null}
          {tab === 'ai' ? (
            <AIPlanPanel
              ticket={ticket}
              generating={generatingPlan}
              onGenerate={onGenerateAIPlan}
              onCopyPrompt={onCopyPrompt}
            />
          ) : null}
          {tab === 'activity' ? <ActivityPanel ticket={ticket} /> : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <MessageCircle className="h-4 w-4" />
            {ticket.commentCount} comments - Updated {formatDateTime(ticket.updatedAt)}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onArchive}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentsPanel({
  ticket,
  body,
  visibility,
  saving,
  onBodyChange,
  onVisibilityChange,
  onAdd,
}: {
  ticket: TicketDTO;
  body: string;
  visibility: TicketCommentVisibility;
  saving: boolean;
  onBodyChange: (body: string) => void;
  onVisibilityChange: (visibility: TicketCommentVisibility) => void;
  onAdd: () => void;
}) {
  const comments = ticket.comments ?? [];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-3">
        {comments.length === 0 ? (
          <EmptyState icon={<Inbox className="h-8 w-8 text-brand" />} title="No comments yet." />
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="rounded-lg border border-stone-200 bg-white px-3 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-stone-950">{comment.authorName}</p>
                  <p className="truncate text-[11px] text-stone-500">{comment.authorEmail}</p>
                </div>
                <Badge className={comment.visibility === 'internal' ? 'border-violet-100 bg-violet-50 text-violet-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}>
                  {comment.visibility === 'internal' ? 'Internal' : 'Public'}
                </Badge>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{comment.body}</p>
              <p className="mt-2 text-[11px] text-stone-400">{formatDateTime(comment.createdAt)}</p>
            </div>
          ))
        )}
      </div>
      <aside className="rounded-lg border border-stone-200 bg-stone-50 p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-stone-700">Visibility</span>
          <select value={visibility} onChange={(event) => onVisibilityChange(event.target.value as TicketCommentVisibility)} className={inputClass(false)}>
            <option value="public">Public update</option>
            <option value="internal">Internal note</option>
          </select>
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-semibold text-stone-700">Comment</span>
          <textarea
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            rows={8}
            placeholder={visibility === 'internal' ? 'Add an Ethan-only note...' : 'Add an update the requester can see...'}
            className={cn(inputClass(false), 'h-auto resize-none py-2 leading-6')}
          />
        </label>
        <button
          type="button"
          onClick={onAdd}
          disabled={saving || !body.trim()}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Add Comment
        </button>
      </aside>
    </div>
  );
}

function AIPlanPanel({
  ticket,
  generating,
  onGenerate,
  onCopyPrompt,
}: {
  ticket: TicketDTO;
  generating: boolean;
  onGenerate: () => void;
  onCopyPrompt: () => void;
}) {
  const plan = ticket.aiPlan;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">AI Plan</p>
          <h3 className="mt-1 text-lg font-semibold text-stone-950">
            {plan ? aiPlanLabel(plan.status) : 'No plan generated'}
          </h3>
          {plan?.generatedAt ? <p className="mt-1 text-xs text-stone-500">Generated {formatDateTime(plan.generatedAt)} {plan.generatedByModel ? `- ${plan.generatedByModel}` : ''}</p> : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {plan ? 'Regenerate Plan' : 'Generate AI Plan'}
          </button>
          <button
            type="button"
            onClick={onCopyPrompt}
            disabled={!plan?.suggestedPrompt}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Clipboard className="h-4 w-4" />
            Copy Prompt
          </button>
        </div>
      </div>

      {!plan ? <EmptyState icon={<Sparkles className="h-8 w-8 text-brand" />} title="Generate a real AI plan when you are ready." /> : null}
      {plan?.status === 'failed' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
          {plan.errorMessage || 'Provider/model/key failed. The failed state was saved.'}
        </div>
      ) : null}
      {plan?.status === 'ready' ? (
        <div className="grid gap-4">
          <PlanSection title="Summary" items={[plan.summary]} prose />
          <PlanSection title="Implementation Steps" items={plan.steps} />
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h4 className="text-sm font-semibold text-stone-950">Suggested Prompt</h4>
            <pre className="mt-3 whitespace-pre-wrap rounded-md border border-stone-200 bg-stone-50 p-3 text-xs leading-6 text-stone-700">{plan.suggestedPrompt || 'No prompt returned.'}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActivityPanel({ ticket }: { ticket: TicketDTO }) {
  const events = ticket.activity ?? [];
  return (
    <div className="space-y-3">
      {events.length === 0 ? (
        <EmptyState icon={<RefreshCw className="h-8 w-8 text-brand" />} title="No activity has been recorded yet." />
      ) : (
        events.map((event) => (
          <div key={event.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-950">{event.summary}</p>
                <p className="mt-1 text-xs text-stone-500">{event.actorName} - {event.actorEmail}</p>
              </div>
              <Badge className="border-stone-200 bg-stone-50 text-stone-700">{event.type}</Badge>
            </div>
            <p className="mt-2 text-[11px] text-stone-400">{formatDateTime(event.createdAt)}</p>
          </div>
        ))
      )}
    </div>
  );
}

function PlanSection({ title, items, prose }: { title: string; items: string[]; prose?: boolean }) {
  const filtered = items.filter(Boolean);
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-stone-950">{title}</h4>
      {filtered.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">No items returned.</p>
      ) : prose ? (
        <p className="mt-3 text-sm leading-6 text-stone-700">{filtered[0]}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
          {filtered.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeveloperCreateModal({
  form,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: DeveloperForm;
  saving: boolean;
  onChange: (form: DeveloperForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-stone-950">Create Developer Task</h2>
            <p className="mt-1 text-xs text-stone-500">Add a requester task or Ethan-only internal note.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Close modal">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-5">
          <DeveloperFormFields form={form} onChange={onChange} />
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            Cancel
          </button>
          <button type="button" onClick={onSubmit} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}

function DeveloperFormFields({ form, onChange }: { form: DeveloperForm; onChange: (form: DeveloperForm) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Title" required className="md:col-span-2">
        <input value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} className={inputClass(false)} placeholder="Lead scoring rules" />
      </Field>
      <Field label="Requester Name">
        <input value={form.createdByName} onChange={(event) => onChange({ ...form, createdByName: event.target.value })} className={inputClass(false)} />
      </Field>
      <Field label="Requester Email">
        <input value={form.createdByEmail} onChange={(event) => onChange({ ...form, createdByEmail: event.target.value })} className={inputClass(false)} />
      </Field>
      <Field label="Urgency" required>
        <select value={form.urgency} onChange={(event) => onChange({ ...form, urgency: event.target.value as TicketUrgency })} className={inputClass(false)}>
          {TICKET_URGENCIES.map((urgency) => <option key={urgency} value={urgency}>{URGENCY_LABELS[urgency]}</option>)}
        </select>
      </Field>
      <Field label="Status">
        <select value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value as TicketStatus })} className={inputClass(false)}>
          {TICKET_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
        </select>
      </Field>
      <Field label="Category">
        <select value={form.category} onChange={(event) => onChange({ ...form, category: event.target.value as TicketCategory })} className={inputClass(false)}>
          {TICKET_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
        </select>
      </Field>
      <Field label="Requested Date">
        <input type="date" value={form.requestedDate} onChange={(event) => onChange({ ...form, requestedDate: event.target.value })} className={inputClass(false)} />
      </Field>
      <Field label="Team / Department">
        <input value={form.team} onChange={(event) => onChange({ ...form, team: event.target.value })} className={inputClass(false)} />
      </Field>
      <Field label="Visibility">
        <select value={form.visibility} onChange={(event) => onChange({ ...form, visibility: event.target.value as TicketVisibility })} className={inputClass(false)}>
          {TICKET_VISIBILITIES.map((visibility) => <option key={visibility} value={visibility}>{VISIBILITY_LABELS[visibility]}</option>)}
        </select>
      </Field>
      <Field label="Next Step" className="md:col-span-2">
        <textarea value={form.nextStep} onChange={(event) => onChange({ ...form, nextStep: event.target.value })} rows={2} className={cn(inputClass(false), 'h-auto resize-none py-2 leading-6')} placeholder="What Ethan should do next..." />
      </Field>
      <Field label="Description" required className="md:col-span-2">
        <textarea value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} rows={5} className={cn(inputClass(false), 'h-auto resize-none py-2 leading-6')} />
      </Field>
      <Field label="Business Impact" className="md:col-span-2">
        <textarea value={form.businessImpact} onChange={(event) => onChange({ ...form, businessImpact: event.target.value })} rows={3} className={cn(inputClass(false), 'h-auto resize-none py-2 leading-6')} />
      </Field>
      <Field label="Attachments / Screenshot" className="md:col-span-2">
        <textarea value={form.attachmentNote} onChange={(event) => onChange({ ...form, attachmentNote: event.target.value })} rows={2} className={cn(inputClass(false), 'h-auto resize-none py-2 leading-6')} />
      </Field>
    </div>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-semibold text-stone-700">{label}{required ? <span className="text-brand"> *</span> : null}</span>
      {children}
    </label>
  );
}

function FilterSelect({ value, onChange, label, children }: { value: string; onChange: (value: string) => void; label: string; children: ReactNode }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10" aria-label={label}>
      {children}
    </select>
  );
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', className)}>{children}</span>;
}

function EmptyState({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-8 text-center">
      {icon}
      <p className="mt-3 text-sm font-semibold text-stone-700">{title}</p>
    </div>
  );
}

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const classes = notice.tone === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : notice.tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-stone-200 bg-white text-stone-700';
  return (
    <div className={cn('sticky top-3 z-20 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm', classes)}>
      <span>{notice.text}</span>
      <button type="button" onClick={onDismiss} className="rounded-md p-1 hover:bg-black/5" aria-label="Dismiss notice">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function inputClass(disabled: boolean): string {
  return cn(
    'h-10 w-full rounded-md border border-stone-200 px-3 text-sm text-stone-900 outline-none transition focus:border-brand/40 focus:ring-2 focus:ring-brand/10',
    disabled ? 'bg-stone-50 text-stone-500' : 'bg-white',
  );
}

function formFromTicket(ticket: TicketDTO): DeveloperForm {
  return {
    title: ticket.title,
    description: ticket.description,
    requestedDate: ticket.requestedDate ? ticket.requestedDate.slice(0, 10) : '',
    nextStep: ticket.nextStep,
    urgency: ticket.urgency,
    category: ticket.category,
    businessImpact: ticket.businessImpact,
    attachmentNote: ticket.attachmentNote,
    team: ticket.team,
    visibility: ticket.visibility,
    status: ticket.status,
    createdByName: ticket.createdByName,
    createdByEmail: ticket.createdByEmail,
  };
}

function formToPayload(form: DeveloperForm) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    requestedDate: form.requestedDate || null,
    nextStep: form.nextStep.trim(),
    urgency: form.urgency,
    category: form.category,
    businessImpact: form.businessImpact.trim(),
    attachmentNote: form.attachmentNote.trim(),
    team: form.team.trim(),
    visibility: form.visibility,
    status: form.status,
    createdByName: form.createdByName.trim(),
    createdByEmail: form.createdByEmail.trim(),
  };
}

function validateForm(form: DeveloperForm): string {
  if (!form.title.trim()) return 'Title is required.';
  if (!form.description.trim()) return 'Description is required.';
  if (!form.createdByEmail.trim()) return 'Requester email is required.';
  return '';
}

function upsertTicket(tickets: TicketDTO[], ticket: TicketDTO): TicketDTO[] {
  const found = tickets.some((item) => item.id === ticket.id);
  const next = found ? tickets.map((item) => (item.id === ticket.id ? ticket : item)) : [ticket, ...tickets];
  return next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function aiPlanLabel(status: string): string {
  if (status === 'ready') return 'Ready';
  if (status === 'failed') return 'Failed';
  if (status === 'generating') return 'Generating';
  return 'Needs Plan';
}

function aiPlanClass(ticket: TicketDTO): string {
  if (ticket.aiPlan?.status === 'ready') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (ticket.aiPlan?.status === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  if (ticket.aiPlan?.status === 'generating') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-stone-200 bg-stone-100 text-stone-700';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatTimeAgo(value: string): string {
  const date = new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return 'recently';
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatLastUpdated(value: string | null): string {
  if (!value) return 'Last updated after refresh';
  return `Last updated ${formatTimeAgo(value)}`;
}
