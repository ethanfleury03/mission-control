'use client';

import { SystemMetrics, Task, ActivityDataPoint, Session } from '../lib/types';
import { formatNumber, cn } from '../lib/utils';
import { useTimeAgo } from '../lib/useTimeAgo';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Inbox, CheckCircle, AlertCircle, XCircle, Clock, Zap, Users, Activity, AlertTriangle } from 'lucide-react';
import { CostDashboard } from './CostDashboard';

interface MainContentProps {
  metrics: SystemMetrics;
  tasks: Task[];
  sessions: Session[];
  activityData: ActivityDataPoint[];
}

export function MainContent({ metrics, tasks, sessions, activityData }: MainContentProps) {
  const queueCount = tasks.filter((t) => t.status === 'queue').length;
  const ongoingCount = tasks.filter((t) => t.status === 'ongoing').length;
  const needHumanCount = tasks.filter((t) => t.status === 'need_human').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <main className="flex-1 bg-bg-primary overflow-auto p-4">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent-cyan" />
          <span className="text-sm font-medium text-text-primary">Operational Overview</span>
        </div>
        <div className="flex items-center gap-4 text-2xs text-text-muted">
          <span>Last activity: 1m ago</span>
          <span>Avg active session: 6h</span>
          <span>Active window: 10m</span>
        </div>
      </div>

      {/* Top Row */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        {/* Task Flow */}
        <div className="col-span-3 card p-4">
          <div className="text-2xs text-text-muted uppercase mb-3">Task Flow</div>
          <div className="flex items-center justify-between mb-4">
            {[
              { label: 'QUE', count: queueCount, color: 'bg-text-muted' },
              { label: 'ONG', count: ongoingCount, color: 'bg-accent-cyan' },
              { label: 'HUM', count: needHumanCount, color: 'bg-accent-yellow' },
              { label: 'COM', count: completedCount, color: 'bg-accent-green' },
            ].map((item, i) => (
              <div key={item.label} className="flex flex-col items-center gap-1">
                <div className={`w-8 h-1.5 rounded-full ${item.color}`} />
                <span className="text-2xs text-text-muted">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-text-muted" />
              <span className="text-xs text-text-secondary">Queue</span>
              <span className="ml-auto text-xs font-medium text-text-primary">{queueCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-cyan" />
              <span className="text-xs text-text-secondary">Ongoing</span>
              <span className="ml-auto text-xs font-medium text-text-primary">{ongoingCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-yellow" />
              <span className="text-xs text-text-secondary">Need Human</span>
              <span className="ml-auto text-xs font-medium text-text-primary">{needHumanCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-green" />
              <span className="text-xs text-text-secondary">Completed</span>
              <span className="ml-auto text-xs font-medium text-accent-green">{completedCount}</span>
            </div>
          </div>
        </div>

        {/* Activity Trend */}
        <div className="col-span-5 card p-4">
          <div className="text-2xs text-text-muted uppercase mb-3">Activity Trend (60M)</div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityData}>
                <defs>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="timestamp" hide />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}
                  itemStyle={{ color: '#22d3ee', fontSize: '12px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="tokens" 
                  stroke="#22d3ee" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center justify-between text-2xs text-text-muted">
            <span>Avg tokens / session</span>
            <span className="text-text-primary">21K</span>
          </div>
          <div className="flex items-center justify-between text-2xs text-text-muted">
            <span>Open avg age</span>
            <span className="text-text-primary">1d</span>
          </div>
          <div className="flex items-center justify-between text-2xs text-text-muted">
            <span>Done in 24h</span>
            <span className="text-accent-green">9</span>
          </div>
        </div>

        {/* Health Index */}
        <div className="col-span-4 card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs text-text-muted uppercase">Health Index</span>
            <div className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_6px_#22c55e]" />
          </div>
          <div className="text-5xl font-bold text-accent-green mb-2">{metrics.healthIndex}</div>
          <div className="text-2xs text-text-muted mb-4">Composite reliability score</div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-bg-tertiary rounded p-2 border border-white/5">
              <div className="text-2xs text-text-muted">OPEN &gt;24H</div>
              <div className="text-lg font-semibold text-accent-yellow">1</div>
            </div>
            <div className="bg-bg-tertiary rounded p-2 border border-white/5">
              <div className="text-2xs text-text-muted">OPEN &gt;72H</div>
              <div className="text-lg font-semibold text-text-primary">0</div>
            </div>
            <div className="bg-bg-tertiary rounded p-2 border border-white/5">
              <div className="text-2xs text-text-muted">RECENT ERRORS</div>
              <div className="text-lg font-semibold text-accent-red">0</div>
            </div>
            <div className="bg-bg-tertiary rounded p-2 border border-white/5">
              <div className="text-2xs text-text-muted">OVERDUE CRONS</div>
              <div className="text-lg font-semibold text-text-primary">0</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid Row */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <MetricCard 
          label="ACTIVE SESSIONS" 
          value={metrics.activeSessions} 
          subvalue={`of ${metrics.totalSessions}`}
          icon={Users}
          color="cyan"
        />
        <MetricCard 
          label="AGENTS ONLINE" 
          value={metrics.agentsOnline} 
          subvalue={`idle ${metrics.agentsIdle}`}
          icon={Zap}
          color="green"
        />
        <MetricCard 
          label="ACTIVITY / MIN" 
          value={metrics.activityPerMin} 
          subvalue="window 10m"
          icon={Activity}
          color="cyan"
        />
        <MetricCard 
          label="ERRORS (60M)" 
          value={metrics.errors60m} 
          subvalue="0 total"
          icon={AlertTriangle}
          color="red"
        />
        <MetricCard 
          label="OVERDUE CRONS" 
          value={metrics.overdueCrons} 
          subvalue="12 active"
          icon={Clock}
          color="yellow"
        />
        <MetricCard 
          label="WIP TASKS" 
          value={metrics.wipTasks} 
          subvalue="38 total"
          icon={CheckCircle}
          color="default"
        />
        <MetricCard 
          label="BLOCKED" 
          value={metrics.blockedTasks} 
          subvalue="0 >72h"
          icon={XCircle}
          color="red"
        />
        <MetricCard 
          label="AVG DONE" 
          value={metrics.avgDoneTime} 
          subvalue="delivery latency"
          icon={Clock}
          color="purple"
        />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-12 gap-3">
        {/* Cost Dashboard - replaces Execution Queue */}
        <CostDashboard />

        {/* Runtime Pulse */}
        <div className="col-span-4 card p-4">
          <div className="text-2xs text-text-muted uppercase mb-3">Runtime Pulse</div>
          <div className="text-2xs text-text-muted mb-2">Online 6/8 · live now</div>
          
          <div className="space-y-2">
            <div className="text-2xs text-text-muted uppercase mb-2">Active Sessions</div>
            {sessions.slice(0, 4).map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-white/5">
            <div className="text-2xs text-text-muted uppercase mb-2">Agent Pulse</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-text-primary">Clawd</div>
                <div className="text-2xs text-text-muted">1m ago · online</div>
              </div>
              <span className="text-xs text-accent-cyan">grok-4.1-fast</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

import { LucideIcon } from 'lucide-react';

function SessionRow({ session }: { session: Session }) {
  const timeAgo = useTimeAgo(session.lastActivity);

  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <div className="text-xs text-text-primary">{session.agentName}</div>
        <div className="text-2xs text-text-muted">{timeAgo}</div>
      </div>
      <span className="text-xs text-accent-cyan font-mono">{formatNumber(session.tokens)}</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subvalue,
  icon: Icon,
  color
}: {
  label: string;
  value: string | number;
  subvalue: string;
  icon: LucideIcon;
  color: 'green' | 'cyan' | 'yellow' | 'red' | 'purple' | 'default';
}) {
  const colorClasses = {
    green: 'text-accent-green',
    cyan: 'text-accent-cyan',
    yellow: 'text-accent-yellow',
    red: 'text-accent-red',
    purple: 'text-accent-purple',
    default: 'text-text-primary',
  };

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xs text-text-muted uppercase">{label}</span>
        <Icon className={cn('w-4 h-4', colorClasses[color])} />
      </div>
      <div className={cn('text-2xl font-bold', colorClasses[color])}>{value}</div>
      <div className="text-2xs text-text-muted">{subvalue}</div>
    </div>
  );
}
