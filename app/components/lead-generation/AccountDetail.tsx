'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Building2, Users, Target, FileText,
  ExternalLink, Zap, Radio, MessageSquare, Shield, Layers, Loader2, Send,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  getSignalsByAccount, getProductFitsByAccount, getReviewsByAccount, getScoreBreakdown,
} from '@/lib/lead-generation/mock-data';
import {
  REVIEW_STATE_COLORS, REVIEW_STATE_LABELS, PRODUCT_FAMILIES,
  LEAD_PIPELINE_STAGE_LABELS, LEAD_PIPELINE_STAGE_COLORS,
} from '@/lib/lead-generation/config';
import { getQualificationLevel, getQualificationColor, calculateFitScore } from '@/lib/lead-generation/scoring';
import { FitScoreBadge, PlannedBadge, DemoDataNotice, HubSpotHandoffBanner } from './shared';
import {
  fetchAccount, fetchMarketById, fetchHubSpotConfig, pushAccountToHubSpot, updateAccount,
} from '@/lib/lead-generation/api';
import type { Account, LeadPipelineStage, Market } from '@/lib/lead-generation/types';
import { hubspotEligibilityReason, isEligibleForHubSpotPush } from '@/lib/lead-generation/push-eligibility';

interface AccountDetailProps {
  accountId: string;
  onBack: () => void;
  onNavigateMarket: (slug: string) => void;
}

