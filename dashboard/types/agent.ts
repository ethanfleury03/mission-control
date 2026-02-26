/**
 * Agent Office Types
 */

export type AgentRole = 'sales' | 'support' | 'marketing' | 'developer';

export type AgentStatus = 'idle' | 'working' | 'paused' | 'error';

export interface AgentTask {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  progress: number; // 0-100
  assignedAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

export interface ChatMessage {
  from: 'user' | 'agent';
  message: string;
  timestamp: string;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  avatar?: string;
  instructions: string;
  currentTask?: AgentTask;
  taskQueue: AgentTask[];
  chatHistory: ChatMessage[];
  sessionId?: string; // OpenClaw session key
  capabilities: string[]; // Tools/skills this agent can use
  workingHours?: {
    start: string; // "09:00"
    end: string;   // "17:00"
    timezone: string;
  };
  stats: {
    tasksCompleted: number;
    tasksFailed: number;
    totalWorkTime: number; // minutes
    lastActive: string;
  };
}

export interface DeskConfig {
  id: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  agentId: string;
}

export interface OfficeConfig {
  width: number;
  height: number;
  desks: DeskConfig[];
}

export interface AgentSpawnRequest {
  task: string;
  role: AgentRole;
  priority?: 'low' | 'medium' | 'high';
  instructions?: string;
  timeout?: number; // seconds
}

export interface AgentSpawnResponse {
  agentId: string;
  sessionKey: string;
  status: 'started' | 'error';
  error?: string;
}
