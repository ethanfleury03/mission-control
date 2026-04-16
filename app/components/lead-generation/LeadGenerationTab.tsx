'use client';

import { useState, useCallback } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Database,
  Building2,
  Radio,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { LeadGenPage } from '@/lib/lead-generation/types';
import { LeadGenDashboard } from './LeadGenDashboard';
import { LeadGenOverview } from './LeadGenOverview';
import { MarketDatabases } from './MarketDatabases';
import { MarketDetail } from './MarketDetail';
import { AccountsExplorer } from './AccountsExplorer';
import { AccountDetail } from './AccountDetail';
import { SocialSignals } from './SocialSignals';

interface NavItem {
  id: LeadGenPage;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'markets', label: 'Market Databases', icon: Database },
  { id: 'accounts', label: 'Accounts', icon: Building2 },
  { id: 'social-signals', label: 'Social Signals', icon: Radio },
];

export function LeadGenerationTab() {
  const [activePage, setActivePage] = useState<LeadGenPage>('dashboard');
  const [selectedMarketSlug, setSelectedMarketSlug] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const navigate = useCallback((page: LeadGenPage, params?: { marketSlug?: string; accountId?: string }) => {
    setActivePage(page);
    if (params?.marketSlug !== undefined) setSelectedMarketSlug(params.marketSlug);
    if (params?.accountId !== undefined) setSelectedAccountId(params.accountId);
  }, []);

  const isDetailPage = activePage === 'market-detail' || activePage === 'account-detail';

  const renderContent = () => {
    switch (activePage) {
      case 'dashboard':
        return <LeadGenDashboard onNavigate={navigate} />;
      case 'overview':
        return <LeadGenOverview />;
      case 'markets':
        return <MarketDatabases onSelectMarket={(slug) => navigate('market-detail', { marketSlug: slug })} />;
      case 'market-detail':
        return (
          <MarketDetail
            slug={selectedMarketSlug ?? ''}
            onBack={() => navigate('markets')}
            onSelectAccount={(id) => navigate('account-detail', { accountId: id })}
          />
        );
      case 'accounts':
        return <AccountsExplorer onSelectAccount={(id) => navigate('account-detail', { accountId: id })} />;
      case 'account-detail':
        return (
          <AccountDetail
            accountId={selectedAccountId ?? ''}
            onBack={() => navigate('accounts')}
            onNavigateMarket={(slug) => navigate('market-detail', { marketSlug: slug })}
          />
        );
      case 'social-signals':
        return <SocialSignals />;
      default:
        return <LeadGenDashboard onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden min-h-0">
      {/* Internal sub-navigation */}
      <div className="w-52 shrink-0 bg-white border-r border-hub-border flex flex-col">
        <div className="p-3 border-b border-hub-border">
          <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Lead Generation</h2>
          <p className="text-2xs text-neutral-500 mt-0.5">Market intelligence & qualification</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id ||
              (item.id === 'markets' && activePage === 'market-detail') ||
              (item.id === 'accounts' && activePage === 'account-detail');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={cn(
                  'w-full text-left rounded-md px-2.5 py-2 transition-colors flex items-center gap-2 mb-0.5',
                  isActive
                    ? 'bg-brand/10 text-brand font-medium'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-hub-border">
          <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2">
            <p className="text-2xs font-medium text-amber-800">Imported Data</p>
            <p className="text-2xs text-amber-600 mt-0.5">Markets and accounts stay empty until you create or import them.</p>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto bg-bg-primary">
        {isDetailPage && (
          <div className="px-6 pt-4">
            <button
              type="button"
              onClick={() => navigate(activePage === 'market-detail' ? 'markets' : 'accounts')}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-brand transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to {activePage === 'market-detail' ? 'Market Databases' : 'Accounts'}
            </button>
          </div>
        )}
        {renderContent()}
      </div>
    </div>
  );
}
