'use client';

import { useState } from 'react';
import { Island, IslandFeature } from '../lib/islandMapData';
import { cn } from '../lib/utils';
import { 
  CheckCircle2, 
  Clock, 
  Circle, 
  FlaskConical, 
  FileText, 
  Image as ImageIcon, 
  ExternalLink,
  Settings,
  ChevronRight,
  X
} from 'lucide-react';

interface BentoIslandViewProps {
  island: Island;
  onBack: () => void;
}

const statusConfig = {
  active: { 
    icon: CheckCircle2, 
    color: 'text-accent-green', 
    bg: 'bg-accent-green/10',
    border: 'border-accent-green/30',
    label: 'Active'
  },
  pending: { 
    icon: Clock, 
    color: 'text-accent-yellow', 
    bg: 'bg-accent-yellow/10',
    border: 'border-accent-yellow/30',
    label: 'Pending'
  },
  experimental: { 
    icon: FlaskConical, 
    color: 'text-accent-purple', 
    bg: 'bg-accent-purple/10',
    border: 'border-accent-purple/30',
    label: 'Experimental'
  },
  planned: { 
    icon: Circle, 
    color: 'text-text-muted', 
    bg: 'bg-text-muted/10',
    border: 'border-text-muted/30',
    label: 'Planned'
  },
};

const typeConfig: Record<string, { icon: typeof FileText; label: string }> = {
  tool: { icon: Settings, label: 'Tool' },
  skill: { icon: Settings, label: 'Skill' },
  channel: { icon: FileText, label: 'Channel' },
  system: { icon: Settings, label: 'System' },
  file: { icon: FileText, label: 'File' },
  policy: { icon: Settings, label: 'Policy' },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.planned;
  const Icon = config.icon;
  
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      config.bg,
      config.color,
      config.border,
      'border'
    )}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function FeatureCard({ feature, index }: { feature: IslandFeature; index: number }) {
  const type = typeConfig[feature.type] || typeConfig.tool;
  const TypeIcon = type.icon;
  
  return (
    <div 
      className="group relative p-4 bg-bg-secondary border border-white/10 rounded-xl hover:border-white/20 hover:bg-bg-tertiary/50 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <TypeIcon className="w-4 h-4 text-text-muted" />
            <span className="text-xs text-text-muted uppercase tracking-wide">{type.label}</span>
          </div>
          <h3 className="text-sm font-medium text-text-primary truncate">{feature.name}</h3>
          <p className="text-xs text-text-secondary mt-1 line-clamp-2">{feature.description}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={feature.status} />
          <ChevronRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </div>
  );
}

