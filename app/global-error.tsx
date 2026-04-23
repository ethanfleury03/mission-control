'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Critical error</p>
          <h1 className="mt-4 max-w-lg text-center text-xl font-semibold tracking-tight">
            {error.message || 'The app shell failed to load.'}
          </h1>
          <p className="mt-4 max-w-md text-center text-sm text-zinc-400">
            Delete the <code className="rounded bg-white/10 px-1">.next</code> folder and restart <code className="rounded bg-white/10 px-1">npm run dev</code>.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-8 rounded-full bg-[#c41e3a] px-6 py-2.5 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
