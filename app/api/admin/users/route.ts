import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const search = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() || '';
  const status = request.nextUrl.searchParams.get('status')?.trim().toLowerCase() || '';

  const users = await prisma.appUser.findMany({
    where: {
      ...(status && status !== 'all' ? { status } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search } },
              { name: { contains: search } },
              { hostedDomain: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastLoginAt: 'desc' }, { createdAt: 'desc' }],
    take: 250,
  });

  return NextResponse.json({ users });
}
