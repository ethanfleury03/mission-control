/**
 * Pure @arrsys.com-only guard for the NextAuth signIn callback.
 *
 * Kept as a separate module so it can be unit-tested without importing
 * next-auth (which needs a runtime environment).
 *
 * Google sends `hd` (hosted domain) in the verified ID token for users
 * signed in to a Google Workspace; it is NOT self-reportable by the user.
 * We also require `email_verified` to be true as belt-and-suspenders.
 */

export const ALLOWED_HD = 'arrsys.com';

export interface GoogleProfileShape {
  hd?: unknown;
  email?: unknown;
  email_verified?: unknown;
}

export function isAllowedGoogleProfile(profile: GoogleProfileShape | null | undefined): boolean {
  if (!profile) return false;
  if (profile.email_verified !== true) return false;
  if (typeof profile.hd !== 'string') return false;
  if (profile.hd.trim().toLowerCase() !== ALLOWED_HD) return false;
  const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
  if (!email.endsWith(`@${ALLOWED_HD}`)) return false;
  return true;
}
