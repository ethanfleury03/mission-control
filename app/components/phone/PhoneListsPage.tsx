'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Database,
  Filter,
  Loader2,
  Upload,
  Users,
} from 'lucide-react';
import { formatTimeAgo } from '../../lib/utils';
import {
  commitPhoneCsv,
  createManualPhoneList,
  fetchPhoneList,
  fetchPhoneLists,
  fetchPhoneSettings,
  previewPhoneCsv,
} from '@/lib/phone/api';
import type { PhoneCsvPreview, PhoneList, PhonePage, PhoneSettingsResponse } from '@/lib/phone/types';
import {
  DetailStat,
  PageError,
  PageLoading,
  ReadonlySetting,
  SectionHeader,
  StatusPill,
  formatInteger,
  formatSourceType,
  parseManualEntries,
} from './shared';

export function PhoneListsPage({ onNavigate }: { onNavigate: (page: PhonePage) => void }) {
  const [lists, setLists] = useState<PhoneList[]>([]);
  const [settingsData, setSettingsData] = useState<PhoneSettingsResponse | null>(null);
  const [selectedListId, setSelectedListId] = useState('');
  const [selectedList, setSelectedList] = useState<PhoneList | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [csvDisplayName, setCsvDisplayName] = useState('');
  const [csvNotes, setCsvNotes] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<PhoneCsvPreview | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  const [manualDisplayName, setManualDisplayName] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualRowsText, setManualRowsText] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  async function load(preferredListId?: string) {
    setLoading(true);
    setError(null);
    try {
      const [nextLists, nextSettings] = await Promise.all([fetchPhoneLists(), fetchPhoneSettings()]);
      setLists(nextLists);
      setSettingsData(nextSettings);
      setSelectedListId((current) => {
        const nextId = preferredListId ?? current;
        if (nextId && nextLists.some((list) => list.id === nextId)) return nextId;
        return nextLists[0]?.id ?? '';
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load lists');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedListId) {
      setSelectedList(null);
      setDetailError(null);
      return;
    }

    let active = true;
    setDetailLoading(true);
    setDetailError(null);
    void fetchPhoneList(selectedListId)
      .then((list) => {
        if (active) setSelectedList(list);
      })
      .catch((loadError) => {
        if (active) {
          setSelectedList(null);
          setDetailError(loadError instanceof Error ? loadError.message : 'Could not load selected list');
        }
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedListId]);

  async function handleCsvPreview() {
    if (!csvFile) return;
    setCsvBusy(true);
    setMessage(null);
    try {
      const preview = await previewPhoneCsv(csvFile);
      setCsvPreview(preview);
      if (!csvDisplayName) {
        setCsvDisplayName(csvFile.name.replace(/\.[^.]+$/, ''));
      }
    } catch (previewError) {
      setMessage(previewError instanceof Error ? previewError.message : 'Could not preview CSV');
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleCsvCommit() {
    if (!csvFile || !csvDisplayName.trim()) return;
    setCsvBusy(true);
    setMessage(null);
    try {
      const created = await commitPhoneCsv({
        displayName: csvDisplayName,
        notes: csvNotes,
        file: csvFile,
      });
      setCsvDisplayName('');
      setCsvNotes('');
      setCsvFile(null);
      setCsvPreview(null);
      setMessage('CSV list imported.');
      await load(created.id);
    } catch (commitError) {
      setMessage(commitError instanceof Error ? commitError.message : 'Could not import CSV');
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleManualCreate() {
    const parsedEntries = parseManualEntries(manualRowsText);
    if (!manualDisplayName.trim() || parsedEntries.length === 0) return;

    setManualBusy(true);
    setMessage(null);
    try {
      const created = await createManualPhoneList({
        displayName: manualDisplayName,
        notes: manualNotes,
        entries: parsedEntries,
      });
      setManualDisplayName('');
      setManualNotes('');
      setManualRowsText('');
      setMessage('Manual list created.');
      await load(created.id);
    } catch (manualError) {
      setMessage(manualError instanceof Error ? manualError.message : 'Could not create manual list');
    } finally {
      setManualBusy(false);
    }
  }

  const previewMappings = useMemo(() => {
    if (!csvPreview?.suggestedMap) return [];
    return Object.entries(csvPreview.suggestedMap)
      .filter(([, columnIndex]) => columnIndex !== undefined)
      .map(([field, columnIndex]) => ({
        field,
        header: csvPreview.header[Number(columnIndex)] ?? `Column ${columnIndex}`,
      }));
  }, [csvPreview]);

  if (loading) return <PageLoading label="Loading lists" />;
  if (!settingsData) return <PageError label={error ?? 'Lists are unavailable right now.'} onRetry={() => void load()} />;

  return (
    <div className="max-w-7xl p-6">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Lists</h1>
          <p className="text-sm text-neutral-500">
            Import and inspect outbound lists here, then use Create Call when a list is ready to become a campaign.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('create-call')}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
        >
          Go to Create Call
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-neutral-700">
          {message}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card p-5">
          <SectionHeader
            icon={Upload}
            title="CSV Import"
            description="Preview mappings and dialability before committing a CSV into the Phone list model."
          />
          <div className="space-y-3">
            <input
              type="text"
              value={csvDisplayName}
              onChange={(event) => setCsvDisplayName(event.target.value)}
              placeholder="List name"
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
            />
            <textarea
              value={csvNotes}
              onChange={(event) => setCsvNotes(event.target.value)}
              placeholder="Notes for this list"
              rows={3}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
            />
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
              className="w-full text-xs text-neutral-600"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleCsvPreview()}
                disabled={!csvFile || csvBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50"
              >
                {csvBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
                Preview
              </button>
              <button
                type="button"
                onClick={() => void handleCsvCommit()}
                disabled={!csvFile || !csvDisplayName.trim() || !csvPreview || csvBusy}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {csvBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Import
              </button>
            </div>
          </div>

          {csvPreview && (
            <div className="mt-4 rounded-lg border border-brand/15 bg-white p-3">
              <div className="grid grid-cols-2 gap-2 text-2xs text-neutral-600">
                <div>
                  <span className="font-medium text-neutral-800">{csvPreview.totalRows}</span> total rows
                </div>
                <div>
                  <span className="font-medium text-neutral-800">{csvPreview.dialableCount}</span> dialable
                </div>
                <div>
                  <span className="font-medium text-neutral-800">{csvPreview.duplicateCount}</span> duplicates
                </div>
                <div>
                  <span className="font-medium text-neutral-800">{csvPreview.invalidPhoneCount}</span> invalid
                </div>
              </div>

              {previewMappings.length ? (
                <div className="mt-3 grid grid-cols-1 gap-2 text-2xs text-neutral-600 sm:grid-cols-2">
                  {previewMappings.map((mapping) => (
                    <div key={mapping.field} className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-2">
                      <span className="font-medium capitalize text-neutral-800">
                        {mapping.field.replace(/([A-Z])/g, ' $1')}
                      </span>
                      <div className="mt-0.5 text-neutral-500">{mapping.header}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="card p-5">
          <SectionHeader
            icon={Database}
            title="Manual List"
            description="Paste one prospect per line to spin up a quick demo list without leaving the app."
          />
          <div className="space-y-3">
            <input
              type="text"
              value={manualDisplayName}
              onChange={(event) => setManualDisplayName(event.target.value)}
              placeholder="List name"
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
            />
            <textarea
              value={manualNotes}
              onChange={(event) => setManualNotes(event.target.value)}
              placeholder="Notes for the list"
              rows={2}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
            />
            <textarea
              value={manualRowsText}
              onChange={(event) => setManualRowsText(event.target.value)}
              placeholder={`One lead per line:\nCompany, Contact, Title, Phone, Email`}
              rows={8}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
            />
            <button
              type="button"
              onClick={() => void handleManualCreate()}
              disabled={!manualDisplayName.trim() || !manualRowsText.trim() || manualBusy}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {manualBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Create Manual List
            </button>
          </div>
        </div>

        <div className="card p-5">
          <SectionHeader
            icon={Users}
            title="Source Connectors"
            description="CSV/manual is live in v1; future list sources stay visible here as staged connectors."
          />
          <div className="space-y-3">
            {settingsData.futureSources.map((source) => (
              <div
                key={source.id}
                className={`rounded-md border px-3 py-3 ${
                  source.status === 'active'
                    ? 'border-brand/20 bg-brand/5'
                    : 'border-dashed border-neutral-300 bg-neutral-50'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-neutral-800">{source.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-2xs font-medium ${
                      source.status === 'active' ? 'bg-brand/10 text-brand' : 'bg-neutral-200 text-neutral-600'
                    }`}
                  >
                    {source.status === 'active' ? 'Active' : 'Coming soon'}
                  </span>
                </div>
                <p className="text-2xs text-neutral-500">{source.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="card p-5">
          <SectionHeader
            icon={Database}
            title="List Health"
            description="Review list status, dialable counts, invalid rows, and duplicates before launching campaigns."
          />

          {lists.length ? (
            <div className="overflow-hidden rounded-lg border border-neutral-200">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">List</th>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-left font-medium">Total</th>
                    <th className="px-3 py-2 text-left font-medium">Dialable</th>
                    <th className="px-3 py-2 text-left font-medium">Invalid</th>
                    <th className="px-3 py-2 text-left font-medium">Duplicates</th>
                    <th className="px-3 py-2 text-left font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {lists.map((list) => {
                    const active = list.id === selectedListId;
                    return (
                      <tr
                        key={list.id}
                        onClick={() => setSelectedListId(list.id)}
                        className={`cursor-pointer border-t border-neutral-100 text-neutral-700 hover:bg-neutral-50 ${
                          active ? 'bg-brand/5' : ''
                        }`}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium text-neutral-900">{list.displayName}</div>
                          <div className="text-2xs text-neutral-500 capitalize">{list.status}</div>
                        </td>
                        <td className="px-3 py-2 capitalize">{formatSourceType(list.sourceType)}</td>
                        <td className="px-3 py-2">{formatInteger(list.totalEntries)}</td>
                        <td className="px-3 py-2">{formatInteger(list.dialableEntries)}</td>
                        <td className="px-3 py-2">{formatInteger(list.invalidEntries)}</td>
                        <td className="px-3 py-2">{formatInteger(list.duplicateEntries)}</td>
                        <td className="px-3 py-2">{formatTimeAgo(list.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-neutral-800">No lists yet</p>
              <p className="mt-1 text-xs text-neutral-500">
                Use the import cards above to bring in CSVs or create a manual list.
              </p>
            </div>
          )}
        </div>

        <div className="card p-5">
          <SectionHeader
            icon={Users}
            title="Selected List Detail"
            description="Metadata, summary counts, and lead-level queue state for the currently selected list."
          />

          {!selectedListId ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-neutral-800">Choose a list to inspect it.</p>
              <p className="mt-1 text-xs text-neutral-500">
                The selected list will show metadata, entry counts, and lead-level queue state here.
              </p>
            </div>
          ) : detailLoading ? (
            <PageLoading label="Loading selected list" compact />
          ) : detailError || !selectedList ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-neutral-800">Could not load this list.</p>
              <p className="mt-1 text-xs text-neutral-500">{detailError ?? 'Try selecting it again.'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">{selectedList.displayName}</h3>
                <p className="mt-1 text-xs text-neutral-500">
                  {selectedList.notes || 'No notes saved for this list.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <DetailStat label="Source" value={formatSourceType(selectedList.sourceType)} />
                <DetailStat label="Status" value={selectedList.status} />
                <DetailStat label="Total" value={formatInteger(selectedList.totalEntries)} />
                <DetailStat label="Dialable" value={formatInteger(selectedList.dialableEntries)} />
                <DetailStat label="Invalid" value={formatInteger(selectedList.invalidEntries)} />
                <DetailStat label="Duplicates" value={formatInteger(selectedList.duplicateEntries)} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ReadonlySetting label="Created" value={formatTimeAgo(selectedList.createdAt)} />
                <ReadonlySetting label="Updated" value={formatTimeAgo(selectedList.updatedAt)} />
              </div>

              <div className="overflow-hidden rounded-lg border border-neutral-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead className="bg-neutral-50 text-neutral-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Contact</th>
                        <th className="px-3 py-2 text-left font-medium">Company</th>
                        <th className="px-3 py-2 text-left font-medium">Phone</th>
                        <th className="px-3 py-2 text-left font-medium">Queue State</th>
                        <th className="px-3 py-2 text-left font-medium">Attempts</th>
                        <th className="px-3 py-2 text-left font-medium">Last Outcome</th>
                        <th className="px-3 py-2 text-left font-medium">Last Call</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedList.entries?.length ? (
                        selectedList.entries.map((entry) => (
                          <tr key={entry.id} className="border-t border-neutral-100 text-neutral-700">
                            <td className="px-3 py-2">{entry.contactName || '—'}</td>
                            <td className="px-3 py-2">{entry.companyName || '—'}</td>
                            <td className="px-3 py-2">{entry.phoneRaw || entry.phoneNormalized || '—'}</td>
                            <td className="px-3 py-2">
                              <StatusPill status={entry.queueState} subtle />
                            </td>
                            <td className="px-3 py-2">{entry.attempts}</td>
                            <td className="px-3 py-2">
                              <StatusPill status={entry.lastOutcome} subtle />
                            </td>
                            <td className="px-3 py-2">
                              {entry.lastCallAt ? formatTimeAgo(entry.lastCallAt) : '—'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-xs text-neutral-500">
                            No entries stored on this list yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
