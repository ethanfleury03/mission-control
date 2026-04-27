import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/prisma';

type TableRow = { name: string };

export async function GET() {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const rows = await prisma.$queryRaw<TableRow[]>`
    SELECT tablename AS name
    FROM pg_catalog.pg_tables
    WHERE schemaname = current_schema()
      AND tablename IN ('app_users', 'auth_event_logs')
  `;
  const tables = new Set(rows.map((row) => row.name));

  return NextResponse.json({
    ok: tables.has('app_users') && tables.has('auth_event_logs'),
    tables: {
      appUsers: tables.has('app_users'),
      authEventLogs: tables.has('auth_event_logs'),
    },
  });
}
