import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import type { CompanyResult } from './types';
import { getResultHeaders, resultToValues } from './export-csv';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      'Google Sheets credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.',
    );
  }

  const key = rawKey.replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export function isSheetsConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

function normalizeHeaderCell(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase();
}

function rowLooksLikeOurHeader(row: unknown[] | undefined): boolean {
  const expected = getResultHeaders().map((h) => h.toLowerCase());
  if (!row || row.length < expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (normalizeHeaderCell(row[i]) !== expected[i]) return false;
  }
  return true;
}

export async function exportToGoogleSheets(
  results: CompanyResult[],
  spreadsheetId: string,
  tabName: string = 'Scrape Results',
): Promise<{ url: string; rowsWritten: number; headersWritten: boolean }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  let sheetExists = false;
  let sheetId = 0;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabs: sheets_v4.Schema$Sheet[] = meta.data.sheets ?? [];
    const tab = tabs.find((s) => s.properties?.title === tabName);
    sheetExists = !!tab;
    sheetId = tab?.properties?.sheetId ?? 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot access spreadsheet: ${msg}`);
  }

  if (!sheetExists) {
    const add = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
    const replies = add.data.replies ?? [];
    const props = replies[0]?.addSheet?.properties;
    sheetId = props?.sheetId ?? 0;
  }

  const safeTab = tabName.replace(/'/g, "''");
  const headerRange = `'${safeTab}'!A1:Z1`;
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: headerRange });
  const firstRow = existing.data.values?.[0] as unknown[] | undefined;
  const hasOurHeader = rowLooksLikeOurHeader(firstRow);
  const sheetHasAnyRow = (existing.data.values?.length ?? 0) > 0 && firstRow?.some((c) => String(c ?? '').trim() !== '');

  const rows: string[][] = [];
  let headersWritten = false;

  if (!sheetHasAnyRow) {
    rows.push(getResultHeaders());
    headersWritten = true;
  } else if (!hasOurHeader) {
    rows.push(getResultHeaders());
    headersWritten = true;
  }

  for (const r of results) {
    rows.push(resultToValues(r));
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${safeTab}'!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  if (headersWritten) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: getResultHeaders().length,
              },
            },
          },
        ],
      },
    });
  } else {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: getResultHeaders().length,
              },
            },
          },
        ],
      },
    });
  }

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const tabs: sheets_v4.Schema$Sheet[] = meta.data.sheets ?? [];
  const tab = tabs.find((s) => s.properties?.title === tabName);
  const gid = tab?.properties?.sheetId ?? 0;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`;

  return { url, rowsWritten: results.length, headersWritten };
}
