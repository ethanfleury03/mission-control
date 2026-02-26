/**
 * Agent Popup - Shows above agent's head when clicked
 * Task assignment, chat, controls
 */

import React, { useState } from 'react';
import { Agent, AgentTask } from '../types/agent';

interface AgentPopupProps {
  agent: Agent;
  position: { x: number; y: number };
  onClose: () => void;
  onAssignTask: (task: Partial<AgentTask>) => void;
  onChat: (message: string) => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onUpdateInstructions: (instructions: string) => void;
}

export const AgentPopup: React.FC<AgentPopupProps> = ({
  agent,
  position,
  onClose,
  onAssignTask,
  onChat,
  onPause,
  onResume,
  onRestart,
  onUpdateInstructions
}) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'chat' | 'settings'>('tasks');
  const [newTaskName, setNewTaskName] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [instructions, setInstructions] = useState(agent.instructions || '');

  const handleAssignTask = () => {
    if (!newTaskName.trim()) return;
    onAssignTask({
      name: newTaskName,
      description: '',
      status: 'pending',
      priority: 'medium'
    });
    setNewTaskName('');
  };

  const handleSendChat = () => {
    if (!chatMessage.trim()) return;
    onChat(chatMessage);
    setChatMessage('');
  };

  const handleUpdateInstructions = () => {
    onUpdateInstructions(instructions);
  };

  const getStatusBadge = () => {
    const colors = {
      working: '#22c55e',
      idle: '#6b7280',
      paused: '#eab308',
      error: '#ef4444'
    };
    return (
      <span style={{
        background: colors[agent.status],
        color: '#fff',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        textTransform: 'uppercase'
      }}>
        {agent.status}
      </span>
    );
  };

  return (
    <div 
      className="agent-popup"
      style={{
        position: 'absolute',
        left: position.x - 125,
        top: position.y,
        width: 250,
        background: '#fff',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        zIndex: 100,
        overflow: 'hidden',
        animation: 'popup-in 0.2s ease'
      }}
    >
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#fff',
        padding: '12px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>{agent.name}</div>
          <div style={{ fontSize: '11px', opacity: 0.8 }}>{agent.role}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {getStatusBadge()}
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#fff',
              width: 24,
              height: 24,
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb'
      }}>
        {(['tasks', 'chat', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              background: activeTab === tab ? '#fff' : 'transparent',
              borderBottom: activeTab === tab ? '2px solid #667eea' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: activeTab === tab ? 600 : 400,
              textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        {activeTab === 'tasks' && (
          <div>
            {/* Current Task */}
            {agent.currentTask && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                  Current Task
                </div>
                <div style={{
                  background: '#f3f4f6',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '13px'
                }}>
                  <div style={{ fontWeight: 600 }}>{agent.currentTask.name}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                    Progress: {agent.currentTask.progress}%
                  </div>
                  <div style={{
                    width: '100%',
                    height: 4,
                    background: '#e5e7eb',
                    borderRadius: 2,
                    marginTop: '6px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${agent.currentTask.progress}%`,
                      height: '100%',
                      background: '#22c55e',
                      borderRadius: 2
                    }} />
                  </div>
                </div>
              </div>
            )}

            {/* Assign New Task */}
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                Assign New Task
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Task name..."
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAssignTask()}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                />
                <button
                  onClick={handleAssignTask}
                  style={{
                    padding: '8px 16px',
                    background: '#667eea',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Assign
                </button>
              </div>
            </div>

            {/* Queue */}
            {agent.taskQueue.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                  Queue ({agent.taskQueue.length})
                </div>
                {agent.taskQueue.slice(0, 3).map((task, idx) => (
                  <div key={idx} style={{
                    padding: '8px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    marginBottom: '4px',
                    fontSize: '12px'
                  }}>
                    {task.name}
                  </div>
                ))}
                {agent.taskQueue.length > 3 && (
                  <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>
                    +{agent.taskQueue.length - 3} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div>
            <div style={{
              height: 120,
              background: '#f9fafb',
              borderRadius: '8px',
              padding: '10px',
              overflowY: 'auto',
              fontSize: '12px',
              marginBottom: '12px'
            }}>
              {agent.chatHistory?.length === 0 ? (
                <div style={{ color: '#9ca3af', textAlign: 'center', marginTop: '40px' }}>
                  No messages yet
                </div>
              ) : (
                agent.chatHistory?.map((msg, idx) => (
                  <div key={idx} style={{ marginBottom: '8px' }}>
                    <span style={{ color: '#6b7280', fontSize: '10px' }}>
                      {msg.from}:
                    </span>
                    <div>{msg.message}</div>
                  </div>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Message agent..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}
              />
              <button
                onClick={handleSendChat}
                style={{
                  padding: '8px 16px',
                  background: '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            {/* Instructions */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                System Instructions
              </div>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
              <button
                onClick={handleUpdateInstructions}
                style={{
                  marginTop: '8px',
                  padding: '6px 12px',
                  background: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Update Instructions
              </button>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {agent.status === 'working' && (
                <button
                  onClick={onPause}
                  style={{
                    padding: '8px 16px',
                    background: '#eab308',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ⏸️ Pause
                </button>
              )}
              {(agent.status === 'paused' || agent.status === 'idle') && (
                <button
                  onClick={onResume}
                  style={{
                    padding: '8px 16px',
                    background: '#22c55e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ▶️ Resume
                </button>
              )}
              <button
                onClick={onRestart}
                style={{
                  padding: '8px 16px',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                🔄 Restart
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
