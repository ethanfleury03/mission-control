'use client';

import { Edit, Copy, Users, Pause, Play, Trash2 } from 'lucide-react';
import { Agent, Team } from '../lib/types';
import { useState } from 'react';

interface UIAgent extends Agent {
  tokens: string;
  status: 'working' | 'moving' | 'idle';
  selected?: boolean;
  hoverInfo: {
    model: string;
    costInfo: string;
  };
}

interface AgentContextMenuProps {
  agent: UIAgent;
  teams: Team[];
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: (agent: UIAgent) => void;
  onDuplicate: (agent: UIAgent) => void;
  onMoveToTeam: (agent: UIAgent, teamId: string) => void;
  onToggleStatus: (agent: UIAgent) => void;
  onDelete: (agent: UIAgent) => void;
}

export function AgentContextMenu({
  agent,
  teams,
  position,
  onClose,
  onEdit,
  onDuplicate,
  onMoveToTeam,
  onToggleStatus,
  onDelete
}: AgentContextMenuProps) {
  const [showTeamsSubmenu, setShowTeamsSubmenu] = useState(false);

  const menuItems = [
    {
      icon: Edit,
      label: 'Edit Agent',
      action: () => {
        onEdit(agent);
        onClose();
      }
    },
    {
      icon: Copy,
      label: 'Duplicate Agent',
      action: () => {
        onDuplicate(agent);
        onClose();
      }
    },
    {
      icon: Users,
      label: 'Move to Team...',
      hasSubmenu: true,
      action: () => setShowTeamsSubmenu(!showTeamsSubmenu)
    },
    {
      icon: agent.status === 'idle' ? Play : Pause,
      label: agent.status === 'idle' ? 'Start Agent' : 'Pause Agent',
      action: () => {
        onToggleStatus(agent);
        onClose();
      }
    },
    {
      icon: Trash2,
      label: 'Delete Agent',
      danger: true,
      action: () => {
        if (confirm(`Are you sure you want to delete ${agent.name}?`)) {
          onDelete(agent);
          onClose();
        }
      }
    }
  ];

  return (
    <>
      {/* Backdrop to close on outside click */}
      <div 
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      
      {/* Context Menu */}
      <div
        className="fixed bg-[#16161e] rounded-lg border border-white/10 py-2 z-50 min-w-[200px] shadow-2xl"
        style={{
          top: position.y,
          left: position.x,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
        }}
      >
        {menuItems.map((item, idx) => (
          <div key={idx} className="relative">
            <button
              className={`w-full px-4 py-2 hover:bg-white/5 flex items-center gap-3 transition-colors text-left ${
                item.danger ? 'text-red-400 hover:text-red-300' : 'text-white'
              }`}
              onClick={item.action}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{item.label}</span>
              {item.hasSubmenu && (
                <span className="ml-auto text-gray-500">▸</span>
              )}
            </button>
            
            {/* Teams Submenu */}
            {item.hasSubmenu && showTeamsSubmenu && (
              <div
                className="absolute left-full top-0 ml-1 bg-[#16161e] rounded-lg border border-white/10 py-2 min-w-[160px] shadow-2xl"
                style={{
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                }}
              >
                {teams.map(team => (
                  <button
                    key={team.id}
                    className={`w-full px-4 py-2 hover:bg-white/5 flex items-center gap-3 transition-colors text-left ${
                      team.id === agent.teamId ? 'text-brand' : 'text-white'
                    }`}
                    onClick={() => {
                      onMoveToTeam(agent, team.id);
                      onClose();
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                    <span className="text-sm">{team.name}</span>
                    {team.id === agent.teamId && (
                      <span className="ml-auto text-xs text-gray-500">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
