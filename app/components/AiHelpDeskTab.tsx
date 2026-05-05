'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  CalendarDays,
  Check,
  CircleDot,
  Clock3,
  HelpCircle,
  Inbox,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';

import { DeveloperOperationsListTab } from '@/app/components/DeveloperOperationsListTab';
import { cn } from '@/app/lib/utils';
import { ADMIN_EMAIL } from '@/lib/auth/constants';
import {
  HELP_DESK_DEVELOPER_EMAIL,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  TICKET_URGENCIES,
  TICKET_VISIBILITIES,
  type TicketCategory,
  type TicketDTO,
  type TicketStatus,
  type TicketUrgency,
  type TicketVisibility,
  type TicketsResponse,
} from '@/lib/help-desk/types';

type TicketForm = {
  title: string;
  description: string;
  requestedDate: string;
  urgency: TicketUrgency;
  category: TicketCategory;
  businessImpact: string;
  attachmentNote: string;
  team: string;
  visibility: TicketVisibility;
  status: TicketStatus;
};

type Notice = {
  tone: 'success' | 'error' | 'info';
  text: string;
};

const EMPTY_FORM: TicketForm = {
  title: '',
  description: '',
  requestedDate: '',
  urgency: 'normal',
  category: 'other',
  businessImpact: '',
  attachmentNote: '',
  team: '',
  visibility: 'team',
  status: 'open',
};

const STATUS_CONFIG: Record<
  TicketStatus,
  {
    label: string;
    metricLabel: string;
    description: string;
    icon: typeof CircleDot;
    accentClass: string;
    badgeClass: string;
  }
> = {
  open: {
    label: 'Open Tickets',
    metricLabel: 'Open Tickets',
    description: 'New requests waiting to be picked up.',
    icon: CircleDot,
    accentClass: 'border-blue-200 bg-blue-50 text-blue-700',
    badgeClass: 'border-blue-100 bg-blue-50 text-blue-700',
  },
  in_progress: {
    label: 'In Progress',
    metricLabel: 'In Progress',
    description: 'Work Ethan is actively handling.',
    icon: RefreshCw,
    accentClass: 'border-rose-200 bg-rose-50 text-brand',
    badgeClass: 'border-rose-100 bg-rose-50 text-brand',
  },
  needs_input: {
    label: 'Needs Your Input',
    metricLabel: 'Needs My Input',
    description: 'Reply here so work can keep moving.',
    icon: HelpCircle,
    accentClass: 'border-amber-200 bg-amber-50 text-amber-700',
    badgeClass: 'border-amber-100 bg-amber-50 text-amber-700',
  },
  finished: {
    label: 'Finished',
    metricLabel: 'Finished',
    description: 'Completed requests and past answers.',
    icon: Check,
    accentClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    badgeClass: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  },
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
  private: 'My tickets only',
  team: 'Team-visible',
  company: 'Company-visible',
};

const URGENCY_CLASSES: Record<TicketUrgency, string> = {
  low: 'border-sky-100 bg-sky-50 text-sky-700',
  normal: 'border-stone-200 bg-stone-100 text-stone-700',
  high: 'border-amber-200 bg-amber-50 text-amber-800',
  urgent: 'border-brand/20 bg-brand/10 text-brand',
};

