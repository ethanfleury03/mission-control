/**
 * Agent Office Floor - Top-down view of agent workspace
 * Video game style office with interactive desks
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AgentDesk } from './AgentDesk';
import { AgentPopup } from './AgentPopup';
import { Agent, AgentTask, OfficeConfig } from '../types/agent';

interface AgentOfficeProps {
  agents: Agent[];
  onAssignTask: (agentId: string, task: Partial<AgentTask>) => void;
  onChatWithAgent: (agentId: string, message: string) => void;
  onPauseAgent: (agentId: string) => void;
  onResumeAgent: (agentId: string) => void;
  onRestartAgent: (agentId: string) => void;
  onUpdateInstructions: (agentId: string, instructions: string) => void;
  officeConfig?: OfficeConfig;
}

const DEFAULT_OFFICE: OfficeConfig = {
  width: 800,
  height: 600,
  desks: [
    { id: 'desk-1', x: 150, y: 150, rotation: 0, agentId: 'sales' },      // Top-left
    { id: 'desk-2', x: 550, y: 150, rotation: 180, agentId: 'marketing' }, // Top-right (facing down)
    { id: 'desk-3', x: 150, y: 400, rotation: 0, agentId: 'developer' },   // Bottom-left
    { id: 'desk-4', x: 550, y: 400, rotation: 180, agentId: 'support' },    // Bottom-right (facing down)
  ]
};

export const AgentOffice: React.FC<AgentOfficeProps> = ({
  agents,
  onAssignTask,
  onChatWithAgent,
  onPauseAgent,
  onResumeAgent,
  onRestartAgent,
  onUpdateInstructions,
  officeConfig = DEFAULT_OFFICE
}) => {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  const handleDeskClick = useCallback((agent: Agent, deskX: number, deskY: number) => {
    setSelectedAgent(agent);
    // Position popup above the desk
    setPopupPosition({ 
      x: deskX, 
      y: deskY - 120 // Above the desk
    });
  }, []);

  const handleClosePopup = useCallback(() => {
    setSelectedAgent(null);
    setPopupPosition(null);
  }, []);

  // Find agent for each desk
  const getAgentForDesk = (agentId: string): Agent | undefined => {
    return agents.find(a => a.id === agentId);
  };

  return (
    <div className="agent-office-container">
      <div className="office-header">
        <h2>🏢 Agent Office Floor</h2>
        <div className="office-stats">
          <span className="stat active">
            🟢 Active: {agents.filter(a => a.status === 'working').length}
          </span>
          <span className="stat idle">
            ⚪ Idle: {agents.filter(a => a.status === 'idle').length}
          </span>
          <span className="stat paused">
            🟡 Paused: {agents.filter(a => a.status === 'paused').length}
          </span>
          <span className="stat error">
            🔴 Error: {agents.filter(a => a.status === 'error').length}
          </span>
        </div>
      </div>

      <div 
        className="office-floor"
        style={{
          width: officeConfig.width,
          height: officeConfig.height,
          background: 'linear-gradient(135deg, #e8e8e8 0%, #d0d0d0 100%)',
          borderRadius: '12px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.1)'
        }}
      >
        {/* Floor grid pattern */}
        <svg className="floor-grid" width="100%" height="100%">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Office walls/structure */}
        <div className="office-structure">
          {/* Center walkway */}
          <div className="walkway-horizontal" style={{
            position: 'absolute',
            left: 0,
            top: officeConfig.height / 2 - 30,
            width: '100%',
            height: 60,
            background: 'rgba(255,255,255,0.4)',
            borderTop: '2px solid rgba(0,0,0,0.05)',
            borderBottom: '2px solid rgba(0,0,0,0.05)'
          }} />
          
          {/* Vertical walkway */}
          <div className="walkway-vertical" style={{
            position: 'absolute',
            left: officeConfig.width / 2 - 30,
            top: 0,
            width: 60,
            height: '100%',
            background: 'rgba(255,255,255,0.4)',
            borderLeft: '2px solid rgba(0,0,0,0.05)',
            borderRight: '2px solid rgba(0,0,0,0.05)'
          }} />
        </div>

        {/* Agent Desks */}
        {officeConfig.desks.map((desk) => {
          const agent = getAgentForDesk(desk.agentId);
          if (!agent) return null;

          return (
            <AgentDesk
              key={desk.id}
              desk={desk}
              agent={agent}
              isHovered={hoveredAgent === agent.id}
              isSelected={selectedAgent?.id === agent.id}
              onClick={() => handleDeskClick(agent, desk.x, desk.y)}
              onHover={() => setHoveredAgent(agent.id)}
              onLeave={() => setHoveredAgent(null)}
            />
          );
        })}

        {/* Agent Popup */}
        {selectedAgent && popupPosition && (
          <AgentPopup
            agent={selectedAgent}
            position={popupPosition}
            onClose={handleClosePopup}
            onAssignTask={(task) => onAssignTask(selectedAgent.id, task)}
            onChat={(msg) => onChatWithAgent(selectedAgent.id, msg)}
            onPause={() => onPauseAgent(selectedAgent.id)}
            onResume={() => onResumeAgent(selectedAgent.id)}
            onRestart={() => onRestartAgent(selectedAgent.id)}
            onUpdateInstructions={(inst) => onUpdateInstructions(selectedAgent.id, inst)}
          />
        )}
      </div>

      {/* Legend */}
      <div className="office-legend">
        <div className="legend-item">
          <span className="dot working" /> Working
        </div>
        <div className="legend-item">
          <span className="dot idle" /> Idle
        </div>
        <div className="legend-item">
          <span className="dot paused" /> Paused
        </div>
        <div className="legend-item">
          <span className="dot error" /> Error
        </div>
      </div>
    </div>
  );
};
