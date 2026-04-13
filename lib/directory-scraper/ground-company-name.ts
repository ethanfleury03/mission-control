/**
 * Every accepted name must be grounded in page-visible text or structured source.
 */
export function isGroundedInPageText(name: string, fullPageText: string): boolean {
  const n = name.trim();
  if (!n) return false;
  const hay = fullPageText.replace(/\s+/g, ' ');
  if (hay.includes(n)) return true;
  const collapsed = n.replace(/\s+/g, ' ');
  if (hay.includes(collapsed)) return true;
  const lowerHay = hay.toLowerCase();
  const lowerName = collapsed.toLowerCase();
  return lowerHay.includes(lowerName);
}

export function isGroundedInSourceText(name: string, sourceText?: string): boolean {
  if (!sourceText) return false;
  const n = name.trim().toLowerCase();
  const s = sourceText.replace(/\s+/g, ' ').toLowerCase();
  return s.includes(n);
}
