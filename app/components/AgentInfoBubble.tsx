'use client';

import { useState } from 'react';
import { X, Activity, Zap, Target, Edit, Check } from 'lucide-react';
import { Agent, Team } from '../lib/types';

interface AgentInfoBubbleProps {
  agent: Agent & {
    tokens: string;
    status: 'working' | 'moving' | 'idle';
  };
  teams?: Team[];
  color: string;
  onClose: () => void;
  onUpdate?: (agent: Agent) => void;
}

export function AgentInfoBubble({ agent, teams = [], color, onClose, onUpdate }: AgentInfoBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedAgent, setEditedAgent] = useState(agent);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      const response = await fetch(`http://localhost:3001/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedAgent),
      });

      if (!response.ok) {
        throw new Error('Failed to update agent');
      }

      const updatedAgent = await response.json();
      
      if (onUpdate) {
        onUpdate(updatedAgent);
      }
      
      setIsEditing(false);
      onClose();
    } catch (error) {
      console.error('Failed to save agent:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto" style={{
      bottom: 'calc(100% + 16px)',
      zIndex: 100
    }}>
      {/* Clean, large popup panel */}
      <div 
        className="relative bg-[#16161e] rounded-xl px-6 py-5 min-w-[320px] animate-slide-in"
        style={{
          border: `2px solid ${color}`,
          boxShadow: `0 0 40px ${color}60, 0 12px 40px rgba(0,0,0,0.8)`,
        }}
      >
        {/* Action buttons */}
        <div className="absolute top-3 right-3 flex gap-2">
          {/* Edit/Save toggle */}
          {teams.length > 0 && (
            <button
              onClick={() => {
                if (isEditing) {
                  handleSave();
                } else {
                  setIsEditing(true);
                }
              }}
              disabled={isSaving}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors group disabled:opacity-50"
            >
              {isEditing ? (
                <Check className="w-4 h-4 text-green-400 group-hover:text-green-300" />
              ) : (
                <Edit className="w-4 h-4 text-white/60 group-hover:text-white" />
              )}
            </button>
          )}
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
          >
            <X className="w-4 h-4 text-white/60 group-hover:text-white" />
          </button>
        </div>

        {/* Agent Header */}
        <div className="mb-4">
          {isEditing ? (
            <>
              <input
                type="text"
                value={editedAgent.name}
                onChange={(e) => setEditedAgent({ ...editedAgent, name: e.target.value })}
                className="w-full text-xl font-bold text-white mb-2 bg-white/5 border border-white/10 rounded px-2 py-1 outline-none focus:border-brand/50"
                placeholder="Agent name"
              />
              <input
                type="text"
                value={editedAgent.model}
                onChange={(e) => setEditedAgent({ ...editedAgent, model: e.target.value })}
                className="w-full text-sm uppercase tracking-wider font-medium bg-white/5 border border-white/10 rounded px-2 py-1 outline-none focus:border-brand/50"
                style={{ color }}
                placeholder="Model"
              />
              {teams.length > 0 && (
                <select
                  value={editedAgent.teamId}
                  onChange={(e) => setEditedAgent({ ...editedAgent, teamId: e.target.value })}
                  className="w-full mt-2 text-sm bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white outline-none focus:border-brand/50"
                >
                  {teams.map(team => (
                    <option key={team.id} value={team.id} className="bg-[#16161e]">
                      {team.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold text-white mb-1.5">{agent.name}</h3>
              <p className="text-sm uppercase tracking-wider font-medium" style={{ color }}>{agent.model}</p>
            </>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-[#0d0d12] rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4" style={{ color }} />
              <p className="text-[10px] text-[#71717a] uppercase font-semibold">Token Usage</p>
            </div>
            <p className="text-lg font-bold text-white">{agent.tokens}</p>
          </div>
          
          <div className="bg-[#0d0d12] rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4" style={{ color }} />
              <p className="text-[10px] text-[#71717a] uppercase font-semibold">Status</p>
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="w-2.5 h-2.5 rounded-full" 
                style={{
                  backgroundColor: agent.status === 'working' ? '#22c55e' : 
                                 agent.status === 'moving' ? '#eab308' : '#71717a',
                  boxShadow: agent.status === 'working' ? '0 0 8px #22c55e' : 
                             agent.status === 'moving' ? '0 0 8px #eab308' : 'none'
                }}
              />
              <span className="text-sm font-semibold text-white capitalize">{agent.status}</span>
            </div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="bg-[#0d0d12] rounded-lg p-3 border border-white/5 space-y-2.5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4" style={{ color }} />
            <p className="text-[10px] text-[#71717a] uppercase font-semibold">Performance Metrics</p>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#71717a]">Response Time</span>
            <span className="text-sm font-semibold text-white">0.8s avg</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#71717a]">Tasks Completed</span>
            <span className="text-sm font-semibold text-white">127</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#71717a]">Accuracy Rate</span>
            <span className="text-sm font-bold" style={{ color }}>98.3%</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#71717a]">Uptime</span>
            <span className="text-sm font-semibold text-white">23h 47m</span>
          </div>
        </div>

        {/* Top glow accent */}
        <div 
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(to right, transparent, ${color}, transparent)`,
            boxShadow: `0 0 12px ${color}`
          }}
        />
        
        {/* Side glow accents */}
        <div 
          className="absolute top-0 bottom-0 left-0 w-px"
          style={{
            background: `linear-gradient(to bottom, transparent, ${color}40, transparent)`,
          }}
        />
        <div 
          className="absolute top-0 bottom-0 right-0 w-px"
          style={{
            background: `linear-gradient(to bottom, transparent, ${color}40, transparent)`,
          }}
        />
      </div>
    </div>
  );
}
