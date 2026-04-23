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
        If DevTools Network shows <strong className="text-white">404</strong> on{' '}
        <code className="rounded bg-white/10 px-1">/_next/static/chunks/*.js</code>, your <code className="rounded bg-white/10 px-1">.next</code> cache is
        out of sync or the wrong program is listening on this port. Stop the server, run{' '}
        <code className="rounded bg-white/10 px-1">npm run dev:clean</code> (or delete <code className="rounded bg-white/10 px-1">.next</code> manually), then
        start again. Make sure only <strong className="text-white">one</strong> Next dev server uses port 3002.
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
