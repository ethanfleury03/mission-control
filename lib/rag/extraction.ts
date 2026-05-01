import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ExtractedPage {
  pageNumber: number;
  rawText: string;
  ocrText: string;
  combinedText: string;
  hasImages: boolean;
  hasTables: boolean;
  extractionQualityScore: number;
  metadata: Record<string, unknown>;
}

export interface ExtractedDocumentText {
  pageCount: number;
  pages: ExtractedPage[];
  metadata: Record<string, unknown>;
}

export interface ExtractionQualitySignals {
  extractedTextCharCount: number;
  averageCharsPerPage: number;
  lowTextPageCount: number;
  lowTextPagePercent: number;
  pagesWithNoText: number[];
  lowTextPages: number[];
  suspectedScannedPdf: boolean;
  pagesWithTables: number[];
  pagesWithImages: number[];
  extractionQualityScore: number;
  extractionWarnings: string[];
  ocrEnabled: boolean;
  ocrInstalled: boolean;
  ocrStatus: 'not_needed' | 'needed_not_configured' | 'disabled' | 'not_available';
}

export function isSupportedRagFile(filePath: string): boolean {
  return ['.pdf', '.txt', '.md', '.markdown', '.docx', '.csv', '.tsv'].includes(path.extname(filePath).toLowerCase());
}

export async function extractDocumentText(input: {
  filename: string;
  bytes: Buffer;
  mimeType?: string;
}): Promise<ExtractedDocumentText> {
  const extension = path.extname(input.filename).toLowerCase();

  if (extension === '.pdf' || input.mimeType === 'application/pdf') {
    return extractPdf(input.bytes);
  }

  if (extension === '.docx') {
    return extractDocx(input.bytes);
  }

  const text = input.bytes.toString('utf8');
  return extractPlainText(text, extension === '.csv' || extension === '.tsv' ? 'csv' : 'text');
}

async function extractPdf(bytes: Buffer): Promise<ExtractedDocumentText> {
  try {
    return await extractPdfWithPdfParse(bytes);
  } catch (error) {
    if (!shouldUseWorkerlessPdfFallback(error)) throw error;

    const fallbackReason = error instanceof Error ? error.message : String(error);
    console.warn('[rag:extract] pdf-parse worker extraction failed; using workerless PDF fallback', {
      message: fallbackReason,
    });
    return extractPdfWithPdfJs(bytes, fallbackReason);
  }
}

async function extractPdfWithPdfParse(bytes: Buffer): Promise<ExtractedDocumentText> {
  await ensurePdfRuntimeGlobals();
  const { PDFParse } = await import('pdf-parse');
  configurePdfWorker(PDFParse);
  const parser = new PDFParse({ data: bytes });
  try {
    const [info, textResult] = await Promise.all([
      parser.getInfo({ parsePageInfo: true }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })),
      parser.getText(),
    ]);

    const pages =
      textResult.pages.length > 0
        ? textResult.pages.map((page) => buildExtractedPage(page.num, page.text, {
            extractionMethod: 'pdf-parse',
            ocrRequired: normalizePageText(page.text).length < 40,
          }))
        : splitTextIntoPseudoPages(textResult.text, 'pdf-parse-fallback');

    const quality = buildQualitySignals(pages, true);
    return {
      pageCount: pages.length || Number('total' in info && typeof info.total === 'number' ? info.total : 0),
      pages,
      metadata: {
        parser: 'pdf-parse',
        info: sanitizePdfInfo(info),
        ocrBacklog: pages.filter((page) => page.metadata.ocrRequired).map((page) => page.pageNumber),
        quality,
        extractionWarnings: quality.extractionWarnings,
        suspectedScannedPdf: quality.suspectedScannedPdf,
        ocrStatus: quality.ocrStatus,
      },
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function shouldUseWorkerlessPdfFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /deserialize cloned data|fake worker|worker|DOMMatrix|canvas/i.test(message);
}

