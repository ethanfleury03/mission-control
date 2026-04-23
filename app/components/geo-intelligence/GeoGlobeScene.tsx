'use client';

import dynamic from 'next/dynamic';
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  FogExp2,
  MeshPhongMaterial,
  PointLight,
} from 'three';
import { LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { buildFeatureStateKeys } from '@/lib/geo-intelligence/keys';
import type {
  GeoCountryDrilldownSnapshot,
  GeoDashboardSnapshot,
  GeoDealer,
  GeoLayerKey,
} from '@/lib/geo-intelligence/types';

const Globe = dynamic(async () => (await import('react-globe.gl')).default, {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[34rem] items-center justify-center text-sm text-zinc-400">
      <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
      Loading globe renderer…
    </div>
  ),
}) as typeof import('react-globe.gl').default;

type GeoPolygon = number[][][];
type GeoMultiPolygon = number[][][][];

type CountryFeature = {
  type: 'Feature';
  properties: {
    id: string;
    name: string;
    isoA2: string;
    isoA3: string;
    labelLat: number;
    labelLng: number;
    continent: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: GeoPolygon | GeoMultiPolygon;
  };
};

type Admin1Feature = {
  type: 'Feature';
  properties: {
    id: string;
    key: string;
    name: string;
    nameAlt?: string;
    postal?: string;
    iso31662?: string;
    adm0A3: string;
    admin: string;
    latitude?: number;
    longitude?: number;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: GeoPolygon | GeoMultiPolygon;
  };
};

type FeatureCollection<TFeature> = {
  type: 'FeatureCollection';
  features: TFeature[];
};

type CountryPolygonDatum = {
  id: string;
  feature: CountryFeature;
  intensity: number;
  count: number;
};

type StatePolygonDatum = {
  id: string;
  feature: Admin1Feature;
  intensity: number;
  count: number;
};

type GlobeMarker = {
  id: string;
  kind: 'origin' | 'dealer';
  lat: number;
  lng: number;
  altitude: number;
  radius: number;
  color: string;
  label: string;
  dealer?: GeoDealer;
};

type GlobeRing = {
  id: string;
  lat: number;
  lng: number;
  maxRadius: number;
  speed: number;
  repeat: number;
  color: string[];
};

type GlobeLabel = {
  id: string;
  lat: number;
  lng: number;
  text: string;
  size: number;
  color: string;
  altitude: number;
};

type HeatPoint = {
  lat: number;
  lng: number;
  weight: number;
};

type HeatDataset = {
  id: string;
  points: HeatPoint[];
};

