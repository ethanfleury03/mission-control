'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Gauge,
  Globe2,
  Layers3,
  MapPinned,
  Orbit,
  RefreshCcw,
  Settings,
  Sparkles,
  Target,
  UsersRound,
  X,
} from 'lucide-react';
import { cn, formatNumber, formatTimeAgo } from '@/app/lib/utils';
import {
  createGeoDealer,
  deleteGeoDealer,
  fetchGeoCountryDrilldown,
  fetchGeoDashboard,
  fetchGeoDealers,
  syncGeoHubSpot,
  updateGeoDealer,
} from '@/lib/geo-intelligence/api';
import type {
  GeoCountryDrilldownSnapshot,
  GeoDashboardSnapshot,
  GeoDealer,
  GeoDealerInput,
  GeoFilterOption,
  GeoFilterState,
  GeoLayerKey,
  GeoTopStat,
} from '@/lib/geo-intelligence/types';
import { GeoDealerSettingsPage } from './GeoDealerSettingsPage';
import { GeoGlobeScene } from './GeoGlobeScene';

type GeoPage = 'dashboard' | 'settings';

const DEFAULT_FILTERS: GeoFilterState = {
  ownerId: '',
  lifecycleStage: '',
  leadStatus: '',
  persona: '',
};

const DEFAULT_LAYERS: Record<GeoLayerKey, boolean> = {
  dealers: true,
  dealerNetwork: true,
  countryHeatmap: true,
  stateHeatmap: true,
  contactCoverage: true,
};

const NAV_ITEMS: Array<{
  id: GeoPage;
  label: string;
  icon: typeof Gauge;
  description: string;
}> = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Gauge,
    description: 'Globe, coverage, and territory view',
  },
];

