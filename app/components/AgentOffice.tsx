'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';
import { AgentCard } from './AgentCard';
import { AgentTooltip } from './AgentTooltip';
import { AgentInfoBubble } from './AgentInfoBubble';
import { ServerRoomBackground } from './ServerRoomBackground';
import { DataFlowLines } from './DataFlowLines';
import { AICommandBar } from './AICommandBar';
import { AgentContextMenu } from './AgentContextMenu';
import { useAgentActivity } from '../hooks/useAgentActivity';
import { useAgents } from '../hooks/useAgents';
import { useTeams } from '../hooks/useTeams';
import { Agent, Team } from '../lib/types';
import { cn } from '../lib/utils';

// Extended Agent interface for UI
interface UIAgent extends Agent {
  tokens: string;
  status: 'working' | 'moving' | 'idle';
  selected?: boolean;
  hoverInfo: {
    model: string;
    costInfo: string;
  };
}

const GATEWAY_URL = (typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_GATEWAY_URL : undefined) || 'http://localhost:18792';
const REGISTRY_API_BASE = `${GATEWAY_URL.replace(/\/$/, '')}/mission-control/registry/agents`;

export function AgentOffice() {
  const { teams, refetch: refetchTeams } = useTeams();
  const [selectedTeam, setSelectedTeam] = useState<string>('managers');
  const { agents: rawAgents, refetch: refetchAgents, setAgents: setRawAgents } = useAgents(
    selectedTeam === 'managers' ? undefined : selectedTeam
  );
  
  // Transform API agents to UI agents
  const [agents, setAgents] = useState<UIAgent[]>([]);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [completionSparkles, setCompletionSparkles] = useState<Array<{ id: string; color: string; x: number; y: number }>>([]);
  const [showCommandBar, setShowCommandBar] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ agent: UIAgent; position: { x: number; y: number } } | null>(null);
  
  const activity = useAgentActivity(agents);
  const previousStatusRef = useRef<Record<string, string>>({});

  // Transform raw agents to UI agents
  useEffect(() => {
    let filteredAgents = rawAgents.filter((agent): agent is Agent => !!agent.id);
    
    // If "Managers" is selected, filter to only show manager agents
    if (selectedTeam === 'managers') {
      filteredAgents = filteredAgents.filter(agent => agent.isManager === true);
    }
    
    const uiAgents: UIAgent[] = filteredAgents.map((agent) => ({
      ...agent,
      lastSeen: agent.lastSeen ? new Date(agent.lastSeen) : new Date(),
      tokens: typeof agent.tokens === 'string' ? agent.tokens : `${((agent.tokensUsed || 0) / 1000).toFixed(1)}K`,
      status: (agent.status === 'active' ? 'working' : agent.status === 'idle' ? 'idle' : 'moving') as 'working' | 'moving' | 'idle',
      selected: agent.id === selectedAgentId,
      hoverInfo: {
        model: agent.model || 'Unknown',
        costInfo: `Tokens: ${typeof agent.tokens === 'string' ? agent.tokens : agent.tokensUsed ?? 0}`,
      },
    }));
    setAgents(uiAgents);
  }, [rawAgents, selectedAgentId, selectedTeam]);

  // WebSocket for real-time updates (optional - gracefully degrades when server is offline)
  useEffect(() => {
    // WebSocket connection is currently not used for agent updates via this component
    // If real-time updates for agents are needed, this method would be re-enabled
    // and the Gateway/MC API would need to expose a WebSocket endpoint for agent updates.
    // (Removed previous WebSocket logic)
  }, []);

  // Keyboard shortcut (Cmd+K for command bar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandBar(true);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAgentClick = (agentId: string) => {
    // Toggle selection
    setSelectedAgentId(prev => prev === agentId ? null : agentId);
  };

  const handleContextMenu = (agent: UIAgent, e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ agent, position: { x: e.clientX, y: e.clientY } });
  };

  const handleTeamChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTeam(event.target.value);
  };

  // Context menu action handlers
  const handleEditAgent = (agent: UIAgent) => {
    setSelectedAgentId(agent.id);
  };

  const handleDuplicateAgent = async (agent: UIAgent) => {
    try {
      const response = await fetch(`${REGISTRY_API_BASE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...agent,
          name: `${agent.name} (Copy)`,
          id: undefined,
        }),
      });
      
      if (response.ok) {
        refetchAgents();
      }
    } catch (error) {
      console.error('Failed to duplicate agent:', error);
    }
  };

  const handleMoveToTeam = async (agent: UIAgent, teamId: string) => {
    try {
      const response = await fetch(`${REGISTRY_API_BASE}/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
      
      if (response.ok) {
        refetchAgents();
      }
    } catch (error) {
      console.error('Failed to move agent:', error);
    }
  };

  const handleToggleStatus = async (agent: UIAgent) => {
    const newStatus = agent.status === 'idle' ? 'active' : 'idle';
    try {
      const response = await fetch(`${REGISTRY_API_BASE}/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (response.ok) {
        refetchAgents();
      }
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  const handleDeleteAgent = async (agent: UIAgent) => {
    try {
      const response = await fetch(`${REGISTRY_API_BASE}/${agent.id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        refetchAgents();
      }
    } catch (error) {
      console.error('Failed to delete agent:', error);
    }
  };
  
  // Get agent theme colors
  const getAgentColor = (avatarType: string | undefined) => {
    const colorMap: Record<string, string> = {
      'cat': '#22d3ee',
      'robot-teal': '#14b8a6',
      'robot-orange': '#f97316',
      'robot-purple': '#a855f7',
    };
    return avatarType ? colorMap[avatarType] || '#22d3ee' : '#22d3ee';
  };

  // Track status changes and trigger sparkle effect
  useEffect(() => {
    agents.forEach((agent, index) => {
      const prevStatus = previousStatusRef.current[agent.id];
      if (prevStatus === 'working' && agent.status === 'idle') {
        // Task completed! Trigger sparkle burst
        const positions = [22, 40, 60, 78]; // agent x positions in %
        const sparkleId = `${agent.id}-${Date.now()}`;
        setCompletionSparkles(prev => [...prev, {
          id: sparkleId,
          color: getAgentColor(agent.avatarType),
          x: positions[index],
          y: 75
        }]);
        
        // Remove sparkle after animation
        setTimeout(() => {
          setCompletionSparkles(prev => prev.filter(s => s.id !== sparkleId));
        }, 600);
      }
      previousStatusRef.current[agent.id] = agent.status;
    });
  }, [agents]);

  return (
    <div className="flex flex-col h-full w-full bg-[#0d0d12] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 w-full flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Arrow Systems Inc</h1>
        
        {/* Team Selector Dropdown */}
        <div className="relative">
          <select
            value={selectedTeam}
            onChange={handleTeamChange}
            className="appearance-none bg-[#1e1e2e] text-white border border-white/20 rounded-lg px-4 py-2 pr-10 text-sm font-medium cursor-pointer hover:bg-[#252530] hover:border-white/30 transition-all focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/50"
            style={{
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
          >
            <option value="managers">Managers</option>
            {teams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
          {/* Dropdown arrow icon */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronDown className="w-4 h-4 text-white/60" />
          </div>
        </div>
      </div>

      {/* Main Content Area - Server Room Scene */}
      <div className="flex-1 relative overflow-hidden w-full">
        <ServerRoomBackground activityLevel={activity.activityLevel} />
        
        {/* Data Flow Lines - between background and agents */}
        <DataFlowLines agents={agents} />
        
        {/* Foreground lighting effects */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Spotlight effects on agent areas - intensity scales with activity */}
          <div 
            className="absolute top-1/3 left-1/4 w-64 h-64 bg-[#22d3ee] rounded-full blur-[80px] transition-opacity duration-1000" 
            style={{ opacity: Number.isFinite(activity?.activityLevel) ? 0.03 + activity.activityLevel * 0.05 : 0.03 }}
          />
          <div 
            className="absolute top-1/3 right-1/4 w-64 h-64 bg-[#a855f7] rounded-full blur-[80px] transition-opacity duration-1000" 
            style={{ opacity: Number.isFinite(activity?.activityLevel) ? 0.03 + activity.activityLevel * 0.05 : 0.03 }}
          />
        </div>
        
        {/* Agent Desks Container - Positioned lower to show more background */}
        <div className="relative z-10 h-full flex items-end justify-center px-16 pb-16 w-full">
          <div className="grid grid-cols-4 gap-12 w-full max-w-full">
            {agents.map((agent, index) => {
              const isHovered = hoveredAgentId === agent.id;
              const showTooltip = isHovered || agent.selected;

              return (
                <div
                  key={agent.id}
                  className="flex flex-col items-center gap-3 relative"
                  onMouseEnter={() => setHoveredAgentId(agent.id)}
                  onMouseLeave={() => setHoveredAgentId(null)}
                  onContextMenu={(e) => handleContextMenu(agent, e)}
                >
                  {/* Agent Spotlight Effect */}
                  {agent.selected && (
                    <div 
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full blur-[100px] pointer-events-none transition-opacity duration-500"
                      style={{
                        background: `radial-gradient(circle, ${getAgentColor(agent.avatarType)}40 0%, transparent 70%)`,
                        opacity: 0.6,
                        zIndex: 1
                      }}
                    />
                  )}
                  {isHovered && !agent.selected && (
                    <div 
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[200px] h-[200px] rounded-full blur-[80px] pointer-events-none transition-opacity duration-300"
                      style={{
                        background: `radial-gradient(circle, ${getAgentColor(agent.avatarType)}30 0%, transparent 70%)`,
                        opacity: 0.3,
                        zIndex: 1
                      }}
                    />
                  )}

                  {/* Complete Desk Setup with Isometric Perspective */}
                  <div className="relative w-full h-40 flex items-end justify-center">
                    {/* Back wall panel - unique for each desk */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-16 bg-[#2d3748] border-2 border-[#1e293b] rounded" style={{
                      boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)'
                    }}>
                      {/* Desk-specific wall decorations */}
                      {index === 0 && (
                        // Clawd: Status monitors
                        <div className="absolute inset-2 flex gap-1">
                          <div className="flex-1 bg-[#0a0a0f] border border-[#22d3ee]/30 rounded p-1">
                            <div className="w-full h-full bg-[#22d3ee]/20" style={{
                              backgroundImage: 'linear-gradient(to bottom, #22d3ee 2px, transparent 2px)',
                              backgroundSize: '100% 4px'
                            }} />
                          </div>
                          <div className="flex-1 bg-[#0a0a0f] border border-[#3b82f6]/30 rounded p-1">
                            <div className="w-full h-full bg-[#3b82f6]/20" />
                          </div>
                        </div>
                      )}
                      {index === 1 && (
                        // Forge: Tool board
                        <div className="absolute inset-2 bg-[#334155] rounded flex items-center justify-center gap-1 flex-wrap p-1">
                          {[0,1,2,3,4,5].map(i => (
                            <div key={i} className="w-2 h-2 bg-[#22d3ee]/40 rounded-full" />
                          ))}
                        </div>
                      )}
                      {index === 2 && (
                        // Athena: Large central monitor
                        <div className="absolute inset-2 bg-[#0a0a0f] border-2 border-[#f97316]/30 rounded p-1">
                          <div className="w-full h-full bg-gradient-to-br from-[#f97316]/30 to-[#f97316]/10 rounded" />
                        </div>
                      )}
                      {index === 3 && (
                        // Quill: Multiple small screens
                        <div className="absolute inset-2 grid grid-cols-2 gap-1">
                          <div className="bg-[#a855f7]/20 border border-[#a855f7]/40 rounded" />
                          <div className="bg-[#22d3ee]/20 border border-[#22d3ee]/40 rounded" />
                        </div>
                      )}
                    </div>

                    {/* Main Desk Surface - isometric view */}
                    <div className="relative w-full h-28 bg-gradient-to-b from-[#475569] to-[#334155] rounded-lg border-2 border-[#1e293b]" style={{
                      boxShadow: '0 8px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
                    }}>
                      {/* Desk Equipment Layout */}
                      <div className="absolute inset-0 p-3 flex items-center justify-center gap-2">
                        {/* Left side - Monitor/Screen */}
                        <div className="relative w-16 h-20 bg-[#1e293b] rounded border-2 border-[#0f172a]" style={{
                          boxShadow: '0 4px 8px rgba(0,0,0,0.5)'
                        }}>
                          {/* Monitor stand */}
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-2 bg-[#334155]" />
                          {/* Screen content - varies by agent */}
                          <div className="absolute inset-1 rounded" style={{
                            background: index === 0 ? 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)' :
                                       index === 1 ? 'linear-gradient(135deg, #22d3ee 0%, #14b8a6 100%)' :
                                       index === 2 ? 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' :
                                       'linear-gradient(135deg, #a855f7 0%, #c084fc 100%)',
                            boxShadow: 'inset 0 0 12px rgba(0,0,0,0.3)'
                          }}>
                            {/* Screen glare effect */}
                            <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/20 to-transparent" />
                          </div>
                        </div>

                        {/* Center - Keyboard */}
                        <div className="relative w-20 h-8 bg-[#1e293b] rounded border border-[#0f172a]" style={{
                          boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                        }}>
                          {/* Keyboard keys pattern */}
                          <div className="absolute inset-0.5 flex flex-wrap gap-0.5 p-0.5">
                            {[...Array(12)].map((_, i) => (
                              <div key={i} className="w-1.5 h-1.5 bg-[#334155] rounded-sm" />
                            ))}
                          </div>
                        </div>

                        {/* Right side - Additional equipment */}
                        {index === 0 && (
                          // Server tower
                          <div className="w-8 h-20 bg-[#0a0a0f] border border-[#22d3ee]/40 rounded" style={{
                            boxShadow: '0 4px 8px rgba(0,0,0,0.5)'
                          }}>
                            <div className="absolute top-2 left-1 w-1 h-1 bg-[#22d3ee] rounded-full animate-pulse" />
                            <div className="absolute top-4 left-1 w-1 h-1 bg-[#22c55e] rounded-full" />
                            <div className="absolute top-6 left-1 w-1 h-1 bg-[#3b82f6] rounded-full animate-pulse" />
                          </div>
                        )}
                        {index === 1 && (
                          // Printer/device
                          <div className="w-10 h-10 bg-[#334155] border border-[#1e293b] rounded" style={{
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                          }}>
                            <div className="absolute inset-2 border-t-2 border-[#22d3ee]/30" />
                            <div className="absolute bottom-1 left-1 w-1 h-1 bg-[#22d3ee] rounded-full" />
                          </div>
                        )}
                        {index === 2 && (
                          // Tablet/secondary device
                          <div className="w-8 h-12 bg-[#1e293b] border-2 border-[#f97316]/30 rounded" style={{
                            boxShadow: '0 2px 4px rgba(0,0,0,0.4)'
                          }}>
                            <div className="absolute inset-1 bg-[#f97316]/10 rounded" />
                          </div>
                        )}
                        {index === 3 && (
                          // Dual monitors (side panel)
                          <div className="w-10 h-16 bg-[#1e293b] border border-[#0f172a] rounded flex flex-col gap-1 p-1" style={{
                            boxShadow: '0 4px 8px rgba(0,0,0,0.5)'
                          }}>
                            <div className="flex-1 bg-gradient-to-br from-[#22c55e]/30 to-[#22c55e]/10 rounded" />
                            <div className="flex-1 bg-gradient-to-br from-[#22d3ee]/30 to-[#22d3ee]/10 rounded" />
                          </div>
                        )}
                      </div>

                      {/* Desk legs/shadow for depth */}
                      <div className="absolute -bottom-2 left-4 right-4 h-2 bg-black/20 blur-sm rounded-full" />
                    </div>

                    {/* Office Chair - positioned behind agent */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-12 h-8 z-0">
                      {/* Chair back */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-6 bg-gradient-to-b from-[#334155] to-[#475569] rounded-t-lg border border-[#1e293b]" style={{
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                      }} />
                      {/* Chair seat */}
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-3 bg-gradient-to-b from-[#475569] to-[#334155] rounded-full border border-[#1e293b]" style={{
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                      }} />
                    </div>
                  </div>

                  {/* Agent Avatar */}
                  <div className="relative z-20 -mt-8">
                    {/* Show tooltip on hover (but not when info bubble is open) */}
                    {showTooltip && !agent.selected && (
                      <AgentTooltip
                        model={agent.hoverInfo.model}
                        costInfo={agent.hoverInfo.costInfo}
                        selected={agent.selected}
                      />
                    )}
                    
                    <div className="relative cursor-pointer" onClick={() => handleAgentClick(agent.id)}>
                      {agent.selected && (
                        <div className="absolute inset-0 bg-[#22d3ee]/20 rounded-full blur-xl scale-150" />
                      )}
                      <AgentAvatar avatarType={agent.avatarType} />
                      {/* Status indicator */}
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0d0d12]" style={{
                        backgroundColor: agent.status === 'working' ? '#22c55e' : 
                                       agent.status === 'moving' ? '#eab308' : 
                                       '#71717a',
                        boxShadow: agent.status === 'working' ? '0 0 8px #22c55e' : 
                                   agent.status === 'moving' ? '0 0 8px #eab308' : 
                                   'none'
                      }} />
                      {/* Show info bubble when agent is clicked/selected */}
                      {agent.selected && (
                        <AgentInfoBubble
                          agent={agent}
                          teams={teams}
                          color={getAgentColor(agent.avatarType)}
                          onClose={() => handleAgentClick(agent.id)}
                          onUpdate={(updatedAgent) => {
                            refetchAgents();
                            setSelectedAgentId(null);
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Agent Card - clickable to show info */}
                  <div onClick={() => handleAgentClick(agent.id)}>
                    <AgentCard
                      name={agent.name}
                      model={agent.model}
                      tokens={agent.tokens}
                      selected={agent.selected}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Task Completion Sparkle Bursts */}
        {completionSparkles.map(sparkle => (
          <div key={sparkle.id} className="absolute pointer-events-none" style={{ left: `${sparkle.x}%`, top: `${sparkle.y}%`, zIndex: 100 }}>
            {[...Array(8)].map((_, i) => {
              const angle = (i / 8) * Math.PI * 2;
              const distance = 40;
              return (
                <div
                  key={i}
                  className="absolute w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: sparkle.color,
                    boxShadow: `0 0 8px ${sparkle.color}`,
                    left: Math.cos(angle) * distance,
                    top: Math.sin(angle) * distance,
                    animation: 'sparkle-burst 600ms ease-out forwards',
                    animationDelay: `${i * 50}ms`
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      
      {/* AI Command Bar */}
      {showCommandBar && (
        <AICommandBar onClose={() => setShowCommandBar(false)} />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <AgentContextMenu
          agent={contextMenu.agent}
          teams={teams}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onEdit={handleEditAgent}
          onDuplicate={handleDuplicateAgent}
          onMoveToTeam={handleMoveToTeam}
          onToggleStatus={handleToggleStatus}
          onDelete={handleDeleteAgent}
        />
      )}
    </div>
  );
}
