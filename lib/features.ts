function parseBooleanFlag(value: string | undefined): boolean | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

export const BLOGS_ENABLED =
  parseBooleanFlag(process.env.ENABLE_BLOGS) ??
  parseBooleanFlag(process.env.NEXT_PUBLIC_ENABLE_BLOGS) ??
  process.env.NODE_ENV !== 'production';
