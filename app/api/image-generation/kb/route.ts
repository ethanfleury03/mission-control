import { NextResponse } from 'next/server';

import { getImageStudioKBResponse } from '@/lib/image-generation/service';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  return NextResponse.json(await getImageStudioKBResponse());
}

export const GET = withActiveUser(GETHandler);
