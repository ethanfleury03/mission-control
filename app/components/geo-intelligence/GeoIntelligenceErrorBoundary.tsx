'use client';

import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

interface Props {
  children: ReactNode;
}

export class GeoIntelligenceErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error('Geo Intelligence crashed:', error, info);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full min-h-screen w-full items-center justify-center bg-[#0b1222] p-6 text-white">
        <div className="max-w-lg rounded-2xl border border-rose-500/30 bg-rose-950/40 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-300">Geo Intelligence error</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">The globe scene failed to render.</h2>
          <p className="mt-3 text-sm leading-6 text-rose-100/80">
            {this.state.error.message || 'An unknown client-side error occurred while hydrating the Geo Intelligence tab.'}
          </p>
          <div className="mt-5 rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] leading-5 text-rose-100/60">
            Common causes:
            <ul className="mt-2 list-disc pl-4 space-y-1">
              <li>Stale <code>.next</code> build cache after switching branches. Stop the dev server, delete the <code>.next</code> folder, then run <code>npm run dev</code> again.</li>
              <li>Prisma schema hasn&apos;t been migrated locally. Run <code>npx prisma migrate deploy</code> (or <code>npx prisma db push</code>) so the <code>geo_*</code> tables exist.</li>
              <li>WebGL is unavailable or blocked in the current browser.</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
