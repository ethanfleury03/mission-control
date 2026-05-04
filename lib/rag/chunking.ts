import type { ExtractedPage } from './extraction';
import type { DocumentType, MetadataExtraction, ProductFamily } from './types';

const TARGET_TOKENS = 950;
const MAX_TOKENS = 1250;
const OVERLAP_TOKENS = 140;

export interface PreparedChunk {
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  headingPath: string;
  text: string;
  tokenCount: number;
  productFamily: ProductFamily;
  productModel: string;
  documentType: DocumentType;
  version: string;
  softwareVersion: string;
  revisionDate: string | null;
  metadata: Record<string, unknown>;
}

interface TextBlock {
  pageNumber: number;
  headingPath: string;
  text: string;
  tokenCount: number;
  hasTables: boolean;
}

export function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).length * 1.25));
}

export function buildChunks(input: {
  pages: ExtractedPage[];
  metadata: MetadataExtraction;
}): PreparedChunk[] {
  const blocks = buildBlocks(input.pages);
  const chunks: PreparedChunk[] = [];
  let current: TextBlock[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  const flush = (options: { preserveOverlap?: boolean } = { preserveOverlap: true }) => {
    if (current.length === 0) return;
    const text = current.map((block) => block.text).join('\n\n').trim();
    if (!text) {
      current = [];
      currentTokens = 0;
      return;
    }

    chunks.push({
      pageStart: Math.min(...current.map((block) => block.pageNumber)),
      pageEnd: Math.max(...current.map((block) => block.pageNumber)),
      chunkIndex,
      headingPath: current[current.length - 1]?.headingPath || '',
      text,
      tokenCount: estimateTokens(text),
      productFamily: input.metadata.product_family,
      productModel: input.metadata.product_model,
      documentType: input.metadata.document_type,
      version: input.metadata.version,
      softwareVersion: input.metadata.software_version,
      revisionDate: input.metadata.revision_date,
      metadata: {
        hasTables: current.some((block) => block.hasTables),
        hasProcedureSteps: /\n\s*(?:\d+\.|step\s+\d+|[a-z]\))\s+/i.test(text),
        hasWarnings: /\b(warning|caution|danger|notice|important)\b/i.test(text),
        metadataComplete: input.metadata.product_family !== 'General' && input.metadata.document_type !== 'unknown',
        qualityWarnings: buildChunkQualityWarnings(text, input.metadata),
        chunkKind: 'content',
      },
    });
    chunkIndex += 1;

    if (options.preserveOverlap === false) {
      current = [];
      currentTokens = 0;
      return;
    }

    const overlapText = tailWords(text, OVERLAP_TOKENS);
    current = overlapText
      ? [
          {
            pageNumber: Math.max(...current.map((block) => block.pageNumber)),
            headingPath: current[current.length - 1]?.headingPath || '',
            text: overlapText,
            tokenCount: estimateTokens(overlapText),
            hasTables: false,
          },
        ]
      : [];
    currentTokens = current.reduce((sum, block) => sum + block.tokenCount, 0);
  };

  for (const block of blocks) {
    if (block.tokenCount > MAX_TOKENS) {
      flush();
      for (const split of splitLargeBlock(block)) {
        current.push(split);
        currentTokens += split.tokenCount;
        if (currentTokens >= TARGET_TOKENS) flush();
      }
      continue;
    }

    const headingChanged = current.length > 0 && block.headingPath !== current[current.length - 1]?.headingPath;
    const shouldStartCleanSection =
      headingChanged &&
      isNumberedSectionHeading(block.headingPath) &&
      currentTokens >= 80;
    const wouldOverflow = currentTokens + block.tokenCount > MAX_TOKENS;
    if (shouldStartCleanSection) {
      flush({ preserveOverlap: false });
    }

    if (current.length > 0 && wouldOverflow && (headingChanged || currentTokens >= TARGET_TOKENS * 0.65)) {
      flush();
    }

    current.push(block);
    currentTokens += block.tokenCount;

    if (currentTokens >= TARGET_TOKENS && /(?:\n\n|[.!?]\s*$)/.test(block.text)) {
      flush();
    }
  }

  flush();

  if (chunks.length > 1) {
    chunks.unshift(buildSummaryChunk(input.metadata, input.pages, chunkIndex + 1));
    return chunks.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
  }

  return chunks;
}

