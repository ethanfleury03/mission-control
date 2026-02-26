'use client';

import { useState, useEffect } from 'react';
import { BackgroundMonitor } from './BackgroundMonitor';

interface ServerRoomBackgroundProps {
  activityLevel?: number;
}

export function ServerRoomBackground({ activityLevel = 0.5 }: ServerRoomBackgroundProps) {
  // Ensure activityLevel is a valid number (NaN can occur when agents array is empty)
  const safeActivityLevel = Number.isFinite(activityLevel) ? Math.max(0, Math.min(1, activityLevel)) : 0;
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [glitchingMonitor, setGlitchingMonitor] = useState<number | null>(null);

  // Monitor glitch effect - random flicker every 8-10 seconds
  useEffect(() => {
    const glitchInterval = setInterval(() => {
      const monitorIndex = Math.floor(Math.random() * 5); // 5 monitors total
      setGlitchingMonitor(monitorIndex);
      setTimeout(() => setGlitchingMonitor(null), 200);
    }, 8000 + Math.random() * 2000);

    return () => clearInterval(glitchInterval);
  }, []);

  const Tooltip = ({ text }: { text: string }) => (
    <div className="absolute z-50 px-3 py-2 bg-[#1e1e2e] border border-white/10 rounded-md shadow-lg text-xs text-white pointer-events-none whitespace-nowrap"
         style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' }}>
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
           style={{ borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid #1e1e2e' }} />
    </div>
  );
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base background - deep office atmosphere */}
      <div className="absolute inset-0 bg-[#2a2f3d]" />
      
      {/* Back wall - upper 60% of screen with more definition */}
      <div className="absolute inset-0 top-0 h-3/5" style={{
        background: 'linear-gradient(180deg, #1e222d 0%, #24283a 20%, #2c3142 40%, #353845 70%, #3d4455 100%)'
      }}>
        {/* Wall texture overlay for definition */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.02) 0%, transparent 50%)',
        }} />
        {/* Subtle concrete/panel texture */}
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `
            repeating-linear-gradient(90deg, transparent, transparent 120px, rgba(0,0,0,0.05) 120px, rgba(0,0,0,0.05) 121px),
            repeating-linear-gradient(0deg, transparent, transparent 120px, rgba(0,0,0,0.05) 120px, rgba(0,0,0,0.05) 121px)
          `
        }} />
      </div>
      
      {/* Floor area - lower 40% with strong perspective and better definition */}
      <div className="absolute bottom-0 left-0 right-0 h-2/5" style={{
        background: 'linear-gradient(180deg, #3d4455 0%, #475163 30%, #52596b 70%, #5a6273 100%)'
      }} />
      
      {/* Horizon line - where wall meets floor - more prominent */}
      <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/20 to-transparent" style={{
        top: '60%',
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
      }} />
      
      {/* Wall baseboard shadow for depth */}
      <div className="absolute left-0 right-0 h-16" style={{
        top: '60%',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 100%)'
      }} />
      
      {/* ===== LEFT WALL - Large File Cabinet System + Equipment ===== */}
      <div className="absolute left-0 top-0 bottom-0 w-40">
        {/* Main cabinet structure - tall and prominent */}
        <div 
          className="absolute left-6 top-12 w-28 h-[500px] cursor-pointer"
          onMouseEnter={() => setHoveredElement('file-cabinet')}
          onMouseLeave={() => setHoveredElement(null)}
          style={{ pointerEvents: 'auto' }}
        >
          {hoveredElement === 'file-cabinet' && <Tooltip text="Document Archive - 847 files" />}
          {/* Cabinet body with 3D effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#505668] to-[#3d4455] rounded-lg" style={{
            boxShadow: '4px 0 12px rgba(0,0,0,0.5), inset -2px 0 4px rgba(0,0,0,0.3)'
          }}>
            {/* Colorful file folders - 5 rows of 3 columns, more prominent */}
            {[0, 1, 2, 3, 4].map(row => (
              <div key={row} className="absolute left-2 right-2 flex gap-1.5" style={{ top: `${row * 18 + 8}%` }}>
                {[
                  ['#3b82f6', '#60a5fa', '#93c5fd'],
                  ['#ef4444', '#f87171', '#fca5a5'],
                  ['#22c55e', '#4ade80', '#86efac'],
                  ['#fbbf24', '#fcd34d', '#fde68a'],
                  ['#8b5cf6', '#a78bfa', '#c4b5fd']
                ][row].map((color, idx) => (
                  <div key={idx} className="flex-1 h-16 rounded" style={{
                    background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
                    boxShadow: `0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)`
                  }} />
                ))}
              </div>
            ))}
          </div>
          
          {/* Cabinet shadow on wall */}
          <div className="absolute -left-1 top-2 w-full h-full bg-black/20 blur-md -z-10" />
        </div>
        
        {/* Additional wall-mounted equipment above cabinet */}
        <div className="absolute left-8 top-2 w-24 h-8 bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded opacity-60" style={{
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)'
        }}>
          <div className="absolute inset-1 flex gap-1">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex-1 bg-[#22d3ee]/20 rounded-sm" />
            ))}
          </div>
        </div>
      </div>
      
      {/* ===== BACK WALL - Large Monitor Arrays ===== */}
      {/* Left side - 3x3 Image gallery monitor wall */}
      <div 
        className="absolute left-[160px] top-10 w-32 h-40"
        onMouseEnter={() => setHoveredElement('gallery-monitor')}
        onMouseLeave={() => setHoveredElement(null)}
        style={{ pointerEvents: 'auto' }}
      >
        {hoveredElement === 'gallery-monitor' && <Tooltip text="Project Thumbnails" />}
        {/* Monitor glow spill */}
        <div 
          className="absolute inset-0 -z-10 blur-[40px] transition-opacity duration-1000 rounded-full" 
          style={{ 
            background: 'radial-gradient(circle, #3b82f640 0%, transparent 70%)',
            opacity: 0.3 + safeActivityLevel * 0.3
          }}
        />
        <div className={glitchingMonitor === 0 ? 'animate-glitch-flicker' : ''}>
          <BackgroundMonitor type="gallery" interactive />
        </div>
      </div>
      
      <style jsx>{`
        .animate-glitch-flicker {
          animation: glitch-flicker 200ms ease-in-out;
        }
      `}</style>
      
      {/* Center - Large horizontal monitor with bar chart */}
      <div 
        className="absolute left-[320px] top-8 w-64 h-32"
        onMouseEnter={() => setHoveredElement('bar-chart-monitor')}
        onMouseLeave={() => setHoveredElement(null)}
        style={{ pointerEvents: 'auto' }}
      >
        {hoveredElement === 'bar-chart-monitor' && <Tooltip text="Agent Token Usage - Last 24h" />}
        {/* Monitor glow spill - multicolor */}
        <div 
          className="absolute inset-0 -z-10 blur-[50px] transition-opacity duration-1000" 
          style={{ 
            background: 'radial-gradient(circle, #22c55e40 0%, #3b82f640 50%, transparent 70%)',
            opacity: 0.4 + safeActivityLevel * 0.4
          }}
        />
        <div className={glitchingMonitor === 1 ? 'animate-glitch-flicker' : ''}>
          <BackgroundMonitor type="bar-chart" interactive />
        </div>
      </div>
      
      {/* Center-right - Vertical stacked monitors */}
      <div className="absolute left-[610px] top-10 w-24 h-44">
        {/* Monitor glow spill - green terminal glow */}
        <div 
          className="absolute inset-0 -z-10 blur-[35px] transition-opacity duration-1000" 
          style={{ 
            background: 'radial-gradient(circle, #22c55e30 0%, transparent 70%)',
            opacity: 0.25 + safeActivityLevel * 0.25
          }}
        />
        <div className={glitchingMonitor === 2 ? 'animate-glitch-flicker' : ''}>
          <BackgroundMonitor type="terminal" />
        </div>
      </div>
      
      {/* Right side - 4x4 Grid monitor array */}
      <div 
        className="absolute right-[160px] top-12 w-36 h-44 cursor-pointer"
        onMouseEnter={() => setHoveredElement('grid-monitor-wall')}
        onMouseLeave={() => setHoveredElement(null)}
        style={{ pointerEvents: 'auto' }}
      >
        {hoveredElement === 'grid-monitor-wall' && <Tooltip text="Team Activity Heatmap" />}
        <div className="w-full h-full bg-gradient-to-br from-[#2d3748] to-[#1e293b] rounded-lg p-3" style={{
          boxShadow: '0 6px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}>
          <div className="grid grid-cols-4 gap-1.5 w-full h-full">
            {[
              '#ef4444', '#f97316', '#f59e0b', '#eab308',
              '#84cc16', '#22c55e', '#10b981', '#14b8a6',
              '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
              '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'
            ].map((color, idx) => (
              <div key={idx} className="rounded" style={{
                background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                boxShadow: `inset 0 0 4px rgba(255,255,255,0.1), 0 0 3px ${color}44`
              }} />
            ))}
          </div>
        </div>
      </div>
      
      {/* ===== RIGHT WALL - Large Display Systems + Equipment ===== */}
      <div className="absolute right-0 top-0 w-44 h-full">
        {/* Large green grid analysis monitor */}
        <div 
          className="absolute right-10 top-8 w-36 h-40"
          onMouseEnter={() => setHoveredElement('green-grid-monitor')}
          onMouseLeave={() => setHoveredElement(null)}
          style={{ pointerEvents: 'auto' }}
        >
          {hoveredElement === 'green-grid-monitor' && <Tooltip text="Network Topology Map" />}
          {/* Monitor glow spill - green */}
          <div 
            className="absolute inset-0 -z-10 blur-[45px] transition-opacity duration-1000" 
            style={{ 
              background: 'radial-gradient(circle, #22c55e50 0%, transparent 70%)',
              opacity: 0.35 + safeActivityLevel * 0.35
            }}
          />
          <div className={glitchingMonitor === 3 ? 'animate-glitch-flicker' : ''}>
            <BackgroundMonitor type="grid" interactive />
          </div>
        </div>
        
        {/* Status indicator panel */}
        <div 
          className="absolute right-14 top-[220px] w-20 h-16 bg-gradient-to-br from-[#1e293b] to-[#0f172a] border border-[#334155] rounded-lg p-2 cursor-pointer" 
          onMouseEnter={() => setHoveredElement('status-panel')}
          onMouseLeave={() => setHoveredElement(null)}
          style={{
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            pointerEvents: 'auto'
          }}
        >
          {hoveredElement === 'status-panel' && <Tooltip text="System Health: 3 OK, 1 Warning" />}
          <div className="grid grid-cols-2 gap-2 w-full h-full">
            {['#22c55e', '#eab308', '#ef4444', '#3b82f6'].map((color, idx) => (
              <div 
                key={idx} 
                className="rounded-full animate-pulse-glow-soft" 
                style={{
                  backgroundColor: color,
                  boxShadow: `0 0 8px ${color}, inset 0 1px 2px rgba(255,255,255,0.2)`,
                  color,
                  animationDelay: `${idx * 0.5}s`
                }} 
              />
            ))}
          </div>
        </div>
        
        {/* Wall-mounted ventilation/AC unit */}
        <div className="absolute right-12 top-2 w-24 h-10 bg-gradient-to-br from-[#2d3748] to-[#1e293b] rounded opacity-60" style={{
          boxShadow: '0 3px 8px rgba(0,0,0,0.5)'
        }}>
          <div className="absolute inset-1">
            {/* Vent slats */}
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="absolute left-2 right-2 h-px bg-[#475569]" style={{
                top: `${i * 20 + 10}%`
              }} />
            ))}
          </div>
        </div>
      </div>
      
      {/* ===== CENTER WALL - Additional Tech Elements ===== */}
      {/* Wall panel with diagnostic display */}
      <div 
        className="absolute left-1/2 -translate-x-1/2 top-[12%] w-32 h-20"
        onMouseEnter={() => setHoveredElement('diagnostic-panel')}
        onMouseLeave={() => setHoveredElement(null)}
        style={{ pointerEvents: 'auto' }}
      >
        {hoveredElement === 'diagnostic-panel' && <Tooltip text="Agent Performance Metrics" />}
        {/* Monitor glow spill - cyan */}
        <div 
          className="absolute inset-0 -z-10 blur-[30px] transition-opacity duration-1000" 
          style={{ 
            background: 'radial-gradient(circle, #22d3ee30 0%, transparent 70%)',
            opacity: 0.2 + safeActivityLevel * 0.2
          }}
        />
        <div className={glitchingMonitor === 4 ? 'animate-glitch-flicker' : ''}>
          <BackgroundMonitor type="status-bars" opacity={0.4} interactive />
        </div>
      </div>
      
      {/* ===== FLOOR - Enhanced with strong perspective ===== */}
      <div className="absolute bottom-0 left-0 right-0 h-2/5">
        {/* Base floor color with gradient */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, #4a5163 0%, #52596b 50%, #5a6273 100%)'
        }} />
        
        {/* Primary isometric tile grid - larger and more visible */}
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(30deg, transparent 48%, rgba(44,49,66,0.6) 49%, rgba(44,49,66,0.6) 51%, transparent 52%),
            linear-gradient(150deg, transparent 48%, rgba(44,49,66,0.6) 49%, rgba(44,49,66,0.6) 51%, transparent 52%)
          `,
          backgroundSize: '60px 104px',
          backgroundPosition: '0 0, 30px 52px'
        }} />
        
        {/* Secondary fine grid for detail */}
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(30deg, transparent 49%, rgba(70,77,95,0.3) 49.5%, rgba(70,77,95,0.3) 50.5%, transparent 51%),
            linear-gradient(150deg, transparent 49%, rgba(70,77,95,0.3) 49.5%, rgba(70,77,95,0.3) 50.5%, transparent 51%)
          `,
          backgroundSize: '30px 52px',
          backgroundPosition: '0 0, 15px 26px'
        }} />
        
        {/* Floor lighting - central illumination */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(96,165,250,0.08) 0%, transparent 70%)'
        }} />
        
        {/* Floor shadow gradients for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1e222d]/90 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#3d4455]/60 to-transparent" />
      </div>
      
      {/* ===== BACKGROUND WORKSTATIONS - Add depth to empty space ===== */}
      {/* Left background equipment cluster */}
      <div className="absolute left-[100px] top-[30%] w-32 h-20 opacity-40">
        <div className="absolute inset-0 bg-gradient-to-br from-[#2d3748] to-[#1e293b] rounded-lg" style={{
          boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
          transform: 'perspective(400px) rotateY(5deg)'
        }}>
          <div className="absolute inset-2 flex gap-1">
            <div className="flex-1 bg-[#3b82f6]/20 rounded border border-[#3b82f6]/30" />
            <div className="flex-1 bg-[#22d3ee]/20 rounded border border-[#22d3ee]/30" />
          </div>
        </div>
      </div>
      
      {/* Center-left background server rack */}
      <div 
        className="absolute left-[240px] top-[25%] w-24 h-32 opacity-35 cursor-pointer hover:opacity-50 transition-opacity"
        onMouseEnter={() => setHoveredElement('server-rack-a')}
        onMouseLeave={() => setHoveredElement(null)}
        style={{ pointerEvents: 'auto' }}
      >
        {hoveredElement === 'server-rack-a' && <Tooltip text="Processing Cluster A" />}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded" style={{
          boxShadow: '0 6px 16px rgba(0,0,0,0.7)'
        }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="absolute left-2 right-2 h-1 bg-[#22d3ee]/20 border-t border-[#22d3ee]/30" style={{
              top: `${i * 20 + 10}%`
            }} />
          ))}
          <div className="absolute top-2 left-2 w-1.5 h-1.5 bg-[#22c55e] rounded-full animate-pulse" style={{
            boxShadow: '0 0 4px #22c55e',
            animationDelay: '0s'
          }} />
          <div className="absolute top-5 left-2 w-1.5 h-1.5 bg-[#22d3ee] rounded-full animate-pulse" style={{
            boxShadow: '0 0 4px #22d3ee',
            animationDelay: '0.7s'
          }} />
        </div>
      </div>
      
      {/* Center background large display */}
      <div className="absolute left-[420px] top-[22%] w-40 h-24 opacity-30">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded-lg border border-[#334155]" style={{
          boxShadow: '0 8px 24px rgba(0,0,0,0.8)'
        }}>
          <div className="absolute inset-3 bg-gradient-to-br from-[#6366f1]/20 to-[#8b5cf6]/20 rounded" />
        </div>
      </div>
      
      {/* Center-right background equipment */}
      <div className="absolute right-[280px] top-[28%] w-28 h-24 opacity-35">
        <div className="absolute inset-0 bg-gradient-to-br from-[#2d3748] to-[#1e293b] rounded-lg" style={{
          boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
          transform: 'perspective(400px) rotateY(-5deg)'
        }}>
          <div className="absolute inset-2 grid grid-cols-3 gap-1">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-[#a855f7]/20 rounded border border-[#a855f7]/30" />
            ))}
          </div>
        </div>
      </div>
      
      {/* Right background tall server */}
      <div className="absolute right-[120px] top-[24%] w-20 h-36 opacity-40">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded" style={{
          boxShadow: '0 6px 18px rgba(0,0,0,0.7)'
        }}>
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="absolute left-1 right-1 h-px bg-[#475569]" style={{
              top: `${i * 14 + 8}%`
            }} />
          ))}
          <div className="absolute top-2 left-2 w-1 h-1 bg-[#22d3ee] rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
          <div className="absolute top-4 left-2 w-1 h-1 bg-[#22c55e] rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
          <div className="absolute top-6 left-2 w-1 h-1 bg-[#3b82f6] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
      </div>
      
      {/* ===== WALL PANELS & DETAILS ===== */}
      {/* Back wall panel sections for depth */}
      <div className="absolute left-0 top-[15%] w-full h-[45%]">
        {/* Horizontal wall segments */}
        <div className="absolute left-0 top-0 w-[15%] h-full bg-gradient-to-r from-[#1e293b]/40 to-transparent" />
        <div className="absolute right-0 top-0 w-[15%] h-full bg-gradient-to-l from-[#1e293b]/40 to-transparent" />
        
        {/* Vertical wall panel lines */}
        <div className="absolute left-[20%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/5 to-transparent" />
        <div className="absolute left-[40%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/5 to-transparent" />
        <div className="absolute left-[60%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/5 to-transparent" />
        <div className="absolute left-[80%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/5 to-transparent" />
      </div>
      
      {/* Cable management / tech strips on ceiling */}
      <div className="absolute top-[8%] left-[25%] w-48 h-3 bg-gradient-to-r from-transparent via-[#1e293b]/60 to-transparent rounded-full" style={{
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)'
      }}>
        <div className="absolute top-1 left-4 w-1 h-1 bg-[#22d3ee] rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
        <div className="absolute top-1 right-4 w-1 h-1 bg-[#22c55e] rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>
      
      <div className="absolute top-[10%] right-[28%] w-40 h-3 bg-gradient-to-r from-transparent via-[#1e293b]/60 to-transparent rounded-full" style={{
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)'
      }}>
        <div className="absolute top-1 left-6 w-1 h-1 bg-[#a855f7] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1 right-6 w-1 h-1 bg-[#3b82f6] rounded-full animate-pulse" style={{ animationDelay: '1.5s' }} />
      </div>
      
      {/* Floating holographic status displays */}
      <div className="absolute top-[18%] left-[15%] w-16 h-12" style={{ animation: 'spotlight-breathe 6s ease-in-out infinite' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#22d3ee]/30 to-[#3b82f6]/30 rounded border border-[#22d3ee]/40 backdrop-blur-sm">
          <div className="absolute inset-2 flex flex-col gap-1">
            <div className="h-1 bg-[#22d3ee]/50 rounded" />
            <div className="h-1 bg-[#22c55e]/50 rounded w-3/4" />
            <div className="h-1 bg-[#eab308]/50 rounded w-1/2" />
          </div>
        </div>
      </div>
      
      <div className="absolute top-[20%] right-[18%] w-14 h-14" style={{ animation: 'spotlight-breathe 6s ease-in-out infinite', animationDelay: '3s' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#a855f7]/30 to-[#ec4899]/30 rounded-full border border-[#a855f7]/40">
          <div className="absolute inset-3 rounded-full" style={{
            background: 'conic-gradient(from 0deg, #a855f7 0%, #ec4899 50%, #a855f7 100%)',
            opacity: 0.5
          }} />
        </div>
      </div>
      
      {/* Small tech elements scattered in background */}
      {[
        { left: '12%', top: '35%', color: '#22c55e', size: 'w-2 h-2', delay: 0 },
        { left: '88%', top: '32%', color: '#3b82f6', size: 'w-2 h-2', delay: 0.3 },
        { left: '50%', top: '15%', color: '#a855f7', size: 'w-1.5 h-1.5', delay: 0.6 },
        { left: '30%', top: '40%', color: '#22d3ee', size: 'w-1.5 h-1.5', delay: 0.9 },
        { left: '70%', top: '38%', color: '#eab308', size: 'w-1.5 h-1.5', delay: 1.2 },
        { left: '18%', top: '48%', color: '#ec4899', size: 'w-2 h-2', delay: 1.5 },
        { left: '82%', top: '44%', color: '#10b981', size: 'w-1.5 h-1.5', delay: 1.8 },
        { left: '42%', top: '52%', color: '#f59e0b', size: 'w-2 h-2', delay: 2.1 },
        { left: '65%', top: '25%', color: '#6366f1', size: 'w-1.5 h-1.5', delay: 2.4 },
        { left: '25%', top: '28%', color: '#14b8a6', size: 'w-2 h-2', delay: 2.7 },
        { left: '75%', top: '50%', color: '#f97316', size: 'w-1.5 h-1.5', delay: 3.0 },
        { left: '55%', top: '35%', color: '#84cc16', size: 'w-2 h-2', delay: 3.3 },
      ].map((dot, i) => (
        <div 
          key={i} 
          className={`absolute ${dot.size} rounded-full animate-pulse-glow-soft`} 
          style={{
            left: dot.left,
            top: dot.top,
            backgroundColor: dot.color,
            boxShadow: `0 0 8px ${dot.color}`,
            color: dot.color,
            animationDelay: `${dot.delay}s`
          }} 
        />
      ))}
      
      {/* ===== ENHANCED ATMOSPHERIC LIGHTING ===== */}
      {/* Ceiling light sources - stronger and more dramatic, scales with activity */}
      <div 
        className="absolute top-0 left-1/4 w-64 h-64 bg-[#60a5fa] rounded-full blur-[140px] transition-opacity duration-1000" 
        style={{ opacity: 0.06 + safeActivityLevel * 0.08 }}
      />
      <div 
        className="absolute top-0 right-1/4 w-64 h-64 bg-[#a78bfa] rounded-full blur-[140px] transition-opacity duration-1000" 
        style={{ opacity: 0.06 + safeActivityLevel * 0.08 }}
      />
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-[#22d3ee] rounded-full blur-[160px] transition-opacity duration-1000" 
        style={{ opacity: 0.05 + safeActivityLevel * 0.06 }}
      />
      
      {/* Overhead lighting bars */}
      <div className="absolute top-[5%] left-[30%] w-64 h-16 bg-gradient-to-b from-white/[0.02] to-transparent blur-sm" />
      <div className="absolute top-[5%] right-[32%] w-56 h-16 bg-gradient-to-b from-white/[0.02] to-transparent blur-sm" />
      
      {/* Wall accent lights - more prominent */}
      <div className="absolute top-1/4 left-4 w-40 h-80 bg-[#3b82f6]/12 blur-[70px]" />
      <div className="absolute top-1/4 right-4 w-40 h-80 bg-[#a855f7]/12 blur-[70px]" />
      
      {/* Floor uplighting */}
      <div className="absolute bottom-0 left-1/3 w-48 h-32 bg-[#22d3ee]/8 blur-[60px]" />
      <div className="absolute bottom-0 right-1/3 w-48 h-32 bg-[#6366f1]/8 blur-[60px]" />
      
      {/* Overall atmospheric gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a1d2e]/40 via-[#2c3142]/20 to-[#2c3142]/60" />
      
      {/* Subtle vignette to focus attention */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 85% 70% at 50% 50%, transparent 20%, rgba(26,29,46,0.3) 65%, rgba(26,29,46,0.6) 100%)'
      }} />
      
      {/* Bottom shadow to anchor the scene */}
      <div className="absolute bottom-0 left-0 right-0 h-56 bg-gradient-to-t from-[#1a1d2e]/95 via-[#1e222d]/50 to-transparent" />
      
      {/* ===== FOREGROUND DEPTH ELEMENTS ===== */}
      {/* Subtle particle effects - floating data points, count scales with activity */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[
          { left: '15%', top: '25%', delay: '0s', duration: '8s', color: '#22d3ee' },
          { left: '45%', top: '30%', delay: '2s', duration: '10s', color: '#3b82f6' },
          { left: '75%', top: '28%', delay: '4s', duration: '9s', color: '#a855f7' },
          { left: '30%', top: '45%', delay: '1s', duration: '11s', color: '#22c55e' },
          { left: '60%', top: '42%', delay: '3s', duration: '7s', color: '#eab308' },
          { left: '85%', top: '38%', delay: '5s', duration: '12s', color: '#ec4899' },
          { left: '20%', top: '35%', delay: '6s', duration: '9s', color: '#14b8a6' },
          { left: '70%', top: '50%', delay: '7s', duration: '10s', color: '#f97316' },
        ].slice(0, Math.max(4, Math.floor(6 + activityLevel * 4))).map((particle, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full opacity-20"
            style={{
              left: particle.left,
              top: particle.top,
              backgroundColor: particle.color,
              boxShadow: `0 0 6px ${particle.color}`,
              animation: `float-drift ${particle.duration} ease-in-out infinite`,
              animationDelay: particle.delay
            }}
          />
        ))}
      </div>
      
      {/* Scan lines effect for tech feel - very subtle */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)'
      }} />
      
      {/* ===== DIGITAL RAIN PARTICLES ===== */}
      <div className="absolute inset-0 top-0 h-3/5 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-0.5 h-3 bg-gradient-to-b from-[#22d3ee]/20 to-transparent"
            style={{
              left: `${Math.random() * 100}%`,
              top: '-5%',
              animation: `float-drift ${15 + Math.random() * 10}s linear infinite`,
              animationDelay: `${Math.random() * 5}s`,
              opacity: 0.05 + Math.random() * 0.05
            }}
          />
        ))}
      </div>
      
    </div>
  );
}
