'use client';

import { Target, AlertTriangle, Crosshair, Layers, ShieldCheck, Globe, Zap } from 'lucide-react';
import { PRODUCT_FAMILIES, PILOT_COUNTRIES, SCORING_DIMENSIONS } from '@/lib/lead-generation/config';

export function LeadGenOverview() {
  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-bold text-neutral-900 mb-1">Strategy Overview</h1>
        <p className="text-sm text-neutral-500">
          Why Arrow lead generation is hard, why precision matters, and what we are building.
        </p>
      </div>

      {/* The Challenge */}
      <div className="card p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Why Arrow Lead Generation Is Hard</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Arrow Systems sells expensive, specialized industrial equipment. The buyer universe is narrow and the sales cycle is complex.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { title: 'Narrow ICP', desc: 'Only companies with specific packaging, labeling, or finishing needs are viable prospects. Mass-market lead lists are wasteful.' },
            { title: 'High deal complexity', desc: 'Solutions involve capital equipment decisions, facility requirements, substrate compatibility, and compliance validation.' },
            { title: 'Multi-persona buying committees', desc: 'Packaging managers, compliance officers, plant managers, and procurement all influence the decision.' },
            { title: 'Global but fragmented', desc: 'Different countries have different compliance regimes, channel structures (direct vs dealer), and market maturity.' },
          ].map((item) => (
            <div key={item.title} className="rounded-md bg-neutral-50 border border-neutral-200 p-3">
              <p className="text-xs font-semibold text-neutral-800">{item.title}</p>
              <p className="text-2xs text-neutral-500 mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Precision Approach */}
      <div className="card p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0 mt-0.5">
            <Crosshair className="h-4 w-4 text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Precision Over Volume</h2>
            <p className="text-xs text-neutral-500 mt-1">
              A smaller set of strong, qualified leads is worth more than thousands of unqualified contacts.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {[
            'Every company record should support qualification logic and fit scoring',
            'Market databases are organized by industry vertical — not random lists',
            'Scoring is rules-first and auditable, not opaque AI-only',
            'Product fit is grounded in real Arrow capabilities from arrsys.com',
            'Licensed B2B data only — no third-party site scraping for lead assembly',
            'Sales feedback feeds back into the scoring model over time',
          ].map((point) => (
            <div key={point} className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
              <p className="text-xs text-neutral-700">{point}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Arrow Product Families */}
      <div className="card p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
            <Layers className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Arrow Solution Areas</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Product families that define what Arrow can sell — the foundation of fit scoring.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {PRODUCT_FAMILIES.map((pf) => (
            <div key={pf.key} className="rounded-md bg-neutral-50 border border-neutral-200 px-3 py-2.5">
              <p className="text-xs font-semibold text-neutral-800">{pf.label}</p>
              <p className="text-2xs text-neutral-500 mt-0.5">{pf.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scoring Framework */}
      <div className="card p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
            <Target className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Scoring Framework</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Weighted 0–100 score across six dimensions. Rules-first with AI explanation layer planned.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {SCORING_DIMENSIONS.map((dim) => (
            <div key={dim.key} className="flex items-center gap-3">
              <div className="w-36 text-xs text-neutral-700 font-medium">{dim.label}</div>
              <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand/70 rounded-full" style={{ width: `${dim.maxPoints}%` }} />
              </div>
              <span className="text-xs font-mono text-neutral-500 w-12 text-right">{dim.maxPoints} pts</span>
            </div>
          ))}
        </div>
        <p className="text-2xs text-neutral-400 mt-3">Total: 100 points. Threshold for qualification is configurable per territory.</p>
      </div>

      {/* Pilot Countries */}
      <div className="card p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0 mt-0.5">
            <Globe className="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Pilot Countries</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Initial target territories with different GTM motions and compliance hooks.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { country: 'Canada', hook: 'Burlington Experience Center, bilingual compliance, direct + distributor', status: 'Primary' },
            { country: 'India', hook: 'BIS/FSSAI toluene ban narrative, SME converters, dealer model', status: 'Primary' },
            { country: 'Italy', hook: 'EU modernization, sustainability, distributor/partner model', status: 'Secondary' },
            { country: 'Mexico', hook: 'Flexible packaging growth, LATAM expansion, Spanish collateral', status: 'Secondary' },
          ].map((c) => (
            <div key={c.country} className="rounded-md bg-neutral-50 border border-neutral-200 p-3">
              <p className="text-xs font-bold text-neutral-800">{c.country}</p>
              <span className={`inline-block mt-1 text-2xs px-1.5 py-0.5 rounded ${c.status === 'Primary' ? 'bg-brand/10 text-brand' : 'bg-neutral-100 text-neutral-600'}`}>
                {c.status}
              </span>
              <p className="text-2xs text-neutral-500 mt-1.5">{c.hook}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Compliance & Ethics */}
      <div className="card p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Data Compliance Principles</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Per the research pack, this system operates under strict data ethics.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {[
            'B2B outreach data treated as regulated where applicable',
            'Licensed sources only for contact data — no web scraping of prospect sites',
            'Purpose limitation and minimal retention',
            'Opt-out and suppression list support',
            'Scoring rationales must not leak sensitive inferences — stick to business fit consistent with public messaging',
          ].map((point) => (
            <div key={point} className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <p className="text-xs text-neutral-700">{point}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Long-Term Vision */}
      <div className="card p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
            <Zap className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Long-Term Vision</h2>
            <p className="text-xs text-neutral-500 mt-1">
              From market databases to a closed-loop, AI-augmented lead generation engine.
            </p>
          </div>
        </div>
        <div className="space-y-1">
          {[
            { phase: 'Phase 1', desc: 'Site ingestion + ontology. Internal market databases with manual research.' },
            { phase: 'Phase 2', desc: 'Licensed data enrichment + rules-based scoring + CRM export.' },
            { phase: 'Phase 3', desc: 'Sales feedback loop + weight calibration + AI explanations.' },
            { phase: 'Phase 4', desc: 'Scale countries + social signal monitoring + automated playbooks.' },
          ].map((p) => (
            <div key={p.phase} className="flex gap-3 py-2">
              <span className="text-2xs font-bold text-brand w-16 shrink-0">{p.phase}</span>
              <p className="text-xs text-neutral-700">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
