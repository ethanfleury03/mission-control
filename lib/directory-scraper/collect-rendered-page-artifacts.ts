import type { Frame, Page } from 'playwright';
import { assertPublicHttpUrl } from './validate-scrape-url';
import { sleep } from './utils';
import { MAX_LOAD_MORE_CLICKS } from './name-extraction-constants';

export interface FrameArtifact {
  url: string;
  html: string;
  text: string;
  /** Hint for UI/debug (not a valid CSS selector across documents) */
  selectorHint: string;
}

export interface RenderedPageArtifacts {
  finalUrl: string;
  title: string;
  html: string;
  text: string;
  frames: FrameArtifact[];
  mainLikeContainers: string[];
  loadMoreClicks: number;
}

export interface PageTextSnapshot {
  finalUrl: string;
  title: string;
  html: string;
  text: string;
  loadMoreClicks: number;
}

function sameSite(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin;
  } catch {
    return false;
  }
}

async function collectFrameArtifact(frame: Frame, idx: number): Promise<FrameArtifact | null> {
  try {
    const url = frame.url();
    if (!url || url === 'about:blank') return null;
    const html = await frame.content();
    const text = await frame.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    return {
      url,
      html,
      text,
      selectorHint: `frame[${idx}]`,
    };
  } catch {
    return null;
  }
}

/**
 * Navigate to url, scroll, load-more, return main document text/html (no iframe merge).
 */
export async function collectInnerTextForUrl(
  page: Page,
  startUrl: string,
  options?: { cancelled?: () => boolean | Promise<boolean> },
): Promise<PageTextSnapshot | null> {
  try {
    assertPublicHttpUrl(startUrl, 'Follow-up roster URL');
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 35_000 });
    await sleep(600);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

    for (let s = 0; s < 2; s++) {
      if (options?.cancelled && (await Promise.resolve(options.cancelled()))) break;
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight * (s + 1) * 0.5);
      });
      await sleep(400);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);

    let loadMoreClicks = 0;
    for (let i = 0; i < MAX_LOAD_MORE_CLICKS; i++) {
      if (options?.cancelled && (await Promise.resolve(options.cancelled()))) break;
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(
          document.querySelectorAll('button, a[role="button"], a.button, [class*="load-more"], [class*="show-more"]'),
        );
        const re = /^(load more|show more|view more|see more|show all)$/i;
        for (const el of buttons) {
          const t = (el.textContent ?? '').trim();
          if (re.test(t) || (t.length < 40 && /more|all/i.test(t))) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      if (!clicked) break;
      loadMoreClicks++;
      await sleep(1200);
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }

    const finalUrl = page.url();
    const title = await page.title();
    const html = await page.content();
    const text = await page.evaluate(() => document.body?.innerText ?? '');

    return { finalUrl, title, html, text, loadMoreClicks };
  } catch {
    return null;
  }
}

/**
 * Scroll, optional load-more clicks, collect main + same-origin iframe HTML/text.
 */
export async function collectRenderedPageArtifacts(
  page: Page,
  startUrl: string,
  options?: {
    cancelled?: () => boolean | Promise<boolean>;
  },
): Promise<RenderedPageArtifacts> {
  const main = await collectInnerTextForUrl(page, startUrl, options);
  if (!main) {
    return {
      finalUrl: startUrl,
      title: '',
      html: '',
      text: '',
      frames: [],
      mainLikeContainers: [],
      loadMoreClicks: 0,
    };
  }

  const pageOrigin = main.finalUrl;
  const frames: FrameArtifact[] = [];
  const allFrames = page.frames();
  let fi = 0;
  for (const fr of allFrames) {
    if (fr === page.mainFrame()) continue;
    if (!sameSite(fr.url(), pageOrigin)) continue;
    const art = await collectFrameArtifact(fr, fi);
    if (art && art.html.length > 200) frames.push(art);
    fi++;
  }

  const mainLikeContainers: string[] = await page.evaluate(() => {
    const out: string[] = [];
    const mains = document.querySelectorAll('main, article, [role="main"]');
    mains.forEach((el, i) => {
      const id = el.id ? `#${el.id}` : '';
      const cls =
        el.className && typeof el.className === 'string'
          ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}`
          : '';
      out.push(`${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 120));
    });
    return out.slice(0, 15);
  });

  return {
    finalUrl: main.finalUrl,
    title: main.title,
    html: main.html,
    text: main.text,
    frames,
    mainLikeContainers,
    loadMoreClicks: main.loadMoreClicks,
  };
}
