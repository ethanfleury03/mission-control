function sanitizeAsciiFileName(fileName: string, fallback: string): string {
  const normalized = fileName
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
}

export function inlineContentDisposition(fileName: string, fallback = 'file'): string {
  const asciiFileName = sanitizeAsciiFileName(fileName, fallback);
  return `inline; filename="${asciiFileName.replace(/"/g, '')}"`;
}