export function AccountDetail({ accountId, onBack, onNavigateMarket }: AccountDetailProps) {
  const [account, setAccount] = useState<Account | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hubCfg, setHubCfg] = useState<{ pushDisabled: boolean; portalConfigured: boolean; portalId: string | null } | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const [a, cfg] = await Promise.all([
        fetchAccount(accountId),
        fetchHubSpotConfig().catch(() => null),
      ]);
      setHubCfg(cfg);
      if (!a) {
        setAccount(null);
        setMarket(null);
        return;
      }
      setAccount(a);
      const m = await fetchMarketById(a.marketId);
      setMarket(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading account…
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="p-6">
        <p className="text-sm text-neutral-500">{error ?? 'Account not found.'}</p>
      </div>
    );
  }

  const signals = getSignalsByAccount(accountId);
  const productFits = getProductFitsByAccount(accountId);
  const reviews = getReviewsByAccount(accountId);
  const seedBreakdown = getScoreBreakdown(accountId);
  const scoreBreakdown = seedBreakdown ?? calculateFitScore(account);
  const qualLevel = getQualificationLevel(account.fitScore);
  const qualColor = getQualificationColor(qualLevel);

  const productFamilyLabel = (key: string) =>
    PRODUCT_FAMILIES.find((p) => p.key === key)?.label ?? key;

  const pipelineStage = account.leadPipelineStage ?? 'discovered';
  const eligible = isEligibleForHubSpotPush(account);
  const hubspotUrl =
    hubCfg?.portalId && account.hubspotContactId
      ? `https://app.hubspot.com/contacts/${hubCfg.portalId}/contact/${account.hubspotContactId}`
      : null;

  const onPipelineChange = async (next: LeadPipelineStage) => {
    try {
      const updated = await updateAccount(account.id, { leadPipelineStage: next });
      setAccount(updated);
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const onPushHubSpot = async () => {
    setPushing(true);
    setPushMsg(null);
    try {
      const { account: updated } = await pushAccountToHubSpot(account.id);
      setAccount(updated);
      const cfg = await fetchHubSpotConfig().catch(() => null);
      if (cfg) setHubCfg(cfg);
      setPushMsg('Pushed to HubSpot.');
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : 'Push failed');
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      <DemoDataNotice />
      <div className="mt-3 space-y-2">
        <HubSpotHandoffBanner />
        {hubCfg?.pushDisabled && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-2xs text-amber-900">
            HubSpot push is disabled server-side (<code className="font-mono">DISABLE_HUBSPOT_PUSH</code>). Configure token to push contacts.
          </div>
        )}
        {!hubCfg?.portalConfigured && !hubCfg?.pushDisabled && (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-2xs text-neutral-600">
            Set <code className="font-mono">HUBSPOT_PORTAL_ID</code> in env to enable &quot;Open in HubSpot&quot; links after push.
          </div>
        )}
      </div>

      {/* Header */}
      <div className="card p-5 mt-3 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-900">{account.name}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                {account.email && (
                  <a href={`mailto:${account.email}`} className="text-xs text-brand hover:underline">
                    {account.email}
                  </a>
                )}
                {account.phone && <span className="text-xs text-neutral-600">{account.phone}</span>}
                {account.website && (
                  <a
                    href={account.website.startsWith('http') ? account.website : `https://${account.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand hover:underline flex items-center gap-1"
                  >
                    {account.domain || account.website} <ExternalLink className="h-3 w-3" />
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
          <div className="flex flex-col items-end gap-2 max-w-[min(100%,320px)]">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <FitScoreBadge score={account.fitScore} />
              <span className={cn('text-2xs px-2 py-0.5 rounded font-medium', REVIEW_STATE_COLORS[account.reviewState])}>
                {REVIEW_STATE_LABELS[account.reviewState]}
              </span>
              <span
                className={cn(
                  'text-2xs px-2 py-0.5 rounded font-medium',
                  LEAD_PIPELINE_STAGE_COLORS[pipelineStage] ?? 'bg-neutral-100 text-neutral-600',
                )}
              >
                {LEAD_PIPELINE_STAGE_LABELS[pipelineStage] ?? pipelineStage}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="text-2xs text-neutral-500">Pipeline</span>
              <select
                value={pipelineStage}
                onChange={(e) => onPipelineChange(e.target.value as LeadPipelineStage)}
                className="h-7 text-2xs border border-neutral-200 rounded-md px-1.5 bg-white text-neutral-800 max-w-[148px]"
              >
                {(Object.keys(LEAD_PIPELINE_STAGE_LABELS) as LeadPipelineStage[]).map((k) => (
                  <option key={k} value={k}>
                    {LEAD_PIPELINE_STAGE_LABELS[k]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onPushHubSpot}
                disabled={pushing || hubCfg?.pushDisabled || !eligible}
                title={eligible ? 'Create/update contact in HubSpot' : hubspotEligibilityReason(account) ?? undefined}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-2xs font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 disabled:pointer-events-none"
              >
                {pushing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Push to HubSpot
              </button>
              {hubspotUrl && (
                <a
                  href={hubspotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-2xs font-medium border border-sky-200 text-sky-800 bg-sky-50 hover:bg-sky-100"
                >
                  Open in HubSpot <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {pushMsg && <p className="text-2xs text-right text-neutral-600 w-full">{pushMsg}</p>}
            {account.hubspotLastPushError && pipelineStage === 'push_failed' && (
              <p className="text-2xs text-right text-red-700 w-full break-words" title={account.hubspotLastPushError}>
                {account.hubspotLastPushError.slice(0, 120)}
                {account.hubspotLastPushError.length > 120 ? '…' : ''}
              </p>
            )}
          </div>
        </div>

        <p className="text-xs text-neutral-600 mt-3">{account.description || '—'}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-neutral-100">
          <div>
            <p className="text-2xs text-neutral-500">Country / Region</p>
            <p className="text-xs font-medium text-neutral-800">{account.country} {account.region && `/ ${account.region}`}</p>
          </div>
          <div>
            <p className="text-2xs text-neutral-500">Industry</p>
            <p className="text-xs font-medium text-neutral-800">{account.industry || '—'} {account.subindustry && `— ${account.subindustry}`}</p>
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
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-brand" />
            Fit Assessment
          </h3>
          <p className="text-xs text-neutral-600 mb-3">{account.fitSummary || '—'}</p>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xs text-neutral-500">Qualification:</span>
            <span className={cn('text-2xs px-1.5 py-0.5 rounded border font-medium capitalize', qualColor)}>
              {qualLevel}
            </span>
          </div>

          <div className="space-y-1.5 pt-3 border-t border-neutral-100">
            <p className="text-2xs font-semibold text-neutral-700 mb-1">
              Score Breakdown {seedBreakdown ? '' : '(rules scaffold)'}
            </p>
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
                <p className="text-2xs text-neutral-500">Suggested bundle (scaffold)</p>
                <p className="text-xs font-medium text-neutral-800">{scoreBreakdown.recommendedBundle}</p>
              </div>
            )}
          </div>
        </div>

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
              <span className="text-2xs text-neutral-500">Source URL</span>
              <span className="text-xs text-neutral-700 truncate max-w-[200px]">{account.sourceUrl || '—'}</span>
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
            <p className="text-2xs text-neutral-400 italic">No product fit rows (demo seed only for legacy IDs).</p>
          )}
        </div>

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
            <p className="text-2xs text-neutral-400 italic">No signals (persisted signals table not wired yet).</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
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
            <p className="text-2xs text-neutral-400 italic">No review history rows yet.</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="card p-4 opacity-60">
            <h3 className="text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Contacts <PlannedBadge />
            </h3>
            <p className="text-2xs text-neutral-500">Buying committee contacts from licensed data.</p>
          </div>
          <div className="card p-4 opacity-60">
            <h3 className="text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5" /> Social Signals <PlannedBadge />
            </h3>
            <p className="text-2xs text-neutral-500">Problem signals from social monitoring.</p>
          </div>
          <div className="card p-4 opacity-60">
            <h3 className="text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Internal Notes <PlannedBadge />
            </h3>
            <p className="text-2xs text-neutral-500">Persistent internal notes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
