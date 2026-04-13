'use client';

import { Agent, Session } from '../lib/types';
import { formatNumber, cn } from '../lib/utils';
import { useTimeAgo } from '../lib/useTimeAgo';
import { Coins } from 'lucide-react';
import { HUB_APPS, type HubAppId } from '../lib/hubApps';

interface LeftSidebarProps {
  activeApp: HubAppId;
  onAppChange: (id: HubAppId) => void;
  agents: Agent[];
  sessions: Session[];
}

export function LeftSidebar({ activeApp, onAppChange, agents, sessions }: LeftSidebarProps) {
  const showOpsPanel = activeApp === 'OVERVIEW';

  return (
    <aside className="w-64 bg-bg-secondary border-r border-hub-border flex flex-col shrink-0 hub-sidebar-accent">
      <div className="p-4 border-b border-hub-border">
        <p className="text-2xs font-medium text-text-muted uppercase tracking-[0.2em] mb-3">
          Internal apps
        </p>
        <nav className="flex flex-col gap-1">
          {HUB_APPS.map((app) => {
            const Icon = app.icon;
            const isActive = activeApp === app.id;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => onAppChange(app.id)}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2.5 transition-colors border',
                  isActive
                    ? 'bg-accent-cyan/10 border-accent-cyan/25 text-text-primary shadow-[inset_3px_0_0_0_var(--accent-cyan)]'
                    : 'border-transparent text-text-secondary hover:bg-white/[0.04] hover:text-text-primary'
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                      isActive
                        ? 'border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan'
                        : 'border-white/10 bg-bg-tertiary text-text-muted'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-tight">{app.label}</span>
                    <span className="block text-2xs text-text-muted mt-0.5 leading-snug">
                      {app.description}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {showOpsPanel && (
        <OpsOverviewPanel agents={agents} sessions={sessions} />
      )}

      {!showOpsPanel && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
          <p className="text-xs text-text-muted leading-relaxed">
            Select <span className="text-text-secondary">Overview</span> for live agent and session
            snapshots alongside the main dashboard.
          </p>
        </div>
      )}
    </aside>
  );
}

function OpsOverviewPanel({ agents, sessions }: { agents: Agent[]; sessions: Session[] }) {
  const activeAgents = agents.filter((a) => a.status === 'active');
  const idleAgents = agents.filter((a) => a.status === 'idle');
  const totalTokens = agents.reduce((sum, a) => sum + a.tokensUsed, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="p-4 border-b border-hub-border shrink-0">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Live ops
          </span>
          <span className="text-xs text-text-muted">
            {agents.filter((a) => a.status === 'active').length}/{agents.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="ACTIVE" value={activeAgents.length.toString()} color="green" />
          <StatCard label="IDLE" value={idleAgents.length.toString()} color="default" />
          <StatCard label="SESSIONS" value={sessions.length.toString()} color="cyan" />
          <StatCard label="TOKENS" value={formatNumber(totalTokens)} color="cyan" />
        </div>
      </div>

      <div className="p-3 border-b border-hub-border shrink-0">
        <input
          type="text"
          placeholder="Filter agents..."
          className="w-full h-8 px-3 bg-bg-tertiary border border-hub-border rounded text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/30"
        />
      </div>

      <div className="px-3 py-2 flex gap-2 border-b border-hub-border shrink-0">
        <button
          type="button"
          className="px-2 py-1 bg-accent-cyan/10 text-accent-cyan text-2xs rounded border border-accent-cyan/20"
        >
          All
        </button>
        <button
          type="button"
          className="px-2 py-1 text-2xs text-text-secondary hover:bg-white/5 rounded"
        >
          Active
        </button>
        <button
          type="button"
          className="px-2 py-1 text-2xs text-text-secondary hover:bg-white/5 rounded"
        >
          Idle
        </button>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <div className="px-3 py-2 text-2xs font-medium text-accent-green uppercase tracking-wider">
          Active
        </div>
        <div className="px-2">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
        <div className="px-3 py-2 mt-2 text-2xs font-medium text-text-secondary uppercase tracking-wider flex items-center justify-between">
          Sessions
          <span className="text-text-muted">{sessions.length}</span>
        </div>
        <div className="px-2 pb-4">
          {sessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: 'green' | 'cyan' | 'default' }) {
  const colorClasses = {
    green: 'text-accent-green',
    cyan: 'text-accent-cyan',
    default: 'text-text-primary',
  };

  return (
    <div className="bg-bg-tertiary rounded-md p-2 border border-hub-border">
      <div className="text-2xs text-text-muted uppercase">{label}</div>
      <div className={cn('text-lg font-semibold', colorClasses[color])}>{value}</div>
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="p-2 rounded-md hover:bg-bg-tertiary cursor-pointer group transition-colors">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 flex items-center justify-center text-xs font-bold text-accent-cyan border border-accent-cyan/20">
          {agent.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">{agent.name}</span>
            <span className="text-2xs px-1.5 py-0.5 bg-accent-cyan/10 text-accent-cyan rounded border border-accent-cyan/20">
              {agent.model}
            </span>
          </div>
          {agent.description && (
            <p className="text-2xs text-text-muted truncate">{agent.description}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-2xs text-accent-green border border-accent-green/20 bg-accent-green/5 px-1.5 py-0.5 rounded">
          {agent.model}
        </span>
        <span className="text-2xs text-text-muted border border-white/10 px-1.5 py-0.5 rounded">
          {agent.runtime}
        </span>
        <span className="text-2xs text-accent-cyan flex items-center gap-1">
          <Coins className="w-3 h-3" />
          {formatNumber(agent.tokensUsed)}
        </span>
      </div>
    </div>
  );
}

function SessionItem({ session }: { session: Session }) {
  const timeAgo = useTimeAgo(session.startTime);

  return (
    <div className="p-2 rounded-md hover:bg-bg-tertiary cursor-pointer transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">{session.agentName}</span>
        <span className="text-2xs text-text-muted">{timeAgo}</span>
      </div>
      <div className="text-2xs text-accent-cyan">
        {session.model} · {formatNumber(session.tokens)} tokens
      </div>
    </div>
  );
}
