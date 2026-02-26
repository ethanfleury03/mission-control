/**
 * Island Architecture Map - React Flow Data
 * ClawdBot in center, islands in perfect circle
 * Copied from memory/island-map-reactflow-data.ts
 */

import { Node, Edge } from '@xyflow/react';

// Island manifest type
export interface IslandManifest {
  version: string;
  lastUpdated: string;
  centerNode: CenterNode;
  islands: Island[];
  layout: LayoutConfig;
}

export interface CenterNode {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  icon: string;
  color: string;
}

export interface IslandFeature {
  id: string;
  name: string;
  description: string;
  type: 'tool' | 'skill' | 'channel' | 'system' | 'file' | 'policy';
  status: 'active' | 'pending' | 'experimental';
}

export interface Island {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: 'active' | 'pending' | 'experimental' | 'planned';
  featureCount: number;
  folderPath: string;
  features?: IslandFeature[];
}

export interface LayoutConfig {
  centerRadius: number;
  islandRadius: number;
  islandSize: number;
}

// Default manifest (can be loaded from JSON)
export const defaultManifest: IslandManifest = {
  version: "1.0",
  lastUpdated: "2026-02-08",
  centerNode: {
    id: "clawdbot-core",
    name: "ClawdBot",
    subtitle: "Sasha",
    description: "AI Assistant running on OpenClaw platform",
    icon: "🤖",
    color: "#6366f1"
  },
  islands: [
    {
      id: "skills-automations",
      name: "Skills & Automations",
      description: "Tools, skills, and automated task execution",
      icon: "🛠️",
      color: "#10b981",
      status: "active",
      featureCount: 11,
      folderPath: "memory/islands/skills-automations",
      features: [
        { id: "read", name: "read", description: "Read files & images", type: "tool", status: "active" },
        { id: "write", name: "write", description: "Create/overwrite files", type: "tool", status: "active" },
        { id: "edit", name: "edit", description: "Surgical text edits", type: "tool", status: "active" },
        { id: "exec", name: "exec", description: "Shell commands", type: "tool", status: "active" },
        { id: "web-search", name: "web_search", description: "Brave Search API", type: "tool", status: "active" },
        { id: "web-fetch", name: "web_fetch", description: "URL content extraction", type: "tool", status: "active" },
        { id: "image", name: "image", description: "Vision model analysis", type: "tool", status: "active" },
        { id: "tts", name: "tts", description: "Text-to-speech", type: "tool", status: "active" },
        { id: "cron", name: "cron", description: "Scheduled jobs", type: "tool", status: "active" },
        { id: "gog", name: "gog", description: "Google Workspace", type: "skill", status: "active" },
        { id: "weather", name: "weather", description: "Weather forecasts", type: "skill", status: "active" },
      ]
    },
    {
      id: "discord-setup",
      name: "Discord Setup",
      description: "Discord integration, channels, roles, and messaging",
      icon: "💬",
      color: "#5865F2",
      status: "active",
      featureCount: 8,
      folderPath: "memory/islands/discord-setup",
      features: [
        { id: "send", name: "Send Messages", description: "DMs and channel posts", type: "channel", status: "active" },
        { id: "read", name: "Read History", description: "Channel message history", type: "channel", status: "active" },
        { id: "react", name: "Reactions", description: "Emoji reactions", type: "channel", status: "active" },
        { id: "threads", name: "Threads", description: "Create/manage threads", type: "channel", status: "active" },
        { id: "polls", name: "Polls", description: "Create polls", type: "channel", status: "active" },
        { id: "events", name: "Events", description: "Server events", type: "channel", status: "active" },
        { id: "voice", name: "Voice Status", description: "Voice channel updates", type: "channel", status: "active" },
        { id: "channels", name: "Channel Mgmt", description: "Create/edit channels", type: "channel", status: "active" },
      ]
    },
    {
      id: "mission-control",
      name: "Mission Control",
      description: "Central dashboard and management interface",
      icon: "🎮",
      color: "#f97316",
      status: "active",
      featureCount: 5,
      folderPath: "memory/islands/mission-control",
      features: [
        { id: "dashboard", name: "Dashboard", description: "Overview & quick actions", type: "system", status: "active" },
        { id: "map", name: "MAP", description: "Visual architecture map", type: "system", status: "active" },
        { id: "team", name: "Team", description: "Org chart & management", type: "system", status: "active" },
        { id: "agents", name: "Agents", description: "Sub-agents & sessions", type: "system", status: "active" },
        { id: "settings", name: "Settings", description: "Configuration panel", type: "system", status: "active" },
      ]
    },
    {
      id: "dashboards",
      name: "Dashboards",
      description: "Analytics, monitoring, and visualization",
      icon: "📊",
      color: "#06b6d4",
      status: "active",
      featureCount: 3,
      folderPath: "memory/islands/dashboards",
      features: [
        { id: "system-status", name: "System Status", description: "Gateway & node health", type: "system", status: "active" },
        { id: "activity", name: "Activity Feed", description: "Recent actions log", type: "system", status: "active" },
        { id: "analytics", name: "Analytics", description: "Usage & cost metrics", type: "system", status: "active" },
      ]
    },
    {
      id: "memory-systems",
      name: "Memory Systems",
      description: "Persistent storage, knowledge, and recall",
      icon: "🧠",
      color: "#8b5cf6",
      status: "active",
      featureCount: 8,
      folderPath: "memory/islands/memory-systems",
      features: [
        { id: "memory-md", name: "MEMORY.md", description: "Long-term curated memory", type: "file", status: "active" },
        { id: "daily-logs", name: "Daily Logs", description: "Session recordings", type: "file", status: "active" },
        { id: "agents-md", name: "AGENTS.md", description: "Workspace rules", type: "file", status: "active" },
        { id: "soul-md", name: "SOUL.md", description: "Personality config", type: "file", status: "active" },
        { id: "user-md", name: "USER.md", description: "User context", type: "file", status: "active" },
        { id: "tools-md", name: "TOOLS.md", description: "Quick reference", type: "file", status: "active" },
        { id: "search", name: "memory_search", description: "Semantic search", type: "tool", status: "active" },
        { id: "get", name: "memory_get", description: "Snippet reader", type: "tool", status: "active" },
      ]
    },
    {
      id: "browser-web",
      name: "Browser & Web",
      description: "Browser automation and web control",
      icon: "🌐",
      color: "#0ea5e9",
      status: "active",
      featureCount: 2,
      folderPath: "memory/islands/browser-web",
      features: [
        { id: "browser", name: "Browser", description: "Full browser automation", type: "tool", status: "active" },
        { id: "canvas", name: "Canvas", description: "Canvas presentation", type: "tool", status: "active" },
      ]
    },
    {
      id: "security-access",
      name: "Security & Access",
      description: "Access control, policies, and security",
      icon: "🔒",
      color: "#eab308",
      status: "active",
      featureCount: 3,
      folderPath: "memory/islands/security-access",
      features: [
        { id: "email-allowlist", name: "Email Allowlist", description: "Domain restrictions", type: "policy", status: "active" },
        { id: "access-control", name: "Access Control", description: "User permissions", type: "policy", status: "active" },
        { id: "blocklist", name: "Blocklist", description: "Banned platforms", type: "policy", status: "active" },
      ]
    }
  ],
  layout: {
    centerRadius: 0,
    islandRadius: 350,
    islandSize: 120
  }
};

