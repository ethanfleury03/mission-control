import { NextRequest, NextResponse } from 'next/server';

import { runSupportAgent } from '@/lib/rag/agent';
import type { RagFilters } from '@/lib/rag/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return NextResponse.json({ error: 'Query is required.' }, { status: 400 });

  try {
    const filters: RagFilters = {
      documentId: normalizeFilter(body.documentId),
      productFamily: normalizeFilter(body.product || body.productFamily),
      documentType: normalizeFilter(body.documentType),
      version: normalizeFilter(body.version),
      softwareVersion: normalizeFilter(body.softwareVersion),
    };
    const result = await runSupportAgent({
      query,
      filters,
      includeDebug: Boolean(body.debug),
      conversationHistory: Array.isArray(body.conversationHistory) ? body.conversationHistory : [],
      mode: body.mode === 'escalation_summary' || body.mode === 'refine' ? body.mode : 'answer',
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not answer RAG query.' },
      { status: 500 },
    );
  }
}

function normalizeFilter(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