interface GeoGlobeSceneProps {
  snapshot: GeoDashboardSnapshot | null;
  drilldown: GeoCountryDrilldownSnapshot | null;
  layers: Record<GeoLayerKey, boolean>;
  loading: boolean;
  onSelectCountry: (countryIsoA3: string | null) => void;
  onSelectDealer: (dealer: GeoDealer | null) => void;
  onResetView: () => void;
  selectedDealer: GeoDealer | null;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function htmlTooltip(title: string, count: number, subtitle?: string) {
  return `
    <div style="
      min-width: 180px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(8,10,16,0.95);
      box-shadow: 0 20px 60px rgba(0,0,0,0.35);
      padding: 12px 14px;
      color: white;
      backdrop-filter: blur(18px);
    ">
      <div style="font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.48);">Geo Intelligence</div>
      <div style="margin-top: 6px; font-size: 15px; font-weight: 600;">${title}</div>
      <div style="margin-top: 6px; font-size: 24px; font-weight: 700; color: #fda4af;">${count.toLocaleString()}</div>
      ${subtitle ? `<div style="margin-top: 4px; font-size: 12px; color: rgba(255,255,255,0.62);">${subtitle}</div>` : ''}
    </div>
  `;
}

function polarColor(intensity: number, alpha = 1) {
  const clamped = clamp(intensity);
  const r = Math.round(98 + 124 * clamped);
  const g = Math.round(14 + 28 * clamped);
  const b = Math.round(28 + 46 * clamped);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function glowColor(intensity: number, alpha = 1) {
  const clamped = clamp(intensity);
  return `rgba(255, ${Math.round(180 - clamped * 90)}, ${Math.round(196 - clamped * 110)}, ${alpha})`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json() as Promise<T>;
}

export function GeoGlobeScene({
  snapshot,
  drilldown,
  layers,
  loading,
  onSelectCountry,
  onSelectDealer,
  onResetView,
  selectedDealer,
}: GeoGlobeSceneProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const interactedRef = useRef(false);
  const materialRef = useRef(
    new MeshPhongMaterial({
      color: new Color('#07090f'),
      emissive: new Color('#1a0d13'),
      emissiveIntensity: 0.78,
      shininess: 18,
      specular: new Color('#7a2334'),
      transparent: true,
      opacity: 1,
    }),
  );

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [admin1, setAdmin1] = useState<Admin1Feature[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.max(320, Math.floor(entry.contentRect.width));
        const height = Math.max(540, Math.min(760, Math.floor(width * 0.72)));
        setDimensions({ width, height });
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await fetchJson<FeatureCollection<CountryFeature>>('/data/geo/countries.geojson');
        if (!cancelled) setCountries(data.features);
      } catch (error) {
        console.error('Country boundary load failed', error);
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!drilldown?.availableAdmin1) {
      setAdmin1([]);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const data = await fetchJson<FeatureCollection<Admin1Feature>>(`/data/geo/admin1/${drilldown.country.isoA3}.geojson`);
        if (!cancelled) setAdmin1(data.features);
      } catch (error) {
        console.error('Admin1 boundary load failed', error);
        if (!cancelled) setAdmin1([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [drilldown?.availableAdmin1, drilldown?.country.isoA3]);

  const countryPolygonData = useMemo<CountryPolygonDatum[]>(() => {
    if (!snapshot || countries.length === 0) return [];

    const max = Math.max(...snapshot.countryBuckets.map((bucket) => bucket.count), 1);
    const bucketMap = new Map(snapshot.countryBuckets.map((bucket) => [bucket.isoA3 ?? bucket.key, bucket]));

    return countries.map((feature) => {
      const bucket = bucketMap.get(feature.properties.isoA3);
      const count = bucket?.count ?? 0;
      const intensity = count > 0 ? count / max : 0;
      return {
        id: feature.properties.isoA3,
        feature,
        intensity,
        count,
      };
    });
  }, [countries, snapshot]);

  const statePolygonData = useMemo<StatePolygonDatum[]>(() => {
    if (!drilldown || admin1.length === 0) return [];

    const max = Math.max(...drilldown.stateBuckets.map((bucket) => bucket.count), 1);
    const stateMap = new Map(drilldown.stateBuckets.map((bucket) => [bucket.key, bucket]));

    return admin1.map((feature) => {
      const keys = [
        feature.properties.key,
        ...buildFeatureStateKeys({
          iso31662: feature.properties.iso31662,
          name: feature.properties.name,
          nameAlt: feature.properties.nameAlt,
          adm0A3: feature.properties.adm0A3,
        }),
      ];
      const bucket = keys.map((key) => stateMap.get(key)).find(Boolean);
      const count = bucket?.count ?? 0;
      const intensity = count > 0 ? count / max : 0;
      return {
        id: feature.properties.id,
        feature,
        intensity,
        count,
      };
    });
  }, [admin1, drilldown]);

  const polygonMode = drilldown && layers.stateHeatmap && statePolygonData.length > 0 ? 'state' : 'country';

  const polygonData = polygonMode === 'state' ? statePolygonData : countryPolygonData;

  const globeMarkers = useMemo<GlobeMarker[]>(() => {
    if (!snapshot) return [];

    const originMarker: GlobeMarker = {
      id: snapshot.arrowOrigin.id,
      kind: 'origin',
      lat: snapshot.arrowOrigin.lat,
      lng: snapshot.arrowOrigin.lng,
      altitude: 0.19,
      radius: 0.46,
      color: '#ffffff',
      label: snapshot.arrowOrigin.label,
    };

    const dealerMarkers = snapshot.dealers
      .filter((dealer) => dealer.status !== 'archived')
      .map((dealer) => ({
        id: dealer.id,
        kind: 'dealer' as const,
        lat: dealer.lat,
        lng: dealer.lng,
        altitude: dealer.id === selectedDealer?.id ? 0.24 : dealer.status === 'active' ? 0.17 : 0.11,
        radius: dealer.id === selectedDealer?.id ? 0.36 : dealer.status === 'active' ? 0.28 : 0.22,
        color: dealer.status === 'active' ? '#f43f5e' : '#fb7185',
        label: dealer.name,
        dealer,
      }));

    return [originMarker, ...(layers.dealers ? dealerMarkers : [])];
  }, [layers.dealers, selectedDealer?.id, snapshot]);

  const ringsData = useMemo<GlobeRing[]>(() => {
    if (!snapshot) return [];

    const base: GlobeRing[] = [
      {
        id: 'origin-ring',
        lat: snapshot.arrowOrigin.lat,
        lng: snapshot.arrowOrigin.lng,
        maxRadius: 4.2,
        speed: 2.4,
        repeat: 900,
        color: ['rgba(255,255,255,0.45)', 'rgba(196,30,58,0.05)'],
      },
    ];

    if (!layers.dealers) return base;

    const selectedRings = snapshot.dealers
      .filter((dealer) => dealer.status === 'active' && (dealer.id === selectedDealer?.id || dealer.sameCountryContacts > 0))
      .slice(0, 18)
      .map((dealer) => ({
        id: `ring:${dealer.id}`,
        lat: dealer.lat,
        lng: dealer.lng,
        maxRadius: dealer.id === selectedDealer?.id ? 3.8 : 2.4,
        speed: dealer.id === selectedDealer?.id ? 1.8 : 1.2,
        repeat: dealer.id === selectedDealer?.id ? 1100 : 2000,
        color: ['rgba(255,255,255,0.28)', 'rgba(244,63,94,0.02)'],
      }));

    return [...base, ...selectedRings];
  }, [layers.dealers, selectedDealer?.id, snapshot]);

  const labelsData = useMemo<GlobeLabel[]>(() => {
    if (!snapshot) return [];

    if (polygonMode === 'state' && drilldown && statePolygonData.length > 0) {
      return statePolygonData
        .filter((item) => item.count > 0 && item.feature.properties.latitude !== undefined && item.feature.properties.longitude !== undefined)
        .sort((a, b) => b.count - a.count)
        .slice(0, 7)
        .map((item) => ({
          id: `state-label:${item.id}`,
          lat: item.feature.properties.latitude ?? drilldown.country.lat,
          lng: item.feature.properties.longitude ?? drilldown.country.lng,
          text: item.feature.properties.name,
          size: item.intensity > 0.45 ? 0.9 : 0.66,
          color: 'rgba(255,255,255,0.78)',
          altitude: 0.038 + item.intensity * 0.02,
        }));
    }

    return snapshot.countryBuckets
      .filter((bucket) => bucket.lat !== undefined && bucket.lng !== undefined)
      .slice(0, 10)
      .map((bucket, index) => ({
        id: `country-label:${bucket.key}`,
        lat: bucket.lat ?? 0,
        lng: bucket.lng ?? 0,
        text: bucket.label,
        size: index < 3 ? 1.04 : 0.8,
        color: index < 3 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.66)',
        altitude: 0.028,
      }));
  }, [drilldown, polygonMode, snapshot, statePolygonData]);

  const heatmapsData = useMemo<HeatDataset[]>(() => {
    if (!layers.contactCoverage || !snapshot) return [];

    if (polygonMode === 'state' && statePolygonData.length > 0) {
      const points = statePolygonData
        .filter((item) => item.count > 0 && item.feature.properties.latitude !== undefined && item.feature.properties.longitude !== undefined)
        .map((item) => ({
          lat: item.feature.properties.latitude ?? 0,
          lng: item.feature.properties.longitude ?? 0,
          weight: item.count,
        }));

      return points.length > 0 ? [{ id: 'state-contact-coverage', points }] : [];
    }

    const points = snapshot.countryBuckets
      .filter((bucket) => bucket.count > 0 && bucket.lat !== undefined && bucket.lng !== undefined)
      .map((bucket) => ({
        lat: bucket.lat ?? 0,
        lng: bucket.lng ?? 0,
        weight: bucket.count,
      }));

    return points.length > 0 ? [{ id: 'country-contact-coverage', points }] : [];
  }, [layers.contactCoverage, polygonMode, snapshot, statePolygonData]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const controls = globe.controls();
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = !interactedRef.current;
    controls.autoRotateSpeed = 0.35;
    controls.minDistance = 160;
    controls.maxDistance = 420;
  }, [dimensions.height, dimensions.width]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    if (selectedDealer) {
      globe.pointOfView({ lat: selectedDealer.lat, lng: selectedDealer.lng, altitude: 1.24 }, 1500);
      return;
    }

    if (drilldown) {
      globe.pointOfView(drilldown.cameraTarget, 1650);
      return;
    }

    globe.pointOfView({ lat: 21, lng: -15, altitude: 2.08 }, 1450);
  }, [drilldown, selectedDealer]);

  const hasInteractiveData = Boolean(snapshot) && (polygonData.length > 0 || globeMarkers.length > 0);
  const countryPolygonDatum = (item: object) => item as CountryPolygonDatum;
  const statePolygonDatum = (item: object) => item as StatePolygonDatum;

  return (
    <div className="geo-stage-card relative overflow-hidden rounded-[32px] border border-white/10 bg-[#06070b] shadow-[0_24px_80px_rgba(3,4,7,0.45)]">
      <div className="absolute inset-0 geo-stage" />
      <div className="absolute inset-0 geo-stage-grid opacity-80" />
      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-3 px-5 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Geo Intelligence</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {drilldown ? `${drilldown.country.name} Focus` : 'Global Dealer & Contact Surface'}
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Dealer pins, Arrow network arcs, and HubSpot coverage layers all share the same globe so territory patterns read instantly.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hoverLabel && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur-sm">
              {hoverLabel}
            </span>
          )}
          <button
            type="button"
            onClick={onResetView}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-zinc-200 backdrop-blur-sm transition-colors hover:border-brand/30 hover:bg-brand/10 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Globe
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="relative z-0 h-[40rem] min-h-[34rem] w-full"
        onPointerDown={() => {
          interactedRef.current = true;
          const controls = globeRef.current?.controls();
          if (controls) controls.autoRotate = false;
        }}
      >
        {(loading || assetsLoading) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#06070b]/55 backdrop-blur-sm">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-zinc-200">
              <LoaderCircle className="h-4 w-4 animate-spin text-brand" />
              Building the globe scene…
            </div>
          </div>
        )}

        {dimensions.width > 0 && (
          <Globe
            ref={globeRef}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="rgba(0,0,0,0)"
            showAtmosphere
            atmosphereColor="#c41e3a"
            atmosphereAltitude={0.18}
            showGraticules
            showGlobe
            globeMaterial={materialRef.current}
            pointsData={globeMarkers}
            pointLat="lat"
            pointLng="lng"
            pointAltitude="altitude"
            pointRadius="radius"
            pointColor={(marker) => (marker as GlobeMarker).color}
            pointLabel={(marker) => {
              const item = marker as GlobeMarker;
              if (item.kind === 'origin') return htmlTooltip(item.label, snapshot?.summary.activeDealers ?? 0, 'Network origin');
              return htmlTooltip(item.label, item.dealer?.sameCountryContacts ?? 0, `${item.dealer?.country || ''}${item.dealer?.stateRegion ? ` · ${item.dealer.stateRegion}` : ''}`);
            }}
            onPointHover={(marker) => {
              const item = marker as GlobeMarker | null;
              setHoverLabel(item ? item.label : null);
            }}
            onPointClick={(marker) => {
              const item = marker as GlobeMarker;
              if (item.kind === 'dealer' && item.dealer) {
                startTransition(() => onSelectDealer(item.dealer ?? null));
              }
            }}
            arcsData={layers.dealerNetwork && snapshot ? snapshot.dealerArcs : []}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcAltitudeAutoScale={0.22}
            arcStroke={0.38}
            arcDashLength={0.44}
            arcDashGap={1.12}
            arcDashAnimateTime={2300}
            arcColor={() => ['rgba(255,255,255,0.88)', 'rgba(196,30,58,0.92)', 'rgba(196,30,58,0.08)']}
            arcLabel={(arc) => htmlTooltip((arc as { label: string }).label, 1, 'Arrow network route')}
            onArcHover={(arc) => setHoverLabel(arc ? (arc as { label: string }).label : null)}
            ringsData={ringsData}
            ringLat="lat"
            ringLng="lng"
            ringMaxRadius="maxRadius"
            ringPropagationSpeed="speed"
            ringRepeatPeriod="repeat"
            ringColor={(ring: object) => (ring as GlobeRing).color}
            labelsData={labelsData}
            labelLat="lat"
            labelLng="lng"
            labelText="text"
            labelSize="size"
            labelColor="color"
            labelAltitude="altitude"
            labelIncludeDot={() => true}
            labelDotRadius={() => 0.28}
            polygonsData={polygonData}
            polygonGeoJsonGeometry={(item) =>
              (item as CountryPolygonDatum | StatePolygonDatum).feature.geometry as unknown as {
                type: string;
                coordinates: number[];
              }
            }
            polygonCapColor={(item) => {
              const datum = item as CountryPolygonDatum | StatePolygonDatum;
              const selected = drilldown && 'feature' in datum && 'isoA3' in datum.feature.properties && datum.feature.properties.isoA3 === drilldown.country.isoA3;
              if (polygonMode === 'country' && !layers.countryHeatmap) {
                return selected ? 'rgba(196,30,58,0.32)' : 'rgba(255,255,255,0.06)';
              }
              if (polygonMode === 'state' && !layers.stateHeatmap) {
                return 'rgba(255,255,255,0.08)';
              }
              return polarColor(datum.intensity, datum.count > 0 ? 0.85 : 0.14);
            }}
            polygonSideColor={(item) => {
              const datum = item as CountryPolygonDatum | StatePolygonDatum;
              if (datum.count <= 0) return 'rgba(255,255,255,0.03)';
              return polarColor(datum.intensity, 0.38);
            }}
            polygonStrokeColor={(item) => {
              const datum = item as CountryPolygonDatum | StatePolygonDatum;
              if (datum.count > 0) return glowColor(datum.intensity, 0.42);
              return 'rgba(255,255,255,0.08)';
            }}
            polygonAltitude={(item) => {
              const datum = item as CountryPolygonDatum | StatePolygonDatum;
              if (polygonMode === 'country' && !layers.countryHeatmap) {
                return drilldown && 'isoA3' in datum.feature.properties && datum.feature.properties.isoA3 === drilldown.country.isoA3 ? 0.014 : 0.004;
              }
              if (polygonMode === 'state' && !layers.stateHeatmap) return 0.008;
              return polygonMode === 'state'
                ? 0.008 + datum.intensity * 0.055
                : 0.004 + datum.intensity * 0.034;
            }}
            polygonCapCurvatureResolution={3}
            polygonsTransitionDuration={1200}
            polygonLabel={(item) => {
              if (polygonMode === 'state') {
                const datum = statePolygonDatum(item);
                return htmlTooltip(datum.feature.properties.name, datum.count, drilldown?.country.name);
              }
              const datum = countryPolygonDatum(item);
              return htmlTooltip(datum.feature.properties.name, datum.count, datum.feature.properties.continent);
            }}
            onPolygonHover={(item) => {
              const datum = item as CountryPolygonDatum | StatePolygonDatum | null;
              if (!datum) {
                setHoverLabel(null);
                return;
              }
              setHoverLabel(polygonMode === 'state' ? datum.feature.properties.name : datum.feature.properties.name);
            }}
            onPolygonClick={(item) => {
              if (polygonMode === 'state') return;
              const datum = countryPolygonDatum(item);
              startTransition(() => onSelectCountry(datum.feature.properties.isoA3));
            }}
            heatmapsData={heatmapsData}
            heatmapPoints="points"
            heatmapPointLat="lat"
            heatmapPointLng="lng"
            heatmapPointWeight="weight"
            heatmapBandwidth={() => (polygonMode === 'state' ? 1.18 : 1.5)}
            heatmapBaseAltitude={() => 0.012}
            heatmapTopAltitude={() => (polygonMode === 'state' ? 0.085 : 0.062)}
            heatmapColorSaturation={() => 0.9}
            heatmapColorFn={() => (t: number) => polarColor(t, 0.24 + t * 0.48)}
            heatmapsTransitionDuration={900}
            onGlobeReady={() => {
              const globe = globeRef.current;
              if (!globe) return;
              globe.scene().fog = new FogExp2('#05060a', 0.06);
              const ambient = new AmbientLight('#f5ced6', 1.5);
              const directional = new DirectionalLight('#ffffff', 1.65);
              directional.position.set(-320, 220, 220);
              const point = new PointLight('#c41e3a', 1.1);
              point.position.set(260, 80, 230);
              globe.lights([ambient, directional, point]);
              const controls = globe.controls();
              controls.autoRotate = !interactedRef.current;
              controls.autoRotateSpeed = 0.35;
            }}
            onZoom={() => {
              interactedRef.current = true;
              const controls = globeRef.current?.controls();
              if (controls) controls.autoRotate = false;
            }}
            showPointerCursor={(type) => type === 'polygon' || type === 'point' || type === 'arc'}
          />
        )}

        {!loading && !assetsLoading && !hasInteractiveData && (
          <div className="absolute inset-x-6 bottom-6 z-20 rounded-[28px] border border-white/10 bg-black/35 p-4 backdrop-blur-md">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/15 text-brand">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h4 className="text-sm font-semibold text-white">The globe is ready for real data.</h4>
                <p className="mt-1 text-sm text-zinc-400">
                  Add a dealer in Settings or run a HubSpot sync to light up geography, arcs, and territory density.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
