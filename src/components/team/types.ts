/**
 * TEAM Tab - TypeScript Types
 * ARRSYS Org Chart System
 */

export interface OrgNodeData {
  id: string;
  name: string;
  role: string;
  email: string | null;
  department: string;
  level: number;
  status: 'active' | 'inactive' | 'pending';
  type: 'root' | 'leaf' | 'manager';
  managerId: string | null;
  directReports: string[];
  avatar: string | null;
  permissions: string[];
  profileFile: string;
  currentProjects?: string;
  expertise?: string;
  [key: string]: unknown;
}

export interface OrgNode {
  id: string;
  type: 'orgNode';
  position: { x: number; y: number };
  data: OrgNodeData & {
    onClick?: (id: string) => void;
    onDragStart?: (id: string) => void;
    onDrop?: (draggedId: string, targetId: string, zone: DropZone) => void;
  };
}

export interface OrgEdge {
  id: string;
  source: string;
  target: string;
  type: 'smoothstep' | 'straight' | 'step';
  animated?: boolean;
  style?: {
    stroke?: string;
    strokeWidth?: number;
  };
}

export type DropZone = 'above' | 'below' | 'on' | 'left' | 'right';

export interface Department {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface PersonDetail {
  id: string;
  name: string;
  role: string;
  email: string | null;
  department: string;
  avatar: string | null;
  permissions: string[];
  level: number;
  manager: string | null;
  directReports: string[];
  brainDump: string[];
  notes: string[];
}

export interface ReorganizeAction {
  type: 'promote' | 'demote' | 'changeManager' | 'reorder' | 'remove';
  employeeId: string;
  targetId?: string;
  direction?: 'before' | 'after';
}

export interface OrgStats {
  total: number;
  byLevel: Record<number, number>;
  byDepartment: Record<string, number>;
  withEmail: number;
  managers: number;
}

export interface ProfileData {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string | null;
  permissions: string[];
  brainDump: string[];
  longTermMemory: string[];
}
