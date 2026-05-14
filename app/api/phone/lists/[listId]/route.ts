import { NextRequest, NextResponse } from 'next/server';
import { getPhoneListById } from '@/lib/phone/service';
import { withActiveUser } from '../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(
  _request: NextRequest,
  context: { params: Promise<{ listId: string }> },
) {
  const { listId } = await context.params;
  const list = await getPhoneListById(listId);
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(list);
}

async function PATCHHandler(
  _request: NextRequest,
  _context: { params: Promise<{ listId: string }> },
) {
  return NextResponse.json(
    { error: 'Phone list management is disabled. Lists live in the CRM.' },
    { status: 410 },
  );
}

async function DELETEHandler(
  _request: NextRequest,
  _context: { params: Promise<{ listId: string }> },
) {
  return NextResponse.json(
    { error: 'Phone list management is disabled. Lists live in the CRM.' },
    { status: 410 },
  );
}

export const GET = withActiveUser(GETHandler);
export const PATCH = withActiveUser(PATCHHandler);
export const DELETE = withActiveUser(DELETEHandler);
