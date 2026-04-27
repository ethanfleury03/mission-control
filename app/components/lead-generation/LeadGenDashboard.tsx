'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Database,
  Building2,
  CheckCircle2,
  Radio,
  ArrowRight,
  Target,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { LeadGenPage } from '@/lib/lead-generation/types';
import { fetchMarkets, fetchAccounts } from '@/lib/lead-generation/api';

interface LeadGenDashboardProps {
  onNavigate: (page: LeadGenPage) => void;
}

const PILOT = ['Canada', 'India', 'Italy', 'Mexico'] as const;

export function LeadGenDashboard({ onNavigate }: LeadGenDashboardProps) {
  const [marketsCount, setMarketsCount] = useState(0);
  const [activeMarkets, setActiveMarkets] = useState(0);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [qualifiedCount, setQualifiedCount] = useState(0);
  const [pilotCounts, setPilotCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [markets, accounts] = await Promise.all([fetchMarkets(), fetchAccounts()]);
      setMarketsCount(markets.length);
      setActiveMarkets(markets.filter((m) => m.status === 'active').length);
      setTotalAccounts(accounts.length);
      setQualifiedCount(accounts.filter((a) => a.reviewState === 'qualified').length);
      const pc: Record<string, number> = {};
      for (const c of PILOT) pc[c] = accounts.filter((a) => a.country === c).length;
      setPilotCounts(pc);
    } catch {
      setMarketsCount(0);
      setActiveMarkets(0);
      setTotalAccounts(0);
      setQualifiedCount(0);
      setPilotCounts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summaryCards = [
    { label: 'Markets', value: marketsCount, detail: `${activeMarkets} active`, icon: Database, color: 'text-brand', page: 'markets' as LeadGenPage },
    { label: 'Company Records', value: totalAccounts, detail: 'in database', icon: Building2, color: 'text-blue-600', page: 'accounts' as LeadGenPage },
    { label: 'Qualified Leads', value: qualifiedCount, detail: totalAccounts ? `of ${totalAccounts} total` : '—', icon: CheckCircle2, color: 'text-green-600', page: 'accounts' as LeadGenPage },
    { label: 'Social Signals', value: '—', detail: 'planned', icon: Radio, color: 'text-neutral-400', page: 'social-signals' as LeadGenPage },
  ];

  const quickLinks = [
    { label: 'Strategy Overview', description: 'Why Arrow lead gen is hard and what we are building', page: 'overview' as LeadGenPage },
    { label: 'Coffee Market Database', description: 'Browse markets — open Coffee or any vertical', page: 'markets' as LeadGenPage },
    { label: 'Accounts Explorer', description: 'Review imported companies and qualification status', page: 'accounts' as LeadGenPage },
    { label: 'Social Signals', description: 'Track the next planned enrichment layer', page: 'social-signals' as LeadGenPage },
  ];

  return (
    <div className="p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-brand/10 flex items-center justify-center">
            <Target className="h-5 w-5 text-brand" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Lead Generation</h1>
            <p className="text-sm text-neutral-500">
              Precision market intelligence for Arrow Systems industrial solutions
            </p>
          </div>
        </div>
        <p className="text-xs text-neutral-500 mt-2 max-w-2xl">
          Build and qualify targeted account databases for Arrow&apos;s narrow ICP — companies that need digital label printing, flexible packaging, finishing, and compliance-driven solutions. Quality over quantity.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-neutral-500 mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading summary…
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onNavigate(card.page)}
              className="card card-hover p-3 text-left transition-all group"
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={cn('h-4 w-4', card.color)} />
                <ArrowRight className="h-3 w-3 text-neutral-300 group-hover:text-brand transition-colors" />
              </div>
              <p className="text-lg font-bold text-neutral-900">{card.value}</p>
              <p className="text-2xs text-neutral-500 font-medium">{card.label}</p>
              <p className="text-2xs text-neutral-400 mt-0.5">{card.detail}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Quick Links */}
        <div className="lg:col-span-2 card p-4">
          <h3 className="text-sm font-semibold text-neutral-900 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand" />
            Quick Access
          </h3>
          <div className="space-y-1.5">
            {quickLinks.map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={() => onNavigate(link.page)}
                className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-neutral-50 transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-800 group-hover:text-brand transition-colors">{link.label}</p>
                  <p className="text-2xs text-neutral-500">{link.description}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-neutral-300 group-hover:text-brand transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Pilot Countries — counts loaded client-side would need full account fetch; show pilot list */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-neutral-900 mb-3">Pilot Countries</h3>
          <p className="text-2xs text-neutral-500 mb-2">Per research pack — account counts in DB:</p>
          <div className="space-y-2">
            {PILOT.map((country) => {
              const count = pilotCounts[country] ?? 0;
              const pct = totalAccounts ? (count / totalAccounts) * 100 : 0;
              return (
                <div key={country} className="flex items-center justify-between">
                  <span className="text-xs text-neutral-700">{country}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-medium text-neutral-600 w-6 text-right">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Current State */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-neutral-900 mb-3">Current State</h3>
          <div className="space-y-2">
            {[
              { label: 'Prisma markets + accounts (Postgres)', status: 'done' },
              { label: 'Market CRUD + Directory Scraper → Lead Gen import', status: 'done' },
              { label: 'Typed data model (TypeScript)', status: 'done' },
              { label: 'Manual imports + empty-state-first database behavior', status: 'done' },
              { label: 'Scoring framework scaffold', status: 'done' },
              { label: 'Review queue UI (read from DB)', status: 'done' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span className="text-xs text-neutral-700">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-neutral-900 mb-3">Roadmap</h3>
          <div className="space-y-2">
            {[
              { label: 'Review actions (PATCH) + audit log', status: 'next' },
              { label: 'Automated scoring engine + product_fit table', status: 'planned' },
              { label: 'CRM export & sync', status: 'planned' },
              { label: 'Social signal monitoring', status: 'planned' },
              { label: 'AI explanation layer', status: 'future' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  item.status === 'next' ? 'bg-amber-500' :
                  item.status === 'planned' ? 'bg-blue-400' : 'bg-neutral-300'
                )} />
                <span className="text-xs text-neutral-700">{item.label}</span>
                <span className={cn(
                  'text-2xs px-1.5 py-0.5 rounded',
                  item.status === 'next' ? 'bg-amber-50 text-amber-700' :
                  item.status === 'planned' ? 'bg-blue-50 text-blue-700' : 'bg-neutral-50 text-neutral-500'
                )}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Research Pack Reference */}
      <div className="mt-4 card p-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">Research Foundation</h3>
        <p className="text-xs text-neutral-500 mb-3">
          This system is built from the internal lead-gen research pack. Key source documents:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { name: 'Executive Summary & Architecture', file: '01-executive-summary-and-architecture.md' },
              { name: 'Arrow Systems Audit & Countries', file: '02-arrsys-audit-and-countries.md' },
              { name: 'Data Model & AI Workflow', file: '03-data-model-and-ai-workflow.md' },
              { name: 'Lead Example Scenarios', file: '04-synthetic-lead-examples.md' },
            ].map((doc) => (
            <div key={doc.file} className="rounded-md bg-neutral-50 border border-neutral-200 px-3 py-2">
              <p className="text-2xs font-medium text-neutral-700">{doc.name}</p>
              <p className="text-2xs text-neutral-400 font-mono mt-0.5">{doc.file}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
