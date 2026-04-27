export const ADMIN_EMAIL = 'ethan@arrsys.com';

export function isAdminEmail(email: string | null | undefined): boolean {
  return (email || '').trim().toLowerCase() === ADMIN_EMAIL;
}