// Node data interfaces
export interface CenterNodeData {
  label: string;
  subtitle: string;
  description: string;
  icon: string;
  color: string;
  islandCount: number;
  [key: string]: any;
}

export interface IslandNodeData {
  label: string;
  description: string;
  icon: string;
  color: string;
  status: 'active' | 'pending' | 'experimental' | 'planned';
  featureCount: number;
  folderPath: string;
  [key: string]: any;
}

// Calculate perfect circle positions
function calculateCirclePositions(count: number, radius: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  const angleStep = (2 * Math.PI) / count;
  
  // Start from top (-90 degrees)
  for (let i = 0; i < count; i++) {
    const angle = (i * angleStep) - (Math.PI / 2);
    positions.push({
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
    });
  }
  
  return positions;
}

// Generate nodes from manifest
export function generateIslandNodes(manifest: IslandManifest = defaultManifest): Node<CenterNodeData | IslandNodeData>[] {
  const nodes: Node<CenterNodeData | IslandNodeData>[] = [];
  const { centerNode, islands, layout } = manifest;
  
  // Center node - ClawdBot
  nodes.push({
    id: centerNode.id,
    type: 'centerNode',
    position: { x: 0, y: 0 },
    data: {
      label: centerNode.name,
      subtitle: centerNode.subtitle,
      description: centerNode.description,
      icon: centerNode.icon,
      color: centerNode.color,
      islandCount: islands.length,
    },
  });
  
  // Island nodes in perfect circle
  const positions = calculateCirclePositions(islands.length, layout.islandRadius);
  
  islands.forEach((island, index) => {
    const pos = positions[index];
    nodes.push({
      id: island.id,
      type: 'islandNode',
      position: pos,
      data: {
        label: island.name,
        description: island.description,
        icon: island.icon,
        color: island.color,
        status: island.status,
        featureCount: island.featureCount,
        folderPath: island.folderPath,
      },
    });
  });
  
  return nodes;
}

