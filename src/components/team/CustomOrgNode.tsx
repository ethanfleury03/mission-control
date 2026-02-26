/**
 * CustomOrgNode.tsx
 * Modern profile card design inspired by social profile cards
 * Features banner header, overlapping avatar, stats row, and contact icons
 */

import React, { useState, useCallback } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { OrgNodeData, DropZone } from './types';
import { Mail, MessageCircle, Calendar, Briefcase, CheckCircle2, Users } from 'lucide-react';

type CustomOrgNodeData = OrgNodeData & {
  isSearchMatch?: boolean;
  onDoubleClick?: (id: string) => void;
  onClick?: (id: string) => void;
  onDragStart?: (id: string) => void;
  onDrop?: (draggedId: string, targetId: string, zone: DropZone) => void;
};

interface CustomOrgNodeProps extends NodeProps<Node<CustomOrgNodeData>> {}

// Gradient progress bar colors (like the "exp." bar in reference)
const ExperienceBar = ({ progress = 75 }: { progress?: number }) => {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-400 font-medium">exp.</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #f87171, #fbbf24, #34d399, #60a5fa, #a78bfa)'
          }}
        />
      </div>
    </div>
  );
};

// Banner background with cloud/sky effect
const BannerBackground = ({ department }: { department: string }) => {
  const deptGradients: Record<string, string> = {
    'IT/Integration': 'from-blue-400 via-blue-300 to-sky-200',
    'Development': 'from-cyan-400 via-cyan-300 to-teal-200',
    'Operations': 'from-amber-400 via-orange-300 to-yellow-200',
    'Sales': 'from-violet-400 via-purple-300 to-pink-200',
    'Marketing': 'from-pink-400 via-rose-300 to-red-200',
    'Management': 'from-gray-400 via-gray-300 to-slate-200',
    'Finance': 'from-emerald-400 via-green-300 to-teal-200',
    'HR': 'from-red-400 via-rose-300 to-pink-200',
  };
  
  const gradient = deptGradients[department] || 'from-blue-400 via-blue-300 to-sky-200';
  
  return (
    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-80`}>
      {/* Cloud effect overlay */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-2 right-4 w-16 h-8 bg-white rounded-full blur-xl" />
        <div className="absolute top-4 right-12 w-12 h-6 bg-white rounded-full blur-lg" />
        <div className="absolute bottom-4 left-8 w-20 h-10 bg-white rounded-full blur-xl" />
      </div>
    </div>
  );
};

export function CustomOrgNode({ data, id, selected }: CustomOrgNodeProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverZone, setDragOverZone] = useState<DropZone | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const hasChildren = data.directReports && data.directReports.length > 0;
  const hasManager = data.managerId !== null;
  const isSearchMatch = data.isSearchMatch;

  // Get first name
  const firstName = data.name.split(' ')[0];

  // Stats calculations
  const projectsCount = data.currentProjects?.split('\n').filter(p => p.trim()).length || 0;
  const expertiseCount = data.expertise?.split(',').length || 0;
  const teamSize = hasChildren ? data.directReports.length : 0;

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ nodeId: id, data }));
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
    data.onDragStart?.(id);
  }, [id, data]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, zone: DropZone) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverZone(zone);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setDragOverZone(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, zone: DropZone) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverZone(null);
    try {
      const draggedData = JSON.parse(e.dataTransfer.getData('application/json'));
      if (draggedData.nodeId !== id) {
        data.onDrop?.(draggedData.nodeId, id, zone);
      }
    } catch {}
  }, [id, data]);

  const handleDoubleClick = useCallback(() => {
    data.onDoubleClick?.(id);
  }, [id, data]);

  const getDropZoneClasses = (zone: DropZone): string => {
    if (dragOverZone !== zone) return 'opacity-0';
    return 'opacity-100 bg-blue-500/20 border-blue-500 border-2 border-dashed';
  };

  return (
    <div
      className={`relative transition-all duration-200 ${isDragging ? 'opacity-50' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Search Highlight */}
      {isSearchMatch && (
        <div className="absolute -inset-2 rounded-3xl bg-yellow-400/30 ring-2 ring-yellow-400 animate-pulse" />
      )}

      {/* Selection Ring */}
      {selected && (
        <div className="absolute -inset-1 rounded-3xl ring-2 ring-blue-500 ring-offset-2 ring-offset-white" />
      )}

      {/* Drop Zones */}
      {!isDragging && (
        <>
          <div className={`absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-3 rounded-full transition-all duration-150 z-20 ${getDropZoneClasses('above')}`}
            onDragOver={(e) => handleDragOver(e, 'above')} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, 'above')} />
          <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 w-24 h-3 rounded-full transition-all duration-150 z-20 ${getDropZoneClasses('below')}`}
            onDragOver={(e) => handleDragOver(e, 'below')} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, 'below')} />
          <div className={`absolute inset-0 rounded-2xl transition-all duration-150 z-10 ${getDropZoneClasses('on')}`}
            onDragOver={(e) => handleDragOver(e, 'on')} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, 'on')} />
        </>
      )}

      {/* Main Card - Modern Profile Design */}
      <div
        className={`relative bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 cursor-grab active:cursor-grabbing min-w-[260px] overflow-hidden ${
          isHovered ? 'shadow-xl scale-[1.02]' : ''
        }`}
        // onClick and onDoubleClick are now handled by ReactFlow's onNodeClick/onNodeDoubleClick
        // Only handle double-click here if needed for custom behavior
        onDoubleClick={handleDoubleClick}
      >
        {/* First Name - Centered at Top */}
        <div className="text-center pt-4 pb-2">
          <h2 className="text-xl font-bold text-gray-900">{firstName}</h2>
        </div>

        {/* Banner Header with Sky/Cloud Effect */}
        <div className="relative h-20 overflow-hidden">
          <BannerBackground department={data.department} />
          
          {/* Action Button - Top Right */}
          <button 
            className="absolute top-3 right-3 px-3 py-1.5 bg-white/90 hover:bg-white backdrop-blur-sm rounded-full text-xs font-medium text-gray-700 shadow-sm transition-all hover:shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              // Click is handled by ReactFlow's onNodeClick, but we stop propagation here
            }}
          >
            View Profile
          </button>
        </div>

        {/* Avatar - Centered, overlapping the banner */}
        <div className="relative px-5 -mt-10 mb-3 flex justify-center">
          <div className="relative">
            <div 
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold border-4 border-white shadow-lg bg-white"
              style={{ 
                background: data.avatar ? 'white' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white'
              }}
            >
              {data.avatar ? (
                <img src={data.avatar} alt={data.name} className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="drop-shadow-md">{data.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            
            {/* Status Indicator - Bottom right of avatar */}
            <div className="absolute -bottom-1 -right-1 flex items-center gap-1 bg-white rounded-full px-2 py-1 shadow-md border border-gray-100">
              <div 
                className={`w-2.5 h-2.5 rounded-full ${
                  data.status === 'active' ? 'bg-green-400' : 
                  data.status === 'inactive' ? 'bg-red-400' : 'bg-amber-400'
                }`}
              />
              <span className="text-[10px] text-gray-500 font-medium capitalize">{data.status}</span>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="px-5 pb-2">
          {/* Experience Bar */}
          <div className="mb-3">
            <ExperienceBar progress={Math.min(85, 50 + (expertiseCount * 10))} />
          </div>

          {/* Email (where name was) */}
          {data.email && (
            <h3 className="font-semibold text-gray-900 text-base leading-tight truncate">
              {data.email}
            </h3>
          )}
          
          {/* Role */}
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            {data.role}
          </p>

          {/* Department Badge */}
          <div className="mt-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600">
              {data.department}
            </span>
          </div>
        </div>

        {/* Stats Row - 3 Column Grid */}
        <div className="grid grid-cols-3 gap-px bg-gray-100 mt-3">
          <div className="bg-white p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{projectsCount}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Projects</div>
          </div>
          <div className="bg-white p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{teamSize || '-'}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Team</div>
          </div>
          <div className="bg-white p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{expertiseCount}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Skills</div>
          </div>
        </div>

        {/* Contact Icons Row */}
        <div className="flex items-center justify-center gap-1 p-3 bg-gray-50 rounded-b-2xl border-t border-gray-100">
          {data.email && (
            <a 
              href={`mailto:${data.email}`}
              className="p-2 rounded-full hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700"
              title={data.email}
              onClick={(e) => e.stopPropagation()}
            >
              <Mail className="w-4 h-4" />
            </a>
          )}
          <button 
            className="p-2 rounded-full hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700"
            title="Send message"
            onClick={(e) => e.stopPropagation()}
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <button 
            className="p-2 rounded-full hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700"
            title="Schedule meeting"
            onClick={(e) => e.stopPropagation()}
          >
            <Calendar className="w-4 h-4" />
          </button>
          <button 
            className="p-2 rounded-full hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700"
            title="View tasks"
            onClick={(e) => e.stopPropagation()}
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
          {hasChildren && (
            <button 
              className="p-2 rounded-full hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700"
              title={`${teamSize} direct reports`}
              onClick={(e) => e.stopPropagation()}
            >
              <Users className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Connection Handles */}
      {hasChildren && (
        <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-white" id="bottom" />
      )}
      {hasManager && (
        <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-white" id="top" />
      )}
    </div>
  );
}
