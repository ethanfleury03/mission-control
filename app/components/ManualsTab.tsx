'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarClock, Download, FileText, Loader2, Plus, Upload, X } from 'lucide-react';

import { createManualUpload, fetchManuals, getManualFileUrl } from '@/lib/manuals/api';
import type { ManualSummary } from '@/lib/manuals/types';
import { cn } from '../lib/utils';

function getFileExtension(fileName: string): string {
  const extension = fileName.trim().match(/\.([^.]+)$/)?.[1];
  return extension ? extension.toUpperCase() : 'FILE';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function isPdfManual(manual: ManualSummary): boolean {
  return manual.mimeType === 'application/pdf' || manual.fileName.toLowerCase().endsWith('.pdf');
}

export function ManualsTab() {
  const [manuals, setManuals] = useState<ManualSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [selectedManualId, setSelectedManualId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedManual = useMemo(
    () => manuals.find((manual) => manual.id === selectedManualId) ?? null,
    [manuals, selectedManualId],
  );

  async function loadManuals() {
    setLoading(true);
    setError(null);
    try {
      const nextManuals = await fetchManuals();
      setManuals(nextManuals);
      setSelectedManualId((current) => {
        if (current && nextManuals.some((manual) => manual.id === current)) return current;
        return current;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load manuals.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadManuals();
  }, []);

  function resetForm() {
    setManualName('');
    setManualFile(null);
  }

  async function handleCreateManual() {
    if (!manualName.trim() || !manualFile) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const created = await createManualUpload({ name: manualName, file: manualFile });
      resetForm();
      setModalOpen(false);
      setMessage(`Manual "${created.name}" uploaded.`);
      setSelectedManualId(created.id);
      await loadManuals();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not upload manual.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg-primary">
      <div className="w-full p-6">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Manuals</h1>
            <p className="text-sm text-neutral-500">
              Keep machine guides, internal SOPs, and reference documents in one searchable-ready library.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMessage(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 self-start rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" />
            Add Manual
          </button>
        </div>

        {message && (
          <div className="mb-4 rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-neutral-700">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(20rem,3fr)]">
          <section className="card overflow-hidden">
            <div className="border-b border-neutral-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-brand" />
                <h2 className="text-sm font-semibold text-neutral-900">Manual Library</h2>
              </div>
              <p className="mt-1 text-2xs text-neutral-500">
                Uploaded files are stored in the database and can be opened from this list.
              </p>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 p-6 text-xs text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading manuals
              </div>
            ) : manuals.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-neutral-900">No manuals uploaded yet</h3>
                <p className="mt-1 max-w-md text-xs text-neutral-500">
                  Add the first manual to start building the internal library.
                </p>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover"
                >
                  <Plus className="h-4 w-4" />
                  Add Manual
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {manuals.map((manual) => {
                  const isSelected = selectedManualId === manual.id;
                  return (
                    <article
                      key={manual.id}
                      onClick={() => setSelectedManualId(manual.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedManualId(manual.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'group flex min-h-[19rem] flex-col overflow-hidden rounded-md border bg-white text-left shadow-sm transition-all',
                        isSelected
                          ? 'border-brand ring-2 ring-brand/15'
                          : 'border-neutral-200 hover:border-brand/40 hover:shadow-md',
                      )}
                    >
                      <ManualPreview manual={manual} />

                      <div className="flex flex-1 flex-col p-3">
                        <div className="mb-2 min-w-0">
                          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-neutral-900">
                            {manual.name}
                          </h3>
                          <p className="mt-1 truncate text-2xs text-neutral-500">{manual.fileName}</p>
                        </div>

                        <div className="mt-auto flex flex-wrap items-center gap-1.5 text-2xs text-neutral-500">
                          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5">
                            {getFileExtension(manual.fileName)}
                          </span>
                          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5">
                            {formatFileSize(manual.byteSize)}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="truncate text-2xs text-neutral-500">{formatDate(manual.createdAt)}</span>
                          <a
                            href={getManualFileUrl(manual.id)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-2xs font-medium text-neutral-800 hover:bg-neutral-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Open
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="card flex min-h-[22rem] flex-col overflow-hidden bg-white">
            <div className="border-b border-neutral-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-brand" />
                <h2 className="text-sm font-semibold text-neutral-900">Manual Details</h2>
              </div>
              <p className="mt-1 text-2xs text-neutral-500">
                Select a manual to inspect its upload and version information.
              </p>
            </div>

            {!selectedManual ? (
              <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
                <p className="text-sm font-medium text-neutral-400">No manual selected</p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xs uppercase tracking-wider text-neutral-500">Selected manual</p>
                    <h3 className="mt-1 break-words text-base font-semibold text-neutral-900">{selectedManual.name}</h3>
                    <p className="mt-1 break-all text-xs text-neutral-500">{selectedManual.fileName}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <DetailItem label="Machine / Manual" value={selectedManual.name} />
                  <DetailItem label="Version Date" value={formatDate(selectedManual.updatedAt)} />
                  <DetailItem label="Length" value={formatFileSize(selectedManual.byteSize)} />
                  <DetailItem label="File Type" value={selectedManual.mimeType} />
                  <DetailItem label="Uploaded" value={formatDate(selectedManual.createdAt)} />
                  <DetailItem label="Storage" value="Database upload" />
                </div>

                <div className="mt-auto pt-5">
                  <a
                    href={getManualFileUrl(selectedManual.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover"
                  >
                    <Download className="h-4 w-4" />
                    Open Manual
                  </a>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">Add Manual</h2>
                <p className="mt-0.5 text-2xs text-neutral-500">Upload a PDF, DOC, DOCX, TXT, or MD file.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                aria-label="Close add manual modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-700">Name</span>
                <input
                  type="text"
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder="Operator training manual"
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-700">Manual file</span>
                <div
                  className={cn(
                    'flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-5 text-center transition-colors',
                    manualFile ? 'border-brand bg-brand/5' : 'border-neutral-300 bg-neutral-50 hover:bg-neutral-100',
                  )}
                >
                  <Upload className="mb-2 h-5 w-5 text-brand" />
                  <span className="text-xs font-medium text-neutral-800">
                    {manualFile ? manualFile.name : 'Choose a manual file'}
                  </span>
                  <span className="mt-1 text-2xs text-neutral-500">
                    {manualFile ? formatFileSize(manualFile.size) : 'PDF, DOC, DOCX, TXT, or MD up to 25 MB'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/x-markdown"
                    className="hidden"
                    onChange={(event) => setManualFile(event.target.files?.[0] ?? null)}
                  />
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateManual}
                disabled={!manualName.trim() || !manualFile || saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload Manual
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
      <p className="text-2xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 break-words text-xs font-medium text-neutral-900">{value}</p>
    </div>
  );
}

function ManualPreview({ manual }: { manual: ManualSummary }) {
  if (isPdfManual(manual)) {
    return (
      <div className="relative aspect-[4/5] overflow-hidden border-b border-neutral-200 bg-neutral-100">
        <iframe
          title={`${manual.name} first page preview`}
          src={`${getManualFileUrl(manual.id)}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          className="pointer-events-none h-full w-full bg-white"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/90 to-transparent" />
      </div>
    );
  }

  return (
    <div className="flex aspect-[4/5] flex-col items-center justify-center border-b border-neutral-200 bg-neutral-50 px-4 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-md bg-brand/10 text-brand">
        <FileText className="h-7 w-7" />
      </div>
      <p className="text-xs font-semibold text-neutral-900">{getFileExtension(manual.fileName)}</p>
      <p className="mt-1 line-clamp-2 text-2xs text-neutral-500">{manual.fileName}</p>
    </div>
  );
}
