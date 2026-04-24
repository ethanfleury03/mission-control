'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Globe2,
  Layers3,
  Minus,
  Plus,
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
import type { GeoRendererMode } from './geo-globe-model';

type GeoPage = 'dashboard' | 'settings';
const RENDERER_MODE_STORAGE_KEY = 'arrow.geo.rendererMode';

const DEFAULT_FILTERS: GeoFilterState = {
  ownerId: '',
  lifecycleStage: '',
  leadStatus: '',
};

const DEFAULT_LAYERS: Record<GeoLayerKey, boolean> = {
  dealers: false,
  dealerNetwork: false,
  countryHeatmap: true,
  stateHeatmap: false,
  contactCoverage: true,
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
  const [zoomCommand, setZoomCommand] = useState<{ id: number; direction: 'in' | 'out' } | null>(null);
  const [rendererMode, setRendererMode] = useState<GeoRendererMode>('hybrid');

  useEffect(() => {
    const stored = window.localStorage.getItem(RENDERER_MODE_STORAGE_KEY);
    if (stored === 'hybrid' || stored === 'three') {
      setRendererMode(stored);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(RENDERER_MODE_STORAGE_KEY, rendererMode);
  }, [rendererMode]);

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
  const activeHeatLegend = selectedCountryName && drilldown?.heatLegend ? drilldown.heatLegend : dashboard?.heatLegend;
  const isDealersView = rendererMode === 'three';
  const visibleLayers = useMemo(
    () =>
      isDealersView
        ? {
            dealers: true,
            dealerNetwork: true,
            countryHeatmap: false,
            stateHeatmap: false,
            contactCoverage: false,
          }
        : layers,
    [isDealersView, layers],
  );
  const handleRendererModeChange = useCallback((mode: GeoRendererMode) => {
    setRendererMode(mode);
    setSelectedCountryIsoA3(null);
    setSelectedDealer(null);
    setLayers((current) => ({ ...current, stateHeatmap: false }));
    if (mode === 'three') {
      setFilters((current) => ({
        ...current,
        ownerId: '',
        leadStatus: '',
      }));
    }
  }, []);
  const syncLabel = syncing
    ? 'Syncing'
    : !dashboard?.sync.hubspotConfigured
      ? 'HubSpot token missing'
      : dashboard.sync.status === 'failed'
        ? 'Sync failed'
        : dashboard.sync.lastSyncedAt
          ? 'Synced'
          : 'Not synced';
  const syncCaption = dashboard?.sync.hubspotConfigured
    ? dashboard.sync.lastSyncedAt
      ? `${formatNumber(dashboard.sync.mappableRecords)} mapped · ${formatTimeAgo(dashboard.sync.lastSyncedAt)}`
      : 'Use Refresh HubSpot to build the heatmap'
    : 'Add HUBSPOT_ACCESS_TOKEN';

  const heroStats = useMemo(
    () => ({
      dealers: dashboard?.summary.activeDealers ?? 0,
      routes: dashboard?.summary.dealerRoutes ?? dashboard?.dealerArcs.length ?? 0,
      countries: dashboard?.summary.countriesCovered ?? 0,
      contacts: dashboard?.summary.hubspotContactsMapped ?? 0,
      states: dashboard?.summary.statesCovered ?? 0,
    }),
    [
      dashboard?.dealerArcs.length,
      dashboard?.summary.activeDealers,
      dashboard?.summary.countriesCovered,
      dashboard?.summary.dealerRoutes,
      dashboard?.summary.hubspotContactsMapped,
      dashboard?.summary.statesCovered,
    ],
  );

  if (activePage === 'settings') {
    return (
      <div className="relative h-full overflow-y-auto bg-[#f4f7fb]">
        <div className="sticky top-0 z-20 shrink-0 border-b border-neutral-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Geo Intelligence</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950">Dealer Network Settings</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <GlassBadge
                label={syncLabel}
                caption={syncCaption}
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

        <div>
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
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#02040a] text-white">
      <div className="absolute inset-0 h-full">
        <GeoGlobeScene
          fullscreen
          snapshot={dashboard}
          drilldown={drilldown}
          layers={visibleLayers}
          loading={loadingDashboard}
          selectedDealer={selectedDealer}
          rendererMode={rendererMode}
          onSelectCountry={(countryIsoA3) => {
            const nextCountry = selectedCountryIsoA3 === countryIsoA3 ? null : countryIsoA3;
            setSelectedDealer(null);
            setSelectedCountryIsoA3(nextCountry);
            if (!isDealersView) {
              setLayers((layerState) => ({ ...layerState, stateHeatmap: Boolean(nextCountry) }));
            }
          }}
          onSelectDealer={setSelectedDealer}
          onResetView={() => {
            setSelectedCountryIsoA3(null);
            setSelectedDealer(null);
            setLayers((current) => ({ ...current, stateHeatmap: false }));
          }}
          zoomCommand={zoomCommand}
        />
      </div>

      <div className="pointer-events-none relative z-20 flex h-full min-h-0 flex-col">
        {/* Hero (top-left) — inspired by the reference "Every place has a story" composition */}
        <section className="pointer-events-none px-4 pt-24 sm:px-6 sm:pt-10 lg:px-10 lg:pt-14">
          <div className="max-w-[24rem] sm:max-w-[28rem]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand/85">Arrow Geo Intelligence</p>
            <h1 className="mt-4 text-[2.25rem] font-semibold leading-[1.02] tracking-tight text-white sm:mt-5 sm:text-[3.2rem]">
              Every partner.
              <br />
              <span className="text-white">Every contact.</span>{' '}
              <span className="text-brand">One globe.</span>
            </h1>
            <p className="mt-4 max-w-[21rem] text-sm leading-6 text-slate-100 sm:mt-5">
              Arrow&apos;s network partners, HubSpot coverage, and territory density rendered as one living global signal.
            </p>
            <div className="mt-7 grid grid-cols-3 gap-5 sm:mt-10 sm:max-w-md sm:gap-8">
              <HeroStat value={isDealersView ? heroStats.dealers : heroStats.contacts} label={isDealersView ? 'Partners' : 'Contacts'} />
              <HeroStat value={isDealersView ? heroStats.routes : heroStats.states} label={isDealersView ? 'Routes' : 'States'} />
              <HeroStat value={heroStats.countries} label="Countries" />
            </div>
            {isDealersView ? (
              <div className="mt-9 max-w-xs border-t border-white/16 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-200">Network partners</p>
                <p className="mt-1 text-xs leading-5 text-slate-100/90">
                  Partner view keeps the scene focused: globe, endpoint beacons, and Arrow routes only.
                </p>
              </div>
            ) : (
              <HeatLegendPanel
                legend={activeHeatLegend}
                scope={selectedCountryName ? `${selectedCountryName} state presence` : 'Global country presence'}
                totalRecords={dashboard?.sync.totalRecords ?? 0}
                unmappedRecords={dashboard?.sync.unmappableRecords ?? 0}
              />
            )}
          </div>
        </section>

        {/* Top-right chrome */}
        <div className="pointer-events-auto absolute left-4 right-4 top-4 z-30 flex flex-wrap items-center justify-end gap-2 sm:left-auto sm:right-6 sm:top-6 lg:right-10 lg:top-10">
          <GlassBadge
            label={syncLabel}
            caption={syncCaption}
            tone={dashboard?.sync.hubspotConfigured ? 'brand' : 'neutral'}
          />
          {selectedCountryName && <GlassBadge label="Focus" caption={selectedCountryName} tone="green" />}
          <RendererModeSwitch value={rendererMode} onChange={handleRendererModeChange} />
          <button
            type="button"
            onClick={() => setShowMissionControl((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-white/24 bg-slate-800/58 px-4 py-2 text-xs font-medium text-white shadow-[0_14px_35px_rgba(2,6,23,0.2)] backdrop-blur-md transition-colors hover:border-brand/50 hover:bg-brand/20 hover:text-white"
          >
            <Layers3 className="h-3.5 w-3.5" />
            {showMissionControl ? 'Hide Stats' : 'Show Stats'}
          </button>
          <button
            type="button"
            onClick={() => setActivePage('settings')}
            className="inline-flex items-center gap-2 rounded-full border border-white/24 bg-slate-800/58 px-4 py-2 text-xs font-medium text-white shadow-[0_14px_35px_rgba(2,6,23,0.2)] backdrop-blur-md transition-colors hover:border-brand/50 hover:bg-brand/20 hover:text-white"
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
          <div className="pointer-events-auto mx-6 mt-4 rounded-2xl border border-rose-300/35 bg-rose-900/60 px-4 py-3 text-sm text-rose-50 backdrop-blur-md lg:mx-10">
            {error}
          </div>
        )}

        <div className="flex-1" />

        <aside
          className={cn(
            'pointer-events-auto absolute right-5 top-24 z-20 hidden w-[22rem] max-h-[calc(100%-8rem)] pr-1 transition-transform duration-300 ease-out lg:block lg:right-6 lg:top-28',
            showMissionControl ? 'translate-x-0' : 'translate-x-[calc(100%+2rem)]',
          )}
        >
          <div className="max-h-[calc(100vh-13rem)] overflow-y-auto">
            <div className="space-y-3 pb-4">
              <OverlayPanel title="Layers & Filters" eyebrow="Live Controls">
                <div className="grid grid-cols-2 gap-1.5">
                  {(isDealersView
                    ? [
                        { key: 'dealers', label: 'Partners' },
                        { key: 'dealerNetwork', label: 'Routes' },
                      ]
                    : [
                        { key: 'countryHeatmap', label: 'Country Heat' },
                        { key: 'stateHeatmap', label: 'State Heat' },
                        { key: 'contactCoverage', label: 'Contact Coverage' },
                      ]).map((layer) => (
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
                          'rounded-md border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors',
                          visibleLayers[layer.key as GeoLayerKey]
                            ? 'border-brand/50 bg-brand/18 text-white shadow-[0_0_20px_rgba(244,63,94,0.18)]'
                            : 'border-white/12 bg-white/6 text-slate-300 hover:border-white/28 hover:bg-white/10 hover:text-white',
                        )}
                      >
                        {layer.label}
                      </button>
                    ))}
                </div>

                <div className="mt-3 grid gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">View</span>
                    <select
                      value={isDealersView ? 'dealers' : 'contacts'}
                      onChange={(event) => {
                        handleRendererModeChange(event.target.value === 'dealers' ? 'three' : 'hybrid');
                      }}
                      className="w-full rounded-xl border border-white/20 bg-slate-900/75 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-brand/60"
                    >
                      <option value="contacts">Contacts</option>
                      <option value="dealers">Dealers</option>
                    </select>
                  </label>
                  {!isDealersView ? (
                    <>
                      <FilterSelect
                        label="Owner"
                        value={filters.ownerId}
                        onChange={(value) => setFilters((current) => ({ ...current, ownerId: value }))}
                        options={dashboard?.filters.owners ?? []}
                      />
                      <FilterSelect
                        label="Lead Status"
                        value={filters.leadStatus}
                        onChange={(value) => setFilters((current) => ({ ...current, leadStatus: value }))}
                        options={dashboard?.filters.leadStatuses ?? []}
                      />
                    </>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                    setSelectedCountryIsoA3(null);
                    setSelectedDealer(null);
                    setLayers((current) => ({ ...current, stateHeatmap: false }));
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/8 px-3 py-1.5 text-[11px] font-medium text-slate-100 transition-colors hover:border-brand/40 hover:bg-brand/15 hover:text-white"
                >
                  Clear filters
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCountryIsoA3(null);
                    setSelectedDealer(null);
                    setLayers((current) => ({ ...current, stateHeatmap: false }));
                  }}
                  className="ml-2 mt-3 inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/8 px-3 py-1.5 text-[11px] font-medium text-slate-100 transition-colors hover:border-brand/40 hover:bg-brand/15 hover:text-white"
                >
                  <RefreshCcw className="h-3 w-3" />
                  Reset globe
                </button>
                <div className="ml-2 mt-3 inline-flex items-center gap-1 rounded-full border border-white/16 bg-white/8 p-1">
                  <button
                    type="button"
                    onClick={() => setZoomCommand((current) => ({ id: (current?.id ?? 0) + 1, direction: 'in' }))}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-100 transition-colors hover:bg-brand/20 hover:text-white"
                    aria-label="Zoom globe in"
                  >
                    <Plus className="h-3 w-3" />
                    Zoom in
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomCommand((current) => ({ id: (current?.id ?? 0) + 1, direction: 'out' }))}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-100 transition-colors hover:bg-white/12 hover:text-white"
                    aria-label="Zoom globe out"
                  >
                    <Minus className="h-3 w-3" />
                    Out
                  </button>
                </div>
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
                      <SnapshotLine label="Network partners" value={formatNumber(drilldown?.summary.activeDealers ?? 0)} />
                      <SnapshotLine
                        label="Boundary detail"
                        value={drilldown?.availableAdmin1 ? 'Admin1 polygons loaded' : 'Country-only focus'}
                      />
                    </>
                  ) : (
                    <>
                      <SnapshotLine label="Arrow origin" value="Burlington, Ontario" />
                      {isDealersView ? (
                        <SnapshotLine label="Partner routes" value={formatNumber(dashboard?.dealerArcs.length ?? 0)} />
                      ) : (
                        <SnapshotLine
                          label="States covered"
                          value={formatNumber(dashboard?.summary.statesCovered ?? 0)}
                        />
                      )}
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

            </div>
          </div>
        </aside>

        {/* Bottom mini KPIs */}
        <div className="pointer-events-none absolute bottom-6 left-6 z-10 hidden gap-3 lg:left-10 lg:flex">
          <MiniKpi icon={Globe2} label="Coverage" value={`${formatNumber(dashboard?.summary.countriesCovered ?? 0)} countries`} />
          <MiniKpi icon={UsersRound} label="Mapped" value={formatNumber(dashboard?.summary.hubspotContactsMapped ?? 0)} />
          <MiniKpi icon={Sparkles} label="Unmapped" value={formatNumber(dashboard?.summary.unmappedContacts ?? 0)} tone="amber" />
        </div>
      </div>

      {selectedDealer && (
        <div className="absolute inset-y-0 right-0 z-30 w-full max-w-[22.5rem] border-l border-white/12 bg-[#172236]/88 shadow-[-24px_0_60px_rgba(3,4,7,0.32)] backdrop-blur-xl">
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Dealer Detail</p>
                  <h3 className="mt-1 truncate text-xl font-semibold tracking-tight text-white">{selectedDealer.name}</h3>
                  <p className="mt-1 text-sm text-slate-300">
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
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand">Live Network Endpoint</p>
                  <p className="mt-2 text-sm leading-5 text-zinc-200">
                    Rendered as a refined globe beacon, receives an Arrow origin route, and contributes to territory context.
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

function RendererModeSwitch({
  value,
  onChange,
}: {
  value: GeoRendererMode;
  onChange: (mode: GeoRendererMode) => void;
}) {
  const labels: Record<GeoRendererMode, string> = {
    hybrid: 'Contacts',
    three: 'Dealers',
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-white/18 bg-black/32 p-1 shadow-[0_14px_35px_rgba(2,6,23,0.24)] backdrop-blur-md">
      {(['hybrid', 'three'] as GeoRendererMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors',
            value === mode
              ? 'bg-white text-neutral-950 shadow-[0_8px_20px_rgba(255,255,255,0.12)]'
              : 'text-slate-300 hover:bg-white/10 hover:text-white',
          )}
          aria-pressed={value === mode}
        >
          {mode === 'hybrid' ? <Layers3 className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
          {labels[mode]}
        </button>
      ))}
    </div>
  );
}

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-[1.85rem] font-semibold leading-none tracking-tight text-brand sm:text-[2.5rem]">
        {formatNumber(value)}
      </p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-300">{label}</p>
    </div>
  );
}

