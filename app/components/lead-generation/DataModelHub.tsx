'use client';

import { Boxes, Database, Radio, MessageSquare, Download, CheckCircle2, Clock, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DATA_MODEL_ENTITIES } from '@/lib/lead-generation/config';

const CATEGORY_COLORS: Record<string, string> = {
  core: 'bg-brand/10 text-brand border-brand/20',
  enrichment: 'bg-blue-50 text-blue-700 border-blue-200',
  ingestion: 'bg-purple-50 text-purple-700 border-purple-200',
  social: 'bg-amber-50 text-amber-700 border-amber-200',
  feedback: 'bg-green-50 text-green-700 border-green-200',
};

const CATEGORY_ICONS: Record<string, typeof Database> = {
  core: Database,
  enrichment: Boxes,
  ingestion: Download,
  social: Radio,
  feedback: MessageSquare,
};

const STATUS_INFO: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  implemented: { icon: CheckCircle2, color: 'text-green-600', label: 'Implemented' },
  typed: { icon: Clock, color: 'text-amber-600', label: 'TypeScript types defined' },
  planned: { icon: Circle, color: 'text-neutral-400', label: 'Planned' },
};

export function DataModelHub() {
  const categories = ['core', 'enrichment', 'ingestion', 'social', 'feedback'];
  const categoryLabels: Record<string, string> = {
    core: 'Core Entities',
    enrichment: 'Enrichment & Scoring',
    ingestion: 'Ingestion Pipeline',
    social: 'Social Signals',
    feedback: 'Feedback & Routing',
  };

  const stats = {
    total: DATA_MODEL_ENTITIES.length,
    implemented: DATA_MODEL_ENTITIES.filter((e) => e.status === 'implemented').length,
    typed: DATA_MODEL_ENTITIES.filter((e) => e.status === 'typed').length,
    planned: DATA_MODEL_ENTITIES.filter((e) => e.status === 'planned').length,
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-neutral-900 mb-1">Data Model</h1>
        <p className="text-sm text-neutral-500">
          Planned data entities for the Lead Generation system. TypeScript types are defined in{' '}
          <code className="text-2xs bg-neutral-100 px-1 py-0.5 rounded">lib/lead-generation/types.ts</code>.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="card p-3 text-center">
          <p className="text-lg font-bold text-neutral-900">{stats.total}</p>
          <p className="text-2xs text-neutral-500">Total Entities</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-lg font-bold text-green-700">{stats.implemented}</p>
          <p className="text-2xs text-neutral-500">Implemented</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-lg font-bold text-amber-700">{stats.typed}</p>
          <p className="text-2xs text-neutral-500">Types Defined</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-lg font-bold text-neutral-400">{stats.planned}</p>
          <p className="text-2xs text-neutral-500">Planned</p>
        </div>
      </div>

      {/* Entity Groups */}
      {categories.map((cat) => {
        const entities = DATA_MODEL_ENTITIES.filter((e) => e.category === cat);
        const CatIcon = CATEGORY_ICONS[cat] ?? Database;
        if (entities.length === 0) return null;

        return (
          <div key={cat} className="mb-4">
            <h2 className="text-sm font-semibold text-neutral-900 mb-2 flex items-center gap-2">
              <CatIcon className="h-4 w-4 text-neutral-400" />
              {categoryLabels[cat]}
              <span className="text-2xs text-neutral-400 font-normal">({entities.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {entities.map((entity) => {
                const statusInfo = STATUS_INFO[entity.status];
                const StatusIcon = statusInfo?.icon ?? Circle;
                return (
                  <div key={entity.name} className="card p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-2xs px-1.5 py-0.5 rounded border font-mono', CATEGORY_COLORS[cat])}>
                          {entity.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <StatusIcon className={cn('h-3 w-3', statusInfo?.color)} />
                        <span className={cn('text-2xs', statusInfo?.color)}>{statusInfo?.label}</span>
                      </div>
                    </div>
                    <p className="text-2xs text-neutral-500 mt-2">{entity.description}</p>
                    <p className="text-2xs text-neutral-400 mt-1">{entity.fieldCount} fields</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Implementation Notes */}
      <div className="card p-4 mt-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">Implementation Notes</h3>
        <div className="space-y-2 text-xs text-neutral-600">
          <p>
            <strong>Current state:</strong> All &ldquo;typed&rdquo; entities have full TypeScript interfaces in{' '}
            <code className="text-2xs bg-neutral-100 px-1 py-0.5 rounded">lib/lead-generation/types.ts</code>{' '}
            with local fixture examples in{' '}
            <code className="text-2xs bg-neutral-100 px-1 py-0.5 rounded">lib/lead-generation/mock-data.ts</code>.
          </p>
          <p>
            <strong>Current state:</strong> Prisma schema models are aligned with these types and run on the configured Postgres
            database alongside the directory scraper entities.
          </p>
          <p>
            <strong>Scoring:</strong> Scaffold in{' '}
            <code className="text-2xs bg-neutral-100 px-1 py-0.5 rounded">lib/lead-generation/scoring.ts</code>{' '}
            — rules-first weighted scoring per the research pack (30/25/15/15/10/5 weighting).
          </p>
          <p>
            <strong>Adapters:</strong> Ingestion adapter interfaces and stubs in{' '}
            <code className="text-2xs bg-neutral-100 px-1 py-0.5 rounded">lib/lead-generation/adapters.ts</code>{' '}
            — ready for scraper integration.
          </p>
        </div>
      </div>
    </div>
  );
}
