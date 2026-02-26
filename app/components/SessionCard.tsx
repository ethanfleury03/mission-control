'use client';

import { Monitor, Wrench, Brain } from 'lucide-react';
import { cn, formatTimeAgo } from '../lib/utils';

interface SessionCardProps {
  name: string;
  model: string;
  tokens: number | string;
  timeAgo?: Date;
  status?: 'idle' | 'working' | 'moving';
  iconType?: 'desktop' | 'tool' | 'claude';
  className?: string;
}

export function SessionCard({ 
  name, 
  model, 
  tokens, 
  timeAgo, 
  status = 'working',
  iconType = 'desktop',
  className 
}: SessionCardProps) {
  // Determine token color based on value
  const getTokenColor = (tokenValue: number | string): string => {
    if (typeof tokenValue === 'string') {
      // Handle compound displays like "339 50k"
      const parts = tokenValue.split(' ');
      const firstPart = parseInt(parts[0]);
      if (firstPart >= 10000) return 'text-[#22c55e]'; // High - green
      if (firstPart >= 1000) return 'text-[#eab308]'; // Medium - yellow
      return 'text-[#71717a]'; // Low - gray
    }
    
    if (tokenValue >= 10000) return 'text-[#22c55e]'; // High - green
    if (tokenValue >= 1000) return 'text-[#eab308]'; // Medium - yellow
    return 'text-[#71717a]'; // Low - gray
  };

  const getIcon = () => {
    switch (iconType) {
      case 'desktop':
        return <Monitor className="w-4 h-4" />;
      case 'tool':
        return <Wrench className="w-4 h-4" />;
      case 'claude':
        return <Brain className="w-4 h-4" />;
      default:
        return <Monitor className="w-4 h-4" />;
    }
  };

  const tokenDisplay = typeof tokens === 'string' ? tokens : `${(tokens / 1000).toFixed(1)}K`;
  const tokenColor = getTokenColor(tokens);

  return (
    <div
      className={cn(
        'bg-[#16161e] rounded-lg p-3 border border-white/10',
        'hover:bg-[#1a1a24] hover:border-white/20 transition-all duration-200 cursor-pointer',
        'min-w-[180px]',
        className
      )}
      style={{
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
      }}
    >
      <div className="flex items-start gap-3">
        <div className="text-[#71717a] mt-0.5">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{name}</div>
          <div className="text-xs text-[#71717a] truncate mt-0.5">{model}</div>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn('text-xs font-semibold', tokenColor)}>
              {tokenDisplay}
            </span>
            {typeof tokens === 'string' && tokens.includes(' ') && (
              <span className="text-xs text-[#71717a] font-medium">
                {tokens.split(' ')[1]}
              </span>
            )}
          </div>
          {timeAgo && (
            <div className="text-xs text-[#71717a] mt-1 font-medium">
              {formatTimeAgo(timeAgo)}
            </div>
          )}
          {status === 'idle' && (
            <div className="flex items-center gap-1 mt-1">
              <div className="w-1.5 h-1.5 bg-[#71717a] rounded-full" />
              <span className="text-xs text-[#71717a] font-medium">Idle</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
