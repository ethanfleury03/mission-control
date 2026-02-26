/**
 * Agent Desk Component - Top-down view of desk with agent
 */

import React from 'react';
import { DeskConfig, Agent } from '../types/agent';

interface AgentDeskProps {
  desk: DeskConfig;
  agent: Agent;
  isHovered: boolean;
  isSelected: boolean;
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
}

export const AgentDesk: React.FC<AgentDeskProps> = ({
  desk,
  agent,
  isHovered,
  isSelected,
  onClick,
  onHover,
  onLeave
}) => {
  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'working': return '#22c55e'; // green
      case 'idle': return '#6b7280'; // gray
      case 'paused': return '#eab308'; // yellow
      case 'error': return '#ef4444'; // red
      default: return '#6b7280';
    }
  };

  const getRoleIcon = (role: Agent['role']) => {
    switch (role) {
      case 'sales': return '💼';
      case 'support': return '🎧';
      case 'marketing': return '📢';
      case 'developer': return '💻';
      default: return '🤖';
    }
  };

  const progress = agent.currentTask?.progress || 0;
  const statusColor = getStatusColor(agent.status);
  const roleIcon = getRoleIcon(agent.role);

  return (
    <div
      className={`agent-desk ${isHovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: desk.x - 75,
        top: desk.y - 50,
        width: 150,
        height: 100,
        cursor: 'pointer',
        transform: `rotate(${desk.rotation}deg)`,
        transition: 'transform 0.2s ease'
      }}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Progress bar floating above */}
      {agent.status === 'working' && agent.currentTask && (
        <div 
          className="floating-progress"
          style={{
            position: 'absolute',
            top: -60,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.85)',
            padding: '8px 12px',
            borderRadius: '8px',
            minWidth: 140,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10
          }}
        >
          <div style={{ 
            fontSize: '11px', 
            color: '#fff',
            marginBottom: '4px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {agent.currentTask.name}
          </div>
          <div style={{
            width: '100%',
            height: 6,
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 3,
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #22c55e, #4ade80)',
              borderRadius: 3,
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ 
            fontSize: '10px', 
            color: '#aaa',
            marginTop: '2px',
            textAlign: 'right'
          }}>
            {progress}%
          </div>
        </div>
      )}

      {/* Status indicator */}
      <div 
        className="status-indicator"
        style={{
          position: 'absolute',
          top: -15,
          right: -15,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: statusColor,
          border: '3px solid #fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          zIndex: 5,
          animation: agent.status === 'working' ? 'pulse 2s infinite' : 'none'
        }}
      />

      {/* Desk surface */}
      <div 
        className="desk-surface"
        style={{
          width: 120,
          height: 70,
          background: 'linear-gradient(145deg, #d4a574 0%, #b8935f 100%)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          position: 'relative',
          border: isSelected ? '3px solid #3b82f6' : '2px solid rgba(0,0,0,0.1)'
        }}
      >
        {/* Desk items */}
        <div className="desk-items">
          {/* Computer monitor */}
          <div style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 50,
            height: 35,
            background: '#1a1a2e',
            borderRadius: '4px',
            border: '2px solid #333',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            {/* Screen glow */}
            <div style={{
              position: 'absolute',
              top: 4,
              left: 4,
              right: 4,
              bottom: 4,
              background: agent.status === 'working' 
                ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                : '#0f172a',
              borderRadius: '2px',
              opacity: agent.status === 'working' ? 0.8 : 0.3
            }} />
          </div>

          {/* Keyboard */}
          <div style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 60,
            height: 12,
            background: '#2d2d2d',
            borderRadius: '2px'
          }} />

          {/* Papers/notes */}
          <div style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 20,
            height: 25,
            background: '#fff',
            borderRadius: '2px',
            transform: 'rotate(5deg)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
          }} />

          {/* Coffee cup */}
          <div style={{
            position: 'absolute',
            bottom: 10,
            left: 15,
            width: 12,
            height: 14,
            background: '#8b4513',
            borderRadius: '0 0 6px 6px'
          }}>
            {/* Steam */}
            {agent.status === 'working' && (
              <div style={{
                position: 'absolute',
                top: -8,
                left: 2,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.3)',
                animation: 'float 2s infinite'
              }} />
            )}
          </div>
        </div>

        {/* Chair with agent */}
        <div 
          className="agent-chair"
          style={{
            position: 'absolute',
            top: desk.rotation === 0 ? '100%' : 'auto',
            bottom: desk.rotation === 180 ? '100%' : 'auto',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          {/* Chair back */}
          <div style={{
            width: 50,
            height: 45,
            background: '#4a5568',
            borderRadius: '8px 8px 4px 4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}>
            {/* Agent avatar */}
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              margin: '4px auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              border: '2px solid #fff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              {roleIcon}
            </div>
          </div>

          {/* Chair seat */}
          <div style={{
            width: 45,
            height: 8,
            background: '#4a5568',
            borderRadius: '4px',
            marginTop: -2
          }} />

          {/* Chair base */}
          <div style={{
            width: 8,
            height: 15,
            background: '#2d3748'
          }} />
          
          <div style={{
            width: 35,
            height: 6,
            background: '#2d3748',
            borderRadius: '3px'
          }} />
        </div>
      </div>

      {/* Agent name label */}
      <div style={{
        position: 'absolute',
        bottom: -30,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.8)',
        color: '#fff',
        padding: '4px 10px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        opacity: isHovered || isSelected ? 1 : 0.7,
        transition: 'opacity 0.2s'
      }}>
        {agent.name}
      </div>
    </div>
  );
};