async function extractPdfWithPdfJs(bytes: Buffer, fallbackReason: string): Promise<ExtractedDocumentText> {
  await ensurePdfRuntimeGlobals();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    // Copy out of Node's pooled Buffer so PDF.js has a plain transferable array.
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    disableFontFace: true,
    stopAtErrors: false,
  });

  let document: any;
  try {
    document = await loadingTask.promise;
    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent({
          disableNormalization: false,
        });
        const text = content.items
          .map((item: { str?: unknown }) => (typeof item.str === 'string' ? item.str : ''))
          .filter(Boolean)
          .join('\n');
        pages.push(buildExtractedPage(pageNumber, text, {
          extractionMethod: 'pdfjs-dist-workerless',
          fallbackFrom: 'pdf-parse',
          fallbackReason,
          ocrRequired: normalizePageText(text).length < 40,
        }));
      } finally {
        page.cleanup();
      }
    }

    const quality = buildQualitySignals(pages, true);
    return {
      pageCount: document.numPages,
      pages,
      metadata: {
        parser: 'pdfjs-dist-workerless',
        fallbackFrom: 'pdf-parse',
        fallbackReason,
        info: { total: document.numPages },
        ocrBacklog: pages.filter((page) => page.metadata.ocrRequired).map((page) => page.pageNumber),
        quality,
        extractionWarnings: quality.extractionWarnings,
        suspectedScannedPdf: quality.suspectedScannedPdf,
        ocrStatus: quality.ocrStatus,
      },
    };
  } finally {
    await document?.destroy?.();
    await loadingTask.destroy?.();
  }
}

