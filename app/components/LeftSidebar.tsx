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
  const showOpsPanel = activeApp === 'OPENCLAW';

  return (
    <aside className="w-64 border-r border-white/10 flex flex-col shrink-0 hub-sidebar-accent text-zinc-100">
      <div className="p-4 border-b border-white/10">
        <p className="text-2xs font-medium text-zinc-500 uppercase tracking-[0.2em] mb-3">Internal apps</p>
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
                  'w-full text-left rounded-md px-3 py-2.5 transition-colors border',
                  isActive
                    ? 'bg-brand border-brand text-white shadow-sm'
                    : 'border-transparent text-zinc-300 hover:bg-white/10 hover:text-white'
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                      isActive
                        ? 'border-white/25 bg-white/15 text-white'
                        : 'border-white/10 bg-zinc-900 text-zinc-400'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-tight">{app.label}</span>
                    <span
                      className={cn(
                        'block text-2xs mt-0.5 leading-snug',
                        isActive ? 'text-white/80' : 'text-zinc-500'
                      )}
                    >
                      {app.description}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {showOpsPanel && <OpenClawOpsPanel agents={agents} sessions={sessions} />}

      {!showOpsPanel && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
          <p className="text-xs text-zinc-500 leading-relaxed">
            Select <span className="text-zinc-300">OpenClaw</span> for live agent and session stats
            alongside the main dashboard.
          </p>
        </div>
      )}
    </aside>
  );
}

function OpenClawOpsPanel({ agents, sessions }: { agents: Agent[]; sessions: Session[] }) {
  const activeAgents = agents.filter((a) => a.status === 'active');
  const idleAgents = agents.filter((a) => a.status === 'idle');
  const totalTokens = agents.reduce((sum, a) => sum + a.tokensUsed, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="p-4 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">OpenClaw live</span>
          <span className="text-xs text-zinc-500">
            {agents.filter((a) => a.status === 'active').length}/{agents.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="ACTIVE" value={activeAgents.length.toString()} color="green" />
          <StatCard label="IDLE" value={idleAgents.length.toString()} color="default" />
          <StatCard label="SESSIONS" value={sessions.length.toString()} color="brand" />
          <StatCard label="TOKENS" value={formatNumber(totalTokens)} color="brand" />
        </div>
      </div>

      <div className="p-3 border-b border-white/10 shrink-0">
        <input
          type="text"
          placeholder="Filter agents..."
          className="w-full h-8 px-3 bg-zinc-900 border border-white/10 rounded text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/30"
        />
      </div>

      <div className="px-3 py-2 flex gap-2 border-b border-white/10 shrink-0">
        <button
          type="button"
          className="px-2 py-1 bg-brand text-white text-2xs rounded border border-brand-hover"
        >
          All
        </button>
        <button
          type="button"
          className="px-2 py-1 text-2xs text-zinc-400 hover:bg-white/10 rounded"
        >
          Active
        </button>
        <button
          type="button"
          className="px-2 py-1 text-2xs text-zinc-400 hover:bg-white/10 rounded"
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
            <AgentRow key={agent.id} agent={agent} />
          ))}
        </div>
        <div className="px-3 py-2 mt-2 text-2xs font-medium text-zinc-400 uppercase tracking-wider flex items-center justify-between">
          Sessions
          <span className="text-zinc-500">{sessions.length}</span>
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

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'green' | 'brand' | 'default';
}) {
  const colorClasses = {
    green: 'text-accent-green',
    brand: 'text-brand',
    default: 'text-zinc-100',
  };

  return (
    <div className="bg-zinc-900/80 rounded-md p-2 border border-white/10">
      <div className="text-2xs text-zinc-500 uppercase">{label}</div>
      <div className={cn('text-lg font-semibold', colorClasses[color])}>{value}</div>
    </div>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  return (
    <div className="p-2 rounded-md hover:bg-white/5 cursor-pointer group transition-colors">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center text-xs font-bold text-brand border border-brand/30">
          {agent.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-100">{agent.name}</span>
            <span className="text-2xs px-1.5 py-0.5 bg-brand-muted text-brand rounded border border-brand/25">
              {agent.model}
            </span>
          </div>
          {agent.description && (
            <p className="text-2xs text-zinc-500 truncate">{agent.description}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-2xs text-accent-green border border-accent-green/25 bg-accent-green/10 px-1.5 py-0.5 rounded">
          {agent.model}
        </span>
        <span className="text-2xs text-zinc-500 border border-white/10 px-1.5 py-0.5 rounded">
          {agent.runtime}
        </span>
        <span className="text-2xs text-brand flex items-center gap-1">
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
    <div className="p-2 rounded-md hover:bg-white/5 cursor-pointer transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-100">{session.agentName}</span>
        <span className="text-2xs text-zinc-500">{timeAgo}</span>
      </div>
      <div className="text-2xs text-brand">
        {session.model} · {formatNumber(session.tokens)} tokens
      </div>
    </div>
  );
}
