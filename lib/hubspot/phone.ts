/** Normalize phone for HubSpot search (digits only, min length check). */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function isSearchablePhone(phone: string): boolean {
  const d = normalizePhoneDigits(phone);
  return d.length >= 10;
}
