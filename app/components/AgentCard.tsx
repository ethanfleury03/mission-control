'use client';

import { Cpu } from 'lucide-react';
import { cn } from '../lib/utils';

interface AgentCardProps {
  name: string;
  model: string;
  tokens: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function AgentCard({ name, model, tokens, selected, onClick, className }: AgentCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-[#16161e] rounded-xl p-4 border border-white/10',
        'transition-all duration-200 cursor-pointer',
        'hover:scale-[1.02] hover:border-[#C41E3A]/30 hover:bg-[#1a1a24]',
        selected && 'ring-2 ring-[#C41E3A] bg-[#1a1a24]',
        className
      )}
      style={{
        boxShadow: selected 
          ? '0 0 20px rgba(34,211,238,0.3), 0 4px 12px rgba(0,0,0,0.5)' 
          : '0 4px 12px rgba(0,0,0,0.4)'
      }}
    >
      <h3 className="text-base font-bold text-white mb-1">{name}</h3>
      <p className="text-xs text-[#71717a] uppercase mb-2">{model}</p>
      <div className="flex items-center gap-1.5">
        <Cpu className="w-3.5 h-3.5 text-[#71717a]" />
        <span className="text-xs font-medium text-white">{tokens}</span>
      </div>
    </div>
  );
}
