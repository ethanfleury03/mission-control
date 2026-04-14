import { NextResponse } from 'next/server';
import { getOpenClawStatus } from '../_lib/openclaw';
import { isOpenClawDisabledForRequest } from '../_lib/is-openclaw-disabled';

export async function GET() {
  if (await isOpenClawDisabledForRequest()) return NextResponse.json([]);
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
