'use client';

import {
  Building2, Globe, MapPin, Tag, Users, Target, FileText,
  ExternalLink, Zap, Radio, MessageSquare, Shield, Layers,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  getAccountById, getMarketById, getSignalsByAccount,
  getProductFitsByAccount, getReviewsByAccount, getScoreBreakdown,
} from '@/lib/lead-generation/mock-data';
import { REVIEW_STATE_COLORS, REVIEW_STATE_LABELS, PRODUCT_FAMILIES, SCORING_DIMENSIONS } from '@/lib/lead-generation/config';
import { getQualificationLevel, getQualificationColor } from '@/lib/lead-generation/scoring';
import { FitScoreBadge, PlannedBadge, DemoDataNotice } from './shared';

interface AccountDetailProps {
  accountId: string;
  onBack: () => void;
  onNavigateMarket: (slug: string) => void;
}

export function AccountDetail({ accountId, onBack, onNavigateMarket }: AccountDetailProps) {
  const account = getAccountById(accountId);

  if (!account) {
    return (
      <div className="p-6">
        <p className="text-sm text-neutral-500">Account not found.</p>
      </div>
    );
  }

  const market = getMarketById(account.marketId);
  const signals = getSignalsByAccount(accountId);
  const productFits = getProductFitsByAccount(accountId);
  const reviews = getReviewsByAccount(accountId);
  const scoreBreakdown = getScoreBreakdown(accountId);
  const qualLevel = getQualificationLevel(account.fitScore);
  const qualColor = getQualificationColor(qualLevel);

  const productFamilyLabel = (key: string) =>
    PRODUCT_FAMILIES.find((p) => p.key === key)?.label ?? key;

  return (
    <div className="p-6 max-w-5xl">
      <DemoDataNotice />

      {/* Header */}
      <div className="card p-5 mt-3 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-900">{account.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                {account.website && (
                  <a
                    href={account.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand hover:underline flex items-center gap-1"
                  >
                    {account.domain} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {market && (
                  <button
                    type="button"
                    onClick={() => onNavigateMarket(market.slug)}
                    className="text-xs text-neutral-500 hover:text-brand transition-colors"
                  >
                    {market.name} →
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FitScoreBadge score={account.fitScore} />
            <span className={cn('text-2xs px-2 py-0.5 rounded font-medium', REVIEW_STATE_COLORS[account.reviewState])}>
              {REVIEW_STATE_LABELS[account.reviewState]}
            </span>
          </div>
        </div>

        <p className="text-xs text-neutral-600 mt-3">{account.description}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-neutral-100">
          <div>
            <p className="text-2xs text-neutral-500">Country / Region</p>
            <p className="text-xs font-medium text-neutral-800">{account.country} {account.region && `/ ${account.region}`}</p>
          </div>
          <div>
            <p className="text-2xs text-neutral-500">Industry</p>
            <p className="text-xs font-medium text-neutral-800">{account.industry} {account.subindustry && `— ${account.subindustry}`}</p>
          </div>
          <div>
            <p className="text-2xs text-neutral-500">Company Size</p>
            <p className="text-xs font-medium text-neutral-800 capitalize">{account.companySizeBand.replace('-', ' ')}</p>
          </div>
          <div>
            <p className="text-2xs text-neutral-500">Revenue Band</p>
            <p className="text-xs font-medium text-neutral-800">{account.revenueBand.replace(/_/g, ' ').replace('under', '<').replace('plus', '+')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Fit Summary */}
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-brand" />
            Fit Assessment
          </h3>
          <p className="text-xs text-neutral-600 mb-3">{account.fitSummary}</p>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xs text-neutral-500">Qualification:</span>
            <span className={cn('text-2xs px-1.5 py-0.5 rounded border font-medium capitalize', qualColor)}>
              {qualLevel}
            </span>
          </div>

          {scoreBreakdown && (
            <div className="space-y-1.5 pt-3 border-t border-neutral-100">
              <p className="text-2xs font-semibold text-neutral-700 mb-1">Score Breakdown</p>
              {scoreBreakdown.dimensions.map((dim) => (
                <div key={dim.key} className="flex items-center gap-2">
                  <span className="text-2xs text-neutral-500 w-28 shrink-0">{dim.label}</span>
                  <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand/60 rounded-full" style={{ width: `${(dim.score / dim.maxPoints) * 100}%` }} />
                  </div>
                  <span className="text-2xs font-mono text-neutral-500 w-10 text-right">{dim.score}/{dim.maxPoints}</span>
                </div>
              ))}
              {scoreBreakdown.recommendedBundle && (
                <div className="mt-2 pt-2 border-t border-neutral-100">
                  <p className="text-2xs text-neutral-500">Recommended bundle</p>
                  <p className="text-xs font-medium text-neutral-800">{scoreBreakdown.recommendedBundle}</p>
                </div>
              )}
            </div>
          )}

          {!scoreBreakdown && (
            <p className="text-2xs text-neutral-400 italic">Detailed score breakdown not yet computed for this account.</p>
          )}
        </div>

        {/* Source & Metadata */}
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-neutral-400" />
            Source & Metadata
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-2xs text-neutral-500">Source Type</span>
              <span className="text-xs text-neutral-700 capitalize">{account.sourceType.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-2xs text-neutral-500">Source Name</span>
              <span className="text-xs text-neutral-700">{account.sourceName || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-2xs text-neutral-500">Account Status</span>
              <span className="text-xs text-neutral-700 capitalize">{account.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-2xs text-neutral-500">Last Seen</span>
              <span className="text-xs text-neutral-700">{new Date(account.lastSeenAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-2xs text-neutral-500">Created</span>
              <span className="text-xs text-neutral-700">{new Date(account.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-2xs text-neutral-500">Assigned Owner</span>
              <span className="text-xs text-neutral-700">{account.assignedOwner || 'Unassigned'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Product Fit */}
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-neutral-400" />
            Product Fit
          </h3>
          {productFits.length > 0 ? (
            <div className="space-y-2">
              {productFits.map((pf) => (
                <div key={pf.id} className="rounded-md bg-neutral-50 border border-neutral-200 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-neutral-800">
                      {productFamilyLabel(pf.productFamily)}
                      {pf.primaryFlag && <span className="ml-1.5 text-2xs text-brand">(primary)</span>}
                    </span>
                    <FitScoreBadge score={pf.fitScore} />
                  </div>
                  <p className="text-2xs text-neutral-500">{pf.rationale}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-2xs text-neutral-400 italic">No product fit assessments yet.</p>
          )}
        </div>

        {/* Signals */}
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            Signals
          </h3>
          {signals.length > 0 ? (
            <div className="space-y-2">
              {signals.map((sig) => (
                <div key={sig.id} className="rounded-md bg-neutral-50 border border-neutral-200 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-2xs font-medium text-neutral-700 capitalize">{sig.signalType.replace(/_/g, ' ')}</span>
                    <span className="text-2xs text-neutral-400">{Math.round(sig.confidence * 100)}% confidence</span>
                  </div>
                  <p className="text-xs text-neutral-600">{sig.signalValue}</p>
                  <p className="text-2xs text-neutral-400 mt-1">Source: {sig.source}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-2xs text-neutral-400 italic">No signals captured yet.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Reviews */}
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-neutral-400" />
            Review History
          </h3>
          {reviews.length > 0 ? (
            <div className="space-y-2">
              {reviews.map((rev) => (
                <div key={rev.id} className="rounded-md bg-neutral-50 border border-neutral-200 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn('text-2xs px-1.5 py-0.5 rounded font-medium capitalize',
                      rev.verdict === 'qualified' ? 'bg-green-100 text-green-800' :
                      rev.verdict === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-amber-100 text-amber-800'
                    )}>
                      {rev.verdict}
                    </span>
                    <span className="text-2xs text-neutral-400">{new Date(rev.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-2xs text-neutral-600 mt-1">{rev.note}</p>
                  <p className="text-2xs text-neutral-400 mt-1">By: {rev.reviewer}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-2xs text-neutral-400 italic">No reviews yet.</p>
          )}
        </div>

        {/* Future Sections */}
        <div className="space-y-3">
          <div className="card p-4 opacity-60">
            <h3 className="text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Contacts <PlannedBadge />
            </h3>
            <p className="text-2xs text-neutral-500">Buying committee contacts from licensed data. Requires data provider integration.</p>
          </div>
          <div className="card p-4 opacity-60">
            <h3 className="text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5" /> Social Signals <PlannedBadge />
            </h3>
            <p className="text-2xs text-neutral-500">Problem signals from social monitoring. Requires social signal pipeline.</p>
          </div>
          <div className="card p-4 opacity-60">
            <h3 className="text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Internal Notes <PlannedBadge />
            </h3>
            <p className="text-2xs text-neutral-500">Persistent internal notes and team comments. Requires database persistence.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