function buildBlocks(pages: ExtractedPage[]): TextBlock[] {
  const blocks: TextBlock[] = [];
  let headingPath = '';

  for (const page of pages) {
    const paragraphs = splitPageIntoParagraphs(insertInlineSectionBreaks(page.combinedText));
    for (const paragraph of paragraphs) {
      if (isLowValueParagraph(paragraph)) continue;
      const heading = detectHeading(paragraph);
      if (heading) {
        headingPath = heading;
        continue;
      }

      const text = headingPath ? `${headingPath}\n${paragraph}` : paragraph;
      blocks.push({
        pageNumber: page.pageNumber,
        headingPath,
        text,
        tokenCount: estimateTokens(text),
        hasTables: page.hasTables,
      });
    }
  }

  return blocks;
}

function splitPageIntoParagraphs(text: string): string[] {
  const lines = text.split('\n');
  const paragraphs: string[] = [];
  let current: string[] = [];

  const push = () => {
    const value = current.join('\n').trim();
    if (value) paragraphs.push(value);
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      push();
      continue;
    }
    if (detectHeading(trimmed)) {
      push();
      paragraphs.push(trimmed);
      continue;
    }
    if (isStandaloneWarning(trimmed)) {
      push();
      current.push(trimmed);
      continue;
    }
    current.push(line);
  }
  push();

  return paragraphs.length > 0 ? paragraphs : [text.trim()].filter(Boolean);
}

function insertInlineSectionBreaks(text: string): string {
  const sectionHeading = /(\d+(?:\.\d+){1,5}\s+[A-Z][A-Za-z0-9 /&()_-]{3,90})/g;
  return text
    .replace(/(\d+(?:\.\d+){1,5})\s*\n\s*([A-Z][A-Za-z0-9 /&()_-]{3,90})/g, '$1 $2')
    .replace(sectionHeading, '\n\n$1\n')
    .replace(/\n{3,}/g, '\n\n');
}