export function AiHelpDeskTab() {
  const { data: session, status: sessionStatus } = useSession();
  const currentEmail = (session?.user?.email ?? '').trim().toLowerCase();
  const currentName = session?.user?.name || currentEmail || 'Arrow User';
  const isDeveloper = currentEmail === ADMIN_EMAIL || currentEmail === HELP_DESK_DEVELOPER_EMAIL;
  const [tickets, setTickets] = useState<TicketDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [query, setQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<'all' | 'mine'>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | TicketUrgency>('all');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TicketForm>(EMPTY_FORM);
  const [selectedTicket, setSelectedTicket] = useState<TicketDTO | null>(null);
  const [detailForm, setDetailForm] = useState<TicketForm>(EMPTY_FORM);
  const [commentBody, setCommentBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TicketStatus | null>(null);

  const showNotice = useCallback((next: Notice) => {
    setNotice(next);
    window.setTimeout(() => {
      setNotice((current) => (current?.text === next.text ? null : current));
    }, 3200);
  }, []);

  const loadTickets = useCallback(async () => {
    if (sessionStatus !== 'authenticated' || isDeveloper) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/tickets', { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as Partial<TicketsResponse> & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'Could not load tickets.');
      setTickets(data.tickets ?? []);
      setLastUpdatedAt(data.lastUpdatedAt ?? new Date().toISOString());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Could not load tickets.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isDeveloper, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (sessionStatus !== 'authenticated' || isDeveloper) {
      setLoading(false);
      return;
    }
    void loadTickets();
  }, [isDeveloper, loadTickets, sessionStatus]);

  const filteredTickets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (teamFilter === 'mine' && ticket.createdByEmail.trim().toLowerCase() !== currentEmail) {
        return false;
      }
      if (urgencyFilter !== 'all' && ticket.urgency !== urgencyFilter) return false;
      if (!normalizedQuery) return true;
      return [
        ticket.title,
        ticket.description,
        ticket.createdByName,
        ticket.createdByEmail,
        ticket.team,
        CATEGORY_LABELS[ticket.category],
        ticket.latestComment?.body ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [currentEmail, query, teamFilter, tickets, urgencyFilter]);

  const ticketsByStatus = useMemo(() => {
    const grouped: Record<TicketStatus, TicketDTO[]> = {
      open: [],
      in_progress: [],
      needs_input: [],
      finished: [],
    };
    for (const ticket of filteredTickets) {
      grouped[ticket.status].push(ticket);
    }
    for (const status of TICKET_STATUSES) {
      grouped[status].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    return grouped;
  }, [filteredTickets]);

  const metrics = useMemo(
    () =>
      TICKET_STATUSES.map((status) => ({
        status,
        value: tickets.filter((ticket) => ticket.status === status).length,
      })),
    [tickets],
  );

  const openTicket = useCallback(async (ticket: TicketDTO) => {
    setSelectedTicket(ticket);
    setDetailForm(formFromTicket(ticket));
    setCommentBody('');
    try {
      const response = await fetch(`/api/tickets/${ticket.id}`, { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as { ticket?: TicketDTO; error?: string };
      const nextTicket = data.ticket;
      if (!response.ok || !nextTicket) throw new Error(data.error || 'Could not load ticket details.');
      setSelectedTicket(nextTicket);
      setDetailForm(formFromTicket(nextTicket));
      setTickets((current) => upsertTicket(current, nextTicket));
    } catch (detailError) {
      showNotice({
        tone: 'error',
        text: detailError instanceof Error ? detailError.message : 'Could not load ticket details.',
      });
    }
  }, [showNotice]);

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
      const nextTicket = data.ticket;
      if (!response.ok || !nextTicket) throw new Error(data.error || 'Could not create ticket.');
      setTickets((current) => upsertTicket(current, nextTicket));
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      setLastUpdatedAt(new Date().toISOString());
      showNotice({ tone: 'success', text: 'Ticket created.' });
    } catch (createError) {
      showNotice({
        tone: 'error',
        text: createError instanceof Error ? createError.message : 'Could not create ticket.',
      });
    } finally {
      setSaving(false);
    }
  }, [createForm, showNotice]);

  const saveSelectedTicket = useCallback(async () => {
    if (!selectedTicket) return;
    const canEditDetails = isOwnedByCurrentUser(selectedTicket, currentEmail);
    const validation = canEditDetails ? validateForm(detailForm) : '';
    if (validation) {
      showNotice({ tone: 'error', text: validation });
      return;
    }
    setSaving(true);
    try {
      const payload = canEditDetails ? formToPayload(detailForm) : { status: detailForm.status };
      const response = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { ticket?: TicketDTO; error?: string };
      const nextTicket = data.ticket;
      if (!response.ok || !nextTicket) throw new Error(data.error || 'Could not save ticket.');
      setSelectedTicket(nextTicket);
      setDetailForm(formFromTicket(nextTicket));
      setTickets((current) => upsertTicket(current, nextTicket));
      setLastUpdatedAt(new Date().toISOString());
      showNotice({ tone: 'success', text: 'Ticket saved.' });
    } catch (saveError) {
      showNotice({
        tone: 'error',
        text: saveError instanceof Error ? saveError.message : 'Could not save ticket.',
      });
    } finally {
      setSaving(false);
    }
  }, [currentEmail, detailForm, selectedTicket, showNotice]);

  const deleteSelectedTicket = useCallback(async () => {
    if (!selectedTicket) return;
    const confirmed = window.confirm(`Delete "${selectedTicket.title}"? This removes it from the board.`);
    if (!confirmed) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/tickets/${selectedTicket.id}`, { method: 'DELETE' });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not delete ticket.');
      setTickets((current) => current.filter((ticket) => ticket.id !== selectedTicket.id));
      setSelectedTicket(null);
      setLastUpdatedAt(new Date().toISOString());
      showNotice({ tone: 'success', text: 'Ticket deleted.' });
    } catch (deleteError) {
      showNotice({
        tone: 'error',
        text: deleteError instanceof Error ? deleteError.message : 'Could not delete ticket.',
      });
    } finally {
      setSaving(false);
    }
  }, [selectedTicket, showNotice]);

  const addComment = useCallback(async () => {
    if (!selectedTicket) return;
    if (!commentBody.trim()) {
      showNotice({ tone: 'error', text: 'Comment is required.' });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/tickets/${selectedTicket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody }),
      });
      const data = (await response.json().catch(() => ({}))) as { ticket?: TicketDTO; error?: string };
      const nextTicket = data.ticket;
      if (!response.ok || !nextTicket) throw new Error(data.error || 'Could not add comment.');
      setSelectedTicket(nextTicket);
      setTickets((current) => upsertTicket(current, nextTicket));
      setCommentBody('');
      setLastUpdatedAt(new Date().toISOString());
      showNotice({ tone: 'success', text: 'Comment added.' });
    } catch (commentError) {
      showNotice({
        tone: 'error',
        text: commentError instanceof Error ? commentError.message : 'Could not add comment.',
      });
    } finally {
      setSaving(false);
    }
  }, [commentBody, selectedTicket, showNotice]);

  const moveTicket = useCallback(
    async (ticketId: string, nextStatus: TicketStatus) => {
      const ticket = tickets.find((item) => item.id === ticketId);
      if (!ticket || ticket.status === nextStatus) return;
      const previousTickets = tickets;
      const optimisticTicket: TicketDTO = {
        ...ticket,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };
      setTickets((current) => upsertTicket(current, optimisticTicket));
      try {
        const response = await fetch(`/api/tickets/${ticketId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });
        const data = (await response.json().catch(() => ({}))) as { ticket?: TicketDTO; error?: string };
        const nextTicket = data.ticket;
        if (!response.ok || !nextTicket) throw new Error(data.error || 'Could not move ticket.');
        setTickets((current) => upsertTicket(current, nextTicket));
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket(nextTicket);
          setDetailForm(formFromTicket(nextTicket));
        }
        setLastUpdatedAt(new Date().toISOString());
        showNotice({ tone: 'success', text: `Moved to ${STATUS_CONFIG[nextStatus].label}.` });
      } catch (moveError) {
        setTickets(previousTickets);
        showNotice({
          tone: 'error',
          text: moveError instanceof Error ? moveError.message : 'Could not move ticket.',
        });
      }
    },
    [selectedTicket?.id, showNotice, tickets],
  );

  if (sessionStatus === 'loading' || loading) {
    return <HelpDeskLoading />;
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <main className="flex flex-1 items-center justify-center bg-[#f6f0ea] p-6">
        <div className="max-w-md rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <Inbox className="mx-auto h-8 w-8 text-brand" />
          <h1 className="mt-3 text-lg font-semibold text-stone-950">Sign in required</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">Please sign in to view the AI Help Desk.</p>
        </div>
      </main>
    );
  }

  if (isDeveloper) {
    return <DeveloperOperationsListTab currentEmail={currentEmail} currentName={currentName} />;
  }

  return (
    <main className="relative flex-1 min-w-0 overflow-y-auto bg-[linear-gradient(180deg,#fffaf6_0%,#f5eee8_100%)]">
      <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-4 px-4 py-5 lg:px-6">
        {notice ? <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}

        <section className="rounded-lg border border-stone-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand">
                Client Ticket Portal
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">AI Help Desk</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                Submit requests, answer questions, and track ticket progress.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Create Ticket
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ status, value }) => (
            <MetricCard key={status} status={status} value={value} />
          ))}
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <span className="sr-only">Search tickets</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tickets..."
              className="h-11 w-full rounded-md border border-stone-200 bg-stone-50 pl-9 pr-3 text-sm text-stone-900 outline-none transition focus:border-brand/40 focus:bg-white focus:ring-2 focus:ring-brand/10"
            />
          </label>
          <select
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value as 'all' | 'mine')}
            className="h-11 rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
            aria-label="Ticket ownership filter"
          >
            <option value="all">All teams</option>
            <option value="mine">My tickets</option>
          </select>
          <select
            value={urgencyFilter}
            onChange={(event) => setUrgencyFilter(event.target.value as 'all' | TicketUrgency)}
            className="h-11 rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
            aria-label="Urgency filter"
          >
            <option value="all">All priorities</option>
            {TICKET_URGENCIES.map((urgency) => (
              <option key={urgency} value={urgency}>
                {URGENCY_LABELS[urgency]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadTickets()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:border-brand/30 hover:text-brand"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <p className="text-xs text-stone-500 lg:ml-auto">{formatLastUpdated(lastUpdatedAt)}</p>
        </section>

        {error ? (
          <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </section>
        ) : null}

        {!error && tickets.length === 0 ? (
          <section className="flex min-h-[24rem] flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white/70 px-6 text-center">
            <Inbox className="h-10 w-10 text-brand" />
            <h2 className="mt-3 text-lg font-semibold text-stone-950">No tickets yet.</h2>
            <p className="mt-2 text-sm text-stone-600">Create your first ticket and it will appear in Open Tickets.</p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Create Ticket
            </button>
          </section>
        ) : (
          <section className="overflow-x-auto pb-2">
            <div className="grid min-w-[76rem] grid-cols-4 gap-4">
              {TICKET_STATUSES.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  tickets={ticketsByStatus[status]}
                  currentEmail={currentEmail}
                  dragOver={dragOverStatus === status}
                  onOpenTicket={openTicket}
                  onDragStart={(ticketId) => setDraggedTicketId(ticketId)}
                  onDragEnd={() => {
                    setDraggedTicketId(null);
                    setDragOverStatus(null);
                  }}
                  onDragOver={() => setDragOverStatus(status)}
                  onDrop={() => {
                    if (draggedTicketId) void moveTicket(draggedTicketId, status);
                    setDraggedTicketId(null);
                    setDragOverStatus(null);
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {createOpen ? (
        <TicketCreateModal
          form={createForm}
          currentName={currentName}
          currentEmail={currentEmail}
          saving={saving}
          onChange={setCreateForm}
          onClose={() => {
            setCreateOpen(false);
            setCreateForm(EMPTY_FORM);
          }}
          onSubmit={() => void createTicket()}
        />
      ) : null}

      {selectedTicket ? (
        <TicketDetailModal
          ticket={selectedTicket}
          form={detailForm}
          currentEmail={currentEmail}
          commentBody={commentBody}
          saving={saving}
          onFormChange={setDetailForm}
          onCommentChange={setCommentBody}
          onClose={() => setSelectedTicket(null)}
          onSave={() => void saveSelectedTicket()}
          onDelete={() => void deleteSelectedTicket()}
          onAddComment={() => void addComment()}
        />
      ) : null}
    </main>
  );
}

function MetricCard({ status, value }: { status: TicketStatus; value: number }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
            {config.metricLabel}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">{value}</p>
        </div>
        <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full border', config.accentClass)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  tickets,
  currentEmail,
  dragOver,
  onOpenTicket,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  status: TicketStatus;
  tickets: TicketDTO[];
  currentEmail: string;
  dragOver: boolean;
  onOpenTicket: (ticket: TicketDTO) => void;
  onDragStart: (ticketId: string) => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const config = STATUS_CONFIG[status];
  return (
    <section
      className={cn(
        'flex min-h-[34rem] flex-col rounded-lg border bg-white/70 p-3 shadow-sm transition-colors',
        dragOver ? 'border-brand/40 bg-brand/5' : 'border-stone-200',
      )}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDragLeave={() => undefined}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-stone-950">{config.label}</h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">{config.description}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-brand shadow-sm">
          {tickets.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3">
        {tickets.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-stone-200 bg-white/60 px-4 text-center text-sm text-stone-500">
            No tickets here.
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              currentEmail={currentEmail}
              onOpen={() => onOpenTicket(ticket)}
              onDragStart={() => onDragStart(ticket.id)}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
    </section>
  );
}

function TicketCard({
  ticket,
  currentEmail,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  ticket: TicketDTO;
  currentEmail: string;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const needsInput = ticket.status === 'needs_input';
  const answered =
    needsInput && ticket.latestComment?.authorEmail.trim().toLowerCase() === currentEmail.trim().toLowerCase();
  return (
    <article
      role="button"
      tabIndex={0}
      draggable
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', ticket.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'cursor-grab rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md active:cursor-grabbing',
        needsInput ? 'border-amber-200 ring-1 ring-amber-100' : 'border-stone-200',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-stone-950">{ticket.title}</h3>
          <p className="mt-2 truncate text-xs font-medium text-stone-500">
            {ticket.createdByName} {ticket.team ? `· ${ticket.team}` : ''}
          </p>
        </div>
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge className={STATUS_CONFIG[ticket.status].badgeClass}>
          {needsInput ? (answered ? 'Answered' : 'Needs Reply') : STATUS_CONFIG[ticket.status].label.replace(' Tickets', '')}
        </Badge>
        <Badge className={URGENCY_CLASSES[ticket.urgency]}>{URGENCY_LABELS[ticket.urgency]}</Badge>
      </div>

      <p className="mt-3 text-xs font-medium text-stone-500">
        {formatRelativeCreated(ticket.createdAt)} · {CATEGORY_LABELS[ticket.category]}
      </p>

      {ticket.requestedDate ? (
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-stone-500">
          <CalendarDays className="h-3.5 w-3.5" />
          Requested {formatDate(ticket.requestedDate)}
        </p>
      ) : null}

      {needsInput && ticket.latestComment ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-amber-800">
            {ticket.latestComment.authorEmail === HELP_DESK_DEVELOPER_EMAIL ? 'Ethan asks' : 'Latest update'}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-amber-900">{ticket.latestComment.body}</p>
        </div>
      ) : ticket.latestComment ? (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-stone-500">{ticket.latestComment.body}</p>
      ) : null}

      <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-[11px] text-stone-500">
        <span>{ticket.commentCount} comments</span>
        <span>Updated {formatTimeAgo(ticket.updatedAt)}</span>
      </div>
    </article>
  );
}

function TicketCreateModal({
  form,
  currentName,
  currentEmail,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: TicketForm;
  currentName: string;
  currentEmail: string;
  saving: boolean;
  onChange: (form: TicketForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl">
        <ModalHeader title="Create Ticket" subtitle="Send Ethan a clear request with enough context to start." onClose={onClose} />
        <div className="min-h-0 overflow-y-auto px-5 py-5">
          <TicketFormFields
            form={form}
            onChange={onChange}
            requestedBy={`${currentName} · ${currentEmail}`}
            includeStatus={false}
            disabled={false}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Ticket
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketDetailModal({
  ticket,
  form,
  currentEmail,
  commentBody,
  saving,
  onFormChange,
  onCommentChange,
  onClose,
  onSave,
  onDelete,
  onAddComment,
}: {
  ticket: TicketDTO;
  form: TicketForm;
  currentEmail: string;
  commentBody: string;
  saving: boolean;
  onFormChange: (form: TicketForm) => void;
  onCommentChange: (body: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onAddComment: () => void;
}) {
  const canEditDetails = isOwnedByCurrentUser(ticket, currentEmail);
  const comments = ticket.comments ?? [];
  const commentButtonLabel = ticket.status === 'needs_input' ? 'Add Answer' : 'Add Comment';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl">
        <ModalHeader
          title={ticket.title}
          subtitle={`${ticket.createdByName} · ${CATEGORY_LABELS[ticket.category]} · opened ${formatDate(ticket.createdAt)}`}
          onClose={onClose}
        />
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="border-b border-stone-200 p-5 lg:border-b-0 lg:border-r">
            {!canEditDetails ? (
              <div className="mb-4 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">
                You can move this ticket and add comments. Only the requester can edit request details.
              </div>
            ) : null}
            <TicketFormFields
              form={form}
              onChange={onFormChange}
              requestedBy={`${ticket.createdByName} · ${ticket.createdByEmail}`}
              includeStatus
              disabled={!canEditDetails}
            />
          </div>
          <aside className="flex min-h-[28rem] flex-col p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Updates</p>
                <h3 className="mt-1 text-base font-semibold text-stone-950">Comments</h3>
              </div>
              <Badge className={STATUS_CONFIG[ticket.status].badgeClass}>{STATUS_CONFIG[ticket.status].label}</Badge>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {comments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                  No comments yet.
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="rounded-lg border border-stone-200 bg-white px-3 py-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-stone-950">{comment.authorName}</p>
                        <p className="truncate text-[11px] text-stone-500">{comment.authorEmail}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-stone-400">{formatTimeAgo(comment.createdAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{comment.body}</p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 border-t border-stone-200 pt-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-stone-700">
                  {ticket.status === 'needs_input' ? 'Reply to Ethan' : 'Add an update'}
                </span>
                <textarea
                  value={commentBody}
                  onChange={(event) => onCommentChange(event.target.value)}
                  rows={4}
                  placeholder="Add a note, answer, or clarification..."
                  className="w-full resize-none rounded-md border border-stone-200 bg-white px-3 py-2 text-sm leading-6 text-stone-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                />
              </label>
              <button
                type="button"
                onClick={onAddComment}
                disabled={saving || !commentBody.trim()}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {commentButtonLabel}
              </button>
            </div>
          </aside>
        </div>
        <div className="flex flex-col gap-2 border-t border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Clock3 className="h-4 w-4" />
            Last updated {formatDateTime(ticket.updatedAt)}
          </div>
          <div className="flex justify-end gap-2">
            {canEditDetails ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            ) : null}
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

function TicketFormFields({
  form,
  onChange,
  requestedBy,
  includeStatus,
  disabled,
}: {
  form: TicketForm;
  onChange: (form: TicketForm) => void;
  requestedBy: string;
  includeStatus: boolean;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Title" required className="md:col-span-2">
        <input
          type="text"
          value={form.title}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
          placeholder="Example: Add weekly HubSpot report"
          disabled={disabled}
          className={inputClass(disabled)}
        />
      </Field>

      <Field label="Requested Date">
        <input
          type="date"
          value={form.requestedDate}
          onChange={(event) => onChange({ ...form, requestedDate: event.target.value })}
          disabled={disabled}
          className={inputClass(disabled)}
        />
      </Field>

      <Field label="Urgency" required>
        <select
          value={form.urgency}
          onChange={(event) => onChange({ ...form, urgency: event.target.value as TicketUrgency })}
          disabled={disabled}
          className={inputClass(disabled)}
        >
          {TICKET_URGENCIES.map((urgency) => (
            <option key={urgency} value={urgency}>
              {URGENCY_LABELS[urgency]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Category">
        <select
          value={form.category}
          onChange={(event) => onChange({ ...form, category: event.target.value as TicketCategory })}
          disabled={disabled}
          className={inputClass(disabled)}
        >
          {TICKET_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </Field>

      {includeStatus ? (
        <Field label="Status">
          <select
            value={form.status}
            onChange={(event) => onChange({ ...form, status: event.target.value as TicketStatus })}
            className={inputClass(false)}
          >
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_CONFIG[status].label}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Requested By">
          <input type="text" value={requestedBy} readOnly className={inputClass(true)} />
        </Field>
      )}

      {includeStatus ? (
        <Field label="Requested By">
          <input type="text" value={requestedBy} readOnly className={inputClass(true)} />
        </Field>
      ) : null}

      <Field label="Team / Department">
        <input
          type="text"
          value={form.team}
          onChange={(event) => onChange({ ...form, team: event.target.value })}
          placeholder="Sales, Admin, Marketing..."
          disabled={disabled}
          className={inputClass(disabled)}
        />
      </Field>

      <Field label="Visibility">
        <select
          value={form.visibility}
          onChange={(event) => onChange({ ...form, visibility: event.target.value as TicketVisibility })}
          disabled={disabled}
          className={inputClass(disabled)}
        >
          {TICKET_VISIBILITIES.map((visibility) => (
            <option key={visibility} value={visibility}>
              {VISIBILITY_LABELS[visibility]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Description" required className="md:col-span-2">
        <textarea
          value={form.description}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
          placeholder="Describe what you need, what is broken, or what outcome you want."
          rows={5}
          disabled={disabled}
          className={cn(inputClass(disabled), 'h-auto resize-none py-2 leading-6')}
        />
      </Field>

      <Field label="Business Impact" className="md:col-span-2">
        <textarea
          value={form.businessImpact}
          onChange={(event) => onChange({ ...form, businessImpact: event.target.value })}
          placeholder="What does this help with? What happens if it is not fixed?"
          rows={3}
          disabled={disabled}
          className={cn(inputClass(disabled), 'h-auto resize-none py-2 leading-6')}
        />
      </Field>

      <Field label="Attachments / Screenshot" className="md:col-span-2">
        <textarea
          value={form.attachmentNote}
          onChange={(event) => onChange({ ...form, attachmentNote: event.target.value })}
          placeholder="Paste links or describe any screenshot/files Ethan should look for."
          rows={2}
          disabled={disabled}
          className={cn(inputClass(disabled), 'h-auto resize-none py-2 leading-6')}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-semibold text-stone-700">
        {label}
        {required ? <span className="text-brand"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-stone-950">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-stone-500">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-950"
        aria-label="Close modal"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const classes =
    notice.tone === 'success'
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

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', className)}>
      {children}
    </span>
  );
}

function HelpDeskLoading() {
  return (
    <main className="flex-1 min-w-0 overflow-y-auto bg-[linear-gradient(180deg,#fffaf6_0%,#f5eee8_100%)]">
      <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-4 px-4 py-5 lg:px-6">
        <div className="h-32 animate-pulse rounded-lg border border-stone-200 bg-white/80" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg border border-stone-200 bg-white" />
          ))}
        </div>
        <div className="h-16 animate-pulse rounded-lg border border-stone-200 bg-white" />
        <div className="grid min-w-[76rem] grid-cols-4 gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[34rem] animate-pulse rounded-lg border border-stone-200 bg-white/70" />
          ))}
        </div>
      </div>
    </main>
  );
}

function inputClass(disabled: boolean): string {
  return cn(
    'h-10 w-full rounded-md border border-stone-200 px-3 text-sm text-stone-900 outline-none transition focus:border-brand/40 focus:ring-2 focus:ring-brand/10',
    disabled ? 'bg-stone-50 text-stone-500' : 'bg-white',
  );
}

function validateForm(form: TicketForm): string {
  if (!form.title.trim()) return 'Title is required.';
  if (!form.description.trim()) return 'Description is required.';
  if (!form.urgency) return 'Urgency is required.';
  return '';
}

function formToPayload(form: TicketForm) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    requestedDate: form.requestedDate || null,
    urgency: form.urgency,
    category: form.category,
    businessImpact: form.businessImpact.trim(),
    attachmentNote: form.attachmentNote.trim(),
    team: form.team.trim(),
    visibility: form.visibility,
    status: form.status,
  };
}

function formFromTicket(ticket: TicketDTO): TicketForm {
  return {
    title: ticket.title,
    description: ticket.description,
    requestedDate: ticket.requestedDate ? ticket.requestedDate.slice(0, 10) : '',
    urgency: ticket.urgency,
    category: ticket.category,
    businessImpact: ticket.businessImpact,
    attachmentNote: ticket.attachmentNote,
    team: ticket.team,
    visibility: ticket.visibility,
    status: ticket.status,
  };
}

function upsertTicket(tickets: TicketDTO[], ticket: TicketDTO): TicketDTO[] {
  const found = tickets.some((item) => item.id === ticket.id);
  const next = found ? tickets.map((item) => (item.id === ticket.id ? ticket : item)) : [ticket, ...tickets];
  return next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function isOwnedByCurrentUser(ticket: TicketDTO, currentEmail: string): boolean {
  return ticket.createdByEmail.trim().toLowerCase() === currentEmail.trim().toLowerCase();
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

function formatRelativeCreated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Created recently';
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Created today';
  if (date.toDateString() === yesterday.toDateString()) return 'Created yesterday';
  return `Created ${formatDate(value)}`;
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