export function GeoIntelligenceTab() {
  const [activePage, setActivePage] = useState<GeoPage>('dashboard');
  const [filters, setFilters] = useState<GeoFilterState>(DEFAULT_FILTERS);
  const deferredFilters = useDeferredValue(filters);
  const [layers, setLayers] = useState<Record<GeoLayerKey, boolean>>(DEFAULT_LAYERS);
  const [dashboard, setDashboard] = useState<GeoDashboardSnapshot | null>(null);
  const [drilldown, setDrilldown] = useState<GeoCountryDrilldownSnapshot | null>(null);
  const [selectedCountryIsoA3, setSelectedCountryIsoA3] = useState<string | null>(null);
  const [selectedDealer, setSelectedDealer] = useState<GeoDealer | null>(null);
  const [dealers, setDealers] = useState<GeoDealer[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadingDealers, setLoadingDealers] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSyncAttemptedRef = useRef(false);

  const loadDashboard = useCallback(async (activeFilters: GeoFilterState, quiet = false) => {
    if (!quiet) setLoadingDashboard(true);
    setError(null);
    try {
      const snapshot = await fetchGeoDashboard(activeFilters);
      setDashboard(snapshot);
      setSelectedDealer((current) => (current ? snapshot.dealers.find((dealer) => dealer.id === current.id) ?? null : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Geo Intelligence dashboard');
    } finally {
      if (!quiet) setLoadingDashboard(false);
    }
  }, []);

  const loadDealers = useCallback(async () => {
    setLoadingDealers(true);
    try {
      const nextDealers = await fetchGeoDealers();
      setDealers(nextDealers);
      setSelectedDealer((current) => (current ? nextDealers.find((dealer) => dealer.id === current.id) ?? null : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Geo dealers');
    } finally {
      setLoadingDealers(false);
    }
  }, []);

  const loadDrilldown = useCallback(async (countryIsoA3: string | null, activeFilters: GeoFilterState) => {
    if (!countryIsoA3) {
      setDrilldown(null);
      return;
    }

    try {
      const snapshot = await fetchGeoCountryDrilldown(countryIsoA3, activeFilters);
      setDrilldown(snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load country drilldown');
      setDrilldown(null);
    }
  }, []);

  useEffect(() => {
    void loadDashboard(deferredFilters);
  }, [deferredFilters, loadDashboard]);

  useEffect(() => {
    void loadDrilldown(selectedCountryIsoA3, deferredFilters);
  }, [deferredFilters, loadDrilldown, selectedCountryIsoA3]);

  useEffect(() => {
    if (activePage !== 'settings') return;
    void loadDealers();
  }, [activePage, loadDealers]);

  useEffect(() => {
    if (!dashboard?.sync.hubspotConfigured || !dashboard.sync.stale || autoSyncAttemptedRef.current || syncing) return;
    autoSyncAttemptedRef.current = true;
    void (async () => {
      try {
        setSyncing(true);
        await syncGeoHubSpot();
        await loadDashboard(deferredFilters, true);
        if (selectedCountryIsoA3) await loadDrilldown(selectedCountryIsoA3, deferredFilters);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Automatic Geo sync failed');
      } finally {
        setSyncing(false);
      }
    })();
  }, [dashboard?.sync.hubspotConfigured, dashboard?.sync.stale, deferredFilters, loadDashboard, loadDrilldown, selectedCountryIsoA3, syncing]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncGeoHubSpot();
      await loadDashboard(deferredFilters, true);
      if (selectedCountryIsoA3) await loadDrilldown(selectedCountryIsoA3, deferredFilters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'HubSpot sync failed');
    } finally {
      setSyncing(false);
    }
  }, [deferredFilters, loadDashboard, loadDrilldown, selectedCountryIsoA3]);

  const handleSaveDealer = useCallback(
    async (payload: GeoDealerInput, id?: string) => {
      const dealer = id ? await updateGeoDealer(id, payload) : await createGeoDealer(payload);
      await Promise.all([loadDealers(), loadDashboard(deferredFilters, true)]);
      if (selectedCountryIsoA3) await loadDrilldown(selectedCountryIsoA3, deferredFilters);
      setSelectedDealer(dealer);
    },
    [deferredFilters, loadDashboard, loadDealers, loadDrilldown, selectedCountryIsoA3],
  );

  const handleDeleteDealer = useCallback(
    async (id: string) => {
      await deleteGeoDealer(id);
      setSelectedDealer(null);
      await Promise.all([loadDealers(), loadDashboard(deferredFilters, true)]);
      if (selectedCountryIsoA3) await loadDrilldown(selectedCountryIsoA3, deferredFilters);
    },
    [deferredFilters, loadDashboard, loadDealers, loadDrilldown, selectedCountryIsoA3],
  );

  const selectedCountryName = drilldown?.country.name ?? null;
  const activeDealers = dashboard?.dealers.filter((dealer) => dealer.status === 'active') ?? [];
  const topCountries = dashboard?.topCountries ?? [];
  const topStates = drilldown?.topStates ?? dashboard?.topStates ?? [];
  const topOwners = dashboard?.topOwners ?? [];
  const topPersonas = dashboard?.topPersonas ?? [];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="w-52 shrink-0 border-r border-hub-border bg-white">
        <div className="border-b border-hub-border p-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">Geo Intelligence</h2>
          <p className="mt-0.5 text-2xs text-neutral-500">Dealer ecosystem & HubSpot coverage</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                className={cn(
                  'mb-1 w-full rounded-md px-2.5 py-2 text-left transition-colors',
                  isActive ? 'bg-brand/10 text-brand' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs font-medium">{item.label}</span>
                </span>
                <span className={cn('mt-1 block pl-[1.45rem] text-2xs', isActive ? 'text-brand/70' : 'text-neutral-400')}>
                  {item.description}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-hub-border p-3">
          <button
            type="button"
            onClick={() => setActivePage('settings')}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
              activePage === 'settings'
                ? 'bg-brand/10 text-brand'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
            )}
          >
            <Settings className="h-3.5 w-3.5 shrink-0" />
            <div>
              <p className="text-xs font-medium">Settings</p>
              <p className="text-2xs text-neutral-400">Manage dealers & map coordinates</p>
            </div>
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto bg-bg-primary">
        {activePage === 'settings' ? (
          <GeoDealerSettingsPage
            dealers={dealers}
            loading={loadingDealers}
            syncing={syncing}
            syncMeta={dashboard?.sync ?? null}
            selectedDealer={selectedDealer}
            onSelectDealer={setSelectedDealer}
            onSave={handleSaveDealer}
            onDelete={handleDeleteDealer}
            onSyncHubSpot={handleSync}
          />
        ) : (
          <div className="px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-3 rounded-2xl border border-brand/15 bg-white px-4 py-3 shadow-sm">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                    <Orbit className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Geo Intelligence</p>
                    <h2 className="text-[2rem] font-semibold tracking-tight text-neutral-950">Global Territory Surface</h2>
                    <p className="mt-1 max-w-3xl text-sm text-neutral-500">
                      A single globe for dealer presence, Arrow routing, and HubSpot contact density. No CRM layer, just spatial signal.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SyncBadge
                  label={dashboard?.sync.status ?? 'idle'}
                  caption={
                    dashboard?.sync.hubspotConfigured
                      ? dashboard?.sync.lastSyncedAt
                        ? `Synced ${formatTimeAgo(dashboard.sync.lastSyncedAt)}`
                        : 'No contact snapshot yet'
                      : 'HubSpot token missing'
                  }
                  tone={dashboard?.sync.hubspotConfigured ? 'brand' : 'neutral'}
                />
                {selectedCountryName && (
                  <SyncBadge
                    label="Focus"
                    caption={selectedCountryName}
                    tone="green"
                  />
                )}
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 rounded-xl border border-brand/20 bg-brand/5 px-3.5 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCcw className={cn('h-4 w-4', syncing && 'animate-spin')} />
                  {syncing ? 'Syncing…' : 'Refresh HubSpot'}
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                icon={MapPinned}
                title="Active Dealers"
                value={formatNumber(dashboard?.summary.activeDealers ?? 0)}
                caption={`${formatNumber(activeDealers.length)} live pin${activeDealers.length === 1 ? '' : 's'} on globe`}
                accent="brand"
              />
              <MetricCard
                icon={Globe2}
                title="Countries Covered"
                value={formatNumber(dashboard?.summary.countriesCovered ?? 0)}
                caption="Country-level HubSpot coverage"
                accent="neutral"
              />
              <MetricCard
                icon={Layers3}
                title="States / Regions"
                value={formatNumber(dashboard?.summary.statesCovered ?? 0)}
                caption={selectedCountryName ? `Drilldown active for ${selectedCountryName}` : 'Focused drilldown available'}
                accent="green"
              />
              <MetricCard
                icon={UsersRound}
                title="Mapped Contacts"
                value={formatNumber(dashboard?.summary.hubspotContactsMapped ?? 0)}
                caption="Location-ready HubSpot contacts"
                accent="neutral"
              />
              <MetricCard
                icon={Sparkles}
                title="Unmapped Contacts"
                value={formatNumber(dashboard?.summary.unmappedContacts ?? 0)}
                caption="Counted for diagnostics only"
                accent="amber"
              />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_360px]">
              <div className="space-y-4">
                <div className="rounded-[28px] border border-hub-border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Layers & Filters</p>
                      <p className="mt-1 text-sm text-neutral-500">
                        The legend is also the control surface. Turn layers on and off, then segment contact coverage using live HubSpot properties.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFilters(DEFAULT_FILTERS);
                        setSelectedCountryIsoA3(null);
                        setSelectedDealer(null);
                      }}
                      className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:border-brand/20 hover:text-brand"
                    >
                      Clear filters
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      { key: 'dealers', label: 'Dealers' },
                      { key: 'dealerNetwork', label: 'Dealer Network' },
                      { key: 'countryHeatmap', label: 'Country Heatmap' },
                      { key: 'stateHeatmap', label: 'State / Region Heatmap' },
                      { key: 'contactCoverage', label: 'Contact Coverage' },
                    ].map((layer) => (
                      <button
                        key={layer.key}
                        type="button"
                        onClick={() =>
                          setLayers((current) => ({
                            ...current,
                            [layer.key]: !current[layer.key as GeoLayerKey],
                          }))
                        }
                        className={cn(
                          'geo-layer-chip',
                          layers[layer.key as GeoLayerKey] && 'geo-layer-chip-active',
                        )}
                      >
                        {layer.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <FilterSelect
                      label="Owner"
                      value={filters.ownerId}
                      onChange={(value) => setFilters((current) => ({ ...current, ownerId: value }))}
                      options={dashboard?.filters.owners ?? []}
                    />
                    <FilterSelect
                      label="Lifecycle Stage"
                      value={filters.lifecycleStage}
                      onChange={(value) => setFilters((current) => ({ ...current, lifecycleStage: value }))}
                      options={dashboard?.filters.lifecycleStages ?? []}
                    />
                    <FilterSelect
                      label="Lead Status"
                      value={filters.leadStatus}
                      onChange={(value) => setFilters((current) => ({ ...current, leadStatus: value }))}
                      options={dashboard?.filters.leadStatuses ?? []}
                    />
                    <FilterSelect
                      label="Persona"
                      value={filters.persona}
                      onChange={(value) => setFilters((current) => ({ ...current, persona: value }))}
                      options={dashboard?.filters.personas ?? []}
                    />
                  </div>
                </div>

                <GeoGlobeScene
                  snapshot={dashboard}
                  drilldown={drilldown}
                  layers={layers}
                  loading={loadingDashboard}
                  selectedDealer={selectedDealer}
                  onSelectCountry={(countryIsoA3) => {
                    setSelectedDealer(null);
                    setSelectedCountryIsoA3((current) => (current === countryIsoA3 ? null : countryIsoA3));
                  }}
                  onSelectDealer={setSelectedDealer}
                  onResetView={() => {
                    setSelectedCountryIsoA3(null);
                    setSelectedDealer(null);
                  }}
                />
              </div>

              <div className="space-y-4">
                <SideCard
                  title={selectedCountryName ? `${selectedCountryName} Snapshot` : 'Global Snapshot'}
                  eyebrow="Territory Read"
                >
                  <div className="space-y-3 text-sm text-neutral-600">
                    {selectedCountryName ? (
                      <>
                        <SnapshotLine label="Mapped contacts" value={formatNumber(drilldown?.summary.mappedContacts ?? 0)} />
                        <SnapshotLine label="States with signal" value={formatNumber(drilldown?.summary.statesWithCoverage ?? 0)} />
                        <SnapshotLine label="Active dealers" value={formatNumber(drilldown?.summary.activeDealers ?? 0)} />
                        <SnapshotLine label="Boundary detail" value={drilldown?.availableAdmin1 ? 'Admin1 polygons loaded' : 'Country-only focus'} />
                      </>
                    ) : (
                      <>
                        <SnapshotLine label="Arrow origin" value="Burlington, Ontario" />
                        <SnapshotLine label="Dealer routes" value={formatNumber(dashboard?.dealerArcs.length ?? 0)} />
                        <SnapshotLine label="HubSpot snapshot" value={dashboard?.sync.lastSyncedAt ? formatTimeAgo(dashboard.sync.lastSyncedAt) : 'Not synced'} />
                        <SnapshotLine label="Coverage scope" value={`${formatNumber(dashboard?.summary.countriesCovered ?? 0)} countries`} />
                      </>
                    )}
                  </div>
                </SideCard>

                <SideCard title="Top Countries" eyebrow="Coverage Hotspots">
                  <StatList stats={topCountries} emptyLabel="Country coverage will appear after the first sync." />
                </SideCard>

                <SideCard title={selectedCountryName ? 'Top States / Regions' : 'Top States'} eyebrow="Drilldown Density">
                  <StatList stats={topStates} emptyLabel="Click a country to unlock state-level ranking." />
                </SideCard>

                <SideCard title="Owners & Personas" eyebrow="Segmentation">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Top Owners</p>
                      <div className="mt-3">
                        <StatList stats={topOwners} emptyLabel="Owner data will populate after HubSpot sync." limit={5} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Top Personas</p>
                      <div className="mt-3">
                        <StatList stats={topPersonas} emptyLabel="Persona data will populate after HubSpot sync." limit={5} />
                      </div>
                    </div>
                  </div>
                </SideCard>

                <SideCard title="Dealer Directory" eyebrow="Manual Network">
                  <div className="space-y-2">
                    {activeDealers.length === 0 ? (
                      <p className="text-sm text-neutral-500">No active dealers yet. Add them in Settings to light up the network.</p>
                    ) : (
                      activeDealers.slice(0, 6).map((dealer) => (
                        <button
                          key={dealer.id}
                          type="button"
                          onClick={() => setSelectedDealer(dealer)}
                          className="w-full rounded-2xl border border-transparent bg-neutral-50 px-3 py-3 text-left transition-colors hover:border-brand/20 hover:bg-brand/5"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-neutral-900">{dealer.name}</p>
                              <p className="mt-1 text-xs text-neutral-500">
                                {[dealer.city, dealer.stateRegion, dealer.country].filter(Boolean).join(', ')}
                              </p>
                            </div>
                            <span className="rounded-full bg-brand/10 px-2 py-1 text-[11px] font-semibold text-brand">
                              {formatNumber(dealer.sameCountryContacts)}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </SideCard>
              </div>
            </div>
          </div>
        )}

        {activePage === 'dashboard' && selectedDealer && (
          <div className="absolute inset-y-0 right-0 z-20 w-full max-w-[26rem] border-l border-hub-border bg-white/96 shadow-[-24px_0_60px_rgba(7,8,12,0.18)] backdrop-blur-xl">
            <div className="flex h-full flex-col">
              <div className="border-b border-hub-border px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Dealer Detail</p>
                    <h3 className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-950">{selectedDealer.name}</h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      {[selectedDealer.city, selectedDealer.stateRegion, selectedDealer.country].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDealer(null)}
                    className="rounded-full border border-neutral-200 p-2 text-neutral-500 transition-colors hover:border-brand/20 hover:text-brand"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                <div className="rounded-[24px] border border-brand/15 bg-brand/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Arrow Route</p>
                  <p className="mt-2 text-sm text-neutral-700">
                    This dealer is rendered as a live globe pin, receives an Arrow origin route, and contributes to territory context without duplicating CRM workflows.
                  </p>
                </div>

                <DetailCard title="Address">
                  <p className="text-sm leading-6 text-neutral-700">
                    {selectedDealer.addressLine1}
                    {selectedDealer.addressLine2 ? <><br />{selectedDealer.addressLine2}</> : null}
                    {selectedDealer.city || selectedDealer.stateRegion || selectedDealer.postalCode ? (
                      <>
                        <br />
                        {[selectedDealer.city, selectedDealer.stateRegion, selectedDealer.postalCode].filter(Boolean).join(', ')}
                      </>
                    ) : null}
                    <br />
                    {selectedDealer.country}
                  </p>
                </DetailCard>

                <DetailCard title="Coverage Context">
                  <div className="space-y-3 text-sm text-neutral-700">
                    <SnapshotLine label="Same-country contacts" value={formatNumber(selectedDealer.sameCountryContacts)} />
                    <SnapshotLine label="Same-state contacts" value={formatNumber(selectedDealer.sameStateContacts)} />
                    <SnapshotLine label="Same-city contacts" value={formatNumber(selectedDealer.sameCityContacts)} />
                    <SnapshotLine label="Status" value={selectedDealer.status} />
                  </div>
                </DetailCard>

                <DetailCard title="Map Coordinates">
                  <div className="space-y-2 text-sm text-neutral-700">
                    <SnapshotLine label="Latitude" value={selectedDealer.lat.toFixed(5)} mono />
                    <SnapshotLine label="Longitude" value={selectedDealer.lng.toFixed(5)} mono />
                  </div>
                </DetailCard>

                <DetailCard title="Notes">
                  <p className="text-sm leading-6 text-neutral-700">
                    {selectedDealer.notes || 'No notes yet. Use Settings to add territory context, specialization, or operational guidance.'}
                  </p>
                </DetailCard>
              </div>

              <div className="border-t border-hub-border px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setActivePage('settings');
                    void loadDealers();
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                >
                  <Settings className="h-4 w-4" />
                  Edit in Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  caption,
  accent,
}: {
  icon: typeof MapPinned;
  title: string;
  value: string;
  caption: string;
  accent: 'brand' | 'neutral' | 'green' | 'amber';
}) {
  const accentClass = {
    brand: 'bg-brand/10 text-brand',
    neutral: 'bg-neutral-100 text-neutral-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  }[accent];

  return (
    <div className="rounded-[24px] border border-hub-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', accentClass)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-neutral-950">{value}</p>
      <p className="mt-2 text-sm font-medium text-neutral-800">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{caption}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: GeoFilterOption[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="geo-input"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({formatNumber(option.count)})
          </option>
        ))}
      </select>
    </label>
  );
}

function SideCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-hub-border bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-semibold text-neutral-950">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function StatList({
  stats,
  emptyLabel,
  limit = 6,
}: {
  stats: GeoTopStat[];
  emptyLabel: string;
  limit?: number;
}) {
  if (stats.length === 0) {
    return <p className="text-sm text-neutral-500">{emptyLabel}</p>;
  }

  const max = Math.max(...stats.slice(0, limit).map((stat) => stat.count), 1);

  return (
    <div className="space-y-3">
      {stats.slice(0, limit).map((stat) => (
        <div key={stat.key}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-neutral-700">{stat.label}</span>
            <span className="font-semibold text-neutral-900">{formatNumber(stat.count)}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand/55 to-brand"
              style={{ width: `${Math.max(8, (stat.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function SnapshotLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-neutral-500">{label}</span>
      <span className={cn('font-medium text-neutral-900', mono && 'font-mono text-[13px]')}>{value}</span>
    </div>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-hub-border bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SyncBadge({
  label,
  caption,
  tone,
}: {
  label: string;
  caption: string;
  tone: 'brand' | 'green' | 'neutral';
}) {
  const toneClass = {
    brand: 'border-brand/20 bg-brand/5 text-brand',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    neutral: 'border-neutral-200 bg-neutral-100 text-neutral-700',
  }[tone];

  return (
    <div className={cn('rounded-2xl border px-3 py-2', toneClass)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-1 text-sm font-medium text-neutral-900">{caption}</p>
    </div>
  );
}
