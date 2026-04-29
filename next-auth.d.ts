import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    appUserId: string | null;
    hd: string | null;
    appRole: string | null;
    appStatus: string | null;
    user: DefaultSession['user'] & {
      email: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    appUserId?: string;
    hd?: string | null;
    appRole?: string | null;
    appStatus?: string | null;
    email?: string;
    name?: string;
    picture?: string;
  }
}
