'use client';

import { GeoIntelligenceErrorBoundary } from './components/geo-intelligence/GeoIntelligenceErrorBoundary';
import { GeoIntelligenceTab } from './components/geo-intelligence/GeoIntelligenceTab';

/** Loaded in a separate chunk via `next/dynamic` from `page.tsx` so a bad three.js / globe bundle cannot brick the whole hub shell. */
export function GeoIntelligenceEntry() {
  return (
    <GeoIntelligenceErrorBoundary>
      <GeoIntelligenceTab />
    </GeoIntelligenceErrorBoundary>
  );
}
