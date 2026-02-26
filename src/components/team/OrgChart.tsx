/**
 * OrgChart.tsx
 * Main org chart component with React Flow, drag/drop, auto-layout, and search
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  Panel,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CustomOrgNode } from './CustomOrgNode';
import { OrgNode, OrgEdge, OrgNodeData, DropZone, ReorganizeAction } from './types';
import { Search, LayoutGrid, Plus, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

// Import data and layout
import { departmentColors, initialNodes as staticInitialNodes, initialEdges as staticInitialEdges, calculateTreeLayout } from '../../../app/lib/orgChartData';
import { autoLayoutNodes, filterNodesBySearch } from '../../../app/lib/autoLayout';

const nodeTypes = {
  orgNode: CustomOrgNode,
};

interface OrgChartProps {
  onNodeSelect?: (nodeId: string, data: OrgNodeData) => void;
  onReorganize?: (action: ReorganizeAction) => void;
  onAddNode?: () => void;
  onEditNode?: (nodeId: string) => void;
  readOnly?: boolean;
}

function OrgChartInner({ onNodeSelect, onReorganize, onAddNode, onEditNode, readOnly = false }: OrgChartProps) {
  // Don't use store at all - React Flow manages everything

  // Storage key for persisting node positions
  const STORAGE_KEY = 'orgchart-positions-v1';

  // Calculate initial layout once and memoize it
  const initialNodes = React.useMemo((): Node[] => {
    // Try to restore positions from sessionStorage
    if (typeof window !== 'undefined') {
      try {
        const savedPositions = sessionStorage.getItem(STORAGE_KEY);
        if (savedPositions) {
          const positions = JSON.parse(savedPositions) as Record<string, { x: number; y: number }>;
          const layoutedNodes = (staticInitialNodes as Node[]).map(node => ({
            ...node,
            position: positions[node.id] || node.position
          }));
          return JSON.parse(JSON.stringify(layoutedNodes)) as Node[];
        }
      } catch (e) {
        console.warn('Failed to restore positions:', e);
      }
    }
    
    // Fallback: calculate tree layout
    const layoutedNodes = calculateTreeLayout([...staticInitialNodes], 'shaan');
    return JSON.parse(JSON.stringify(layoutedNodes)) as Node[];
  }, []); // Empty deps - only calculate once

  const initialEdges = React.useMemo((): Edge[] => {
    // Deep clone to ensure React Flow gets a fresh copy
    return JSON.parse(JSON.stringify(staticInitialEdges)) as Edge[];
  }, []); // Empty deps - only calculate once

  // Use React Flow's state management - completely independent from Zustand store
  // Initialize with memoized static data
  const [nodes, setLocalNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setLocalEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Save node positions to sessionStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && nodes.length > 0) {
      try {
        const positions: Record<string, { x: number; y: number }> = {};
        nodes.forEach(node => {
          positions[node.id] = node.position;
        });
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
      } catch (e) {
        console.warn('Failed to save positions:', e);
      }
    }
  }, [nodes]);

  // Also save on window unload (beforeunload event)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (nodes.length > 0) {
        try {
          const positions: Record<string, { x: number; y: number }> = {};
          nodes.forEach(node => {
            positions[node.id] = node.position;
          });
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
        } catch (e) {
          console.warn('Failed to save positions:', e);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [nodes]);
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Handle node click
  const handleNodeClick = useCallback((id: string) => {
    setSelectedNode(id);
    const node = nodes.find((n) => n.id === id);
    if (node && onNodeSelect) {
      onNodeSelect(id, node.data as unknown as OrgNodeData);
    }
  }, [nodes, onNodeSelect]);

  // Handle drag start
  const handleDragStart = useCallback((id: string) => {
    setIsDragging(true);
  }, []);

  // Handle drop for hierarchy management
  const handleDrop = useCallback((draggedId: string, targetId: string, zone: DropZone) => {
    if (readOnly) return;

    const draggedNode = nodes.find((n) => n.id === draggedId);
    const targetNode = nodes.find((n) => n.id === targetId);

    if (!draggedNode || !targetNode) return;

    let action: ReorganizeAction | null = null;

    switch (zone) {
      case 'on':
        // Change manager to target
        action = {
          type: 'changeManager',
          employeeId: draggedId,
          targetId: targetId,
        };
        break;
      case 'above':
      case 'below':
        // Reorder at same level
        action = {
          type: 'reorder',
          employeeId: draggedId,
          targetId: targetId,
          direction: zone === 'above' ? 'before' : 'after',
        };
        break;
    }

    if (action && onReorganize) {
      onReorganize(action);
    }

    // Visual feedback - update local state
    if (zone === 'on') {
      // Update the dragged node's manager
      setLocalNodes((nds) =>
        nds.map((n) =>
          n.id === draggedId
            ? { ...n, data: { ...n.data, managerId: targetId } }
            : n
        )
      );

      // Update edges
      setLocalEdges((eds) => {
        // Remove old edge from previous manager
        const filtered = eds.filter((e) => e.target !== draggedId);
        // Add new edge to target
        return [
          ...filtered,
          {
            id: `e-${targetId}-${draggedId}`,
            source: targetId,
            target: draggedId,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#9ca3af', strokeWidth: 1.5 },
          },
        ];
      });
    }

    setIsDragging(false);
  }, [nodes, readOnly, onReorganize, setLocalNodes, setLocalEdges]);

  // Handle double-click for editing
  const handleNodeDoubleClick = useCallback((id: string) => {
    if (!readOnly && onEditNode) {
      onEditNode(id);
    }
  }, [readOnly, onEditNode]);

  // Handle node click via ReactFlow's onNodeClick instead of embedding in node data
  // This prevents infinite loops from recreating nodesWithHandlers
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    handleNodeClick(node.id);
  }, [handleNodeClick]);

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    handleNodeDoubleClick(node.id);
  }, [handleNodeDoubleClick]);

  // Keep drag/drop handlers in node data since CustomOrgNode needs them for drop zones
  // But make them stable to prevent infinite loops
  const nodesWithDragHandlers = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        // Remove onClick/onDoubleClick - ReactFlow handles these now
        onDragStart: handleDragStart,
        onDrop: handleDrop,
      },
    }));
  }, [nodes, handleDragStart, handleDrop]);

  // Handle connect (manual edge creation)
  const onConnect = useCallback(
    (params: Connection) => {
      if (readOnly || !params.source || !params.target) return;

      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);

      if (sourceNode && targetNode) {
        // Create confirmation action
        const action: ReorganizeAction = {
          type: 'changeManager',
          employeeId: params.target,
          targetId: params.source,
        };
        onReorganize?.(action);

        // Add edge visually
        setLocalEdges((eds) => [
          ...eds,
          {
            id: `e-${params.source}-${params.target}`,
            source: params.source,
            target: params.target,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#9ca3af', strokeWidth: 1.5 },
          },
        ]);
      }
    },
    [nodes, readOnly, onReorganize, setLocalEdges]
  );

  // Handle node drag stop
  const onNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
    setIsDragging(false);
    // React Flow already updated the position internally
    // Immediately save positions to sessionStorage after drag
    if (typeof window !== 'undefined') {
      try {
        const updatedNodes = nodes.map(n => 
          n.id === node.id ? { ...n, position: node.position } : n
        );
        const positions: Record<string, { x: number; y: number }> = {};
        updatedNodes.forEach(n => {
          positions[n.id] = n.id === node.id ? node.position : n.position;
        });
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
      } catch (e) {
        console.warn('Failed to save positions after drag:', e);
      }
    }
  }, [nodes]);

  // Auto-layout function
  const handleAutoLayout = useCallback(() => {
    const layouted = autoLayoutNodes(nodes, edges, 'shaan') as Node[];
    setLocalNodes(layouted);
    // Don't update store here - let user actions update the store
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  }, [nodes, edges, setLocalNodes, fitView]);

  // Search functionality - only update if search match state actually changes
  useEffect(() => {
    if (searchQuery.trim()) {
      setLocalNodes(prev => {
        const results = filterNodesBySearch(prev, searchQuery);
        const resultIds = new Set(results.map(n => n.id));
        setSearchResults(Array.from(resultIds));
        
        // Only update nodes if search match state changed
        const needsUpdate = prev.some(n => {
          const wasMatch = (n.data as Record<string, unknown>).isSearchMatch || false;
          const isMatch = resultIds.has(n.id);
          return wasMatch !== isMatch;
        });
        
        if (!needsUpdate) return prev;
        
        return prev.map(n => ({
          ...n,
          data: { ...n.data, isSearchMatch: resultIds.has(n.id) }
        }));
      });
    } else {
      setSearchResults([]);
      setLocalNodes(prev => {
        // Only update if any nodes have isSearchMatch set
        const needsUpdate = prev.some(n => (n.data as Record<string, unknown>).isSearchMatch);
        if (!needsUpdate) return prev;
        
        return prev.map(n => ({
          ...n,
          data: { ...n.data, isSearchMatch: false }
        }));
      });
    }
  }, [searchQuery, setLocalNodes]);

  // Fit view to show all nodes
  const fitViewOptions = useMemo(
    () => ({
      padding: 0.2,
      includeHiddenNodes: false,
    }),
    []
  );

  // Stats for display
  const stats = useMemo(() => {
    const total = nodes.length;
    const byDept = nodes.reduce((acc, n) => {
      const dept = (n.data as OrgNodeData).department;
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const managers = nodes.filter((n) => {
      const dr = (n.data as OrgNodeData).directReports;
      return Array.isArray(dr) && dr.length > 0;
    }).length;
    return { total, byDept, managers };
  }, [nodes]);

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
      <ReactFlow
        nodes={nodesWithDragHandlers}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={fitViewOptions}
        attributionPosition="bottom-left"
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#9ca3af', strokeWidth: 1.5 },
        }}
        proOptions={{ hideAttribution: true }}
        style={{ backgroundColor: '#ffffff' }}
      >
        <Controls className="!bg-white !border-gray-200 !shadow-md" />
        <MiniMap
          className="!bg-white !border-gray-200 !rounded-lg !shadow-md"
          nodeStrokeWidth={3}
          zoomable
          pannable
        />

        {/* Search & Toolbar Panel */}
        <Panel position="top-left" className="!m-4">
          <div className="flex flex-col gap-3">
            {/* Search Bar */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 flex items-center gap-2 min-w-[240px]">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search team members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 text-sm text-gray-700 placeholder-gray-400 outline-none bg-transparent"
              />
              {searchQuery && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {searchResults.length}
                </span>
              )}
            </div>
          </div>
        </Panel>

        {/* Legend & Actions Panel */}
        <Panel position="top-right" className="!m-4">
          <div className="flex flex-col gap-3">
            {/* Actions Toolbar */}
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-2 flex items-center gap-1">
              {!readOnly && (
                <button
                  onClick={onAddNode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
                  title="Add new team member"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              )}
              <button
                onClick={handleAutoLayout}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-md transition-colors"
                title="Auto-layout org chart"
              >
                <LayoutGrid className="w-4 h-4" />
                <span>Layout</span>
              </button>
              <div className="w-px h-6 bg-gray-300 mx-1" />
              <button
                onClick={() => zoomOut()}
                className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => zoomIn()}
                className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => fitView({ padding: 0.2 })}
                className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                title="Fit to view"
              >
                <Maximize className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* Legend */}
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3">
              <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2">
                Departments
              </h4>
              <div className="space-y-1.5">
                {Object.entries(departmentColors).map(([dept, color]) => {
                  const count = stats.byDept[dept] || 0;
                  if (count === 0) return null;
                  return (
                    <div key={dept} className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full ring-1 ring-gray-200"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs text-gray-700">{dept}</span>
                      <span className="text-xs text-gray-500 ml-auto">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>

        {/* Instructions Panel */}
        {!readOnly && (
          <Panel position="bottom-center" className="!mb-4">
            <div className="bg-white/90 backdrop-blur rounded-lg shadow-md border border-gray-200 px-4 py-2">
              <p className="text-xs text-gray-600">
                <span className="font-medium">Drag</span> nodes to rearrange •{' '}
                <span className="font-medium">Drop on</span> node to change manager •{' '}
                <span className="font-medium">Click</span> for details •{' '}
                <span className="font-medium">Double-click</span> to edit
              </p>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export function OrgChart(props: OrgChartProps) {
  return (
    <ReactFlowProvider>
      <OrgChartInner {...props} />
    </ReactFlowProvider>
  );
}
