const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isAuthBypassEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const raw = process.env.AUTH_BYPASS_LOGIN?.trim().toLowerCase();
  return raw ? TRUE_VALUES.has(raw) : false;
}

export function getAuthBypassEmail(): string {
  const email = process.env.AUTH_BYPASS_EMAIL?.trim().toLowerCase();
  return email && email.endsWith('@arrsys.com') ? email : 'dev@arrsys.com';
}

export function getAuthBypassHd(): string {
  return 'arrsys.com';
}
