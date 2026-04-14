import { NextRequest, NextResponse } from 'next/server';
import { getJob, patchJobMeta } from '@/lib/directory-scraper/job-store';
import { exportToCsv } from '@/lib/directory-scraper/export-csv';
import { exportToGoogleSheets, isSheetsConfigured } from '@/lib/directory-scraper/export-sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.results.length === 0) {
    return NextResponse.json({ error: 'No results to export' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const target = body.target ?? 'csv';

  if (target === 'csv') {
    const csv = exportToCsv(job.results);
    const prevCsv = job.meta?.csvExportCount ?? 0;
    await patchJobMeta(jobId, {
      lastCsvExportAt: new Date().toISOString(),
      csvExportCount: prevCsv + 1,
    });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="scrape-${jobId}.csv"`,
      },
    });
  }

  if (target === 'sheets') {
    if (!isSheetsConfigured()) {
      return NextResponse.json(
        {
          error:
            'Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in the server environment, restart the app, and share the target spreadsheet with that service account email (Editor).',
          code: 'SHEETS_NOT_CONFIGURED',
        },
        { status: 400 },
      );
    }
    const sheetId = body.googleSheetId || job.input.googleSheetId;
    const tabName = body.googleSheetTab || job.input.googleSheetTab || 'Scrape Results';
    if (!sheetId) {
      return NextResponse.json({ error: 'Google Sheet ID required', code: 'MISSING_SHEET_ID' }, { status: 400 });
    }
    try {
      const prevSheets = job.meta?.sheetsExportCount ?? 0;
      const result = await exportToGoogleSheets(job.results, sheetId, tabName);
      const duplicateNote =
        prevSheets > 0
          ? `This was export #${prevSheets + 1} to Sheets for this job. Each export appends all ${job.results.length} rows again — you may have duplicates unless you clear the tab or use a new tab.`
          : `Sheets export appends rows. Re-exporting the same job will duplicate rows in the tab.`;
      await patchJobMeta(jobId, {
        lastSheetsExportAt: new Date().toISOString(),
        sheetsExportCount: prevSheets + 1,
        lastSheetsRowsAppended: result.rowsWritten + (result.headersWritten ? 1 : 0),
        sheetsExportNote: duplicateNote,
      });
      return NextResponse.json({ ...result, duplicateWarning: prevSheets > 0 ? duplicateNote : undefined });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sheets export failed';
      return NextResponse.json(
        { error: message, code: 'SHEETS_EXPORT_FAILED' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: 'Invalid export target' }, { status: 400 });
}
