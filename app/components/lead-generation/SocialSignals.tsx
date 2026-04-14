'use client';

import {
  Radio, AlertTriangle, TrendingUp, Rss, Globe, MessageSquare,
  Users, BookOpen, Newspaper, Shield, ArrowRight, Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { SOCIAL_SIGNAL_CATEGORIES } from '@/lib/lead-generation/config';
import { PlannedBadge } from './shared';

export function SocialSignals() {
  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 mb-1 flex items-center gap-2">
            Social Signals
            <PlannedBadge />
          </h1>
          <p className="text-sm text-neutral-500">
            Problem signal intelligence — monitoring external sources for buying signals that indicate Arrow solution fit.
          </p>
        </div>
      </div>

      {/* Overview */}
      <div className="card p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <Radio className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">What Is Problem Signal Intelligence?</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Instead of cold outreach, detect when companies publicly express problems that Arrow solutions address.
              Signals like compliance concerns, packaging changes, production bottlenecks, and equipment searches
              indicate active buying intent or latent need.
            </p>
          </div>
        </div>
        <p className="text-xs text-neutral-600">
          Social signals augment the rules-based scoring system by adding timing and intent data.
          A company with a strong industry fit score that also shows active problem signals
          becomes a higher-priority lead than one based on firmographics alone.
        </p>
      </div>

      {/* Problem Taxonomy */}
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">Problem Signal Taxonomy</h3>
        <p className="text-xs text-neutral-500 mb-3">
          Categories of signals that indicate potential Arrow solution fit:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {SOCIAL_SIGNAL_CATEGORIES.map((cat) => {
            const descriptions: Record<string, string> = {
              compliance_concern: 'Company discusses regulatory challenges, labeling compliance issues, or food-safety requirements.',
              packaging_change: 'Company announces packaging redesign, format changes, or new product launches requiring labels.',
              production_bottleneck: 'Company mentions production delays, outsourcing pain, long lead times, or capacity constraints.',
              sustainability_pressure: 'Company faces sustainability mandates, packaging reduction goals, or eco-labeling requirements.',
              label_quality_issue: 'Company reports label defects, adhesion problems, or print quality concerns.',
              equipment_search: 'Company actively researching, comparing, or evaluating printing or packaging equipment.',
              regulatory_update: 'Government or industry body announces new labeling regulations affecting target industries.',
              market_trend: 'Broader industry trend indicating growing demand for Arrow-type solutions.',
            };

            return (
              <div key={cat.key} className="rounded-md bg-neutral-50 border border-neutral-200 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span className="text-xs font-semibold text-neutral-800">{cat.label}</span>
                </div>
                <p className="text-2xs text-neutral-500">{descriptions[cat.key] ?? ''}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Signal Pipeline */}
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">Signal Pipeline</h3>
        <p className="text-xs text-neutral-500 mb-3">
          How signals flow from detection to account prioritization:
        </p>
        <div className="flex flex-wrap items-center gap-1 mb-3">
          {[
            { label: 'Detect', desc: 'Monitor sources for relevant mentions' },
            { label: 'Classify', desc: 'Categorize signal by problem type' },
            { label: 'Match', desc: 'Link signal to account(s)' },
            { label: 'Score', desc: 'Boost account fit score' },
            { label: 'Route', desc: 'Notify owner or add to review' },
          ].map((stage, i) => (
            <div key={stage.label} className="flex items-center gap-1">
              <div className="rounded-md bg-neutral-50 border border-neutral-200 px-3 py-2 text-center min-w-[90px]">
                <p className="text-2xs font-semibold text-neutral-800">{stage.label}</p>
                <p className="text-2xs text-neutral-400 mt-0.5">{stage.desc}</p>
              </div>
              {i < 4 && <ArrowRight className="h-3 w-3 text-neutral-300 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Source Types */}
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">Planned Source Types</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { name: 'LinkedIn', icon: Users, desc: 'Posts, comments, and job listings from target accounts and personas' },
            { name: 'Reddit / Industry Forums', icon: MessageSquare, desc: 'Discussions about packaging problems, equipment comparisons, compliance' },
            { name: 'Trade Publications', icon: BookOpen, desc: 'Label & Narrow Web, Packaging World, FlexPack, Converting Quarterly' },
            { name: 'News Feeds', icon: Newspaper, desc: 'Company news, M&A, facility expansions, regulatory announcements' },
            { name: 'Government Databases', icon: Shield, desc: 'Regulatory filings, GHS updates, food-safety enforcement actions' },
            { name: 'RSS / Custom Monitors', icon: Rss, desc: 'Keyword-based monitoring across configurable web sources' },
          ].map((source) => {
            const Icon = source.icon;
            return (
              <div key={source.name} className="rounded-md bg-neutral-50 border border-neutral-200 p-3 flex items-start gap-2.5">
                <Icon className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-neutral-800">{source.name}</p>
                  <p className="text-2xs text-neutral-500">{source.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Account Impact */}
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">How Signals Affect Prioritization</h3>
        <div className="space-y-2">
          {[
            { scenario: 'Account has strong industry fit (score 85+) AND active compliance signal', effect: 'Boost to top of review queue, notify account owner immediately' },
            { scenario: 'Account has moderate fit (score 65–84) AND equipment search signal', effect: 'Escalate to review queue, recommend outreach with demo offer' },
            { scenario: 'Unmatched signal about regulatory change in target industry', effect: 'Trigger research task to identify affected companies in database' },
            { scenario: 'Matched account shows sustainability pressure + packaging change', effect: 'Multiple signals compound — significant score boost, sales alert' },
          ].map((item) => (
            <div key={item.scenario} className="rounded-md bg-neutral-50 border border-neutral-200 p-3">
              <p className="text-xs text-neutral-800 font-medium">{item.scenario}</p>
              <p className="text-2xs text-neutral-500 mt-1">→ {item.effect}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Data Model */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">Data Entities (Typed)</h3>
        <p className="text-xs text-neutral-500 mb-3">
          TypeScript types for social signal entities are defined in{' '}
          <code className="text-2xs bg-neutral-100 px-1 py-0.5 rounded">lib/lead-generation/types.ts</code>:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { name: 'SocialSignal', fields: 10 },
            { name: 'SocialSignalClassification', fields: 5 },
            { name: 'SocialEntityMatch', fields: 5 },
            { name: 'SocialAction', fields: 5 },
            { name: 'SocialTrend', fields: 7 },
          ].map((entity) => (
            <div key={entity.name} className="rounded-md bg-neutral-50 border border-neutral-200 px-3 py-2">
              <code className="text-2xs font-mono text-brand">{entity.name}</code>
              <p className="text-2xs text-neutral-400 mt-0.5">{entity.fields} fields</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
