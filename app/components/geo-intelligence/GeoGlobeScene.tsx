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
  AdditiveBlending,
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  Mesh,
  MeshPhongMaterial,
  PointLight,
  RepeatWrapping,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';
import { LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { buildFeatureStateKeys } from '@/lib/geo-intelligence/keys';
import type {
  GeoArc,
  GeoCityPoint,
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
  kind: 'origin' | 'dealer-active' | 'dealer-inactive' | 'city';
  lat: number;
  lng: number;
  altitude: number;
  label: string;
  size: number;
  dealer?: GeoDealer;
  count?: number;
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
  dotRadius: number;
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
  fullscreen?: boolean;
  onSelectCountry: (countryIsoA3: string | null) => void;
  onSelectDealer: (dealer: GeoDealer | null) => void;
  onResetView: () => void;
  zoomCommand?: { id: number; direction: 'in' | 'out' } | null;
  selectedDealer: GeoDealer | null;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function htmlTooltip(title: string, count: number, subtitle?: string, percentage?: number) {
  const percentLine = percentage !== undefined
    ? `<div style="margin-top: 4px; font-size: 11px; color: rgba(255,255,255,0.62); letter-spacing: 0.02em;">${percentage.toFixed(1)}% of mapped contacts</div>`
    : '';
  return `
    <div style="
      min-width: 196px;
      border-radius: 14px;
      border: 1px solid rgba(244,63,94,0.28);
      background: linear-gradient(160deg, rgba(10,12,20,0.96), rgba(22,12,20,0.92));
      box-shadow: 0 24px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04);
      padding: 12px 14px;
      color: white;
      backdrop-filter: blur(18px);
      font-family: Inter, system-ui, sans-serif;
    ">
      <div style="font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(244,114,182,0.72);">Arrow Geo</div>
      <div style="margin-top: 6px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.96); line-height: 1.2;">${title}</div>
      <div style="margin-top: 8px; font-size: 22px; font-weight: 700; color: #ff4d6a; letter-spacing: -0.02em;">${count.toLocaleString()}</div>
      ${percentLine}
      ${subtitle ? `<div style="margin-top: 4px; font-size: 11px; color: rgba(255,255,255,0.55); letter-spacing: 0.02em;">${subtitle}</div>` : ''}
    </div>
  `;
}

function densityIntensity(count: number, max: number) {
  if (count <= 0 || max <= 0) return 0;
  if (max <= 1) return 1;
  const logValue = Math.log10(count + 1) / Math.log10(max + 1);
  return clamp(0.16 + logValue * 0.84);
}

function heatColor(intensity: number, alpha = 1) {
  const clamped = clamp(intensity);
  const r = Math.round(252 - 96 * clamped);
  const g = Math.round(165 - 138 * clamped);
  const b = Math.round(165 - 123 * clamped);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function glowColor(intensity: number, alpha = 1) {
  const clamped = clamp(intensity);
  return `rgba(255, ${Math.round(180 - clamped * 110)}, ${Math.round(200 - clamped * 120)}, ${alpha})`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json() as Promise<T>;
}

// Create a soft radial-gradient sprite texture at runtime so pins look like glowing beacons
// without shipping extra PNGs. Cached per color/softness pair.
const spriteTextureCache = new Map<string, CanvasTexture>();
function createBeaconTexture(color: string, softness = 0.45) {
  const key = `${color}:${softness}`;
  const cached = spriteTextureCache.get(key);
  if (cached) return cached;

  const size = 128;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return null;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(softness * 0.35, 'rgba(255,255,255,0.92)');
  gradient.addColorStop(softness, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  spriteTextureCache.set(key, texture);
  return texture;
}

function createBeacon(kind: GlobeMarker['kind'], selected: boolean) {
  const group = new Group();

  const profile = {
    origin: {
      core: '#ffffff',
      haloColor: 'rgba(255,215,130,0.95)',
      coreRadius: 1.1,
      haloRadius: 5.2,
      beamHeight: 0,
    },
    'dealer-active': {
      core: '#ffffff',
      haloColor: 'rgba(255,80,108,0.9)',
      coreRadius: selected ? 0.9 : 0.72,
      haloRadius: selected ? 4.4 : 3.2,
      beamHeight: 0,
    },
    'dealer-inactive': {
      core: '#f8c8d0',
      haloColor: 'rgba(244,114,128,0.55)',
      coreRadius: 0.55,
      haloRadius: 2.2,
      beamHeight: 0,
    },
    city: {
      core: '#ffffff',
      haloColor: 'rgba(226,232,240,0.55)',
      coreRadius: 0.36,
      haloRadius: 1.6,
      beamHeight: 0,
    },
  }[kind];

  const haloTexture = createBeaconTexture(profile.haloColor, 0.5);
  if (haloTexture) {
    const halo = new Sprite(
      new SpriteMaterial({
        map: haloTexture,
        color: new Color('#ffffff'),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    halo.scale.set(profile.haloRadius, profile.haloRadius, 1);
    group.add(halo);
  }

  const coreTexture = createBeaconTexture('rgba(255,255,255,0.98)', 0.6);
  if (coreTexture) {
    const core = new Sprite(
      new SpriteMaterial({
        map: coreTexture,
        color: new Color(profile.core),
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    core.scale.set(profile.coreRadius, profile.coreRadius, 1);
    group.add(core);
  }

  return group;
}

// Rotating cloud sphere + atmospheric fresnel shell, added in onGlobeReady.
function createCloudLayer(radius: number, texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshPhongMaterial({
    map: texture,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const geometry = new SphereGeometry(radius, 48, 32);
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 2;
  return mesh;
}

export function GeoGlobeScene({
  snapshot,
  drilldown,
  layers,
  loading,
  fullscreen = false,
  onSelectCountry,
  onSelectDealer,
  onResetView,
  zoomCommand,
  selectedDealer,
}: GeoGlobeSceneProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const interactedRef = useRef(false);
  const cloudMeshRef = useRef<Mesh | null>(null);

  const materialRef = useRef<MeshPhongMaterial | null>(null);
  if (!materialRef.current && typeof window !== 'undefined') {
    const material = new MeshPhongMaterial({
      color: new Color('#1b2f4e'),
      emissive: new Color('#162a44'),
      emissiveIntensity: 0.3,
      specular: new Color('#6f98c8'),
      shininess: 16,
    });

    const loader = new TextureLoader();
    loader.load('/data/geo/textures/earth-day.jpg', (texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 4;
      material.map = texture;
      material.color = new Color('#ffffff');
      material.needsUpdate = true;
    });
    loader.load('/data/geo/textures/earth-topology.png', (texture) => {
      texture.anisotropy = 4;
      material.bumpMap = texture;
      material.bumpScale = 14;
      material.needsUpdate = true;
    });
    loader.load('/data/geo/textures/earth-water.png', (texture) => {
      texture.anisotropy = 4;
      material.specularMap = texture;
      material.specular = new Color('#3a6cb0');
      material.needsUpdate = true;
    });
    loader.load('/data/geo/textures/earth-night.jpg', (texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 4;
      material.emissiveMap = texture;
      material.emissive = new Color('#ffc27a');
      material.emissiveIntensity = 0.36;
      material.needsUpdate = true;
    });

    materialRef.current = material;
  }

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [admin1, setAdmin1] = useState<Admin1Feature[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const preloadedAdmin1Ref = useRef<Set<string>>(new Set());

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.max(320, Math.floor(entry.contentRect.width));
        const nextHeight = fullscreen
          ? Math.max(540, Math.floor(entry.contentRect.height))
          : Math.max(540, Math.min(760, Math.floor(width * 0.72)));
        const height = Number.isFinite(nextHeight) && nextHeight > 0 ? nextHeight : 540;
        setDimensions({ width, height });
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [fullscreen]);

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
      const intensity = densityIntensity(count, max);
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
      const intensity = densityIntensity(count, max);
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

    const markers: GlobeMarker[] = [
      {
        id: snapshot.arrowOrigin.id,
        kind: 'origin',
        lat: snapshot.arrowOrigin.lat,
        lng: snapshot.arrowOrigin.lng,
        altitude: 0.015,
        size: 1.4,
        label: snapshot.arrowOrigin.label,
      },
    ];

    if (layers.dealers) {
      for (const dealer of snapshot.dealers) {
        if (dealer.status === 'archived') continue;
        const active = dealer.status === 'active';
        const selected = dealer.id === selectedDealer?.id;
        markers.push({
          id: dealer.id,
          kind: active ? 'dealer-active' : 'dealer-inactive',
          lat: dealer.lat,
          lng: dealer.lng,
          altitude: 0.012,
          size: selected ? 1.4 : active ? 1 : 0.7,
          label: dealer.name,
          dealer,
        });
      }
    }

    if (layers.contactCoverage && snapshot.topCities?.length) {
      for (const city of snapshot.topCities.slice(0, 16)) {
        markers.push({
          id: `city:${city.key}`,
          kind: 'city',
          lat: city.lat,
          lng: city.lng,
          altitude: 0.008,
          size: 0.6,
          label: city.label,
          count: city.count,
        });
      }
    }

    return markers;
  }, [layers.contactCoverage, layers.dealers, selectedDealer?.id, snapshot]);

  const ringsData = useMemo<GlobeRing[]>(() => {
    if (!snapshot) return [];

    if (!layers.dealers || !selectedDealer) return [];

    const dealer = snapshot.dealers.find((d) => d.id === selectedDealer.id && d.status === 'active');
    if (!dealer) return [];

    return [
      {
        id: `ring:${dealer.id}`,
        lat: dealer.lat,
        lng: dealer.lng,
        maxRadius: 2.6,
        speed: 0.85,
        repeat: 1400,
        color: ['rgba(255,255,255,0.35)', 'rgba(244,63,94,0.0)'],
      },
    ];
  }, [layers.dealers, selectedDealer?.id, snapshot]);

  const labelsData = useMemo<GlobeLabel[]>(() => {
    if (!snapshot) return [];

    const labels: GlobeLabel[] = [];

    if (polygonMode === 'state' && drilldown && statePolygonData.length > 0) {
      for (const item of statePolygonData
        .filter((i) => i.count > 0 && i.feature.properties.latitude !== undefined && i.feature.properties.longitude !== undefined)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)) {
        labels.push({
          id: `state-label:${item.id}`,
          lat: item.feature.properties.latitude ?? drilldown.country.lat,
          lng: item.feature.properties.longitude ?? drilldown.country.lng,
          text: item.feature.properties.name,
          size: item.intensity > 0.45 ? 0.82 : 0.62,
          color: 'rgba(248,250,252,0.92)',
          altitude: 0.03 + item.intensity * 0.012,
          dotRadius: 0.18,
        });
      }
    } else {
      for (const [index, bucket] of snapshot.countryBuckets
        .filter((bucket) => bucket.lat !== undefined && bucket.lng !== undefined)
        .slice(0, 6)
        .entries()) {
        labels.push({
          id: `country-label:${bucket.key}`,
          lat: bucket.lat ?? 0,
          lng: bucket.lng ?? 0,
          text: bucket.label,
          size: index < 3 ? 0.92 : 0.72,
          color: index < 3 ? 'rgba(248,250,252,0.96)' : 'rgba(226,232,240,0.82)',
          altitude: 0.024,
          dotRadius: 0.22,
        });
      }
    }

    if (layers.contactCoverage && snapshot.topCities?.length) {
      for (const city of snapshot.topCities.slice(0, 14)) {
        labels.push({
          id: `city-label:${city.key}`,
          lat: city.lat,
          lng: city.lng,
          text: city.label,
          size: 0.5,
          color: 'rgba(226,232,240,0.85)',
          altitude: 0.018,
          dotRadius: 0.14,
        });
      }
    }

    return labels;
  }, [drilldown, layers.contactCoverage, polygonMode, snapshot, statePolygonData]);

  const arcData = useMemo<GeoArc[]>(() => {
    if (!snapshot) return [];
    const arcs: GeoArc[] = [];
    if (layers.dealerNetwork) arcs.push(...snapshot.dealerArcs.slice(0, 10));
    if (layers.contactCoverage) arcs.push(...(snapshot.ecosystemArcs?.slice(0, 12) ?? []));
    return arcs;
  }, [layers.contactCoverage, layers.dealerNetwork, snapshot]);

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
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.dampingFactor = 0.08;
    controls.autoRotate = !interactedRef.current;
    controls.autoRotateSpeed = 0.14;
    controls.minDistance = 175;
    controls.maxDistance = 520;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.75;
  }, [dimensions.height, dimensions.width]);

  useEffect(() => {
    if (!zoomCommand) return;
    const globe = globeRef.current;
    if (!globe) return;

    interactedRef.current = true;
    const controls = globe.controls();
    controls.autoRotate = false;

    const current = globe.pointOfView() as {
      lat?: number;
      lng?: number;
      altitude?: number;
    };
    const altitude = current.altitude ?? 2.4;
    const multiplier = zoomCommand.direction === 'in' ? 0.72 : 1.32;
    globe.pointOfView(
      {
        lat: current.lat ?? 24,
        lng: current.lng ?? -10,
        altitude: clamp(altitude * multiplier, 0.55, 4.2),
      },
      650,
    );
  }, [zoomCommand]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    if (selectedDealer) {
      globe.pointOfView({ lat: selectedDealer.lat, lng: selectedDealer.lng, altitude: 1.1 }, 1800);
      return;
    }

    if (drilldown) {
      globe.pointOfView(drilldown.cameraTarget, 1800);
      return;
    }

    globe.pointOfView({ lat: 24, lng: -10, altitude: 2.4 }, 1600);
  }, [drilldown, selectedDealer]);

  // Slowly rotate the cloud layer independently of the globe for a living-planet feel.
  useEffect(() => {
    let frame = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      if (cloudMeshRef.current) {
        cloudMeshRef.current.rotation.y += dt * 0.004;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const emptyNetwork =
    snapshot !== null &&
    snapshot.summary.activeDealers === 0 &&
    snapshot.dealerArcs.length === 0 &&
    snapshot.summary.hubspotContactsMapped === 0;
  const countryPolygonDatum = (item: object) => item as CountryPolygonDatum;
  const statePolygonDatum = (item: object) => item as StatePolygonDatum;

  return (
    <div
      className={cn(
        'geo-stage-card relative overflow-hidden bg-[#0b1222]',
        fullscreen
          ? 'h-full min-h-[34rem] rounded-none border-0 shadow-none'
          : 'rounded-[32px] border border-white/35 shadow-[0_24px_80px_rgba(15,23,42,0.16)]',
      )}
    >
      <div className="pointer-events-none absolute inset-0 geo-stage" />
      <div className="pointer-events-none absolute inset-0 geo-stage-stars" />
      <div className="pointer-events-none absolute inset-0 geo-stage-vignette" />

      <div
        ref={stageRef}
        className={cn(
          'relative z-0 w-full cursor-grab active:cursor-grabbing',
          fullscreen ? 'h-full min-h-[34rem]' : 'h-[40rem] min-h-[34rem]',
        )}
        onPointerDown={() => {
          interactedRef.current = true;
          const controls = globeRef.current?.controls();
          if (controls) controls.autoRotate = false;
        }}
      >
        {(loading || assetsLoading) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b1222]/50 backdrop-blur-sm">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-slate-900/75 px-5 py-3 text-sm text-white shadow-[0_18px_50px_rgba(244,63,94,0.18)]">
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
            showAtmosphere={false}
            showGraticules={false}
            showGlobe
            globeMaterial={materialRef.current ?? undefined}
            pointsData={globeMarkers}
            pointLat="lat"
            pointLng="lng"
            pointAltitude="altitude"
            pointRadius={() => 0}
            pointsTransitionDuration={0}
            pointLabel={(marker) => {
              const item = marker as GlobeMarker;
              if (item.kind === 'origin') return htmlTooltip(item.label, snapshot?.summary.activeDealers ?? 0, 'Arrow origin · Burlington, ON');
              if (item.kind === 'city') return htmlTooltip(item.label, item.count ?? 0, 'HubSpot contact hotspot');
              return htmlTooltip(item.label, item.dealer?.sameCountryContacts ?? 0, `${item.dealer?.country || ''}${item.dealer?.stateRegion ? ` · ${item.dealer.stateRegion}` : ''}`);
            }}
            onPointHover={(marker) => {
              const item = marker as GlobeMarker | null;
              setHoverLabel(item ? item.label : null);
            }}
            onPointClick={(marker) => {
              const item = marker as GlobeMarker;
              if ((item.kind === 'dealer-active' || item.kind === 'dealer-inactive') && item.dealer) {
                startTransition(() => onSelectDealer(item.dealer ?? null));
              }
            }}
            customLayerData={globeMarkers}
            customThreeObject={(marker) => {
              const item = marker as GlobeMarker;
              const selected = item.kind === 'dealer-active' && item.dealer?.id === selectedDealer?.id;
              const group = createBeacon(item.kind, selected);
              group.scale.setScalar(item.size);
              return group;
            }}
            customThreeObjectUpdate={(obj, marker) => {
              const globe = globeRef.current;
              const item = marker as GlobeMarker;
              if (!globe) return;
              const coords = globe.getCoords(item.lat, item.lng, item.altitude);
              (obj as Group).position.set(coords.x, coords.y, coords.z);
            }}
            arcsData={arcData}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcAltitudeAutoScale={0.48}
            arcStroke={(arc: object) => ((arc as GeoArc).kind === 'ecosystem' ? 0.2 : 0.42)}
            arcDashLength={0.38}
            arcDashGap={2.0}
            arcDashInitialGap={() => Math.random() * 2}
            arcDashAnimateTime={(arc: object) => ((arc as GeoArc).kind === 'ecosystem' ? 0 : 2800)}
            arcColor={(arc: object) => {
              const a = arc as GeoArc;
              if (a.kind === 'ecosystem') {
                return ['rgba(248,113,133,0.02)', 'rgba(244,114,182,0.55)', 'rgba(251,191,36,0.02)'];
              }
              return ['rgba(255,255,255,0.02)', 'rgba(244,63,94,0.98)', 'rgba(196,30,58,0.04)'];
            }}
            arcLabel={(arc) => htmlTooltip((arc as { label: string }).label, 1, ((arc as GeoArc).kind === 'ecosystem' ? 'Contact ecosystem link' : 'Arrow network route'))}
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
            labelDotRadius={(label) => (label as GlobeLabel).dotRadius}
            labelResolution={2}
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
                return selected ? 'rgba(196,30,58,0.32)' : 'rgba(255,255,255,0.0)';
              }
              if (polygonMode === 'state' && !layers.stateHeatmap) {
                return 'rgba(255,255,255,0.06)';
              }
              if (datum.count === 0) return 'rgba(255,255,255,0.0)';
              return heatColor(datum.intensity, 0.58 + datum.intensity * 0.32);
            }}
            polygonSideColor={(item) => {
              const datum = item as CountryPolygonDatum | StatePolygonDatum;
              if (datum.count <= 0) return 'rgba(255,255,255,0.0)';
              return heatColor(datum.intensity, 0.52);
            }}
            polygonStrokeColor={(item) => {
              const datum = item as CountryPolygonDatum | StatePolygonDatum;
              if (datum.count > 0) return glowColor(datum.intensity, 0.78);
              return 'rgba(255,255,255,0.08)';
            }}
            polygonAltitude={(item) => {
              const datum = item as CountryPolygonDatum | StatePolygonDatum;
              if (polygonMode === 'country' && !layers.countryHeatmap) {
                return drilldown && 'isoA3' in datum.feature.properties && datum.feature.properties.isoA3 === drilldown.country.isoA3 ? 0.02 : 0.005;
              }
              if (polygonMode === 'state' && !layers.stateHeatmap) return 0.008;
              return polygonMode === 'state'
                ? 0.006 + datum.intensity * 0.032
                : 0.004 + datum.intensity * 0.026;
            }}
            polygonCapCurvatureResolution={2}
            polygonsTransitionDuration={500}
            polygonLabel={(item) => {
              if (polygonMode === 'state') {
                const datum = statePolygonDatum(item);
                const percentage = drilldown?.summary.mappedContacts
                  ? (datum.count / drilldown.summary.mappedContacts) * 100
                  : undefined;
                return htmlTooltip(datum.feature.properties.name, datum.count, drilldown?.country.name, percentage);
              }
              const datum = countryPolygonDatum(item);
              const percentage = snapshot?.summary.hubspotContactsMapped
                ? (datum.count / snapshot.summary.hubspotContactsMapped) * 100
                : undefined;
              return htmlTooltip(datum.feature.properties.name, datum.count, datum.feature.properties.continent, percentage);
            }}
            onPolygonHover={(item) => {
              const datum = item as CountryPolygonDatum | StatePolygonDatum | null;
              if (!datum) {
                setHoverLabel(null);
                return;
              }
              setHoverLabel(datum.feature.properties.name);
              if (polygonMode === 'country' && 'isoA3' in datum.feature.properties) {
                const iso = (datum as CountryPolygonDatum).feature.properties.isoA3;
                if (!preloadedAdmin1Ref.current.has(iso)) {
                  preloadedAdmin1Ref.current.add(iso);
                  fetch(`/data/geo/admin1/${iso}.geojson`, { cache: 'force-cache' }).catch(() => {
                    preloadedAdmin1Ref.current.delete(iso);
                  });
                }
              }
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
            heatmapBandwidth={() => (polygonMode === 'state' ? 1.02 : 1.28)}
            heatmapBaseAltitude={() => 0.008}
            heatmapTopAltitude={() => (polygonMode === 'state' ? 0.058 : 0.044)}
            heatmapColorSaturation={() => 0.72}
            heatmapColorFn={() => (t: number) => heatColor(t, 0.18 + t * 0.34)}
            heatmapsTransitionDuration={400}
            onGlobeReady={() => {
              const globe = globeRef.current;
              if (!globe) return;
              const scene = globe.scene();
              scene.fog = new FogExp2('#0b1222', 0.001);

              const ambient = new AmbientLight('#dbeafe', 0.38);
              const sun = new DirectionalLight('#fff2d2', 1.52);
              sun.position.set(-360, 220, 200);
              const rim = new PointLight('#ff6b86', 0.42, 900);
              rim.position.set(420, 120, -260);
              const fill = new PointLight('#5d92ff', 0.32, 900);
              fill.position.set(-360, -140, 220);
              globe.lights([ambient, sun, rim, fill]);

              const globeRadius = globe.getGlobeRadius();

              const loader = new TextureLoader();
              loader.load('/data/geo/textures/earth-clouds.png', (texture) => {
                texture.wrapS = RepeatWrapping;
                texture.wrapT = RepeatWrapping;
                texture.anisotropy = 4;
                const cloudMesh = createCloudLayer(globeRadius * 1.012, texture);
                scene.add(cloudMesh);
                cloudMeshRef.current = cloudMesh;
              });

              const controls = globe.controls();
              controls.autoRotate = !interactedRef.current;
              controls.autoRotateSpeed = 0.14;
            }}
            onZoom={() => {
              interactedRef.current = true;
              const controls = globeRef.current?.controls();
              if (controls) controls.autoRotate = false;
            }}
            showPointerCursor={(type) => type === 'polygon' || type === 'point' || type === 'arc'}
          />
        )}

        <div className="pointer-events-none absolute right-5 top-5 z-10 flex flex-wrap items-center justify-end gap-2">
          {hoverLabel && (
            <span className="pointer-events-auto rounded-full border border-white/18 bg-slate-900/75 px-3 py-1.5 text-xs text-white/90 shadow-[0_12px_30px_rgba(15,23,42,0.24)] backdrop-blur-sm">
              {hoverLabel}
            </span>
          )}
          {!fullscreen ? (
            <button
              type="button"
              onClick={onResetView}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/18 bg-slate-900/75 px-3 py-1.5 text-xs font-medium text-white/90 shadow-[0_12px_30px_rgba(15,23,42,0.24)] backdrop-blur-sm transition-colors hover:border-brand/50 hover:bg-brand/20 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Globe
            </button>
          ) : null}
        </div>

        {!loading && !assetsLoading && emptyNetwork && (
          <div className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center px-6">
            <div className="max-w-md rounded-2xl border border-white/18 bg-[#101827]/90 px-5 py-4 text-center shadow-[0_24px_60px_rgba(0,0,0,0.36)] backdrop-blur-md">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">No map data yet</p>
              <p className="mt-2 text-sm font-medium text-white">Only Arrow HQ is shown until you add data.</p>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                Add dealers in <strong className="text-zinc-300">Dealers</strong> and set a HubSpot token, then <strong className="text-zinc-300">Refresh HubSpot</strong> to plot contacts and heatmaps.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
