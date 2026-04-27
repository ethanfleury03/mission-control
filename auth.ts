import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

import { ALLOWED_HD, isAllowedGoogleProfile } from '@/lib/auth/hd-guard';

const authSecret =
  process.env.AUTH_SECRET?.trim() ||
  (process.env.NODE_ENV !== 'production'
    ? 'dev-insecure-auth-secret-only-for-local-npm-run-dev'
    : undefined);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: authSecret,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/signin',
    error: '/signin',
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Ask Google to pre-restrict the account picker. The `hd` param is a hint,
      // not a security boundary — the real enforcement is in the signIn callback.
      authorization: {
        params: {
          hd: ALLOWED_HD,
          prompt: 'select_account',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email =
        typeof profile?.email === 'string' ? profile.email.trim().toLowerCase() : '';
      if (!isAllowedGoogleProfile(profile as any)) {
        const { recordAuthEvent } = await import('@/lib/auth/audit-log');
        await recordAuthEvent({
          type: 'login_rejected_domain',
          actorEmail: email,
          targetEmail: email,
          action: 'google_sign_in',
          detail: {
            hd: typeof profile?.hd === 'string' ? profile.hd : '',
            emailVerified: profile?.email_verified === true,
          },
        });
        return false;
      }

      const { isExistingAppUserDisabled } = await import('@/lib/auth/app-user');
      if (await isExistingAppUserDisabled(email)) {
        const { recordAuthEvent } = await import('@/lib/auth/audit-log');
        await recordAuthEvent({
          type: 'login_rejected_disabled',
          actorEmail: email,
          targetEmail: email,
          action: 'google_sign_in',
        });
        return false;
      }

      return true;
    },
    async jwt({ token, profile }) {
      if (profile && isAllowedGoogleProfile(profile as any)) {
        const { upsertAppUserFromGoogleProfile } = await import('@/lib/auth/app-user');
        const { recordAuthEvent } = await import('@/lib/auth/audit-log');
        const appUser = await upsertAppUserFromGoogleProfile(profile as any);
        await recordAuthEvent({
          type: 'login_success',
          actorEmail: appUser.email,
          targetEmail: appUser.email,
          action: 'google_sign_in',
          detail: { appUserId: appUser.id, loginCount: appUser.loginCount },
        });
        token.appUserId = appUser.id;
        token.hd = appUser.hostedDomain;
        token.email = appUser.email;
        token.name = appUser.name || undefined;
        token.picture = appUser.image || undefined;
        return token;
      }

      if (typeof token.email === 'string' && !token.appUserId) {
        const { getAppUserByEmail } = await import('@/lib/auth/app-user');
        const appUser = await getAppUserByEmail(token.email);
        if (appUser) {
          token.appUserId = appUser.id;
          token.hd = appUser.hostedDomain;
          token.name = appUser.name || token.name;
          token.picture = appUser.image || token.picture;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.appUserId = typeof token.appUserId === 'string' ? token.appUserId : null;
      session.hd = typeof token.hd === 'string' ? token.hd : null;
      if (session.user && typeof token.email === 'string') {
        session.user.email = token.email;
      }
      if (session.user && typeof token.name === 'string') {
        session.user.name = token.name;
      }
      if (session.user && typeof token.picture === 'string') {
        session.user.image = token.picture;
      }
      return session;
    },
  },
});