// Generate edges from center to each island
export function generateIslandEdges(manifest: IslandManifest = defaultManifest): Edge[] {
  const edges: Edge[] = [];
  const { centerNode, islands } = manifest;
  
  islands.forEach((island) => {
    edges.push({
      id: `${centerNode.id}-${island.id}`,
      source: centerNode.id,
      target: island.id,
      type: 'smoothstep',
      animated: true,
      style: {
        stroke: island.color,
        strokeWidth: 3,
        opacity: 0.8,
      },
    });
  });
  
  return edges;
}

// Export default data
export const islandNodes = generateIslandNodes();
export const islandEdges = generateIslandEdges();

// Helper functions
export function getIslandById(id: string, manifest: IslandManifest = defaultManifest): Island | undefined {
  return manifest.islands.find(i => i.id === id);
}

export function addIsland(
  manifest: IslandManifest,
  island: Omit<Island, 'folderPath'>
): IslandManifest {
  const newIsland: Island = {
    ...island,
    folderPath: `memory/islands/${island.id}`,
  };
  
  return {
    ...manifest,
    islands: [...manifest.islands, newIsland],
    lastUpdated: new Date().toISOString().split('T')[0],
  };
}

export function removeIsland(manifest: IslandManifest, islandId: string): IslandManifest {
  return {
    ...manifest,
    islands: manifest.islands.filter(i => i.id !== islandId),
    lastUpdated: new Date().toISOString().split('T')[0],
  };
}

// Recalculate positions for any island count
export function recalculatePositions(islandCount: number, radius: number = 500): Array<{ x: number; y: number }> {
  return calculateCirclePositions(islandCount, radius);
}

// Generate feature nodes for drill-down view
export interface FeatureNodeData {
  label: string;
  description: string;
  type: string;
  status: string;
  color: string;
  [key: string]: any;
}

export function generateFeatureNodes(island: Island, radius: number = 280): Node<FeatureNodeData>[] {
  const nodes: Node<FeatureNodeData>[] = [];
  
  if (!island.features || island.features.length === 0) {
    return nodes;
  }
  
  // Center node - the island itself (larger, in center)
  nodes.push({
    id: 'island-center',
    type: 'islandCenter',
    position: { x: 0, y: 0 },
    data: {
      label: island.name,
      description: island.description,
      icon: island.icon,
      color: island.color,
      featureCount: island.features.length,
    } as any,
  });
  
  // Feature nodes in circle around island
  const positions = calculateCirclePositions(island.features.length, radius);
  
  island.features.forEach((feature, index) => {
    const pos = positions[index];
    nodes.push({
      id: `feature-${feature.id}`,
      type: 'featureNode',
      position: pos,
      data: {
        label: feature.name,
        description: feature.description,
        type: feature.type,
        status: feature.status,
        color: island.color,
      },
    });
  });
  
  return nodes;
}

// Generate edges from island center to features
export function generateFeatureEdges(island: Island): Edge[] {
  const edges: Edge[] = [];
  
  if (!island.features) return edges;
  
  island.features.forEach((feature) => {
    edges.push({
      id: `center-${feature.id}`,
      source: 'island-center',
      target: `feature-${feature.id}`,
      type: 'smoothstep',
      animated: true,
      style: {
        stroke: island.color,
        strokeWidth: 2,
        opacity: 0.6,
      },
    });
  });
  
  return edges;
}
