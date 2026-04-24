'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Globe2,
  MapPinned,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { cn, formatNumber, formatTimeAgo } from '@/app/lib/utils';
import type {
  GeoDealer,
  GeoDealerInput,
  GeoDealerStatus,
  GeoSyncMeta,
} from '@/lib/geo-intelligence/types';
import { GeoPointPicker } from './GeoPointPicker';

interface GeoDealerSettingsPageProps {
  dealers: GeoDealer[];
  loading: boolean;
  syncing: boolean;
  syncMeta: GeoSyncMeta | null;
  selectedDealer: GeoDealer | null;
  onSelectDealer: (dealer: GeoDealer | null) => void;
  onSave: (payload: GeoDealerInput, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSyncHubSpot: () => Promise<void>;
}

type DealerFormState = {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  country: string;
  lat: string;
  lng: string;
  status: GeoDealerStatus;
  notes: string;
};

function blankForm(): DealerFormState {
  return {
    name: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    stateRegion: '',
    postalCode: '',
    country: '',
    lat: '43.3255',
    lng: '-79.799',
    status: 'active',
    notes: '',
  };
}

function dealerToForm(dealer: GeoDealer): DealerFormState {
  return {
    name: dealer.name,
    addressLine1: dealer.addressLine1,
    addressLine2: dealer.addressLine2,
    city: dealer.city,
    stateRegion: dealer.stateRegion,
    postalCode: dealer.postalCode,
    country: dealer.country,
    lat: String(dealer.lat),
    lng: String(dealer.lng),
    status: dealer.status,
    notes: dealer.notes,
  };
}

function parseForm(form: DealerFormState): GeoDealerInput {
  return {
    name: form.name.trim(),
    addressLine1: form.addressLine1.trim(),
    addressLine2: form.addressLine2.trim(),
    city: form.city.trim(),
    stateRegion: form.stateRegion.trim(),
    postalCode: form.postalCode.trim(),
    country: form.country.trim(),
    lat: Number(form.lat),
    lng: Number(form.lng),
    status: form.status,
    notes: form.notes.trim(),
  };
}

function statusTone(status: GeoDealerStatus) {
  switch (status) {
    case 'inactive':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'archived':
      return 'border-neutral-200 bg-neutral-100 text-neutral-500';
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
}

export function GeoDealerSettingsPage({
  dealers,
  loading,
  syncing,
  syncMeta,
  selectedDealer,
  onSelectDealer,
  onSave,
  onDelete,
  onSyncHubSpot,
}: GeoDealerSettingsPageProps) {
  const [form, setForm] = useState<DealerFormState>(blankForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(selectedDealer ? dealerToForm(selectedDealer) : blankForm());
    setError(null);
  }, [selectedDealer]);

  const totals = useMemo(() => {
    const active = dealers.filter((dealer) => dealer.status === 'active').length;
    const inactive = dealers.filter((dealer) => dealer.status === 'inactive').length;
    const archived = dealers.filter((dealer) => dealer.status === 'archived').length;
    return { active, inactive, archived };
  }, [dealers]);

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-brand/15 bg-white px-4 py-3 shadow-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <MapPinned className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Geo Intelligence</p>
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">Dealer Settings</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Manage the manual dealer network that anchors the globe and Arrow ecosystem routes.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectDealer(null)}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-brand/25 hover:text-brand"
          >
            <Plus className="h-4 w-4" />
            New Dealer
          </button>
          <button
            type="button"
            onClick={onSyncHubSpot}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl border border-brand/20 bg-brand/5 px-3.5 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            {syncing ? 'Syncing HubSpot…' : 'Refresh Contact Snapshot'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="rounded-[28px] border border-hub-border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Network Inventory</p>
                <h3 className="mt-1 text-lg font-semibold text-neutral-950">Dealer Registry</h3>
              </div>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                {formatNumber(dealers.length)} total
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: 'Active', value: totals.active, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                { label: 'Inactive', value: totals.inactive, tone: 'bg-amber-50 text-amber-700 border-amber-100' },
                { label: 'Archived', value: totals.archived, tone: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
              ].map((metric) => (
                <div key={metric.label} className={cn('rounded-2xl border px-3 py-3', metric.tone)}>
                  <p className="text-[11px] uppercase tracking-[0.16em]">{metric.label}</p>
                  <p className="mt-2 text-xl font-semibold">{metric.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col rounded-[28px] border border-hub-border bg-white p-3 shadow-sm">
            <div className="px-2 pb-3 pt-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Dealers</p>
              <p className="mt-1 text-sm text-neutral-500">
                Select a dealer to edit its metadata, status, notes, and exact map coordinates.
              </p>
            </div>
            <div className="max-h-[32rem] min-h-[14rem] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">
                  Loading dealer registry…
                </div>
              ) : dealers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">
                  No dealers yet. Create the first one and place it directly on the map.
                </div>
              ) : (
                dealers.map((dealer) => {
                  const isActive = selectedDealer?.id === dealer.id;
                  return (
                    <button
                      key={dealer.id}
                      type="button"
                      onClick={() => onSelectDealer(dealer)}
                      className={cn(
                        'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                        isActive
                          ? 'border-brand/30 bg-brand/5 shadow-sm'
                          : 'border-transparent bg-neutral-50 hover:border-brand/20 hover:bg-brand/5',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-neutral-900">{dealer.name}</span>
                            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', statusTone(dealer.status))}>
                              {dealer.status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-neutral-500">
                            {[dealer.city, dealer.stateRegion, dealer.country].filter(Boolean).join(', ') || dealer.country}
                          </p>
                        </div>
                        <PencilLine className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-[28px] border border-hub-border bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Editor</p>
                <h3 className="mt-1 text-xl font-semibold text-neutral-950">
                  {selectedDealer ? `Edit ${selectedDealer.name}` : 'Create Dealer'}
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Dealer records are manual by design so the globe stays clean, precise, and intentionally curated.
                </p>
              </div>
              {selectedDealer && (
                <button
                  type="button"
                  onClick={() => onSelectDealer(null)}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:border-brand/20 hover:text-brand"
                >
                  Clear selection
                </button>
              )}
            </div>

            <form
              className="mt-5 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setSaving(true);
                setError(null);
                try {
                  await onSave(parseForm(form), selectedDealer?.id);
                  if (!selectedDealer) setForm(blankForm());
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to save dealer');
                } finally {
                  setSaving(false);
                }
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Dealer name" required>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="geo-input"
                    placeholder="Arrow Canada"
                  />
                </Field>
                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as GeoDealerStatus }))}
                    className="geo-input"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="archived">Archived</option>
                  </select>
                </Field>
                <Field label="Address line 1" required className="md:col-span-2">
                  <input
                    value={form.addressLine1}
                    onChange={(event) => setForm((current) => ({ ...current, addressLine1: event.target.value }))}
                    className="geo-input"
                    placeholder="123 Industrial Way"
                  />
                </Field>
                <Field label="Address line 2" className="md:col-span-2">
                  <input
                    value={form.addressLine2}
                    onChange={(event) => setForm((current) => ({ ...current, addressLine2: event.target.value }))}
                    className="geo-input"
                    placeholder="Suite, building, district, or landmark"
                  />
                </Field>
                <Field label="City">
                  <input
                    value={form.city}
                    onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                    className="geo-input"
                    placeholder="Burlington"
                  />
                </Field>
                <Field label="State / Region">
                  <input
                    value={form.stateRegion}
                    onChange={(event) => setForm((current) => ({ ...current, stateRegion: event.target.value }))}
                    className="geo-input"
                    placeholder="Ontario"
                  />
                </Field>
                <Field label="Postal code">
                  <input
                    value={form.postalCode}
                    onChange={(event) => setForm((current) => ({ ...current, postalCode: event.target.value }))}
                    className="geo-input"
                    placeholder="L7L 5P4"
                  />
                </Field>
                <Field label="Country" required>
                  <input
                    value={form.country}
                    onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                    className="geo-input"
                    placeholder="Canada"
                  />
                </Field>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
                <GeoPointPicker
                  lat={Number(form.lat) || 0}
                  lng={Number(form.lng) || 0}
                  onChange={(coords) =>
                    setForm((current) => ({
                      ...current,
                      lat: coords.lat.toFixed(5),
                      lng: coords.lng.toFixed(5),
                    }))
                  }
                  className="min-h-[16rem]"
                />
                <div className="grid content-start gap-4">
                  <Field label="Latitude" required>
                    <input
                      value={form.lat}
                      onChange={(event) => setForm((current) => ({ ...current, lat: event.target.value }))}
                      className="geo-input font-mono"
                    />
                  </Field>
                  <Field label="Longitude" required>
                    <input
                      value={form.lng}
                      onChange={(event) => setForm((current) => ({ ...current, lng: event.target.value }))}
                      className="geo-input font-mono"
                    />
                  </Field>
                  <Field label="Notes">
                    <textarea
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      className="geo-input min-h-[120px] resize-none"
                      placeholder="Territory notes, channel fit, specialization, or rollout context."
                    />
                  </Field>
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <Globe2 className="h-4 w-4 text-brand" />
                  These coordinates drive the live dealer pin, pulse ring, and Arrow network arc on the globe.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedDealer && (
                    <button
                      type="button"
                      onClick={async () => {
                        setDeleting(true);
                        setError(null);
                        try {
                          await onDelete(selectedDealer.id);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to delete dealer');
                        } finally {
                          setDeleting(false);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={deleting || saving}
                    >
                      <Trash2 className="h-4 w-4" />
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving || deleting}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving…' : selectedDealer ? 'Save Changes' : 'Create Dealer'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <InfoCard
              title="HubSpot Snapshot"
              value={syncMeta?.hubspotConfigured ? (syncMeta?.status ?? 'idle') : 'Not configured'}
              caption={
                syncMeta?.hubspotConfigured
                  ? syncMeta?.lastSyncedAt
                    ? `Last synced ${formatTimeAgo(syncMeta.lastSyncedAt)}`
                    : 'No sync has run yet'
                  : 'Add HUBSPOT_ACCESS_TOKEN to enable contact coverage'
              }
            />
            <InfoCard
              title="Mapped Contacts"
              value={formatNumber(syncMeta?.mappableRecords ?? 0)}
              caption={`${formatNumber(syncMeta?.unmappableRecords ?? 0)} unmapped`}
            />
            <InfoCard
              title="Snapshot Size"
              value={formatNumber(syncMeta?.totalRecords ?? 0)}
              caption={syncMeta?.stale ? 'Snapshot is stale' : 'Snapshot is fresh'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  className,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

function InfoCard({
  title,
  value,
  caption,
}: {
  title: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-[24px] border border-hub-border bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{value}</p>
      <p className="mt-1 text-sm text-neutral-500">{caption}</p>
    </div>
  );
}
