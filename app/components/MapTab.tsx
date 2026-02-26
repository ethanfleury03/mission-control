'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { cn } from '../lib/utils';
import { 
  defaultManifest, 
  generateIslandNodes, 
  generateIslandEdges,
  IslandNodeData,
  CenterNodeData,
  Island,
} from '../lib/islandMapData';
import { BentoIslandView } from './BentoIslandView';

// ===== CUSTOM NODE COMPONENTS =====

function CenterNodeComponent({ data }: { data: CenterNodeData }) {
  return (
    <div 
      className="relative flex flex-col items-center justify-center cursor-pointer group"
      style={{ width: 160, height: 160 }}
    >
      <div 
        className="absolute inset-0 rounded-full blur-xl opacity-40"
        style={{ backgroundColor: data.color }}
      />
      <div 
        className="relative w-32 h-32 rounded-full flex flex-col items-center justify-center border-4 shadow-2xl"
        style={{ 
          backgroundColor: data.color,
          borderColor: `${data.color}80`,
          boxShadow: `0 0 60px ${data.color}40`
        }}
      >
        <span className="text-5xl">{data.icon}</span>
        <span className="text-white font-bold text-lg mt-1">{data.label}</span>
        <span className="text-white/70 text-xs">{data.subtitle}</span>
      </div>
      <div className="absolute -bottom-2 bg-bg-tertiary border border-white/20 px-3 py-1 rounded-full">
        <span className="text-xs text-text-secondary">{data.islandCount} islands</span>
      </div>
    </div>
  );
}

function IslandNodeComponent({ data }: { data: IslandNodeData }) {
  const isPending = data.status === 'pending';
  return (
    <div 
      className={cn(
        "relative flex flex-col items-center cursor-pointer group transition-transform hover:scale-105",
        isPending && "opacity-60"
      )}
      style={{ width: 140, height: 140 }}
    >
      <div 
        className="absolute inset-2 rounded-full blur-lg opacity-30"
        style={{ backgroundColor: data.color }}
      />
      <div 
        className="relative w-24 h-24 rounded-full flex flex-col items-center justify-center border-2 shadow-lg"
        style={{ 
          backgroundColor: `${data.color}20`,
          borderColor: data.color,
          boxShadow: `0 0 30px ${data.color}30`
        }}
      >
        <span className="text-3xl">{data.icon}</span>
        <span className="text-white font-semibold text-xs mt-1 text-center px-2">
          {data.label.split(' ').slice(0, 2).join(' ')}
        </span>
      </div>
      <div 
        className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ backgroundColor: data.color, color: '#fff' }}
      >
        {data.featureCount}
      </div>
    </div>
  );
}

const nodeTypes = {
  centerNode: CenterNodeComponent,
  islandNode: IslandNodeComponent,
};

// ===== OVERVIEW COMPONENT =====

function MapOverview({ 
  onSelectIsland 
}: { 
  onSelectIsland: (island: Island) => void;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const { fitView } = useReactFlow();
  
  const nodes = useMemo(() => generateIslandNodes(defaultManifest), []);
  const edges = useMemo(() => generateIslandEdges(defaultManifest), []);
  
  const [reactFlowNodes, setReactFlowNodes, onNodesChange] = useNodesState(nodes);
  const [reactFlowEdges, setReactFlowEdges, onEdgesChange] = useEdgesState(edges);

  // Fit view on mount
  useEffect(() => {
    const timeout = setTimeout(() => {
      fitView({ padding: 0.15, duration: 600 });
    }, 100);
    return () => clearTimeout(timeout);
  }, [fitView]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'islandNode') {
      const island = defaultManifest.islands.find(i => i.id === node.id);
      if (island) {
        onSelectIsland(island);
      }
    }
  }, [onSelectIsland]);

  return (
    <>
      <ReactFlow
        nodes={reactFlowNodes}
        edges={reactFlowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, duration: 800 }}
        minZoom={0.4}
        maxZoom={2}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnDrag={false}
        attributionPosition="bottom-left"
        translateExtent={[[-800, -600], [800, 600]]}
      >
        <Background color="#334155" gap={20} size={1} />
        <Controls className="bg-bg-secondary border border-white/10 shadow-xl" />
        
        {/* Add Island Button */}
        <Panel position="top-right" className="m-4">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent-cyan/10 hover:bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 rounded-lg transition-colors"
          >
            <span>+</span>
            <span className="text-sm font-medium">Add Island</span>
          </button>
        </Panel>
        
        {/* View indicator */}
        <Panel position="top-center" className="m-4">
          <div className="bg-bg-secondary/90 backdrop-blur border border-white/10 rounded-full px-4 py-2">
            <span className="text-sm text-text-secondary">🏝️ Overview</span>
          </div>
        </Panel>
        
        {/* Legend */}
        <Panel position="bottom-left" className="m-4">
          <div className="bg-bg-secondary/90 backdrop-blur border border-white/10 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-text-secondary mb-2">Legend</h4>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#6366f1]" />
                <span className="text-xs text-text-muted">Core</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#10b981]" />
                <span className="text-xs text-text-muted">Active</span>
              </div>
            </div>
          </div>
        </Panel>
      </ReactFlow>
      
      {/* Add Island Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-secondary border border-white/10 rounded-xl p-6 w-96">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Add New Island</h3>
            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="Island name"
                className="w-full px-3 py-2 bg-bg-tertiary border border-white/10 rounded-lg text-sm"
              />
              <input 
                type="text" 
                placeholder="Description"
                className="w-full px-3 py-2 bg-bg-tertiary border border-white/10 rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-2 mt-6">
              <button 
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 bg-bg-tertiary hover:bg-white/5 text-text-secondary rounded-lg text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 bg-accent-cyan/10 hover:bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 rounded-lg text-sm"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ===== MAIN COMPONENT =====

function MapTabInner() {
  const [selectedIsland, setSelectedIsland] = useState<Island | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleSelectIsland = useCallback((island: Island) => {
    setIsTransitioning(true);
    // Small delay for smooth transition
    setTimeout(() => {
      setSelectedIsland(island);
      setIsTransitioning(false);
    }, 200);
  }, []);

  const handleBackToOverview = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setSelectedIsland(null);
      setIsTransitioning(false);
    }, 200);
  }, []);

  return (
    <div className={cn(
      "flex-1 h-full transition-opacity duration-200",
      isTransitioning && "opacity-50"
    )}>
      {selectedIsland ? (
        <BentoIslandView 
          island={selectedIsland} 
          onBack={handleBackToOverview}
        />
      ) : (
        <MapOverview onSelectIsland={handleSelectIsland} />
      )}
    </div>
  );
}

export function MapTab() {
  return (
    <ReactFlowProvider>
      <MapTabInner />
    </ReactFlowProvider>
  );
}
