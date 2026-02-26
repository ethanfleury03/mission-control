'use client';

import { useState, useEffect } from 'react';
import { formatNumber, cn } from '../lib/utils';
import { DollarSign, TrendingUp, Calendar, RotateCcw, AlertTriangle } from 'lucide-react';

interface CostData {
  weeklyTokens: number;
  weeklyCost: number;
  budgetLimit: number;
  previousWeek: number;
  byAgent: { name: string; tokens: number; cost: number; percent: number }[];
  byModel: { name: string; tokens: number; cost: number; percent: number }[];
}

// Mock cost data - in production this would come from your database
const generateCostData = (): CostData => ({
  weeklyTokens: 2847500,
  weeklyCost: 142.38,
  budgetLimit: 500.00,
  previousWeek: 128.92,
  byAgent: [
    { name: 'Clawd', tokens: 1250000, cost: 62.50, percent: 44 },
    { name: 'Forge', tokens: 850000, cost: 42.50, percent: 30 },
    { name: 'Athena', tokens: 520000, cost: 26.00, percent: 18 },
    { name: 'Quill', tokens: 227500, cost: 11.38, percent: 8 },
  ],
  byModel: [
    { name: 'claude-opus-4-6', tokens: 1800000, cost: 90.00, percent: 63 },
    { name: 'gpt-4-turbo', tokens: 620000, cost: 31.00, percent: 22 },
    { name: 'kimi-k2.5', tokens: 280000, cost: 14.00, percent: 10 },
    { name: 'claude-3-5-sonnet', tokens: 147500, cost: 7.38, percent: 5 },
  ],
});

// Calculate days until next Monday (weekly reset)
const getDaysUntilReset = (): number => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  return daysUntilMonday;
};

export function CostDashboard() {
  const [data, setData] = useState<CostData>(generateCostData());
  const [activeTab, setActiveTab] = useState<'agents' | 'models'>('agents');
  const [daysUntilReset, setDaysUntilReset] = useState<number>(1);
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setDaysUntilReset(getDaysUntilReset());
    setMounted(true);
  }, []);
  
  const budgetPercent = (data.weeklyCost / data.budgetLimit) * 100;
  const weekOverWeek = ((data.weeklyCost - data.previousWeek) / data.previousWeek) * 100;

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => ({
        ...prev,
        weeklyTokens: prev.weeklyTokens + Math.floor(Math.random() * 1000),
        weeklyCost: Number((prev.weeklyCost + Math.random() * 0.05).toFixed(2)),
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="col-span-5 card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-accent-green" />
          <span className="text-xs font-medium text-text-primary uppercase tracking-wider">Cost Dashboard</span>
        </div>
        <div className="flex items-center gap-2 text-2xs text-text-muted">
          <Calendar className="w-3 h-3" />
          <span>Resets in {mounted ? daysUntilReset : '--'}d</span>
          <RotateCcw className="w-3 h-3 ml-2" />
          <span>Every Monday 00:00 UTC</span>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-bg-tertiary rounded-lg p-3 border border-white/5">
          <div className="text-2xs text-text-muted uppercase mb-1">Weekly Tokens</div>
          <div className="text-xl font-bold text-accent-cyan">{formatNumber(data.weeklyTokens)}</div>
          <div className="text-2xs text-text-muted mt-1">~${(data.weeklyCost * 0.05).toFixed(2)} est. cost</div>
        </div>
        <div className="bg-bg-tertiary rounded-lg p-3 border border-white/5">
          <div className="text-2xs text-text-muted uppercase mb-1">Weekly Cost</div>
          <div className="text-xl font-bold text-accent-green">${data.weeklyCost.toFixed(2)}</div>
          <div className={cn(
            "text-2xs mt-1 flex items-center gap-1",
            weekOverWeek > 0 ? "text-accent-red" : "text-accent-green"
          )}>
            <TrendingUp className="w-3 h-3" />
            {weekOverWeek > 0 ? '+' : ''}{weekOverWeek.toFixed(1)}% vs last week
          </div>
        </div>
        <div className="bg-bg-tertiary rounded-lg p-3 border border-white/5">
          <div className="text-2xs text-text-muted uppercase mb-1">Budget Used</div>
          <div className="text-xl font-bold text-text-primary">{budgetPercent.toFixed(1)}%</div>
          <div className="text-2xs text-text-muted mt-1">${data.weeklyCost.toFixed(2)} / ${data.budgetLimit}</div>
        </div>
      </div>

      {/* Budget Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-2xs mb-1">
          <span className="text-text-muted">Budget consumption</span>
          {budgetPercent > 80 && (
            <span className="text-accent-yellow flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Approaching limit
            </span>
          )}
        </div>
        <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-500",
              budgetPercent > 90 ? "bg-accent-red" : budgetPercent > 70 ? "bg-accent-yellow" : "bg-accent-green"
            )}
            style={{ width: `${Math.min(budgetPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setActiveTab('agents')}
          className={cn(
            "px-3 py-1.5 text-xs rounded-md transition-colors",
            activeTab === 'agents' 
              ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20" 
              : "text-text-secondary hover:bg-white/5"
          )}
        >
          By Agent
        </button>
        <button
          onClick={() => setActiveTab('models')}
          className={cn(
            "px-3 py-1.5 text-xs rounded-md transition-colors",
            activeTab === 'models' 
              ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20" 
              : "text-text-secondary hover:bg-white/5"
          )}
        >
          By Model
        </button>
      </div>

      {/* Cost Breakdown */}
      <div className="space-y-2">
        {(activeTab === 'agents' ? data.byAgent : data.byModel).map((item) => (
          <div key={item.name} className="flex items-center gap-3">
            <div className="w-24 text-xs text-text-primary truncate">{item.name}</div>
            <div className="flex-1">
              <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent-cyan rounded-full"
                  style={{ width: `${item.percent}%` }}
                />
              </div>
            </div>
            <div className="w-16 text-right">
              <div className="text-xs text-text-primary">${item.cost.toFixed(2)}</div>
              <div className="text-2xs text-text-muted">{formatNumber(item.tokens)} tokens</div>
            </div>
            <div className="w-8 text-right text-xs text-accent-cyan">{item.percent}%</div>
          </div>
        ))}
      </div>

      {/* Weekly Reset Info */}
      <div className="mt-4 pt-3 border-t border-white/5">
        <div className="flex items-center justify-between text-2xs">
          <span className="text-text-muted">Next reset: Monday 00:00 UTC</span>
          <span className="text-accent-cyan">{mounted ? `${daysUntilReset} days remaining` : '--'}</span>
        </div>
      </div>
    </div>
  );
}
