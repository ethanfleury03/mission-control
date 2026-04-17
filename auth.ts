import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

import { ALLOWED_HD, isAllowedGoogleProfile } from '@/lib/auth/hd-guard';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
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
      return isAllowedGoogleProfile(profile as any);
    },
    async jwt({ token, profile }) {
      if (profile) {
        (token as any).hd = (profile as any).hd;
        (token as any).email = (profile as any).email;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).hd = (token as any).hd;
      if (session.user && typeof (token as any).email === 'string') {
        session.user.email = (token as any).email;
      }
      return session;
    },
  },
});
