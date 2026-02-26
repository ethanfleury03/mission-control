'use client';

import { Agent, Session } from '../lib/types';
import { formatNumber, cn } from '../lib/utils';
import { useTimeAgo } from '../lib/useTimeAgo';
import { Terminal, Activity, Users, Coins } from 'lucide-react';

interface LeftSidebarProps {
  agents: Agent[];
  sessions: Session[];
}

export function LeftSidebar({ agents, sessions }: LeftSidebarProps) {
  const activeAgents = agents.filter((a) => a.status === 'active');
  const idleAgents = agents.filter((a) => a.status === 'idle');
  const totalTokens = agents.reduce((sum, a) => sum + a.tokensUsed, 0);

  return (
    <aside className="w-64 bg-bg-secondary border-r border-white/5 flex flex-col shrink-0">
      {/* Agents Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agents</span>
          <span className="text-xs text-text-muted">{agents.filter(a => a.status === 'active').length}/{agents.length}</span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="ACTIVE" value={activeAgents.length.toString()} color="green" />
          <StatCard label="IDLE" value={idleAgents.length.toString()} color="default" />
          <StatCard label="SESSIONS" value={sessions.length.toString()} color="cyan" />
          <StatCard label="TOKENS" value={formatNumber(totalTokens)} color="cyan" />
        </div>
      </div>

      {/* Filter */}
      <div className="p-3 border-b border-white/5">
        <input
          type="text"
          placeholder="Filter agents..."
          className="w-full h-8 px-3 bg-bg-tertiary border border-white/5 rounded text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/30"
        />
      </div>

      {/* Status Pills */}
      <div className="px-3 py-2 flex gap-2 border-b border-white/5">
        <button className="px-2 py-1 bg-accent-cyan/10 text-accent-cyan text-2xs rounded border border-accent-cyan/20">
          All
        </button>
        <button className="px-2 py-1 text-2xs text-text-secondary hover:bg-white/5 rounded">
          Active
        </button>
        <button className="px-2 py-1 text-2xs text-text-secondary hover:bg-white/5 rounded">
          Idle
        </button>
      </div>

      {/* Active Agents Section */}
      <div className="flex-1 overflow-auto">
        <div className="px-3 py-2 text-2xs font-medium text-accent-green uppercase tracking-wider">
          Active
        </div>
        <div className="px-2">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>

        {/* Sessions Section */}
        <div className="px-3 py-2 mt-2 text-2xs font-medium text-text-secondary uppercase tracking-wider flex items-center justify-between">
          Sessions
          <span className="text-text-muted">{sessions.length}</span>
        </div>
        <div className="px-2">
          {sessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: 'green' | 'cyan' | 'default' }) {
  const colorClasses = {
    green: 'text-accent-green',
    cyan: 'text-accent-cyan',
    default: 'text-text-primary',
  };

  return (
    <div className="bg-bg-tertiary rounded-md p-2 border border-white/5">
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
      <div className="text-2xs text-accent-cyan">{session.model} · {formatNumber(session.tokens)} tokens</div>
    </div>
  );
}
