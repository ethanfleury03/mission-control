'use client';

import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  Globe2,
  Layers3,
  MapPinned,
  Orbit,
  RefreshCcw,
  Settings,
  Sparkles,
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
  stateHeatmap: false,
  contactCoverage: false,
};

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
      setSelectedDealer((current) =>
        current ? snapshot.dealers.find((dealer) => dealer.id === current.id) ?? null : null,
      );
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
      setSelectedDealer((current) =>
        current ? nextDealers.find((dealer) => dealer.id === current.id) ?? null : current,
      );
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
  }, [
    dashboard?.sync.hubspotConfigured,
    dashboard?.sync.stale,
    deferredFilters,
    loadDashboard,
    loadDrilldown,
    selectedCountryIsoA3,
    syncing,
  ]);

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

  if (activePage === 'settings') {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#f4f7fb]">
        <div className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Geo Intelligence</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950">Dealer Network Settings</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <GlassBadge
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
              <button
                type="button"
                onClick={() => setActivePage('dashboard')}
                className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-brand/20 hover:text-brand"
              >
                Back to Globe
              </button>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw className={cn('h-4 w-4', syncing && 'animate-spin')} />
                {syncing ? 'Syncing…' : 'Refresh HubSpot'}
              </button>
            </div>
          </div>
        </div>

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
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d1522] text-white">
      <div className="relative lg:absolute lg:inset-0">
        <GeoGlobeScene
          fullscreen
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

      <div className="relative z-20 flex min-h-screen flex-col p-4 sm:p-6 lg:pointer-events-none">
        <div className="flex flex-wrap items-center justify-end gap-2 lg:pointer-events-auto">
          <GlassBadge
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
          {selectedCountryName && <GlassBadge label="Focus" caption={selectedCountryName} tone="green" />}
          <button
            type="button"
            onClick={() => setActivePage('settings')}
            className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-slate-950/60 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition-colors hover:border-brand/35 hover:bg-brand/12"
          >
            <Settings className="h-4 w-4" />
            Dealers
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(196,30,58,0.35)] transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            {syncing ? 'Syncing…' : 'Refresh HubSpot'}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-[24px] border border-rose-500/25 bg-rose-950/55 px-4 py-3 text-sm text-rose-100 backdrop-blur-md lg:pointer-events-auto">
            {error}
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:mt-24 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)_minmax(18rem,24rem)] xl:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)_minmax(20rem,25rem)]">
          <div className="space-y-4 lg:pointer-events-auto">
            <OverlayPanel
              title="Layers & Filters"
              eyebrow="Live Controls"
              description="Toggle the network surface and segment the HubSpot snapshot without leaving the globe."
            >
              <div className="flex flex-wrap gap-2">
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
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      layers[layer.key as GeoLayerKey]
                        ? 'border-brand/40 bg-brand/15 text-white'
                        : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/20 hover:text-white',
                    )}
                  >
                    {layer.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-3">
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

              <button
                type="button"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setSelectedCountryIsoA3(null);
                  setSelectedDealer(null);
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-brand/30 hover:bg-brand/10 hover:text-white"
              >
                Clear filters
              </button>
            </OverlayPanel>

            <OverlayPanel
              title="Mission Snapshot"
              eyebrow="At A Glance"
              description="The geo surface is the primary workspace now, so core KPIs stay pinned beside the globe."
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <OverlayMetricCard
                  icon={MapPinned}
                  title="Active Dealers"
                  value={formatNumber(dashboard?.summary.activeDealers ?? 0)}
                  caption={`${formatNumber(activeDealers.length)} live pin${activeDealers.length === 1 ? '' : 's'} on globe`}
                  accent="brand"
                />
                <OverlayMetricCard
                  icon={Globe2}
                  title="Countries Covered"
                  value={formatNumber(dashboard?.summary.countriesCovered ?? 0)}
                  caption="Country-level HubSpot coverage"
                  accent="neutral"
                />
                <OverlayMetricCard
                  icon={Layers3}
                  title="States / Regions"
                  value={formatNumber(dashboard?.summary.statesCovered ?? 0)}
                  caption={selectedCountryName ? `Focused on ${selectedCountryName}` : 'State drilldown ready'}
                  accent="green"
                />
                <OverlayMetricCard
                  icon={UsersRound}
                  title="Mapped Contacts"
                  value={formatNumber(dashboard?.summary.hubspotContactsMapped ?? 0)}
                  caption={`${formatNumber(dashboard?.summary.unmappedContacts ?? 0)} still need cleanup`}
                  accent="amber"
                />
              </div>
            </OverlayPanel>
          </div>

          <div className="hidden lg:block" />

          <div className="space-y-4 lg:pointer-events-auto lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
            <OverlayPanel
              title={selectedCountryName ? `${selectedCountryName} Snapshot` : 'Global Snapshot'}
              eyebrow="Territory Read"
            >
              <div className="space-y-3 text-sm text-zinc-200">
                {selectedCountryName ? (
                  <>
                    <SnapshotLine label="Mapped contacts" value={formatNumber(drilldown?.summary.mappedContacts ?? 0)} />
                    <SnapshotLine label="States with signal" value={formatNumber(drilldown?.summary.statesWithCoverage ?? 0)} />
                    <SnapshotLine label="Active dealers" value={formatNumber(drilldown?.summary.activeDealers ?? 0)} />
                    <SnapshotLine
                      label="Boundary detail"
                      value={drilldown?.availableAdmin1 ? 'Admin1 polygons loaded' : 'Country-only focus'}
                    />
                  </>
                ) : (
                  <>
                    <SnapshotLine label="Arrow origin" value="Burlington, Ontario" />
                    <SnapshotLine label="Dealer routes" value={formatNumber(dashboard?.dealerArcs.length ?? 0)} />
                    <SnapshotLine
                      label="HubSpot snapshot"
                      value={dashboard?.sync.lastSyncedAt ? formatTimeAgo(dashboard.sync.lastSyncedAt) : 'Not synced'}
                    />
                    <SnapshotLine
                      label="Coverage scope"
                      value={`${formatNumber(dashboard?.summary.countriesCovered ?? 0)} countries`}
                    />
                  </>
                )}
              </div>
            </OverlayPanel>

            <OverlayPanel title="Top Countries" eyebrow="Coverage Hotspots">
              <StatList stats={topCountries} emptyLabel="Country coverage will appear after the first sync." />
            </OverlayPanel>

            <OverlayPanel title={selectedCountryName ? 'Top States / Regions' : 'Top States'} eyebrow="Drilldown Density">
              <StatList stats={topStates} emptyLabel="Click a country to unlock state-level ranking." />
            </OverlayPanel>

            <OverlayPanel title="Owners & Personas" eyebrow="Segmentation">
              <div className="grid gap-4 lg:grid-cols-1 xl:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Top Owners</p>
                  <div className="mt-3">
                    <StatList stats={topOwners} emptyLabel="Owner data will populate after sync." limit={5} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Top Personas</p>
                  <div className="mt-3">
                    <StatList stats={topPersonas} emptyLabel="Persona data will populate after sync." limit={5} />
                  </div>
                </div>
              </div>
            </OverlayPanel>

            <OverlayPanel title="Dealer Directory" eyebrow="Manual Network">
              <div className="space-y-2">
                {activeDealers.length === 0 ? (
                  <p className="text-sm text-zinc-400">No active dealers yet. Add them in Dealer Settings to light up the network.</p>
                ) : (
                  activeDealers.slice(0, 8).map((dealer) => (
                    <button
                      key={dealer.id}
                      type="button"
                      onClick={() => setSelectedDealer(dealer)}
                      className="w-full rounded-2xl border border-white/8 bg-white/5 px-3 py-3 text-left transition-colors hover:border-brand/25 hover:bg-brand/10"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{dealer.name}</p>
                          <p className="mt-1 text-xs text-zinc-400">
                            {[dealer.city, dealer.stateRegion, dealer.country].filter(Boolean).join(', ')}
                          </p>
                        </div>
                        <span className="rounded-full bg-brand/15 px-2 py-1 text-[11px] font-semibold text-white">
                          {formatNumber(dealer.sameCountryContacts)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </OverlayPanel>
          </div>
        </div>
      </div>

      {selectedDealer && (
        <div className="absolute inset-y-0 right-0 z-30 w-full max-w-[26rem] border-l border-white/10 bg-[#0a0c11]/95 shadow-[-24px_0_60px_rgba(3,4,7,0.45)] backdrop-blur-xl">
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Dealer Detail</p>
                  <h3 className="mt-1 truncate text-xl font-semibold tracking-tight text-white">{selectedDealer.name}</h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    {[selectedDealer.city, selectedDealer.stateRegion, selectedDealer.country].filter(Boolean).join(', ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDealer(null)}
                  className="rounded-full border border-white/10 p-2 text-zinc-400 transition-colors hover:border-brand/30 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <DetailCard title="Arrow Route">
                <div className="rounded-[22px] border border-brand/20 bg-brand/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Live Network Pin</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">
                    This dealer is rendered as a live globe pin, receives an Arrow origin route, and contributes to territory context
                    without duplicating CRM workflows.
                  </p>
                </div>
              </DetailCard>

              <DetailCard title="Address">
                <p className="text-sm leading-6 text-zinc-200">
                  {selectedDealer.addressLine1}
                  {selectedDealer.addressLine2 ? (
                    <>
                      <br />
                      {selectedDealer.addressLine2}
                    </>
                  ) : null}
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
                <div className="space-y-3 text-sm text-zinc-200">
                  <SnapshotLine label="Same-country contacts" value={formatNumber(selectedDealer.sameCountryContacts)} />
                  <SnapshotLine label="Same-state contacts" value={formatNumber(selectedDealer.sameStateContacts)} />
                  <SnapshotLine label="Same-city contacts" value={formatNumber(selectedDealer.sameCityContacts)} />
                  <SnapshotLine label="Status" value={selectedDealer.status} />
                </div>
              </DetailCard>

              <DetailCard title="Map Coordinates">
                <div className="space-y-2 text-sm text-zinc-200">
                  <SnapshotLine label="Latitude" value={selectedDealer.lat.toFixed(5)} mono />
                  <SnapshotLine label="Longitude" value={selectedDealer.lng.toFixed(5)} mono />
                </div>
              </DetailCard>

              <DetailCard title="Notes">
                <p className="text-sm leading-6 text-zinc-200">
                  {selectedDealer.notes || 'No notes yet. Use Dealer Settings to add territory context, specialization, or rollout guidance.'}
                </p>
              </DetailCard>
            </div>

            <div className="border-t border-white/10 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setActivePage('settings');
                  void loadDealers();
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                <Settings className="h-4 w-4" />
                Edit in Dealer Settings
              </button>
            </div>
          </div>
        </div>
      )}
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
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/20 bg-slate-950/55 px-3.5 py-3 text-sm text-white outline-none transition-colors focus:border-brand/35"
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

function OverlayPanel({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-white/22 bg-slate-950/58 p-4 text-white shadow-[0_24px_60px_rgba(15,23,42,0.2)] backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300/80">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-semibold tracking-tight text-white">{title}</h3>
      {description ? <p className="mt-2 text-sm text-zinc-200/78">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function OverlayMetricCard({
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
    brand: 'bg-brand/15 text-white',
    neutral: 'bg-white/8 text-white',
    green: 'bg-emerald-500/15 text-emerald-100',
    amber: 'bg-amber-500/15 text-amber-100',
  }[accent];

  return (
    <div className="rounded-[24px] border border-white/8 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', accentClass)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm font-medium text-zinc-100">{title}</p>
      <p className="mt-1 text-sm text-zinc-400">{caption}</p>
    </div>
  );
}

function GlassBadge({
  label,
  caption,
  tone,
}: {
  label: string;
  caption: string;
  tone: 'brand' | 'green' | 'neutral';
}) {
  const toneClass = {
    brand: 'border-brand/25 bg-brand/10 text-brand',
    green: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
    neutral: 'border-white/24 bg-slate-950/58 text-zinc-200',
  }[tone];

  return (
    <div className={cn('rounded-full border px-3.5 py-2 backdrop-blur-md', toneClass)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-white">{caption}</p>
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
    return <p className="text-sm text-zinc-400">{emptyLabel}</p>;
  }

  const max = Math.max(...stats.slice(0, limit).map((stat) => stat.count), 1);

  return (
    <div className="space-y-3">
      {stats.slice(0, limit).map((stat) => (
        <div key={stat.key}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-zinc-200">{stat.label}</span>
            <span className="font-semibold text-white">{formatNumber(stat.count)}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/8">
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
      <span className="text-zinc-400">{label}</span>
      <span className={cn('font-medium text-white', mono && 'font-mono text-[13px]')}>{value}</span>
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
    <div className="rounded-[24px] border border-white/8 bg-white/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
