import { google } from 'googleapis';
import type { CompanyResult } from './types';
import { getResultHeaders, resultToValues } from './export-csv';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error('Google Sheets credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.');
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

export async function exportToGoogleSheets(
  results: CompanyResult[],
  spreadsheetId: string,
  tabName: string = 'Scrape Results',
): Promise<{ url: string; rowsWritten: number }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Ensure sheet/tab exists
  let sheetExists = false;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabs = meta.data.sheets ?? [];
    sheetExists = tabs.some((s) => s.properties?.title === tabName);
  } catch (err: any) {
    throw new Error(`Cannot access spreadsheet: ${err?.message}`);
  }

  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
  }

  // Check if headers exist
  const range = `'${tabName}'!A1:L1`;
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const hasHeaders = (existing.data.values ?? []).length > 0;

  const rows: string[][] = [];
  if (!hasHeaders) {
    rows.push(getResultHeaders());
  }
  for (const r of results) {
    rows.push(resultToValues(r));
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tabName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  // Freeze header row
  if (!hasHeaders) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tab = meta.data.sheets?.find((s) => s.properties?.title === tabName);
    const sheetId = tab?.properties?.sheetId ?? 0;

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
        ],
      },
    });
  }

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;
  return { url, rowsWritten: results.length };
}
