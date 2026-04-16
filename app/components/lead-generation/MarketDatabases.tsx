'use client';

import { useCallback, useEffect, useState } from 'react';
import { Database, ArrowRight, MapPin, Users, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Market, MarketStatus } from '@/lib/lead-generation/types';
import { fetchMarkets, createMarket, updateMarket, deleteMarket } from '@/lib/lead-generation/api';

interface MarketDatabasesProps {
  onSelectMarket: (slug: string) => void;
}

const STATUS_STYLES: Record<MarketStatus, string> = {
  active: 'bg-green-100 text-green-800',
  building: 'bg-amber-100 text-amber-800',
  planned: 'bg-blue-100 text-blue-800',
  archived: 'bg-neutral-100 text-neutral-600',
};

const STATUSES: MarketStatus[] = ['active', 'building', 'planned', 'archived'];

export function MarketDatabases({ onSelectMarket }: MarketDatabasesProps) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Market | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    countries: '',
    personas: '',
    solutions: '',
    status: 'active' as MarketStatus,
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMarkets(await fetchMarkets());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load markets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      slug: '',
      description: '',
      countries: '',
      personas: '',
      solutions: '',
      status: 'active',
      notes: '',
    });
    setModal('create');
  };

  const openEdit = (m: Market) => {
    setEditing(m);
    setForm({
      name: m.name,
      slug: m.slug,
      description: m.description,
      countries: m.countries.join(', '),
      personas: m.targetPersonas.join(', '),
      solutions: m.solutionAreas.join(', '),
      status: m.status,
      notes: m.notes,
    });
    setModal('edit');
  };

  const splitList = (s: string) =>
    s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

  const submitForm = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        description: form.description,
        countries: splitList(form.countries),
        targetPersonas: splitList(form.personas),
        solutionAreas: splitList(form.solutions),
        status: form.status,
        notes: form.notes,
      };
      if (modal === 'create') {
        await createMarket(payload as Parameters<typeof createMarket>[0]);
      } else if (editing) {
        await updateMarket(editing.id, payload);
      }
      setModal(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: Market) => {
    if (!confirm(`Delete market "${m.name}" and all ${m.companyCount} company records? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteMarket(m.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const activeCount = markets.filter((m) => m.status === 'active').length;
  const buildingCount = markets.filter((m) => m.status === 'building').length;
  const plannedCount = markets.filter((m) => m.status === 'planned').length;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 mb-1">Market Databases</h1>
          <p className="text-sm text-neutral-500">
            Industry-specific company databases backed by your configured <code className="text-2xs bg-neutral-100 px-1 rounded">DATABASE_URL</code>.
            This view stays empty until you create a market or import data.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xs px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">{activeCount} active</span>
          <span className="text-2xs px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200">{buildingCount} building</span>
          <span className="text-2xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">{plannedCount} planned</span>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand text-white text-xs font-medium hover:bg-brand-hover"
          >
            <Plus className="h-3.5 w-3.5" /> Add market
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading markets…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {markets.length === 0 && (
            <div className="md:col-span-2 card p-6 border border-amber-200 bg-amber-50/50">
              <p className="text-sm font-medium text-neutral-900 mb-2">No markets in this database yet</p>
              <p className="text-xs text-neutral-600 mb-3">
                Create your first market here, or import scraper results into a market after one exists.
              </p>
              <p className="text-2xs text-neutral-500">
                If you expect existing records and do not see them, verify that <code className="font-mono">DATABASE_URL</code> points at the right database.
              </p>
            </div>
          )}
          {markets.map((market) => (
            <div
              key={market.id}
              className="card p-4 text-left transition-all group relative"
            >
              <div className="absolute top-3 right-3 flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openEdit(market); }}
                  className="p-1.5 rounded-md text-neutral-400 hover:text-brand hover:bg-neutral-100"
                  title="Edit market"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(market); }}
                  className="p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50"
                  title="Delete market"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onSelectMarket(market.slug)}
                className="w-full text-left pr-16"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-brand" />
                    <h3 className="text-sm font-semibold text-neutral-900 group-hover:text-brand transition-colors">
                      {market.name}
                    </h3>
                  </div>
                  <span className={cn('text-2xs px-2 py-0.5 rounded font-medium shrink-0', STATUS_STYLES[market.status])}>
                    {market.status}
                  </span>
                </div>

                <p className="text-xs text-neutral-500 mb-3 line-clamp-2">{market.description}</p>

                <div className="flex flex-wrap gap-3 mb-3">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-neutral-400" />
                    <span className="text-2xs text-neutral-500">{market.countries.length ? market.countries.join(', ') : '—'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-neutral-400" />
                    <span className="text-2xs text-neutral-500">{market.companyCount} companies</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {market.solutionAreas.slice(0, 3).map((area) => (
                    <span key={area} className="text-2xs px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 border border-neutral-200">
                      {area}
                    </span>
                  ))}
                  {market.solutionAreas.length > 3 && (
                    <span className="text-2xs px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-400">
                      +{market.solutionAreas.length - 3}
                    </span>
                  )}
                </div>

                {market.notes && (
                  <p className="text-2xs text-neutral-400 italic line-clamp-2">{market.notes}</p>
                )}

                <div className="flex items-center justify-end mt-2">
                  <span className="text-2xs text-neutral-400 group-hover:text-brand transition-colors flex items-center gap-1">
                    View database <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal>
          <div className="bg-white rounded-lg border border-hub-border shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-5">
            <h2 className="text-sm font-semibold text-neutral-900 mb-3">
              {modal === 'create' ? 'Add market' : 'Edit market'}
            </h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-600 mb-1">Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full h-9 px-2 border border-neutral-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-neutral-600 mb-1">Slug (optional; URL key)</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="auto from name if empty"
                  className="w-full h-9 px-2 border border-neutral-200 rounded-md font-mono text-2xs"
                />
              </div>
              <div>
                <label className="block text-neutral-600 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-2 py-1.5 border border-neutral-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-neutral-600 mb-1">Countries (comma-separated)</label>
                <input
                  value={form.countries}
                  onChange={(e) => setForm((f) => ({ ...f, countries: e.target.value }))}
                  className="w-full h-9 px-2 border border-neutral-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-neutral-600 mb-1">Target personas (comma-separated)</label>
                <input
                  value={form.personas}
                  onChange={(e) => setForm((f) => ({ ...f, personas: e.target.value }))}
                  className="w-full h-9 px-2 border border-neutral-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-neutral-600 mb-1">Solution areas (comma-separated)</label>
                <input
                  value={form.solutions}
                  onChange={(e) => setForm((f) => ({ ...f, solutions: e.target.value }))}
                  className="w-full h-9 px-2 border border-neutral-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-neutral-600 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as MarketStatus }))}
                  className="w-full h-9 px-2 border border-neutral-200 rounded-md"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-neutral-600 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-2 py-1.5 border border-neutral-200 rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-neutral-100">
              <button type="button" onClick={() => setModal(null)} className="px-3 py-1.5 text-xs border border-neutral-200 rounded-md">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitForm}
                disabled={saving || !form.name.trim()}
                className="px-3 py-1.5 text-xs bg-brand text-white rounded-md disabled:opacity-50 inline-flex items-center gap-1"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
