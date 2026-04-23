'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/app/lib/utils';

type GeoPolygon = number[][][];
type GeoMultiPolygon = number[][][][];

type GeoFeature = {
  type: 'Feature';
  properties: {
    id: string;
    name: string;
    isoA2: string;
    isoA3: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: GeoPolygon | GeoMultiPolygon;
  };
};

type GeoFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoFeature[];
};

interface GeoPointPickerProps {
  lat: number;
  lng: number;
  onChange: (coords: { lat: number; lng: number }) => void;
  disabled?: boolean;
  className?: string;
}

const VIEWBOX_WIDTH = 720;
const VIEWBOX_HEIGHT = 360;

function projectLng(lng: number) {
  return ((lng + 180) / 360) * VIEWBOX_WIDTH;
}

function projectLat(lat: number) {
  return ((90 - lat) / 180) * VIEWBOX_HEIGHT;
}

function ringPath(points: number[][]) {
  return points
    .map(([lng, lat], index) => `${index === 0 ? 'M' : 'L'} ${projectLng(lng).toFixed(2)} ${projectLat(lat).toFixed(2)}`)
    .join(' ');
}

function geometryToPath(geometry: GeoFeature['geometry']) {
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates as GeoPolygon]
    : (geometry.coordinates as GeoMultiPolygon);

  return polygons
    .map((polygon) =>
      polygon
        .map((ring) => `${ringPath(ring)} Z`)
        .join(' ')
    )
    .join(' ');
}

export function GeoPointPicker({ lat, lng, onChange, disabled, className }: GeoPointPickerProps) {
  const [features, setFeatures] = useState<GeoFeature[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/data/geo/countries.geojson', { cache: 'force-cache' });
        if (!res.ok) throw new Error('Failed to load base map');
        const data = (await res.json()) as GeoFeatureCollection;
        if (!cancelled) setFeatures(data.features);
      } catch (error) {
        console.error('Geo point picker map load failed', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const paths = useMemo(
    () => features.map((feature) => ({ id: feature.properties.id, d: geometryToPath(feature.geometry) })),
    [features],
  );

  return (
    <div className={cn('geo-point-picker overflow-hidden rounded-2xl border border-white/10', className)}>
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">Point Picker</p>
        <p className="mt-1 text-xs text-zinc-500">Click anywhere on the world silhouette to place the dealer pin.</p>
      </div>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className={cn('block h-56 w-full cursor-crosshair bg-transparent', disabled && 'cursor-not-allowed opacity-70')}
        role="img"
        aria-label="Dealer point picker world map"
        onClick={(event) => {
          if (disabled) return;
          const svg = event.currentTarget;
          const rect = svg.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
          const y = ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;
          onChange({
            lat: Number((90 - (y / VIEWBOX_HEIGHT) * 180).toFixed(5)),
            lng: Number(((x / VIEWBOX_WIDTH) * 360 - 180).toFixed(5)),
          });
        }}
      >
        <defs>
          <linearGradient id="geo-point-picker-fill" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
            <stop offset="100%" stopColor="rgba(196,30,58,0.12)" />
          </linearGradient>
          <radialGradient id="geo-point-picker-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="35%" stopColor="rgba(196,30,58,0.95)" />
            <stop offset="100%" stopColor="rgba(196,30,58,0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="transparent" />
        <g opacity="0.95">
          {paths.map((path) => (
            <path
              key={path.id}
              d={path.d}
              fill="url(#geo-point-picker-fill)"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="0.8"
            />
          ))}
        </g>
        <circle cx={projectLng(lng)} cy={projectLat(lat)} r="16" fill="url(#geo-point-picker-glow)" opacity="0.9" />
        <circle cx={projectLng(lng)} cy={projectLat(lat)} r="5.5" fill="#ffffff" />
        <circle cx={projectLng(lng)} cy={projectLat(lat)} r="3.5" fill="#c41e3a" />
      </svg>
      <div className="grid grid-cols-2 gap-3 border-t border-white/10 px-4 py-3 text-xs text-zinc-400">
        <div>
          <span className="block text-[11px] uppercase tracking-[0.16em] text-zinc-500">Latitude</span>
          <span className="mt-1 block font-mono text-zinc-100">{lat.toFixed(5)}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase tracking-[0.16em] text-zinc-500">Longitude</span>
          <span className="mt-1 block font-mono text-zinc-100">{lng.toFixed(5)}</span>
        </div>
      </div>
    </div>
  );
}
