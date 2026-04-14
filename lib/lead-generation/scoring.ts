// ---------------------------------------------------------------------------
// Lead Generation – Scoring Foundation
// ---------------------------------------------------------------------------
// Rules-first scoring scaffold. Defines dimensions, weights, and placeholder
// scoring logic. The full engine (with AI explanations) will build on this.
// ---------------------------------------------------------------------------

import type { Account, ScoreDimension, FitScoreBreakdown } from './types';
import { SCORING_DIMENSIONS } from './config';

// ── Score Dimension Evaluators ──────────────────────────────────────────────

type DimensionEvaluator = (account: Account) => { score: number; rationale: string };

const SERVED_INDUSTRIES = new Set([
  'Coffee', 'Food & Beverage', 'Pharma / Nutraceutical', 'Chemical',
  'Flexible Packaging', 'Label Converters', 'Corrugated / Packaging',
  'Industrial Manufacturing', 'Cosmetics & Personal Care', 'Government & Military',
  'Aviation', 'Building Materials & Decor',
]);

const PILOT_COUNTRIES = new Set(['Canada', 'India', 'Italy', 'Mexico']);

const evaluators: Record<string, DimensionEvaluator> = {
  industry_fit(account) {
    if (SERVED_INDUSTRIES.has(account.industry)) {
      return { score: 25, rationale: `${account.industry} is a directly served segment` };
    }
    if (account.subindustry && SERVED_INDUSTRIES.has(account.subindustry)) {
      return { score: 20, rationale: `Subindustry ${account.subindustry} aligns with served segments` };
    }
    return { score: 5, rationale: 'Industry not in primary served segments' };
  },

  use_case_fit(account) {
    let score = 10;
    const notes: string[] = [];
    const desc = (account.description + ' ' + account.fitSummary).toLowerCase();
    if (desc.includes('short-run') || desc.includes('high-mix')) { score += 5; notes.push('short-run/high-mix'); }
    if (desc.includes('label') || desc.includes('packaging')) { score += 5; notes.push('label/packaging need'); }
    if (desc.includes('compliance') || desc.includes('ghs') || desc.includes('food-safe')) { score += 3; notes.push('compliance driver'); }
    if (desc.includes('digital') || desc.includes('in-house')) { score += 2; notes.push('digital/in-house intent'); }
    return { score: Math.min(score, 25), rationale: notes.length ? `Use-case signals: ${notes.join(', ')}` : 'Limited use-case signals detected' };
  },

  compliance_intensity(account) {
    let score = 3;
    const desc = (account.description + ' ' + account.fitSummary).toLowerCase();
    if (desc.includes('ghs')) score += 5;
    if (desc.includes('food-safe') || desc.includes('fssai') || desc.includes('fda')) score += 4;
    if (desc.includes('serialization') || desc.includes('vdp') || desc.includes('track')) score += 3;
    if (desc.includes('pharma') || desc.includes('nutraceutical')) score += 3;
    return { score: Math.min(score, 15), rationale: score > 5 ? 'Compliance-intensive use case detected' : 'Standard compliance level' };
  },

  technical_feasibility(account) {
    let score = 10;
    if (account.companySizeBand === 'enterprise') score += 3;
    else if (account.companySizeBand === 'mid-market') score += 2;
    return { score: Math.min(score, 15), rationale: 'Technical feasibility assumed pending facility assessment' };
  },

  commercial_readiness(account) {
    let score = 5;
    if (account.companySizeBand === 'enterprise') score += 3;
    else if (account.companySizeBand === 'mid-market') score += 2;
    if (account.status === 'active') score += 1;
    return { score: Math.min(score, 10), rationale: `${account.companySizeBand} company, ${account.status} status` };
  },

  channel_accessibility(account) {
    let score = 2;
    if (PILOT_COUNTRIES.has(account.country)) score += 2;
    if (account.country === 'Canada') score += 1;
    return { score: Math.min(score, 5), rationale: PILOT_COUNTRIES.has(account.country) ? `${account.country} is a pilot territory` : 'Outside pilot territories' };
  },
};

// ── Calculate Fit Score ─────────────────────────────────────────────────────

export function calculateFitScore(account: Account): FitScoreBreakdown {
  const dimensions: ScoreDimension[] = SCORING_DIMENSIONS.map((dim) => {
    const evaluator = evaluators[dim.key];
    if (!evaluator) {
      return { key: dim.key, label: dim.label, maxPoints: dim.maxPoints, score: 0, rationale: 'No evaluator configured' };
    }
    const result = evaluator(account);
    return { key: dim.key, label: dim.label, maxPoints: dim.maxPoints, score: result.score, rationale: result.rationale };
  });

  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);

  return {
    accountId: account.id,
    totalScore,
    dimensions,
    recommendedBundle: inferBundle(account),
    aiExplanation: null,
    calculatedAt: new Date().toISOString(),
  };
}

// ── Bundle Inference ────────────────────────────────────────────────────────

function inferBundle(account: Account): string {
  const desc = (account.description + ' ' + account.fitSummary + ' ' + account.industry).toLowerCase();

  if (desc.includes('flexible') || desc.includes('pouch') || desc.includes('film') || desc.includes('wrap')) {
    return 'Hybrid Pro M + Digital Finishing';
  }
  if (desc.includes('corrugated') || desc.includes('box') || desc.includes('e-commerce')) {
    return 'OverJet Pro 700';
  }
  if (desc.includes('security') || desc.includes('anti-counterfeit') || desc.includes('vdp') || desc.includes('serialization')) {
    return 'Nova 250R+ / Security VDP Stack';
  }
  if (desc.includes('wide') || desc.includes('800')) {
    return 'Aqua 800M + Finishing';
  }
  if (desc.includes('durable') || desc.includes('asset tag') || desc.includes('industrial')) {
    return 'Nova 250R+ + Laser Finishing';
  }
  return 'Aqua 330R II + EZCut + Eco-300';
}

// ── Qualification Status ────────────────────────────────────────────────────

export type QualificationLevel = 'strong' | 'moderate' | 'weak' | 'unqualified';

export function getQualificationLevel(score: number): QualificationLevel {
  if (score >= 80) return 'strong';
  if (score >= 65) return 'moderate';
  if (score >= 45) return 'weak';
  return 'unqualified';
}

export function getQualificationColor(level: QualificationLevel): string {
  switch (level) {
    case 'strong': return 'text-green-700 bg-green-50 border-green-200';
    case 'moderate': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'weak': return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'unqualified': return 'text-red-700 bg-red-50 border-red-200';
  }
}
