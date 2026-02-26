/**
 * Auto-layout utilities using dagre for org chart
 */

import * as dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

interface LayoutOptions {
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
  nodesep?: number;
  ranksep?: number;
  align?: 'UL' | 'UR' | 'DL' | 'DR';
}

/**
 * Auto-layout nodes using dagre algorithm
 */
export function autoLayoutNodes(
  nodes: Node[],
  edges: Edge[],
  rootId?: string,
  options: LayoutOptions = {}
): Node[] {
  const {
    rankdir = 'TB',
    nodesep = 80,
    ranksep = 120,
    align = 'UL',
  } = options;

  // Reset graph
  dagreGraph.setGraph({
    rankdir,
    nodesep,
    ranksep,
    align,
    marginx: 50,
    marginy: 50,
  });

  // Clear previous nodes/edges
  dagreGraph.nodes().forEach((n) => dagreGraph.removeNode(n));
  dagreGraph.edges().forEach((e) => dagreGraph.removeEdge(e.v, e.w));

  // Add nodes to dagre graph
  nodes.forEach((node) => {
    const width = 240; // Node width
    const height = 140; // Node height
    dagreGraph.setNode(node.id, { width, height });
  });

  // Add edges to dagre graph
  edges.forEach((edge) => {
    if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  // Run layout algorithm
  dagre.layout(dagreGraph);

  // Extract positions and update nodes
  return nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    if (dagreNode) {
      return {
        ...node,
        position: {
          x: dagreNode.x - dagreNode.width / 2,
          y: dagreNode.y - dagreNode.height / 2,
        },
      };
    }
    return node;
  });
}

/**
 * Calculate tree layout (fallback if dagre fails)
 */
export function calculateTreeLayout(
  nodes: Node[],
  edges: Edge[],
  rootId: string
): Node[] {
  const levels: Record<number, string[]> = {};
  const visited = new Set<string>();
  const childrenMap: Record<string, string[]> = {};

  // Build children map from edges
  edges.forEach((edge) => {
    if (!childrenMap[edge.source]) childrenMap[edge.source] = [];
    childrenMap[edge.source].push(edge.target);
  });

  // BFS to calculate levels
  const queue: Array<{ id: string; level: number }> = [{ id: rootId, level: 0 }];
  while (queue.length) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    if (!levels[level]) levels[level] = [];
    levels[level].push(id);

    const children = childrenMap[id] || [];
    children.forEach((childId) => {
      queue.push({ id: childId, level: level + 1 });
    });
  }

  // Handle orphaned nodes (add them to bottom level)
  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      const maxLevel = Math.max(...Object.keys(levels).map(Number), 0);
      if (!levels[maxLevel + 1]) levels[maxLevel + 1] = [];
      levels[maxLevel + 1].push(node.id);
    }
  });

  // Calculate positions
  const VERTICAL_SPACING = 160;
  const HORIZONTAL_SPACING = 280;

  Object.entries(levels).forEach(([levelStr, nodeIds]) => {
    const level = parseInt(levelStr);
    const count = nodeIds.length;
    const totalWidth = (count - 1) * HORIZONTAL_SPACING;
    const startX = -totalWidth / 2;

    nodeIds.forEach((id, index) => {
      const node = nodes.find((n) => n.id === id);
      if (node) {
        node.position = {
          x: startX + index * HORIZONTAL_SPACING,
          y: level * VERTICAL_SPACING,
        };
      }
    });
  });

  return nodes;
}

/**
 * Get connected nodes (for highlighting search results)
 */
export function getConnectedNodes(
  nodeId: string,
  edges: Edge[],
  includeParents = true,
  includeChildren = true
): string[] {
  const connected = new Set<string>([nodeId]);

  edges.forEach((edge) => {
    if (includeChildren && edge.source === nodeId) {
      connected.add(edge.target);
    }
    if (includeParents && edge.target === nodeId) {
      connected.add(edge.source);
    }
  });

  return Array.from(connected);
}

/**
 * Filter nodes by a search query (matches against node id and data fields).
 */
export function filterNodesBySearch(nodes: Node[], query: string): Node[] {
  if (!query.trim()) return nodes;
  const lower = query.toLowerCase();
  return nodes.filter((node) => {
    if (node.id.toLowerCase().includes(lower)) return true;
    const data = node.data as Record<string, unknown>;
    return Object.values(data).some(
      (v) => typeof v === 'string' && v.toLowerCase().includes(lower),
    );
  });
}

/**
 * Check if a node is a descendant of another node
 */
export function isDescendant(
  potentialDescendant: string,
  ancestor: string,
  edges: Edge[]
): boolean {
  const childrenMap: Record<string, string[]> = {};
  edges.forEach((edge) => {
    if (!childrenMap[edge.source]) childrenMap[edge.source] = [];
    childrenMap[edge.source].push(edge.target);
  });

  const queue = [ancestor];
  const visited = new Set<string>();

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    if (current === potentialDescendant) {
      return true;
    }

    const children = childrenMap[current] || [];
    queue.push(...children);
  }

  return false;
}
