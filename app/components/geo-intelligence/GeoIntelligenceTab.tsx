'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe2,
  Layers3,
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
  const [showMissionControl, setShowMissionControl] = useState(true);
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
  const topCountries = dashboard?.topCountries ?? [];
  const topStates = drilldown?.topStates ?? dashboard?.topStates ?? [];
  const topOwners = dashboard?.topOwners ?? [];
  const topPersonas = dashboard?.topPersonas ?? [];
  const activeDealers = useMemo(
    () => dashboard?.dealers.filter((dealer) => dealer.status === 'active') ?? [],
    [dashboard?.dealers],
  );

  const heroStats = useMemo(
    () => ({
      dealers: dashboard?.summary.activeDealers ?? 0,
      routes: dashboard?.summary.dealerRoutes ?? dashboard?.dealerArcs.length ?? 0,
      countries: dashboard?.summary.countriesCovered ?? 0,
    }),
    [dashboard?.dealerArcs.length, dashboard?.summary.activeDealers, dashboard?.summary.countriesCovered, dashboard?.summary.dealerRoutes],
  );

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
    <div className="relative min-h-screen overflow-hidden bg-[#05070d] text-white">
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

      <div className="pointer-events-none relative z-20 flex min-h-screen flex-col">
        {/* Hero (top-left) — inspired by the reference "Every place has a story" composition */}
        <section className="pointer-events-auto px-6 pt-10 lg:px-10 lg:pt-14">
          <div className="max-w-[28rem]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55">Arrow Geo Intelligence</p>
            <h1 className="mt-5 text-[2.75rem] font-semibold leading-[1.02] tracking-tight text-white sm:text-[3.2rem]">
              Every dealer.
              <br />
              <span className="text-white">Every contact.</span>{' '}
              <span className="text-brand">One globe.</span>
            </h1>
            <p className="mt-5 max-w-[22rem] text-sm leading-6 text-white/70">
              Arrow&apos;s dealer network, HubSpot coverage, and territory density — rendered live on a single living map.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-8 sm:max-w-md sm:grid-cols-3">
              <HeroStat value={heroStats.dealers} label="Dealers" />
              <HeroStat value={heroStats.routes} label="Routes" />
              <HeroStat value={heroStats.countries} label="Countries" />
            </div>
          </div>
        </section>

        {/* Top-right chrome */}
        <div className="pointer-events-auto absolute right-6 top-6 z-30 flex flex-wrap items-center justify-end gap-2 lg:right-10 lg:top-10">
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
            onClick={() => setShowMissionControl((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-slate-950/60 px-4 py-2 text-xs font-medium text-white/85 backdrop-blur-md transition-colors hover:border-brand/35 hover:bg-brand/15 hover:text-white"
          >
            <Layers3 className="h-3.5 w-3.5" />
            {showMissionControl ? 'Hide Mission Control' : 'Open Mission Control'}
          </button>
          <button
            type="button"
            onClick={() => setActivePage('settings')}
            className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-slate-950/60 px-4 py-2 text-xs font-medium text-white/85 backdrop-blur-md transition-colors hover:border-brand/35 hover:bg-brand/15 hover:text-white"
          >
            <Settings className="h-3.5 w-3.5" />
            Dealers
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-[0_16px_40px_rgba(196,30,58,0.45)] transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            {syncing ? 'Syncing…' : 'Refresh HubSpot'}
          </button>
        </div>

        {error && (
          <div className="pointer-events-auto mx-6 mt-4 rounded-2xl border border-rose-500/25 bg-rose-950/75 px-4 py-3 text-sm text-rose-100 backdrop-blur-md lg:mx-10">
            {error}
          </div>
        )}

        <div className="flex-1" />

        {showMissionControl && (
          <aside className="pointer-events-auto absolute right-5 top-24 z-20 hidden w-[22rem] max-h-[calc(100vh-8rem)] overflow-y-auto pr-1 lg:block lg:right-6 lg:top-28">
            <div className="space-y-3">
              <OverlayPanel title="Layers & Filters" eyebrow="Live Controls">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: 'dealers', label: 'Dealers' },
                    { key: 'dealerNetwork', label: 'Dealer Network' },
                    { key: 'countryHeatmap', label: 'Country Heat' },
                    { key: 'stateHeatmap', label: 'State Heat' },
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
                        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                        layers[layer.key as GeoLayerKey]
                          ? 'border-brand/50 bg-brand/20 text-white shadow-[0_0_20px_rgba(244,63,94,0.25)]'
                          : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-white',
                      )}
                    >
                      {layer.label}
                    </button>
                  ))}
                </div>

                <div className="mt-3 grid gap-2">
                  <FilterSelect
                    label="Owner"
                    value={filters.ownerId}
                    onChange={(value) => setFilters((current) => ({ ...current, ownerId: value }))}
                    options={dashboard?.filters.owners ?? []}
                  />
                  <FilterSelect
                    label="Lifecycle"
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
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-zinc-200 transition-colors hover:border-brand/30 hover:bg-brand/10 hover:text-white"
                >
                  Clear filters
                </button>
              </OverlayPanel>

              <OverlayPanel
                title={selectedCountryName ? `${selectedCountryName} Snapshot` : 'Global Snapshot'}
                eyebrow="Territory Read"
              >
                <div className="space-y-2.5 text-sm text-zinc-200">
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
                      <SnapshotLine
                        label="Mapped contacts"
                        value={formatNumber(dashboard?.summary.hubspotContactsMapped ?? 0)}
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
                <div className="grid gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Top Owners</p>
                    <div className="mt-2">
                      <StatList stats={topOwners} emptyLabel="Owner data will populate after sync." limit={4} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Top Personas</p>
                    <div className="mt-2">
                      <StatList stats={topPersonas} emptyLabel="Persona data will populate after sync." limit={4} />
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
                        className="w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 text-left transition-colors hover:border-brand/30 hover:bg-brand/10"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{dealer.name}</p>
                            <p className="mt-0.5 text-[11px] text-zinc-400">
                              {[dealer.city, dealer.stateRegion, dealer.country].filter(Boolean).join(', ')}
                            </p>
                          </div>
                          <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {formatNumber(dealer.sameCountryContacts)}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </OverlayPanel>
            </div>
          </aside>
        )}

        {/* Bottom mini KPIs */}
        <div className="pointer-events-none absolute bottom-6 left-6 z-10 hidden gap-3 lg:left-10 lg:flex">
          <MiniKpi icon={Globe2} label="Coverage" value={`${formatNumber(dashboard?.summary.countriesCovered ?? 0)} countries`} />
          <MiniKpi icon={UsersRound} label="Mapped" value={formatNumber(dashboard?.summary.hubspotContactsMapped ?? 0)} />
          <MiniKpi icon={Sparkles} label="Unmapped" value={formatNumber(dashboard?.summary.unmappedContacts ?? 0)} tone="amber" />
        </div>
      </div>

      {selectedDealer && (
        <div className="absolute inset-y-0 right-0 z-30 w-full max-w-[22.5rem] border-l border-brand/35 bg-[#07090f]/95 shadow-[-24px_0_60px_rgba(3,4,7,0.55)] backdrop-blur-xl">
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Dealer Detail</p>
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

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <DetailCard title="Arrow Route">
                <div className="rounded-xl border border-brand/25 bg-brand/12 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand">Live Network Pin</p>
                  <p className="mt-2 text-sm leading-5 text-zinc-200">
                    Rendered as a live globe beacon, receives an Arrow origin route, and contributes to territory context.
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
                <div className="space-y-2 text-sm text-zinc-200">
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

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-[2.25rem] font-semibold leading-none tracking-tight text-brand sm:text-[2.5rem]">
        {formatNumber(value)}
      </p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55">{label}</p>
    </div>
  );
}

function MiniKpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Globe2;
  label: string;
  value: string;
  tone?: 'amber';
}) {
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/60 px-3.5 py-2 backdrop-blur-md">
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full',
          tone === 'amber' ? 'bg-amber-400/20 text-amber-200' : 'bg-white/10 text-white',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/50">{label}</p>
        <p className="text-sm font-semibold text-white">{value}</p>
      </div>
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
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-brand/50"
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
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{eyebrow}</p>
      <h3 className="mt-1 text-base font-semibold tracking-tight text-white">{title}</h3>
      {description ? <p className="mt-1.5 text-xs text-zinc-300/75">{description}</p> : null}
      <div className="mt-3">{children}</div>
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
    brand: 'border-brand/30 bg-brand/10 text-white',
    green: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
    neutral: 'border-white/18 bg-slate-950/70 text-zinc-200',
  }[tone];

  return (
    <div className={cn('rounded-full border px-3 py-1.5 backdrop-blur-md', toneClass)}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.22em]">{label}</p>
      <p className="mt-0.5 text-xs font-medium text-white">{caption}</p>
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
    return <p className="text-xs text-zinc-400">{emptyLabel}</p>;
  }

  const max = Math.max(...stats.slice(0, limit).map((stat) => stat.count), 1);

  return (
    <div className="space-y-2.5">
      {stats.slice(0, limit).map((stat) => (
        <div key={stat.key}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-zinc-200">{stat.label}</span>
            <span className="font-semibold text-white">{formatNumber(stat.count)}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand/60 to-brand"
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
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={cn('text-xs font-medium text-white', mono && 'font-mono text-[12px]')}>{value}</span>
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
    <div className="rounded-xl border border-white/8 bg-white/5 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