function detectHeading(paragraph: string): string | null {
  const compact = paragraph.trim().replace(/\s+/g, ' ');
  if (!compact || compact.length > 120) return null;
  if (/^#{1,4}\s+/.test(compact)) return compact.replace(/^#{1,4}\s+/, '');
  const numbered = compact.match(/^((?:[1-9]\d?|[1-9]\d*(?:\.\d+){1,5})\s+[A-Z][A-Za-z0-9 /&()_-]+?)(?=\s{2,}|$)/);
  if (numbered) return numbered[1].trim();
  if (/^[A-Z][A-Z0-9 /&()_-]{5,}$/.test(compact) && compact.length < 80) return compact;
  if (/^(?:Procedure|Troubleshooting|Installation|Maintenance|Calibration|Release Notes|Spare Parts|System Requirements)\b/i.test(compact)) {
    return compact;
  }
  if (/^(?:Warning|Caution|Danger|Important|Notice)\b/i.test(compact)) return compact;
  return null;
}

function isNumberedSectionHeading(headingPath: string): boolean {
  return /^\d+(?:\.\d+){1,5}\s+\S/.test(headingPath.trim());
}

function isStandaloneWarning(line: string): boolean {
  return /^(?:warning|caution|danger|important|notice)[:\s-]/i.test(line) && line.length < 160;
}

function isLowValueParagraph(paragraph: string): boolean {
  const compact = paragraph.trim().replace(/\s+/g, ' ');
  if (!compact) return true;
  if (/^page\s+\d+(?:\s+of\s+\d+)?$/i.test(compact)) return true;
  if (/^(?:table\s+of\s+contents|contents)$/i.test(compact)) return true;
  if (/^\.{3,}\s*\d+$/.test(compact)) return true;
  if (isLikelyTocLine(compact)) return true;
  if (/^(?:confidential|proprietary)\s*$/i.test(compact)) return true;
  if (/^arrow\s+systems(?:,\s*inc\.?)?\s*$/i.test(compact)) return true;
  return false;
}

function isLikelyTocLine(text: string): boolean {
  if (text.length > 180) return false;
  if (/\.{4,}\s*\d{1,4}$/.test(text)) return true;
  if (/^[A-Za-z0-9 /&()_-]{4,}\s{2,}\d{1,4}$/.test(text) && !/[.!?]$/.test(text)) return true;
  return false;
}

function buildChunkQualityWarnings(text: string, metadata: MetadataExtraction): string[] {
  const warnings: string[] = [];
  const tokenCount = estimateTokens(text);
  if (tokenCount < 80) warnings.push('Very short chunk; may be weak retrieval context.');
  if (metadata.product_family === 'General') warnings.push('Chunk has no specific product metadata.');
  if (metadata.document_type === 'unknown') warnings.push('Chunk has unknown document type metadata.');
  if (/table\s+of\s+contents/i.test(text) || text.split('\n').filter(isLikelyTocLine).length >= 4) {
    warnings.push('Chunk appears to contain table-of-contents or index material.');
  }
  if (/copyright|all rights reserved|confidential/i.test(text) && tokenCount < 180) {
    warnings.push('Chunk may be mostly legal/header/footer boilerplate.');
  }
  return warnings;
}

function splitLargeBlock(block: TextBlock): TextBlock[] {
  const words = block.text.split(/\s+/).filter(Boolean);
  const chunks: TextBlock[] = [];
  for (let start = 0; start < words.length; start += TARGET_TOKENS - OVERLAP_TOKENS) {
    const text = words.slice(start, start + TARGET_TOKENS).join(' ');
    chunks.push({
      ...block,
      text,
      tokenCount: estimateTokens(text),
    });
  }
  return chunks;
}

function tailWords(text: string, wordCount: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= wordCount) return '';
  return words.slice(-wordCount).join(' ');
}

function buildSummaryChunk(
  metadata: MetadataExtraction,
  pages: ExtractedPage[],
  chunkIndex: number,
): PreparedChunk {
  const pageTerms = pages
    .flatMap((page) => page.combinedText.toLowerCase().match(/\b[a-z][a-z0-9-]{4,}\b/g) || [])
    .filter((term) => !['document', 'printer', 'system', 'arrow', 'manual', 'guide'].includes(term));
  const topTerms = [...new Set(pageTerms)].slice(0, 40);
  const text = [
    `Document summary: ${metadata.title}`,
    `Product family: ${metadata.product_family}`,
    `Document type: ${metadata.document_type}`,
    metadata.version ? `Version: ${metadata.version}` : '',
    metadata.revision_date ? `Revision date: ${metadata.revision_date}` : '',
    topTerms.length > 0 ? `Observed support terms: ${topTerms.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    pageStart: 1,
    pageEnd: Math.max(1, pages.length),
    chunkIndex,
    headingPath: 'Document Summary',
    text,
    tokenCount: estimateTokens(text),
    productFamily: metadata.product_family,
    productModel: metadata.product_model,
    documentType: metadata.document_type,
    version: metadata.version,
    softwareVersion: metadata.software_version,
    revisionDate: metadata.revision_date,
    metadata: {
      chunkKind: 'document_summary',
      qualityWarnings: metadata.product_family === 'General' || metadata.document_type === 'unknown'
        ? ['Summary chunk inherits low-confidence document metadata.']
        : [],
    },
  };
}
