import { chromium, type Browser } from 'playwright';

export interface LaunchBrowserResult {
  browser: Browser;
  hint?: string;
}

/**
 * Launch Chromium with explicit local vs production behavior.
 * Production (e.g. Vercel): set PLAYWRIGHT_BROWSERS_PATH or use a Docker image with browsers installed.
 */
export async function launchChromiumForScraper(): Promise<LaunchBrowserResult> {
  const isProd = process.env.NODE_ENV === 'production';
  const execPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

  try {
    const browser = await chromium.launch({
      headless: true,
      ...(execPath ? { executablePath: execPath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    return { browser };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const lines = [
      `Playwright failed to launch Chromium: ${msg}`,
      isProd
        ? 'Production: install browsers on the host or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to a Chromium/Chrome binary. Serverless hosts often cannot run Playwright without a custom runtime.'
        : 'Local: run `npx playwright install chromium` once, or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.',
    ];
    throw new Error(lines.join(' '));
  }
}
