'use client';

import { Search, Hexagon, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

interface HeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = ['OVERVIEW', 'MAP', 'KANBAN', 'AGENTS'];

export function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <header className="h-14 bg-bg-secondary border-b border-white/5 flex items-center px-4 gap-4 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 flex items-center justify-center border border-accent-cyan/20">
          <Hexagon className="w-5 h-5 text-accent-cyan" />
        </div>
        <span className="font-semibold text-sm tracking-wider text-text-primary">THE BATCAVE</span>
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search tasks, agents, sessions..."
          className="w-full h-8 pl-9 pr-3 bg-bg-tertiary border border-white/5 rounded-md text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/30"
        />
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center gap-1 ml-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={cn(
              'px-4 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeTab === tab
                ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            )}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status Indicators */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary rounded-md border border-white/5">
          <Clock className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-xs font-mono text-text-secondary">8a/18s/12c</span>
        </div>
        
        <StatusBadge label="Live" value="8a/18s/12c" color="green" />
        <StatusBadge label="Sync age" value="5s ago" color="default" />
        <StatusBadge label="Agents" value="AGENTS.md" color="cyan" />
        <StatusBadge label="Gateway" value="Ok" color="green" />
      </div>
    </header>
  );
}

function StatusBadge({ label, value, color }: { label: string; value: string; color: 'green' | 'cyan' | 'default' }) {
  const colorClasses = {
    green: 'text-accent-green border-accent-green/20 bg-accent-green/5',
    cyan: 'text-accent-cyan border-accent-cyan/20 bg-accent-cyan/5',
    default: 'text-text-secondary border-white/10 bg-bg-tertiary',
  };

  return (
    <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs', colorClasses[color])}>
      <span className="text-text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
