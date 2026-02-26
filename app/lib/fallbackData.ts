import { Team, Agent } from './types';

// Fallback data when API server is unavailable
export const fallbackTeams: Team[] = [
  { id: 'team-marketing', name: 'Marketing', description: 'Marketing and content creation team', color: '#22d3ee', managerId: '2', createdAt: '2026-02-10T00:00:00Z' },
  { id: 'team-sales', name: 'Sales', description: 'Sales and lead generation team', color: '#8b5cf6', managerId: '1', createdAt: '2026-02-10T00:00:00Z' },
  { id: 'team-labels', name: 'Labels', description: 'Label and tagging operations', color: '#f59e0b', managerId: '4', createdAt: '2026-02-10T00:00:00Z' },
  { id: 'team-rip', name: 'RIP', description: 'Deprecated agents', color: '#71717a', createdAt: '2026-02-10T00:00:00Z' },
];

export const fallbackAgents: Agent[] = [
  { id: '1', name: 'Clawd', teamId: 'team-sales', isManager: true, status: 'active', model: 'CLAUDE-OPUS-4-6', runtime: 'grok-4.1-fast', lastSeen: new Date(), tokensUsed: 14000, description: 'Casual, resourceful ghost. No fluff.', tokens: '14.0K', avatarType: 'cat' },
  { id: '2', name: 'Forge', teamId: 'team-marketing', isManager: true, status: 'active', model: 'CLAUDE-OPUS-4-6', runtime: 'claude-opus-4-6', lastSeen: new Date(), tokensUsed: 8500, description: 'Code blacksmith. Debug/deploy. Git...', tokens: '8.5K', avatarType: 'robot-teal' },
  { id: '3', name: 'Athena', teamId: 'team-marketing', isManager: false, status: 'idle', model: 'GPT-4-TURBO', runtime: 'gpt-4-turbo', lastSeen: new Date(), tokensUsed: 5200, tokens: '5.2K', avatarType: 'robot-orange' },
  { id: '4', name: 'Quill', teamId: 'team-labels', isManager: true, status: 'active', model: 'CLAUDE-3-5-SONNET', runtime: 'claude-3-5-sonnet', lastSeen: new Date(), tokensUsed: 23000, tokens: '23.0K', avatarType: 'robot-purple' },
];
