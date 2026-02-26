export interface Agent {
  id: string;
  name: string;
  teamId: string;
  isManager?: boolean;
  status: 'active' | 'idle' | 'paused' | 'error' | 'working' | 'moving';
  model: string;
  runtime: string;
  lastSeen: Date;
  tokensUsed: number;
  description?: string;
  tokens?: string;
  avatarType?: 'cat' | 'robot-teal' | 'robot-orange' | 'robot-purple';
  selected?: boolean;
  hoverInfo?: {
    model: string;
    costInfo: string;
  };
}

export interface Session {
  id: string;
  agentId: string;
  agentName: string;
  model: string;
  tokens: number;
  startTime: Date;
  lastActivity: Date;
  status: 'active' | 'idle' | 'closed';
}

// Updated Task interface to match database schema
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'queue' | 'ongoing' | 'completed' | 'need_human';
  priority: 'low' | 'medium' | 'high';
  assigned_to?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  channel?: string;
  channel_id?: string;
  session_id?: string;
  message_id?: string;
  source: 'manual' | 'ai_suggested' | 'webhook';
  metadata: {
    changed_by?: string;
    changed_via?: string;
    comments?: TaskComment[];
    attachments?: string[];
    [key: string]: any;
  };
  deleted_at?: string;
  deleted_by?: string;
  tags?: string[];
}

export interface TaskComment {
  id: string;
  task_id: string;
  author: string;
  content: string;
  created_at: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  ai_summary?: string;
}

export interface TaskHistory {
  id: string;
  task_id: string;
  field_changed: string;
  old_value?: string;
  new_value?: string;
  changed_by: string;
  changed_at: string;
}

export interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  lastRun: Date;
  nextRun: Date;
  status: 'healthy' | 'warning' | 'error';
}

export interface Alert {
  id: string;
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: Date;
  acknowledged: boolean;
}

export interface ActivityDataPoint {
  timestamp: Date;
  tokens: number;
  sessions: number;
}

export interface QueueItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  age: string;
}

export interface PriorityAction {
  id: string;
  type: string;
  message: string;
  count: number;
  severity: 'info' | 'warning' | 'error';
}

export interface SystemMetrics {
  activeSessions: number;
  totalSessions: number;
  agentsOnline: number;
  agentsIdle: number;
  activityPerMin: number;
  errors60m: number;
  overdueCrons: number;
  wipTasks: number;
  blockedTasks: number;
  avgDoneTime: string;
  healthIndex: number;
  tokensTotal: number;
}

export interface DeskPosition {
  id: string;
  position: {
    x: number;
    y: number;
    label: string;
  };
  employeeId: string | null;
  level: 'executive' | 'manager' | 'employee';
}

export interface Employee {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
  timezone: string;
  reports_to: string | null;
  manages: string[];
  role_responsibilities: string;
  expertise: string;
  communication_preferences: string;
  current_projects: string;
  brain_dump: string;
  lastUpdated: string;
}

export interface OrgStructure {
  version: string;
  lastUpdated: string;
  layout: string;
  positions: DeskPosition[];
  hierarchy: Record<string, {
    title: string;
    reports?: string[];
    manages?: string[];
    reportsTo?: string;
  }>;
  metadata: {
    totalDesks: number;
    occupied: number;
    vacant: number;
  };
}

export interface Team {
  id: string;
  name: string;
  description: string;
  color: string;
  managerId?: string;
  createdAt: string;
}

export interface ParsedCommand {
  action: 'create' | 'update' | 'delete';
  entity: 'agent' | 'team';
  params: any;
}

export interface CommandResult {
  success: boolean;
  message: string;
  changes?: Array<{
    type: 'create' | 'update' | 'delete';
    entity: 'agent' | 'team';
    id: string;
    before?: any;
    after?: any;
  }>;
}
