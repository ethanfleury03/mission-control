'use client';

import type {
  GeoArc,
  GeoCountryDrilldownSnapshot,
  GeoDashboardSnapshot,
  GeoDealer,
  GeoLayerKey,
} from '@/lib/geo-intelligence/types';

export type GeoRendererMode = 'hybrid' | 'three';
export type GeoPolygonMode = 'country' | 'state';

export type GeoSceneMarkerKind = 'origin' | 'dealer-active' | 'dealer-inactive' | 'city';

export type GeoSceneMarker = {
  id: string;
  kind: GeoSceneMarkerKind;
  lat: number;
  lng: number;
  altitude: number;
  label: string;
  size: number;
  dealer?: GeoDealer;
  count?: number;
};

export type GeoSceneRing = {
  id: string;
  lat: number;
  lng: number;
  maxRadius: number;
  speed: number;
  repeat: number;
  color: string[];
};

export type GeoSceneLabel = {
  id: string;
  lat: number;
  lng: number;
  text: string;
  size: number;
  color: string;
  altitude: number;
  dotRadius: number;
};

export type GeoSceneHeatPoint = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  weight: number;
  intensity: number;
};

export type GeoSceneHeatDataset = {
  id: string;
  points: Array<{
    lat: number;
    lng: number;
    weight: number;
  }>;
};

export type GeoSceneModel = {
  markers: GeoSceneMarker[];
  rings: GeoSceneRing[];
  labels: GeoSceneLabel[];
  arcs: GeoArc[];
  heatPoints: GeoSceneHeatPoint[];
  heatmaps: GeoSceneHeatDataset[];
};

export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function densityIntensity(count: number, max: number) {
  if (count <= 0 || max <= 0) return 0;
  if (max <= 1) return 1;
  const logValue = Math.log10(count + 1) / Math.log10(max + 1);
  return clamp(0.14 + logValue * 0.86);
}