function configurePdfWorker(PDFParse: { setWorker?: (workerSrc?: string) => string }): void {
  if (typeof PDFParse.setWorker !== 'function') return;

  const candidates = [
    path.join(process.cwd(), 'node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs'),
    path.join(process.cwd(), 'node_modules/pdf-parse/dist/worker/pdf.worker.mjs'),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const workerUrl = pathToFileURL(candidate).href;
      PDFParse.setWorker(workerUrl);
      console.info('[rag:extract] PDF worker configured', { workerUrl });
      return;
    } catch (error) {
      console.warn('[rag:extract] PDF worker candidate failed', {
        candidate,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function ensurePdfRuntimeGlobals(): Promise<void> {
  const globals = globalThis as Record<string, unknown>;
  if (globals.DOMMatrix && globals.DOMPoint && globals.DOMRect) return;

  try {
    const canvasPackage = '@napi-rs/' + 'canvas';
    const canvas = await import(/* webpackIgnore: true */ canvasPackage) as {
      DOMMatrix?: unknown;
      DOMPoint?: unknown;
      DOMRect?: unknown;
      ImageData?: unknown;
      Path2D?: unknown;
    };
    globals.DOMMatrix ??= canvas.DOMMatrix;
    globals.DOMPoint ??= canvas.DOMPoint;
    globals.DOMRect ??= canvas.DOMRect;
    globals.ImageData ??= canvas.ImageData;
    globals.Path2D ??= canvas.Path2D;
    console.info('[rag:extract] PDF runtime geometry polyfills loaded', {
      domMatrix: Boolean(globals.DOMMatrix),
      domPoint: Boolean(globals.DOMPoint),
      domRect: Boolean(globals.DOMRect),
    });
  } catch (error) {
    console.warn('[rag:extract] PDF runtime geometry polyfills unavailable', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function extractDocx(bytes: Buffer): Promise<ExtractedDocumentText> {
  const mammoth = await import('mammoth');
  const result = await mammoth.default.extractRawText({ buffer: bytes });
  return extractPlainText(result.value, 'docx', {
    mammothMessages: result.messages.map((message) => ({
      type: message.type,
      message: message.message,
    })),
  });
}

function extractPlainText(
  text: string,
  extractionMethod: string,
  metadata: Record<string, unknown> = {},
): ExtractedDocumentText {
  const pages = splitTextIntoPseudoPages(text, extractionMethod);
  return {
    pageCount: pages.length,
    pages,
    metadata: {
      parser: extractionMethod,
      quality: buildQualitySignals(pages, false),
      ...metadata,
    },
  };
}

function splitTextIntoPseudoPages(text: string, extractionMethod: string): ExtractedPage[] {
  const formFeedPages = text.split(/\f/g).map((page) => page.trim()).filter(Boolean);
  const rawPages = formFeedPages.length > 1 ? formFeedPages : chunkByCharacters(text, 5000);
  return rawPages.map((pageText, index) =>
    buildExtractedPage(index + 1, pageText, {
      extractionMethod,
      pseudoPage: formFeedPages.length <= 1,
      ocrRequired: false,
    }),
  );
}

function chunkByCharacters(text: string, targetChars: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [''];
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += targetChars) {
    chunks.push(normalized.slice(start, start + targetChars));
  }
  return chunks;
}

function buildExtractedPage(
  pageNumber: number,
  text: string,
  metadata: Record<string, unknown>,
): ExtractedPage {
  const normalized = normalizePageText(text);
  const textCharCount = normalized.length;
  const tokenishCount = normalized ? normalized.split(/\s+/).length : 0;
  const hasTables = detectTableLikeText(normalized);
  const quality = Math.max(0, Math.min(1, Math.max(tokenishCount / 180, textCharCount / 1600)));
  const likelyImageOnly = tokenishCount < 12;
  const needsOcr = Boolean(metadata.ocrRequired || likelyImageOnly || textCharCount < 80);

  return {
    pageNumber,
    rawText: normalized,
    ocrText: '',
    combinedText: normalized,
    hasImages: likelyImageOnly,
    hasTables,
    extractionQualityScore: Number(quality.toFixed(3)),
    metadata: {
      ...metadata,
      textCharCount,
      tokenishCount,
      likelyImageOnly,
      needsOcr,
      ocrStatus: needsOcr
        ? process.env.RAG_OCR_ENABLED === 'true'
          ? 'needed_but_not_installed'
          : 'needed_not_configured'
        : 'not_needed',
    },
  };
}

function normalizePageText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function detectTableLikeText(text: string): boolean {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.some((line) => line.includes('|') && line.split('|').length >= 3)) return true;
  const alignedRows = lines.filter((line) => /\S+\s{2,}\S+\s{2,}\S+/.test(line));
  const csvRows = lines.filter((line) => line.split(',').length >= 4);
  return alignedRows.length >= 3 || csvRows.length >= 3;
}

function sanitizePdfInfo(info: unknown): Record<string, unknown> {
  if (!info || typeof info !== 'object') return {};
  const candidate = info as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of ['total', 'info', 'metadata', 'pages', 'error']) {
    if (key in candidate) result[key] = candidate[key];
  }
  return result;
}

function buildQualitySignals(pages: ExtractedPage[], isPdf: boolean): ExtractionQualitySignals {
  const extractedTextCharCount = pages.reduce((sum, page) => sum + page.combinedText.length, 0);
  const averageCharsPerPage = pages.length > 0 ? Math.round(extractedTextCharCount / pages.length) : 0;
  const lowTextPages = pages.filter((page) => page.combinedText.length < 120).map((page) => page.pageNumber);
  const pagesWithNoText = pages.filter((page) => page.combinedText.trim().length === 0).map((page) => page.pageNumber);
  const pagesWithTables = pages.filter((page) => page.hasTables).map((page) => page.pageNumber);
  const pagesWithImages = pages.filter((page) => page.hasImages).map((page) => page.pageNumber);
  const lowTextPagePercent = pages.length > 0 ? Number((lowTextPages.length / pages.length).toFixed(3)) : 0;
  const extractionQualityScore =
    pages.length > 0
      ? Number((pages.reduce((sum, page) => sum + page.extractionQualityScore, 0) / pages.length).toFixed(3))
      : 0;
  const suspectedScannedPdf = isPdf && pages.length > 0 && (lowTextPagePercent >= 0.35 || averageCharsPerPage < 180);
  const ocrEnabled = process.env.RAG_OCR_ENABLED === 'true';
  const ocrInstalled = false;
  const ocrStatus = lowTextPages.length === 0
    ? 'not_needed'
    : !ocrEnabled
      ? 'disabled'
      : ocrInstalled
        ? 'not_available'
        : 'needed_not_configured';
  const extractionWarnings: string[] = [];
  if (pagesWithNoText.length > 0) {
    extractionWarnings.push(`${pagesWithNoText.length} page(s) had no extractable text.`);
  }
  if (lowTextPages.length > 0) {
    extractionWarnings.push(`${lowTextPages.length} page(s) had very little extractable text. OCR may be required.`);
  }
  if (suspectedScannedPdf) {
    extractionWarnings.push('This PDF appears scanned or image-heavy based on extracted text volume.');
  }
  if (pages.length > 0 && extractedTextCharCount < 1000) {
    extractionWarnings.push(`Only ${extractedTextCharCount} characters were extracted from ${pages.length} page(s).`);
  }
  if (ocrEnabled && !ocrInstalled && lowTextPages.length > 0) {
    extractionWarnings.push('OCR was requested, but no OCR engine is wired yet. Low-text pages are flagged for OCR review.');
  }

  return {
    extractedTextCharCount,
    averageCharsPerPage,
    lowTextPageCount: lowTextPages.length,
    lowTextPagePercent,
    pagesWithNoText,
    lowTextPages,
    suspectedScannedPdf,
    pagesWithTables,
    pagesWithImages,
    extractionQualityScore,
    extractionWarnings,
    ocrEnabled,
    ocrInstalled,
    ocrStatus,
  };
}
