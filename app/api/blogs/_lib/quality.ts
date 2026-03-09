export type QualityResult = {
  pass: boolean;
  score: number;
  checks: Record<string, boolean>;
  reasons: string[];
};

export function evaluateDraftQuality(input: {
  content_markdown?: string;
  content_html?: string;
  title?: string;
  primary_keyword?: string;
  target_words?: number;
}): QualityResult {
  const markdown = String(input.content_markdown || '');
  const html = String(input.content_html || '');
  const text = (markdown || html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const targetWords = Number(input.target_words || 1800);
  const minWords = Math.max(600, Math.floor(targetWords * 0.55));
  const words = text ? text.split(' ').length : 0;

  const hasH2 = /(^|\n)##\s+/m.test(markdown) || /<h2[\s>]/i.test(html);
  const hasConclusion = /conclusion|final thoughts|key takeaways/i.test(text);
  const hasKeyword = input.primary_keyword ? new RegExp(String(input.primary_keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text) : true;
  const hasMetaTitle = Boolean(String(input.title || '').trim());

  const checks = {
    min_words: words >= minWords,
    has_h2_sections: hasH2,
    has_conclusion: hasConclusion,
    has_primary_keyword: hasKeyword,
    has_title: hasMetaTitle,
  };

  const reasons: string[] = [];
  if (!checks.min_words) reasons.push(`Too short (${words} words, need >= ${minWords})`);
  if (!checks.has_h2_sections) reasons.push('Missing section structure (H2 headings)');
  if (!checks.has_conclusion) reasons.push('Missing conclusion section');
  if (!checks.has_primary_keyword) reasons.push('Primary keyword missing from content');
  if (!checks.has_title) reasons.push('Missing title');

  const passCount = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passCount / Object.keys(checks).length) * 100);

  return { pass: reasons.length === 0, score, checks, reasons };
}
