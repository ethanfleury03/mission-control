import { NextResponse } from 'next/server';

import { BLOGS_ENABLED } from '@/lib/features';

export function ensureBlogsEnabled() {
  if (BLOGS_ENABLED) return null;
  return NextResponse.json(
    { error: 'Blogs are disabled in this environment.' },
    { status: 404 },
  );
}
