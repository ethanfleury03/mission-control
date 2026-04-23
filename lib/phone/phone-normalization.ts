export function normalizePhone(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return '';

  const noExtension = cleaned.replace(/\b(ext|x|extension)\b.*$/i, '').trim();
  const keepPlus = noExtension.startsWith('+');
  const digits = noExtension.replace(/\D/g, '');

  if (!digits) return '';
  if (keepPlus && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  if (digits.startsWith('00') && digits.length >= 12 && digits.length <= 17) {
    return `+${digits.slice(2)}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return '';
}

export function isDialablePhone(raw: string): boolean {
  return normalizePhone(raw) !== '';
}

export function getPhoneValidationReason(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'missing';
  return normalizePhone(trimmed) ? 'valid' : 'invalid_format';
}

export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return phone;
  if (normalized.startsWith('+1') && normalized.length === 12) {
    const local = normalized.slice(2);
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return normalized;
}
