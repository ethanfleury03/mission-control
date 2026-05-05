import { NextRequest, NextResponse } from 'next/server';
import { deletePhoneList, getPhoneListById, updatePhoneList } from '@/lib/phone/service';
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
  request: NextRequest,
  context: { params: Promise<{ listId: string }> },
) {
  const { listId } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const updated = await updatePhoneList(listId, {
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      status: typeof body.status === 'string' ? (body.status as 'active' | 'archived') : undefined,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update phone list' },
      { status: 400 },
    );
  }
}

async function DELETEHandler(
  _request: NextRequest,
  context: { params: Promise<{ listId: string }> },
) {
  const { listId } = await context.params;
  try {
    await deletePhoneList(listId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export const GET = withActiveUser(GETHandler);
export const PATCH = withActiveUser(PATCHHandler);
export const DELETE = withActiveUser(DELETEHandler);
