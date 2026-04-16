import { NextRequest, NextResponse } from 'next/server';
import { getJobSnapshot } from '@/lib/directory-scraper/job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

function writeEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const { searchParams } = new URL(request.url);
  const resultsLimit = Number(searchParams.get('resultsLimit') ?? '150');
  const logsLimit = Number(searchParams.get('logsLimit') ?? '80');
  const first = await getJobSnapshot(jobId, {
    resultsLimit: Number.isFinite(resultsLimit) ? resultsLimit : 150,
    logsLimit: Number.isFinite(logsLimit) ? logsLimit : 80,
  });

  if (!first) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      const pushSnapshot = async () => {
        const snapshot = await getJobSnapshot(jobId, {
          resultsLimit: Number.isFinite(resultsLimit) ? resultsLimit : 150,
          logsLimit: Number.isFinite(logsLimit) ? logsLimit : 80,
        });
        if (!snapshot || closed) return;
        controller.enqueue(writeEvent('job', snapshot));
        if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
          if (interval) clearInterval(interval);
          controller.close();
          closed = true;
        }
      };

      controller.enqueue(encoder.encode('retry: 2000\n\n'));
      controller.enqueue(writeEvent('job', first));

      interval = setInterval(() => {
        void pushSnapshot().catch(() => {
          if (interval) clearInterval(interval);
          if (!closed) {
            controller.close();
            closed = true;
          }
        });
      }, 2000);

      const abort = () => {
        if (interval) clearInterval(interval);
        closed = true;
        try {
          controller.close();
        } catch {
          /* ignore close after close */
        }
      };

      request.signal.addEventListener('abort', abort);
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
