import { NextResponse } from 'next/server';

import { getDashboardStats } from '@/lib/rag/db';
import { collectRagHealth } from '@/lib/rag/health';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  const health = await collectRagHealth();
  try {
    return NextResponse.json({ ...(await getDashboardStats()), health });
  } catch (error) {
    return NextResponse.json(
      {
        ...emptyDashboardStats(),
        health,
        error: error instanceof Error ? error.message : 'Could not load RAG dashboard.',
      },
      { status: health.ok ? 500 : 200 },
    );
  }
}

function emptyDashboardStats() {
  return {
    totals: {
      totalDocuments: 0,
      totalPages: 0,
      totalChunks: 0,
      productsRepresented: 0,
      lastSuccessfulIngestion: null,
    },
    products: [],
    documentTypes: [],
    recentJobs: [],
    failedJobs: [],
    warnings: {
      missingProduct: 0,
      missingDocumentType: 0,
      lowExtractionQuality: 0,
      noEmbeddings: 0,
      staleDocuments: 0,
      needsMetadataReview: 0,
    },
  };
}

export const GET = withActiveUser(GETHandler);
