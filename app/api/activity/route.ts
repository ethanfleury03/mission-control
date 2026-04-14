import { NextResponse } from 'next/server';
import { getOpenClawStatus } from '../_lib/openclaw';

const DISABLED = process.env.DISABLE_OPENCLAW === '1' || process.env.DISABLE_OPENCLAW === 'true';

export async function GET() {
  if (DISABLED) return NextResponse.json([]);
  const status = await getOpenClawStatus();
  const recent = status?.sessions?.recent ?? [];

  const now = Date.now();
  const points = Array.from({ length: 12 }).map((_, idx) => {
    const bucketStart = now - (11 - idx) * 5 * 60 * 1000;
    const bucketEnd = bucketStart + 5 * 60 * 1000;

    const inBucket = recent.filter((s) => {
      const ts = s.updatedAt ?? 0;
      return ts >= bucketStart && ts < bucketEnd;
    });

    return {
      timestamp: new Date(bucketStart).toISOString(),
      tokens: inBucket.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0),
      sessions: inBucket.length,
    };
  });

  return NextResponse.json(points);
}
