'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, ShoppingCart, Package, CreditCard, Users, TrendingUp, Store } from 'lucide-react';

export function SecTeamTab() {
  const [storeStatus, setStoreStatus] = useState<'loading' | 'running' | 'stopped'>('stopped');
  const [storeUrl, setStoreUrl] = useState<string>('');

  // Check if store dev server is running
  useEffect(() => {
    // For now, just show the preview info
    setStoreUrl('http://localhost:3001');
  }, []);

  const features = [
    { icon: ShoppingCart, label: 'Products', value: '5 SKUs', desc: 'Tamper-evident, hologram, serialized labels' },
    { icon: Package, label: 'Orders', value: 'Admin Dashboard', desc: 'Manage orders, print packing slips' },
    { icon: CreditCard, label: 'Payments', value: 'Stripe', desc: 'Secure checkout processing' },
    { icon: Users, label: 'Customers', value: 'Accounts', desc: 'Order history & reordering' },
    { icon: TrendingUp, label: 'Pricing', value: '$2.50/sq ft', desc: 'Dynamic pricing with volume discounts' },
    { icon: Store, label: 'Builder', value: 'Custom Labels', desc: 'Size, quantity, artwork upload' },
  ];

  return (
    <div className="flex-1 overflow-auto bg-bg-primary p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <Store className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">SEC LABELS Store</h1>
            <p className="text-sm text-text-secondary">ARRSYS Security Labels E-Commerce Platform</p>
          </div>
        </div>
      </div>

      {/* Preview Banner */}
      <div className="mb-8 p-4 bg-bg-secondary rounded-lg border border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
            <div>
              <h3 className="text-sm font-medium text-text-primary">Store Location</h3>
              <p className="text-xs text-text-secondary">Built at: workspace-coding-coordinator/arrsys-labels-store/</p>
            </div>
          </div>
          <a 
            href="/opt/openclaw_stack/workspace/workspace-coding-coordinator/arrsys-labels-store"
            target="_blank"
            className="flex items-center gap-2 px-4 py-2 bg-accent-cyan/10 text-accent-cyan rounded-md text-xs font-medium border border-accent-cyan/20 hover:bg-accent-cyan/20 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Store Directory
          </a>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {features.map((feature) => (
          <div key={feature.label} className="p-4 bg-bg-secondary rounded-lg border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-md bg-bg-tertiary flex items-center justify-center">
                <feature.icon className="w-4 h-4 text-accent-cyan" />
              </div>
              <span className="text-xs text-text-muted">{feature.label}</span>
            </div>
            <div className="text-lg font-semibold text-text-primary mb-1">{feature.value}</div>
            <p className="text-xs text-text-secondary">{feature.desc}</p>
          </div>
        ))}
      </div>

      {/* Tech Stack */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-text-primary mb-4">Tech Stack</h3>
        <div className="flex flex-wrap gap-2">
          {['Next.js 14', 'TypeScript', 'Prisma', 'PostgreSQL', 'Stripe', 'Docker'].map((tech) => (
            <span key={tech} className="px-3 py-1.5 bg-bg-tertiary rounded-md text-xs text-text-secondary border border-white/5">
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-bg-secondary rounded-lg border border-white/5">
          <h4 className="text-sm font-medium text-text-primary mb-2">To Start Dev Server</h4>
          <code className="block p-3 bg-bg-tertiary rounded-md text-xs font-mono text-text-secondary">
            cd workspace-coding-coordinator/arrsys-labels-store<br/>
            npm install<br/>
            npm run dev
          </code>
          <p className="mt-2 text-xs text-text-muted">Then visit http://localhost:3000</p>
        </div>

        <div className="p-4 bg-bg-secondary rounded-lg border border-white/5">
          <h4 className="text-sm font-medium text-text-primary mb-2">Environment Setup</h4>
          <code className="block p-3 bg-bg-tertiary rounded-md text-xs font-mono text-text-secondary">
            cp .env.example .env<br/>
            # Add DATABASE_URL<br/>
            # Add Stripe keys
          </code>
          <p className="mt-2 text-xs text-text-muted">Required before first run</p>
        </div>
      </div>

      {/* Note */}
      <div className="mt-8 p-4 bg-yellow-500/5 rounded-lg border border-yellow-500/20">
        <p className="text-xs text-yellow-400">
          <strong>Note:</strong> This is an MVP build. Design customization and review are pending. 
          The store is fully functional but needs your design input before launch.
        </p>
      </div>
    </div>
  );
}