export function heatColor(intensity: number, alpha = 1) {
  const clamped = clamp(intensity);
  const r = Math.round(255 - 78 * clamped);
  const g = Math.round(158 - 132 * clamped);
  const b = Math.round(150 - 118 * clamped);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function heatHex(intensity: number) {
  const clamped = clamp(intensity);
  const r = Math.round(255 - 72 * clamped);
  const g = Math.round(132 - 104 * clamped);
  const b = Math.round(128 - 96 * clamped);
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

export function glowColor(intensity: number, alpha = 1) {
  const clamped = clamp(intensity);
  return `rgba(255, ${Math.round(150 - clamped * 94)}, ${Math.round(170 - clamped * 110)}, ${alpha})`;
}

function buildCountryHeatPoints(snapshot: GeoDashboardSnapshot | null): GeoSceneHeatPoint[] {
  if (!snapshot) return [];
  const max = Math.max(...snapshot.countryBuckets.map((bucket) => bucket.count), 1);

  return snapshot.countryBuckets
    .filter((bucket) => bucket.count > 0 && bucket.lat !== undefined && bucket.lng !== undefined)
    .map((bucket) => ({
      id: `country-heat:${bucket.key}`,
      label: bucket.label,
      lat: bucket.lat ?? 0,
      lng: bucket.lng ?? 0,
      weight: bucket.count,
      intensity: densityIntensity(bucket.count, max),
    }));
}

function curateDealerArcs(snapshot: GeoDashboardSnapshot, selectedDealer: GeoDealer | null): GeoArc[] {
  const selectedArcId = selectedDealer ? `dealer-arc:${selectedDealer.id}` : '';
  const dealerArcs = [...snapshot.dealerArcs].sort((a, b) => {
    if (a.id === selectedArcId) return -1;
    if (b.id === selectedArcId) return 1;
    return (b.weight ?? 0) - (a.weight ?? 0) || a.label.localeCompare(b.label);
  });

  const cap = selectedDealer ? 24 : Math.max(24, snapshot.summary.activeDealers);
  return dealerArcs.slice(0, cap);
}

export function buildGeoSceneModel({
  snapshot,
  drilldown,
  layers,
  selectedDealer,
  polygonMode,
  stateHeatPoints = [],
}: {
  snapshot: GeoDashboardSnapshot | null;
  drilldown: GeoCountryDrilldownSnapshot | null;
  layers: Record<GeoLayerKey, boolean>;
  selectedDealer: GeoDealer | null;
  polygonMode: GeoPolygonMode;
  stateHeatPoints?: GeoSceneHeatPoint[];
}): GeoSceneModel {
  if (!snapshot) {
    return {
      markers: [],
      rings: [],
      labels: [],
      arcs: [],
      heatPoints: [],
      heatmaps: [],
    };
  }

  const markers: GeoSceneMarker[] = [
    {
      id: snapshot.arrowOrigin.id,
      kind: 'origin',
      lat: snapshot.arrowOrigin.lat,
      lng: snapshot.arrowOrigin.lng,
      altitude: 0.014,
      size: 1.18,
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
        altitude: 0.011,
        size: selected ? 1.22 : active ? 0.86 : 0.58,
        label: dealer.name,
        dealer,
      });
    }
  }

  if (layers.contactCoverage && snapshot.topCities?.length) {
    for (const city of snapshot.topCities.slice(0, 10)) {
      markers.push({
        id: `city:${city.key}`,
        kind: 'city',
        lat: city.lat,
        lng: city.lng,
        altitude: 0.008,
        size: 0.46,
        label: city.label,
        count: city.count,
      });
    }
  }

  const rings: GeoSceneRing[] = [];
  if (layers.dealers && selectedDealer) {
    const dealer = snapshot.dealers.find((d) => d.id === selectedDealer.id && d.status === 'active');
    if (dealer) {
      rings.push({
        id: `ring:${dealer.id}`,
        lat: dealer.lat,
        lng: dealer.lng,
        maxRadius: 2.25,
        speed: 0.72,
        repeat: 1700,
        color: ['rgba(255,255,255,0.28)', 'rgba(244,63,94,0.0)'],
      });
    }
  }

  const labels: GeoSceneLabel[] = [];
  if (polygonMode === 'state' && drilldown && stateHeatPoints.length > 0) {
    for (const point of [...stateHeatPoints].sort((a, b) => b.weight - a.weight).slice(0, 4)) {
      labels.push({
        id: `state-label:${point.id}`,
        lat: point.lat,
        lng: point.lng,
        text: point.label,
        size: point.intensity > 0.45 ? 0.72 : 0.56,
        color: 'rgba(248,250,252,0.9)',
        altitude: 0.026 + point.intensity * 0.01,
        dotRadius: 0.16,
      });
    }
  } else {
    for (const [index, bucket] of snapshot.countryBuckets
      .filter((bucket) => bucket.lat !== undefined && bucket.lng !== undefined)
      .slice(0, 5)
      .entries()) {
      labels.push({
        id: `country-label:${bucket.key}`,
        lat: bucket.lat ?? 0,
        lng: bucket.lng ?? 0,
        text: bucket.label,
        size: index < 2 ? 0.82 : 0.64,
        color: index < 2 ? 'rgba(248,250,252,0.92)' : 'rgba(226,232,240,0.72)',
        altitude: 0.02,
        dotRadius: 0.18,
      });
    }
  }

  if (layers.contactCoverage && snapshot.topCities?.length) {
    for (const city of snapshot.topCities.slice(0, 5)) {
      labels.push({
        id: `city-label:${city.key}`,
        lat: city.lat,
        lng: city.lng,
        text: city.label,
        size: 0.44,
        color: 'rgba(226,232,240,0.7)',
        altitude: 0.016,
        dotRadius: 0.11,
      });
    }
  }

  const arcs: GeoArc[] = [];
  if (layers.dealerNetwork) arcs.push(...curateDealerArcs(snapshot, selectedDealer));
  if (layers.contactCoverage) {
    arcs.push(
      ...[...(snapshot.ecosystemArcs ?? [])]
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
        .slice(0, 6),
    );
  }

  const heatPoints =
    polygonMode === 'state' && stateHeatPoints.length > 0
      ? stateHeatPoints
      : buildCountryHeatPoints(snapshot);

  const activeHeatPoints = heatPoints.filter((point) => {
    if (polygonMode === 'state') return layers.stateHeatmap;
    return layers.countryHeatmap;
  });

  const heatmaps: GeoSceneHeatDataset[] = [];
  if (layers.contactCoverage) {
    const points = (polygonMode === 'state' ? stateHeatPoints : buildCountryHeatPoints(snapshot)).map((point) => ({
      lat: point.lat,
      lng: point.lng,
      weight: point.weight,
    }));
    if (points.length > 0) {
      heatmaps.push({ id: `${polygonMode}-contact-coverage`, points });
    }
  }

  return {
    markers,
    rings,
    labels,
    arcs,
    heatPoints: activeHeatPoints,
    heatmaps,
  };
}
