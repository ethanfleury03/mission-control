'use client';

import { Plus, Terminal } from 'lucide-react';

export function BottomBar() {
  return (
    <footer className="h-12 bg-white border-t border-hub-border flex items-center px-4 gap-4 shrink-0 hub-header-bar">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-md border border-brand-hover transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span className="text-xs font-medium">New Task</span>
      </button>

      <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-neutral-100 rounded-md border border-neutral-200">
        <Terminal className="w-4 h-4 text-neutral-500" />
        <input
          type="text"
          placeholder="Type a command or / for actions..."
          className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
        />
        <span className="text-xs text-neutral-500 px-2 py-0.5 bg-white rounded border border-neutral-200">
          Enter
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-neutral-500">
        <span className="text-2xs uppercase tracking-wider text-brand font-semibold hidden sm:inline">
          Arrow Hub
        </span>
        <span className="text-neutral-300 hidden sm:inline">·</span>
        <span>6 active</span>
        <span className="text-neutral-300">·</span>
        <span>38 tasks</span>
        <span className="text-neutral-300">·</span>
        <span>v1.0</span>
      </div>
    </footer>
  );
}