function HeatLegendPanel({
  legend,
  scope,
  totalRecords,
  unmappedRecords,
}: {
  legend?: GeoDashboardSnapshot['heatLegend'];
  scope: string;
  totalRecords: number;
  unmappedRecords: number;
}) {
  const bands = legend?.bands ?? [];
  return (
    <div className="mt-9 max-w-xs border-t border-white/16 pt-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-300">
        {legend?.title ?? 'Contacts'}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-300/90">{scope}</p>
      <div className="mt-4 space-y-2">
        {bands.length > 0 ? (
          bands.map((band) => (
            <div key={`${band.min}-${band.max ?? 'up'}`} className="flex items-center gap-3 text-xs text-slate-200">
              <span
                className="h-5 w-8 rounded-sm border border-white/15 shadow-[0_0_18px_rgba(244,63,94,0.28)]"
                style={{ backgroundColor: band.color }}
              />
              <span>{band.label}</span>
            </div>
          ))
        ) : (
          <p className="text-xs leading-5 text-slate-300/80">
            Refresh HubSpot to paint contact presence onto the map.
          </p>
        )}
      </div>
      {legend?.totalContacts ? (
        <p className="mt-4 text-[11px] leading-5 text-slate-300/80">
          Based on {formatNumber(legend.totalContacts)} mapped HubSpot contacts.
        </p>
      ) : null}
      <div className="mt-4 grid gap-2 border-t border-white/12 pt-4 text-xs text-slate-200">
        <LegendLine swatchClass="bg-rose-300/70 shadow-[0_0_16px_rgba(251,113,133,0.35)]" label="Contact density" />
        <LegendLine swatchClass="bg-white/80 shadow-[0_0_16px_rgba(255,255,255,0.35)]" label="Country / state borders" />
      </div>
      {totalRecords > 0 && unmappedRecords > 0 ? (
        <p className="mt-1 text-[11px] leading-5 text-slate-400">
          {formatNumber(unmappedRecords)} of {formatNumber(totalRecords)} contacts had no recognizable contact country.
        </p>
      ) : null}
    </div>
  );
}

