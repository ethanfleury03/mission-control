import { redirect } from 'next/navigation';

import { auth, signIn } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = { callbackUrl?: string | string[]; error?: string | string[] };

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'AccessDenied':
      return 'Sign-in is restricted to @arrsys.com Google accounts.';
    case 'Configuration':
      return 'Authentication is misconfigured. Contact the Mission Control admin.';
    default:
      return `Sign-in failed (${code}). Try again.`;
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = first(params.callbackUrl) ?? '/';
  const err = errorMessage(first(params.error));

  if (session) {
    redirect(callbackUrl);
  }

  async function doSignIn() {
    'use server';
    await signIn('google', { redirectTo: callbackUrl });
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b1020',
        color: '#e6ecff',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: 380,
          padding: 32,
          borderRadius: 16,
          background: '#131a35',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, letterSpacing: 0.3 }}>Mission Control</h1>
        <p style={{ marginTop: 8, marginBottom: 28, color: '#9fb0d9', fontSize: 14 }}>
          Sign in with your <strong>@arrsys.com</strong> Google account.
        </p>

        {err ? (
          <div
            style={{
              marginBottom: 20,
              padding: '10px 12px',
              borderRadius: 8,
              background: '#5a1a1a',
              color: '#ffd8d8',
              fontSize: 13,
              textAlign: 'left',
            }}
          >
            {err}
          </div>
        ) : null}

        <form action={doSignIn}>
          <button
            type="submit"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid #3c4a85',
              background: '#fff',
              color: '#1a1a1a',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 34.8 26.8 36 24 36c-5.2 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.5 16.2 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.2 5.2c-.4.4 6.7-4.9 6.7-14.7 0-1.2-.1-2.4-.4-3.5z"
              />
            </svg>
            Continue with Google
          </button>
        </form>

        <p style={{ marginTop: 24, fontSize: 12, color: '#6e7fb0' }}>
          Other Google accounts will be rejected automatically.
        </p>
      </div>
    </main>
  );
}
