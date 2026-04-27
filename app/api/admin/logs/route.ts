import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/prisma';

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseDetail(value: string): unknown {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const params = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(20, Number(params.get('limit') ?? 80) || 80));
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const type = params.get('type')?.trim() || '';
  const actorEmail = params.get('actorEmail')?.trim().toLowerCase() || '';
  const targetEmail = params.get('targetEmail')?.trim().toLowerCase() || '';
  const from = parseDate(params.get('from'));
  const to = parseDate(params.get('to'));

  const where = {
    ...(type ? { type } : {}),
    ...(actorEmail ? { actorEmail: { contains: actorEmail } } : {}),
    ...(targetEmail ? { targetEmail: { contains: targetEmail } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.authEventLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.authEventLog.count({ where }),
  ]);

  return NextResponse.json({
    logs: logs.map((log) => ({ ...log, detail: parseDetail(log.detailJson) })),
    total,
    limit,
    offset,
  });
}