function LegendLine({ swatchClass, label }: { swatchClass: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn('h-2.5 w-8 rounded-full border border-white/20', swatchClass)} />
      <span>{label}</span>
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
    <div className="flex items-center gap-3 rounded-full border border-white/22 bg-slate-800/56 px-3.5 py-2 shadow-[0_16px_40px_rgba(2,6,23,0.18)] backdrop-blur-md">
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full',
          tone === 'amber' ? 'bg-amber-300/22 text-amber-100' : 'bg-white/14 text-white',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-200">{label}</p>
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
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-200">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/22 bg-slate-800/62 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-brand/60"
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
    <div className="rounded-lg border border-white/16 bg-slate-900/48 p-3.5 text-white shadow-[0_18px_50px_rgba(2,6,23,0.22)] backdrop-blur-xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand/75">{eyebrow}</p>
      <h3 className="mt-1 text-base font-semibold tracking-tight text-white">{title}</h3>
      {description ? <p className="mt-1.5 text-xs text-slate-200/95">{description}</p> : null}
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
    brand: 'border-brand/45 bg-brand/20 text-white shadow-[0_14px_35px_rgba(196,30,58,0.16)]',
    green: 'border-emerald-300/45 bg-emerald-500/20 text-emerald-50 shadow-[0_14px_35px_rgba(16,185,129,0.1)]',
    neutral: 'border-white/24 bg-slate-800/62 text-slate-50',
  }[tone];

  return (
    <div className={cn('rounded-lg border px-3 py-1.5 backdrop-blur-md', toneClass)}>
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
    return <p className="text-xs text-slate-300">{emptyLabel}</p>;
  }

  const max = Math.max(...stats.slice(0, limit).map((stat) => stat.count), 1);

  return (
    <div className="space-y-2.5">
      {stats.slice(0, limit).map((stat) => (
        <div key={stat.key}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-slate-200">{stat.label}</span>
            <span className="font-semibold text-white">{formatNumber(stat.count)}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/12">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-300 via-brand to-red-600 shadow-[0_0_18px_rgba(244,63,94,0.45)]"
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
      <span className="text-xs text-slate-300">{label}</span>
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
    <div className="rounded-xl border border-white/14 bg-white/8 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand/70">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
