'use client';

import { Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface AgentTooltipProps {
  model: string;
  costInfo: string;
  selected?: boolean;
  className?: string;
}

export function AgentTooltip({ model, costInfo, selected, className }: AgentTooltipProps) {
  return (
    <div
      className={cn(
        'absolute z-50 px-3 py-2 bg-[#1e1e2e] border border-white/10 rounded-md shadow-lg',
        'text-xs text-white',
        'pointer-events-none',
        'left-1/2 -translate-x-1/2',
        className
      )}
      style={{
        bottom: '100%',
        marginBottom: '8px',
      }}
    >
      <div className="flex items-center gap-2">
        {selected && <Check className="w-3 h-3 text-[#22c55e] shrink-0" />}
        <div className="min-w-0">
          <div className="font-medium whitespace-nowrap">{model}</div>
          <div className="text-[#a1a1aa] text-[10px] whitespace-nowrap">{costInfo}</div>
        </div>
      </div>
      {/* Arrow pointing down */}
      <div
        className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
        style={{
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderTop: '4px solid #1e1e2e',
        }}
      />
    </div>
  );
}
