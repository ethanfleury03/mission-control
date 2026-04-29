import type {
  ImageConversationMessage,
  ImageGenerationChatResponse,
  ImageGenerationHistoryRun,
  ImageGenerationMachineSummary,
  ImageStudioAgentContext,
  ImageStudioKBResponse,
  ImageStudioSettingsResponse,
  ImageStudioSettingsUpdate,
  KBAssetSummary,
  KBColorEntry,
  VideoDurationSeconds,
  VideoGenerationRunSummary,
  VideoSourceKind,
} from './types';

const BASE = '/api/image-generation';

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? response.statusText);
  }
  return data as T;
}

export async function fetchImageStudioSettings(): Promise<ImageStudioSettingsResponse> {
  const response = await fetch(`${BASE}/settings`, { cache: 'no-store' });
  return readJson<ImageStudioSettingsResponse>(response);
}

export async function updateImageStudioSettings(
  patch: ImageStudioSettingsUpdate,
): Promise<ImageStudioSettingsResponse> {
  const response = await fetch(`${BASE}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readJson<ImageStudioSettingsResponse>(response);
}

export async function sendImageGenerationPrompt(input: {
  prompt: string;
  machineId?: string | null;
  imageType: string;
  imageMode: boolean;
  generationMode: ImageStudioAgentContext['generationMode'];
  studioContext?: ImageStudioAgentContext;
  messages: ImageConversationMessage[];
}): Promise<ImageGenerationChatResponse> {
  const response = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson<ImageGenerationChatResponse>(response);
}

export async function fetchImageGenerationHistory(limit?: number): Promise<ImageGenerationHistoryRun[]> {
  const search = typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : '';
  const response = await fetch(`${BASE}/history${search}`, { cache: 'no-store' });
  const payload = await readJson<{ runs: ImageGenerationHistoryRun[] }>(response);
  return payload.runs;
}

export async function createVideoRun(input: {
  prompt: string;
  duration: VideoDurationSeconds;
  sourceKind: VideoSourceKind;
  sourceFile?: File | null;
  sourceImageRunId?: string | null;
  messages: ImageConversationMessage[];
}): Promise<VideoGenerationRunSummary> {
  const form = new FormData();
  form.set('prompt', input.prompt);
  form.set('duration', String(input.duration));
  form.set('sourceKind', input.sourceKind);
  form.set('messagesJson', JSON.stringify(input.messages));

  if (input.sourceKind === 'upload' && input.sourceFile) {
    form.set('sourceFile', input.sourceFile);
  }
  if (input.sourceKind === 'generated' && input.sourceImageRunId) {
    form.set('sourceImageRunId', input.sourceImageRunId);
  }

  const response = await fetch(`${BASE}/videos`, {
    method: 'POST',
    body: form,
  });

  return readJson<VideoGenerationRunSummary>(response);
}

export async function fetchVideoRuns(limit?: number): Promise<VideoGenerationRunSummary[]> {
  const search = typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : '';
  const response = await fetch(`${BASE}/videos${search}`, { cache: 'no-store' });
  const payload = await readJson<{ runs: VideoGenerationRunSummary[] }>(response);
  return payload.runs;
}

export async function fetchVideoRun(id: string): Promise<VideoGenerationRunSummary> {
  const response = await fetch(`${BASE}/videos/${encodeURIComponent(id)}`, { cache: 'no-store' });
  return readJson<VideoGenerationRunSummary>(response);
}

export async function fetchImageGenerationMachines(): Promise<ImageGenerationMachineSummary[]> {
  const response = await fetch(`${BASE}/machines`, { cache: 'no-store' });
  const payload = await readJson<{ machines: ImageGenerationMachineSummary[] }>(response);
  return payload.machines;
}

export async function createImageGenerationMachine(input: {
  title: string;
  notes: string;
  files: File[];
}): Promise<ImageGenerationMachineSummary> {
  const form = new FormData();
  form.set('title', input.title);
  form.set('notes', input.notes);
  input.files.forEach((file) => form.append('images', file));

  const response = await fetch(`${BASE}/machines`, {
    method: 'POST',
    body: form,
  });

  return readJson<ImageGenerationMachineSummary>(response);
}

export async function updateImageGenerationMachine(input: {
  id: string;
  title: string;
  notes: string;
}): Promise<ImageGenerationMachineSummary> {
  const response = await fetch(`${BASE}/machines/${input.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      notes: input.notes,
    }),
  });

  return readJson<ImageGenerationMachineSummary>(response);
}

export async function addImageGenerationMachineImages(input: {
  machineId: string;
  files: File[];
}): Promise<ImageGenerationMachineSummary> {
  const form = new FormData();
  input.files.forEach((file) => form.append('images', file));

  const response = await fetch(`${BASE}/machines/${input.machineId}/images`, {
    method: 'POST',
    body: form,
  });

  return readJson<ImageGenerationMachineSummary>(response);
}

export async function fetchImageStudioKB(): Promise<ImageStudioKBResponse> {
  const response = await fetch(`${BASE}/kb`, { cache: 'no-store' });
  return readJson<ImageStudioKBResponse>(response);
}

export async function createImageStudioKBAsset(input: {
  category: 'logo' | 'post';
  label: string;
  file: File;
}): Promise<KBAssetSummary> {
  const form = new FormData();
  form.set('label', input.label);
  form.set('file', input.file);

  const response = await fetch(`${BASE}/kb/${input.category === 'logo' ? 'logos' : 'posts'}`, {
    method: 'POST',
    body: form,
  });

  return readJson<KBAssetSummary>(response);
}

export async function createImageStudioKBPostAssets(files: File[]): Promise<KBAssetSummary[]> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }

  const response = await fetch(`${BASE}/kb/posts`, {
    method: 'POST',
    body: form,
  });

  const payload = await readJson<{ assets: KBAssetSummary[] }>(response);
  return payload.assets;
}

export async function createImageStudioKBColor(input: {
  name: string;
  hex: string;
  notes: string;
}): Promise<KBColorEntry> {
  const response = await fetch(`${BASE}/kb/colors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson<KBColorEntry>(response);
}

export async function updateImageStudioKBColor(input: KBColorEntry): Promise<KBColorEntry> {
  const response = await fetch(`${BASE}/kb/colors/${input.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson<KBColorEntry>(response);
}

export async function deleteImageStudioKBColor(id: string): Promise<void> {
  const response = await fetch(`${BASE}/kb/colors/${id}`, { method: 'DELETE' });
  await readJson<{ ok: true }>(response);
}

export function getImageGenerationMachineImageUrl(imageId: string): string {
  return `${BASE}/machine-images/${imageId}`;
}

export function getImageGenerationKbAssetUrl(assetId: string): string {
  return `${BASE}/kb/assets/${assetId}`;
}

export function getImageGenerationRunImageUrl(runId: string): string {
  return `${BASE}/history/${runId}/image`;
}

export function getVideoRunContentUrl(runId: string): string {
  return `${BASE}/videos/${runId}/content`;
}

export function getVideoRunSourceImageUrl(runId: string): string {
  return `${BASE}/videos/${runId}/source-image`;
}
