/**
 * Static org-chart data for the Team view.
 * Provides initial nodes, edges, department colour palette, and a
 * two-argument calculateTreeLayout helper used by OrgChart.tsx.
 */

import { Node, Edge } from '@xyflow/react';
import { OrgNodeData } from '../../src/components/team/types';

// ---------------------------------------------------------------------------
// Department colour palette
// ---------------------------------------------------------------------------
export const departmentColors: Record<string, string> = {
  Leadership: '#6366f1',
  Engineering: '#0ea5e9',
  Marketing: '#C41E3A',
  Sales: '#8b5cf6',
  Operations: '#f59e0b',
  Design: '#ec4899',
  Product: '#10b981',
  Finance: '#f97316',
};

// ---------------------------------------------------------------------------
// Initial nodes
// ---------------------------------------------------------------------------
type OrgChartNodeData = OrgNodeData & {
  onClick?: (id: string) => void;
  onDragStart?: (id: string) => void;
  onDrop?: (draggedId: string, targetId: string, zone: string) => void;
};

function makeNode(
  id: string,
  data: OrgNodeData,
  position: { x: number; y: number } = { x: 0, y: 0 },
): Node<OrgChartNodeData> {
  return { id, type: 'orgNode', position, data };
}

export const initialNodes: Node<OrgChartNodeData>[] = [
  makeNode('shaan', {
    id: 'shaan',
    name: 'Shaan',
    role: 'Founder',
    email: null,
    department: 'Leadership',
    level: 0,
    status: 'active',
    type: 'root',
    managerId: null,
    directReports: ['clawd', 'forge', 'athena'],
    avatar: null,
    permissions: ['admin'],
    profileFile: 'shaan.json',
  }),
  makeNode('clawd', {
    id: 'clawd',
    name: 'Clawd',
    role: 'Sales Agent',
    email: null,
    department: 'Sales',
    level: 1,
    status: 'active',
    type: 'manager',
    managerId: 'shaan',
    directReports: [],
    avatar: null,
    permissions: ['read', 'write'],
    profileFile: 'clawd.json',
  }),
  makeNode('forge', {
    id: 'forge',
    name: 'Forge',
    role: 'Engineering Agent',
    email: null,
    department: 'Engineering',
    level: 1,
    status: 'active',
    type: 'manager',
    managerId: 'shaan',
    directReports: [],
    avatar: null,
    permissions: ['read', 'write'],
    profileFile: 'forge.json',
  }),
  makeNode('athena', {
    id: 'athena',
    name: 'Athena',
    role: 'Marketing Agent',
    email: null,
    department: 'Marketing',
    level: 1,
    status: 'active',
    type: 'leaf',
    managerId: 'shaan',
    directReports: [],
    avatar: null,
    permissions: ['read'],
    profileFile: 'athena.json',
  }),
];

// ---------------------------------------------------------------------------
// Initial edges (derived from managerId relationships)
// ---------------------------------------------------------------------------
export const initialEdges: Edge[] = initialNodes
  .filter((n) => n.data.managerId !== null)
  .map((n) => ({
    id: `e-${n.data.managerId}-${n.id}`,
    source: n.data.managerId as string,
    target: n.id,
    type: 'smoothstep' as const,
    animated: false,
    style: { stroke: '#9ca3af', strokeWidth: 1.5 },
  }));

// ---------------------------------------------------------------------------
// Two-argument calculateTreeLayout
// Derives the tree structure from node.data.managerId.
// ---------------------------------------------------------------------------
export function calculateTreeLayout(
  nodes: Node<OrgChartNodeData>[],
  rootId: string,
): Node<OrgChartNodeData>[] {
  const childrenMap: Record<string, string[]> = {};
  nodes.forEach((node) => {
    const pid = node.data.managerId;
    if (typeof pid === 'string') {
      if (!childrenMap[pid]) childrenMap[pid] = [];
      childrenMap[pid].push(node.id);
    }
  });

  const levels: Record<number, string[]> = {};
  const visited = new Set<string>();
  const queue: Array<{ id: string; level: number }> = [{ id: rootId, level: 0 }];

  while (queue.length) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (!levels[level]) levels[level] = [];
    levels[level].push(id);
    (childrenMap[id] ?? []).forEach((childId) =>
      queue.push({ id: childId, level: level + 1 }),
    );
  }

  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      const maxLevel = Math.max(...Object.keys(levels).map(Number), 0);
      if (!levels[maxLevel + 1]) levels[maxLevel + 1] = [];
      levels[maxLevel + 1].push(node.id);
    }
  });

  const VERTICAL_SPACING = 200;
  const HORIZONTAL_SPACING = 300;

  const result = nodes.map((node) => ({ ...node }));

  Object.entries(levels).forEach(([levelStr, nodeIds]) => {
    const level = parseInt(levelStr, 10);
    const count = nodeIds.length;
    const startX = -((count - 1) * HORIZONTAL_SPACING) / 2;
    nodeIds.forEach((id, index) => {
      const node = result.find((n) => n.id === id);
      if (node) {
        node.position = {
          x: startX + index * HORIZONTAL_SPACING,
          y: level * VERTICAL_SPACING,
        };
      }
    });
  });

  return result;
}
