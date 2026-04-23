import type {
  ImageConversationMessage,
  ImageGenerationChatResponse,
  ImageGenerationHistoryRun,
  ImageGenerationMachineSummary,
  ImageStudioKBResponse,
  ImageStudioSettingsResponse,
  ImageStudioSettingsUpdate,
  KBAssetSummary,
  KBColorEntry,
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
  messages: ImageConversationMessage[];
}): Promise<ImageGenerationChatResponse> {
  const response = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson<ImageGenerationChatResponse>(response);
}

export async function fetchImageGenerationHistory(): Promise<ImageGenerationHistoryRun[]> {
  const response = await fetch(`${BASE}/history`, { cache: 'no-store' });
  const payload = await readJson<{ runs: ImageGenerationHistoryRun[] }>(response);
  return payload.runs;
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
