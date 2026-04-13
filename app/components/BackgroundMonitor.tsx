'use client';

import { useState, useEffect } from 'react';

interface BackgroundMonitorProps {
  type: 'bar-chart' | 'terminal' | 'grid' | 'gallery' | 'status-bars';
  opacity?: number;
  className?: string;
  interactive?: boolean;
}

export function BackgroundMonitor({ 
  type, 
  opacity = 1, 
  className = '', 
  interactive = false 
}: BackgroundMonitorProps) {
  const [barHeights, setBarHeights] = useState<string[]>([
    '65%', '85%', '50%', '95%', '75%', '60%', '80%', '90%'
  ]);
  const [terminalLines, setTerminalLines] = useState<string[]>([
    '> initializing agent system...',
    '> loading workspace data...',
    '> agents ready'
  ]);
  const [gridPoints, setGridPoints] = useState<Array<{left: string, top: string, opacity: number}>>([
    { left: '20%', top: '25%', opacity: 1 },
    { left: '45%', top: '35%', opacity: 1 },
    { left: '70%', top: '20%', opacity: 1 },
    { left: '35%', top: '60%', opacity: 1 },
    { left: '80%', top: '70%', opacity: 1 },
  ]);
  const [statusBarWidths, setStatusBarWidths] = useState<string[]>(['75%', '90%', '60%']);

  // Bar chart animation
  useEffect(() => {
    if (type !== 'bar-chart') return;
    const interval = setInterval(() => {
      setBarHeights(prev => prev.map(() => 
        `${Math.floor(Math.random() * 50 + 40)}%`
      ));
    }, 3000);
    return () => clearInterval(interval);
  }, [type]);

  // Terminal scrolling text
  useEffect(() => {
    if (type !== 'terminal') return;
    const messages = [
      '> compiling agent modules...',
      '> deploying to workspace...',
      '> monitoring token usage...',
      '> optimizing performance...',
      '> agents synchronized',
      '> processing tasks...',
      '> generating responses...'
    ];
    let index = 0;
    const interval = setInterval(() => {
      const newLine = messages[index % messages.length];
      setTerminalLines(prev => [...prev.slice(-2), newLine]);
      index++;
    }, 2500);
    return () => clearInterval(interval);
  }, [type]);

  // Grid points animation
  useEffect(() => {
    if (type !== 'grid') return;
    const interval = setInterval(() => {
      setGridPoints(prev => {
        const newPoints = [...prev];
        // Fade out one random point
        const fadeIndex = Math.floor(Math.random() * newPoints.length);
        newPoints[fadeIndex] = { ...newPoints[fadeIndex], opacity: 0 };
        // Add new point
        setTimeout(() => {
          setGridPoints(p => {
            const updated = [...p];
            updated[fadeIndex] = {
              left: `${Math.random() * 80 + 10}%`,
              top: `${Math.random() * 80 + 10}%`,
              opacity: 1
            };
            return updated;
          });
        }, 500);
        return newPoints;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [type]);

  // Status bars animation
  useEffect(() => {
    if (type !== 'status-bars') return;
    const interval = setInterval(() => {
      setStatusBarWidths([
        `${Math.floor(Math.random() * 30 + 60)}%`,
        `${Math.floor(Math.random() * 20 + 75)}%`,
        `${Math.floor(Math.random() * 40 + 50)}%`,
      ]);
    }, 2000);
    return () => clearInterval(interval);
  }, [type]);

  const baseClasses = `${className} ${interactive ? 'cursor-pointer hover:scale-105 transition-transform duration-300' : ''}`;

  // Bar Chart Monitor
  if (type === 'bar-chart') {
    return (
      <div className={baseClasses} style={{ opacity }}>
        <div className="w-full h-full bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded-xl p-3" style={{
          boxShadow: '0 8px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}>
          <div className="w-full h-full bg-[#0a0a0f] rounded-lg p-2 border border-[#334155]/50 relative overflow-hidden">
            {/* Scan line effect */}
            <div className="absolute inset-0 h-1 bg-gradient-to-r from-transparent via-[#C41E3A]/40 to-transparent" 
                 style={{ animation: 'scan-line 4s linear infinite' }} />
            
            <div className="flex items-end justify-between h-full gap-1.5">
              {barHeights.map((height, idx) => (
                <div 
                  key={idx} 
                  className="flex-1 rounded-t-sm transition-all duration-1000 ease-in-out origin-bottom" 
                  style={{
                    height,
                    background: [
                      'linear-gradient(180deg, #ef4444 0%, #ef4444bb 100%)',
                      'linear-gradient(180deg, #f59e0b 0%, #f59e0bbb 100%)',
                      'linear-gradient(180deg, #eab308 0%, #eab308bb 100%)',
                      'linear-gradient(180deg, #22c55e 0%, #22c55ebb 100%)',
                      'linear-gradient(180deg, #9B1930 0%, #06b6d4bb 100%)',
                      'linear-gradient(180deg, #3b82f6 0%, #3b82f6bb 100%)',
                      'linear-gradient(180deg, #8b5cf6 0%, #8b5cf6bb 100%)',
                      'linear-gradient(180deg, #ec4899 0%, #ec4899bb 100%)',
                    ][idx],
                    boxShadow: `0 -2px 8px ${['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#9B1930', '#3b82f6', '#8b5cf6', '#ec4899'][idx]}88, 0 0 4px ${['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#9B1930', '#3b82f6', '#8b5cf6', '#ec4899'][idx]}66`
                  }} 
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Terminal Monitor
  if (type === 'terminal') {
    return (
      <div className={baseClasses} style={{ opacity }}>
        <div className="w-full h-full bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded-lg p-2" style={{
          boxShadow: '0 6px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}>
          <div className="w-full h-full bg-[#0a0a0f] rounded p-2 border border-[#22c55e]/20 font-mono text-[8px] text-[#22c55e] overflow-hidden">
            {terminalLines.map((line, idx) => (
              <div key={idx} className="mb-1 animate-slide-in">
                {line}
                {idx === terminalLines.length - 1 && (
                  <span className="inline-block w-1 h-2 bg-[#22c55e] ml-1" style={{
                    animation: 'typing-cursor 1s step-end infinite'
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Grid Monitor
  if (type === 'grid') {
    return (
      <div className={baseClasses} style={{ opacity }}>
        <div className="w-full h-full bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded-xl p-3" style={{
          boxShadow: '0 8px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}>
          <div className="w-full h-full rounded-lg border border-[#065f46]/30 p-2 relative" style={{
            background: 'linear-gradient(135deg, #064e3b 0%, #065f46 80%, #047857 100%)',
            backgroundImage: `
              linear-gradient(to right, rgba(34,197,94,0.12) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(34,197,94,0.12) 1px, transparent 1px)
            `,
            backgroundSize: '12px 12px',
            boxShadow: 'inset 0 0 32px rgba(34,197,94,0.15)'
          }}>
            {gridPoints.map((point, idx) => (
              <div 
                key={idx} 
                className="absolute w-2 h-2 bg-[#22c55e] rounded-full transition-all duration-500" 
                style={{
                  left: point.left,
                  top: point.top,
                  opacity: point.opacity,
                  boxShadow: '0 0 6px #22c55e'
                }} 
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Gallery Monitor
  if (type === 'gallery') {
    return (
      <div className={baseClasses} style={{ opacity }}>
        <div className="w-full h-full bg-gradient-to-br from-[#2d3748] to-[#1e293b] rounded-lg p-2" style={{
          boxShadow: '0 6px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}>
          <div className="grid grid-cols-3 gap-1.5 w-full h-full">
            {[
              '#3b82f6', '#60a5fa', '#93c5fd',
              '#8b5cf6', '#a78bfa', '#c4b5fd',
              '#9B1930', '#C41E3A', '#E85A70'
            ].map((color, idx) => (
              <div 
                key={idx} 
                className="rounded animate-pulse-glow-soft" 
                style={{
                  background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                  boxShadow: `inset 0 0 6px rgba(255,255,255,0.15), 0 0 4px ${color}44`,
                  animationDelay: `${idx * 0.2}s`,
                  color
                }} 
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Status Bars Monitor
  if (type === 'status-bars') {
    return (
      <div className={baseClasses} style={{ opacity }}>
        <div className="w-full h-full bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded-lg border border-[#334155]" style={{
          boxShadow: '0 4px 12px rgba(0,0,0,0.6)'
        }}>
          <div className="absolute inset-3 flex flex-col gap-1.5">
            {statusBarWidths.map((width, idx) => (
              <div key={idx} className="h-2 bg-[#0a0a0f] rounded overflow-hidden">
                <div 
                  className="h-full rounded transition-all duration-1000 ease-in-out"
                  style={{
                    width,
                    background: [
                      'linear-gradient(to right, rgba(196,30,58,0.25), rgba(196,30,58,0.38), rgba(196,30,58,0.13))',
                      'linear-gradient(to right, #22c55e40, #22c55e60, #22c55e20)',
                      'linear-gradient(to right, #eab30840, #eab30860, #eab30820)'
                    ][idx]
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
