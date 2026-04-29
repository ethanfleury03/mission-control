import { redirect } from 'next/navigation';
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';

import { auth, signIn } from '@/auth';
import { isAuthBypassEnabled } from '@/lib/auth/bypass';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = {
  callbackUrl?: string | string[];
  error?: string | string[];
  signedOut?: string | string[];
};

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
  const authBypassEnabled = isAuthBypassEnabled();
  const googleAuthConfigured = Boolean(
    process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim()
  );
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = first(params.callbackUrl) ?? '/';
  const signedOut = first(params.signedOut) === '1';
  const err = authBypassEnabled
    ? null
    : !googleAuthConfigured
    ? 'Google sign-in is not configured on this deployment yet. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, then redeploy.'
    : errorMessage(first(params.error));

  if (authBypassEnabled || (session && !signedOut)) {
    redirect(callbackUrl);
  }

  async function doSignIn() {
    'use server';
    if (!googleAuthConfigured) return;
    await signIn('google', { redirectTo: callbackUrl });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f3ece5]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(196,30,58,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(43,34,30,0.16),transparent_36%),linear-gradient(180deg,#fffdfa_0%,#f5ece4_100%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-10 lg:px-10">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-[36px] border border-white/80 bg-white/80 shadow-[0_28px_90px_rgba(57,28,11,0.16)] backdrop-blur-xl lg:grid-cols-[1.15fr_0.85fr]">
          <section className="relative overflow-hidden bg-[linear-gradient(180deg,#2b221e_0%,#3b2c28_50%,#5a3b31_100%)] px-8 py-10 text-white sm:px-10 sm:py-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(196,30,58,0.28),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.06),transparent_22%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">
                <Sparkles className="h-3.5 w-3.5 text-brand" />
                Arrow Systems Login
              </div>

              <div className="mt-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">
                  Arrow Hub
                </p>
                <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">
                  Secure access for the internal Arrow workspace.
                </h1>
                <p className="mt-5 max-w-lg text-base leading-8 text-white/78">
                  Sign in with your Arrow Google Workspace account to access Image Studio, Geo Intelligence, and the rest of the shared company hub.
                </p>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[24px] border border-white/12 bg-white/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <ShieldCheck className="h-5 w-5 text-[#ff9aa8]" />
                  <p className="mt-4 text-sm font-semibold text-white">Employees only</p>
                  <p className="mt-2 text-sm leading-6 text-white/68">
                    Access is limited to verified <strong>@arrsys.com</strong> Google accounts.
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/12 bg-white/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <LockKeyhole className="h-5 w-5 text-[#ff9aa8]" />
                  <p className="mt-4 text-sm font-semibold text-white">Shared workspace</p>
                  <p className="mt-2 text-sm leading-6 text-white/68">
                    Teams currently work from one shared Arrow database, knowledge base, and app surface.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center px-6 py-10 sm:px-10 sm:py-12">
            <div className="w-full max-w-md">
              <div className="rounded-[30px] border border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,246,239,0.92))] p-6 shadow-[0_18px_48px_rgba(57,28,11,0.10)] sm:p-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand">
                  Welcome Back
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-stone-950">
                  Sign in to Arrow Hub
                </h2>
                <p className="mt-3 text-sm leading-7 text-stone-600">
                  Use your company Google account to continue. Other domains will be rejected automatically.
                </p>

                {err ? (
                  <div className="mt-6 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
                    {err}
                  </div>
                ) : null}

                <form action={doSignIn} className="mt-6">
                  <button
                    type="submit"
                    disabled={!googleAuthConfigured}
                    className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white px-5 text-sm font-semibold text-stone-900 shadow-sm transition-all hover:border-brand/35 hover:shadow-[0_14px_30px_rgba(196,30,58,0.12)] disabled:cursor-not-allowed disabled:opacity-55"
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
                    <ArrowRight className="h-4 w-4 text-brand" />
                  </button>
                </form>

                <div className="mt-6 rounded-[20px] border border-stone-200 bg-white/75 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                    Access policy
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Authentication is limited to Arrow Systems employees using Google Workspace accounts on the <strong>@arrsys.com</strong> domain.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
