import { NextResponse } from 'next/server';
import { getOpenClawStatus } from '../_lib/openclaw';

const DISABLED = process.env.DISABLE_OPENCLAW === '1' || process.env.DISABLE_OPENCLAW === 'true';

export async function GET() {
  if (DISABLED) return NextResponse.json([]);
  const status = await getOpenClawStatus();
  const recent = status?.sessions?.recent ?? [];

  const sessions = recent.slice(0, 24).map((s, idx) => {
    const ts = s.updatedAt ? new Date(s.updatedAt).toISOString() : new Date().toISOString();
    return {
      id: s.key || `session-${idx}`,
      agentId: s.agentId || 'unknown',
      agentName: s.agentId || 'unknown',
      model: s.model || 'unknown',
      tokens: s.totalTokens ?? (s.inputTokens ?? 0) + (s.outputTokens ?? 0),
      startTime: ts,
      lastActivity: ts,
      status: 'active' as const,
    };
  });

  return NextResponse.json(sessions);
}