function StatsCard({ island }: { island: Island }) {
  const activeCount = island.features?.filter(f => f.status === 'active').length || 0;
  const pendingCount = island.features?.filter(f => f.status === 'pending').length || 0;
  const experimentalCount = island.features?.filter(f => f.status === 'experimental').length || 0;
  
  return (
    <div className="p-4 bg-bg-secondary border border-white/10 rounded-xl">
      <h3 className="text-xs text-text-muted uppercase tracking-wide mb-3">Status Overview</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent-green" />
            <span className="text-sm text-text-secondary">Active</span>
          </div>
          <span className="text-sm font-medium text-text-primary">{activeCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent-yellow" />
            <span className="text-sm text-text-secondary">Pending</span>
          </div>
          <span className="text-sm font-medium text-text-primary">{pendingCount}</span>
        </div>
        {experimentalCount > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-purple" />
              <span className="text-sm text-text-secondary">Experimental</span>
            </div>
            <span className="text-sm font-medium text-text-primary">{experimentalCount}</span>
          </div>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Total Features</span>
          <span className="text-lg font-semibold" style={{ color: island.color }}>
            {island.featureCount}
          </span>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ island }: { island: Island }) {
  return (
    <div className="p-4 bg-bg-secondary border border-white/10 rounded-xl">
      <h3 className="text-xs text-text-muted uppercase tracking-wide mb-3">About</h3>
      <p className="text-sm text-text-secondary mb-4">{island.description}</p>
      
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <FileText className="w-4 h-4 text-text-muted" />
          <span className="text-text-muted">Folder:</span>
          <code className="px-1.5 py-0.5 bg-bg-tertiary rounded text-text-primary font-mono">
            {island.folderPath}
          </code>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Settings className="w-4 h-4 text-text-muted" />
          <span className="text-text-muted">Status:</span>
          <StatusBadge status={island.status} />
        </div>
      </div>
    </div>
  );
}

function ScreenshotCard({ island }: { island: Island }) {
  // Placeholder - can be populated with actual screenshots
  const hasScreenshot = false; // Set to true when screenshots are available
  
  return (
    <div className="p-4 bg-bg-secondary border border-white/10 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs text-text-muted uppercase tracking-wide">Visual Reference</h3>
        <ImageIcon className="w-4 h-4 text-text-muted" />
      </div>
      
      {hasScreenshot ? (
        <div className="relative aspect-video bg-bg-tertiary rounded-lg overflow-hidden group cursor-pointer">
          {/* Replace with actual image */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-text-muted text-sm">Screenshot preview</span>
          </div>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      ) : (
        <div className="aspect-video bg-bg-tertiary border border-dashed border-white/20 rounded-lg flex flex-col items-center justify-center gap-2">
          <ImageIcon className="w-8 h-8 text-text-muted/50" />
          <span className="text-xs text-text-muted">No screenshot yet</span>
          <button className="text-xs text-accent-cyan hover:underline mt-1">
            Upload image
          </button>
        </div>
      )}
    </div>
  );
}

function ActionsCard({ island }: { island: Island }) {
  return (
    <div className="p-4 bg-bg-secondary border border-white/10 rounded-xl">
      <h3 className="text-xs text-text-muted uppercase tracking-wide mb-3">Quick Actions</h3>
      <div className="space-y-2">
        <button className="w-full flex items-center justify-between px-3 py-2 bg-bg-tertiary hover:bg-white/5 border border-white/10 rounded-lg transition-colors group">
          <span className="text-sm text-text-secondary">Open folder</span>
          <ExternalLink className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
        </button>
        <button className="w-full flex items-center justify-between px-3 py-2 bg-bg-tertiary hover:bg-white/5 border border-white/10 rounded-lg transition-colors group">
          <span className="text-sm text-text-secondary">Edit island</span>
          <Settings className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
        </button>
        <button className="w-full flex items-center justify-between px-3 py-2 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 rounded-lg transition-colors group">
          <span className="text-sm text-accent-cyan">Add feature</span>
          <span className="text-accent-cyan text-lg leading-none">+</span>
        </button>
      </div>
    </div>
  );
}

export function BentoIslandView({ island, onBack }: BentoIslandViewProps) {
  const features = island.features || [];
  
  return (
    <div className="flex flex-col h-full bg-bg-primary overflow-auto">
      {/* Hero Header */}
      <div className="p-6 pb-4">
        <div className="max-w-6xl mx-auto">
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors mb-4"
          >
            <span className="text-lg">←</span>
            <span className="text-sm">Back to Map</span>
          </button>
          
          {/* Island identity */}
          <div className="flex items-center gap-4">
            <div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center border-2 shadow-lg"
              style={{ 
                backgroundColor: `${island.color}20`,
                borderColor: island.color,
                boxShadow: `0 0 40px ${island.color}30`
              }}
            >
              <span className="text-3xl">{island.icon}</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{island.name}</h1>
              <p className="text-text-secondary">{island.description}</p>
              <div className="flex items-center gap-3 mt-1">
                <StatusBadge status={island.status} />
                <span className="text-xs text-text-muted">{island.featureCount} features</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bento Grid Content */}
      <div className="flex-1 p-6 pt-0">
        <div className="max-w-6xl mx-auto">
          {/* Main Grid */}
          <div className="grid grid-cols-12 gap-4">
            
            {/* Left Column - Features List (wider) */}
            <div className="col-span-12 lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-text-primary">Features</h2>
                <span className="text-xs text-text-muted">{features.length} items</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {features.map((feature, index) => (
                  <FeatureCard key={feature.id} feature={feature} index={index} />
                ))}
              </div>
            </div>
            
            {/* Right Column - Stats, Info, Screenshot, Actions */}
            <div className="col-span-12 lg:col-span-5 space-y-4">
              {/* Stats */}
              <StatsCard island={island} />
              
              {/* Info */}
              <InfoCard island={island} />
              
              {/* Screenshot placeholder (can hold images) */}
              <ScreenshotCard island={island} />
              
              {/* Quick Actions */}
              <ActionsCard island={island} />
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
