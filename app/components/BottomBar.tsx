'use client';

import { Plus, Terminal } from 'lucide-react';

export function BottomBar() {
  return (
    <footer className="h-12 bg-bg-secondary border-t border-hub-border flex items-center px-4 gap-4 shrink-0 hub-header-bar">
      {/* New Task Button */}
      <button className="flex items-center gap-2 px-3 py-1.5 bg-accent-cyan/10 text-accent-cyan rounded-md border border-accent-cyan/20 hover:bg-accent-cyan/20 transition-colors">
        <Plus className="w-4 h-4" />
        <span className="text-xs font-medium">New Task</span>
      </button>

      {/* Command Input */}
      <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary rounded-md border border-white/5">
        <Terminal className="w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Type a command or / for actions..."
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        <span className="text-xs text-text-muted px-2 py-0.5 bg-bg-secondary rounded border border-white/5">Enter</span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span className="text-2xs uppercase tracking-wider text-accent-cyan/80 hidden sm:inline">
          Arrow Systems Inc
        </span>
        <span className="text-text-secondary hidden sm:inline">·</span>
        <span>6 active</span>
        <span className="text-text-secondary">·</span>
        <span>38 tasks</span>
        <span className="text-text-secondary">·</span>
        <span>v1.0</span>
      </div>
    </footer>
  );
}
