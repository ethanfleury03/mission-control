import { NextRequest, NextResponse } from 'next/server';

import { createFeedback, listFeedback } from '@/lib/rag/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get('limit') || 50);
    return NextResponse.json({ feedback: await listFeedback(Number.isFinite(limit) ? limit : 50) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load feedback.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const rating = typeof body.rating === 'string' ? body.rating.trim() : '';
  const queryId = typeof body.queryId === 'string' && body.queryId.trim() ? body.queryId.trim() : null;
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

  if (!rating) return NextResponse.json({ error: 'Rating is required.' }, { status: 400 });
  const allowedRatings = ['good', 'bad', 'needs_review', 'relevant', 'irrelevant', 'expected_doc_missing', 'wrong_product', 'bad_citation_page'];
  if (!allowedRatings.includes(rating)) {
    return NextResponse.json({ error: `Rating must be one of: ${allowedRatings.join(', ')}.` }, { status: 400 });
  }

  try {
    await createFeedback({ queryId, rating, notes });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not store feedback.' },
      { status: 500 },
    );
  }
}
