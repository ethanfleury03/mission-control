import type { Page } from 'playwright';

/** Extra ms beyond Playwright's goto timeout — forces rejection if goto never settles. */
const GOTO_HARD_CAP_PAD_MS = 5000;

/**
 * `page.goto` with domcontentloaded can occasionally hang past the requested timeout
 * on some stacks/CDNs. Race with a hard timer so enrichment rows cannot stall forever.
 */
export async function gotoDomContentLoaded(page: Page, url: string, timeoutMs: number): Promise<void> {
  const t = Math.max(3000, timeoutMs);
  const navigation = page.goto(url, { waitUntil: 'domcontentloaded', timeout: t });
  const hardCap = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(`Navigation hard-cap ${t + GOTO_HARD_CAP_PAD_MS}ms (still loading): ${url.slice(0, 96)}`),
        ),
      t + GOTO_HARD_CAP_PAD_MS,
    );
  });
  await Promise.race([navigation, hardCap]);
}
