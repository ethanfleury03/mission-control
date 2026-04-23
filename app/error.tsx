'use client';

import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Arrow Hub route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Something went wrong</p>
      <h1 className="mt-4 max-w-lg text-center text-xl font-semibold tracking-tight">
        {error.message || 'The page failed to render.'}
      </h1>
      <p className="mt-4 max-w-md text-center text-sm leading-6 text-zinc-400">
        If you just pulled new code, stop the dev server, delete the <code className="rounded bg-white/10 px-1">.next</code> folder, run{' '}
        <code className="rounded bg-white/10 px-1">npm install</code>, then <code className="rounded bg-white/10 px-1">npm run dev</code> again. Stale
        webpack chunks often cause a blank white screen.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded-full bg-[#c41e3a] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#a01830]"
      >
        Try again
      </button>
    </div>
  );
}
