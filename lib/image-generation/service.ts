import { prisma } from '@/lib/prisma';

import {
  DEFAULT_IMAGE_STUDIO_CHAT_MODEL,
  DEFAULT_IMAGE_STUDIO_IMAGE_MODEL,
  DEFAULT_IMAGE_STUDIO_VIDEO_MODEL,
  DEFAULT_IMAGE_STUDIO_PROMPTS,
  IMAGE_STUDIO_PROMPT_USAGE,
  IMAGE_STUDIO_PROVIDER,
} from './defaults';
import { IMAGE_TYPE_VARIANTS } from './machines';
import type {
  GeneratedImage,
  ImageBrief,
  ImageConversationMessage,
  ImageGenerationChatResponse,
  ImageGenerationHistoryRun,
  ImageGenerationMachineImageSummary,
  ImageGenerationMachineSummary,
  ImagePlannerResult,
  ImageStudioKBResponse,
  ImageStudioModelStatus,
  ImageStudioPromptKey,
  ImageStudioPromptSet,
  ImageStudioSettingsResponse,
  ImageStudioSettingsUpdate,
  ImageTypeValue,
  KBAssetSummary,
  KBColorEntry,
} from './types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_API_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_VIDEO_MODELS_API_URL = 'https://openrouter.ai/api/v1/videos/models';
const TEXT_REQUEST_TIMEOUT_MS = 120_000;
const IMAGE_REQUEST_TIMEOUT_MS = 240_000;
const MODEL_STATUS_TIMEOUT_MS = 12_000;
const HISTORY_LIMIT = 12;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MODEL_STATUS_CACHE_TTL_MS = 5 * 60_000;
export const LINKEDIN_MACHINE_REFERENCE_REQUIRED_MESSAGE =
  'Select a machine with uploaded reference images before generating a LinkedIn ad.';

const IMAGE_GENERATION_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "image_generation_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "provider" TEXT NOT NULL DEFAULT 'openrouter',
    "orchestratorModel" TEXT NOT NULL DEFAULT 'deepseek/deepseek-chat-v3.1',
    "promptsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "image_generation_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userPrompt" TEXT NOT NULL DEFAULT '',
    "assistantReply" TEXT NOT NULL DEFAULT '',
    "plannerJson" TEXT NOT NULL DEFAULT '{}',
    "finalImagePrompt" TEXT NOT NULL DEFAULT '',
    "chatModel" TEXT NOT NULL DEFAULT '',
    "imageModel" TEXT NOT NULL DEFAULT '',
    "machineId" TEXT,
    "imageType" TEXT NOT NULL DEFAULT 'linkedin_ad',
    "imageDataUrl" TEXT NOT NULL DEFAULT '',
    "imageMimeType" TEXT NOT NULL DEFAULT 'image/png',
    "imageAlt" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "image_generation_machines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "brochureFilename" TEXT,
    "brochureMimeType" TEXT,
    "brochureByteSize" INTEGER,
    "brochurePdf" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "image_generation_machine_images" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "machineId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Reference image',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "imageBytes" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "image_generation_machine_images_machineId_fkey"
      FOREIGN KEY ("machineId") REFERENCES "image_generation_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "image_generation_kb_assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "imageBytes" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "image_generation_kb_colors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "hex" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "image_generation_video_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userPrompt" TEXT NOT NULL DEFAULT '',
    "assistantReply" TEXT NOT NULL DEFAULT '',
    "sourceKind" TEXT NOT NULL,
    "sourceImageRunId" TEXT,
    "sourceImageFileName" TEXT NOT NULL,
    "sourceImageMimeType" TEXT NOT NULL,
    "sourceImageByteSize" INTEGER NOT NULL,
    "sourceImageBytes" BLOB NOT NULL,
    "videoModel" TEXT NOT NULL DEFAULT '',
    "openrouterJobId" TEXT NOT NULL DEFAULT '',
    "openrouterGenerationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "resolution" TEXT NOT NULL DEFAULT '720p',
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "videoFileName" TEXT,
    "videoMimeType" TEXT,
    "videoByteSize" INTEGER,
    "videoBytes" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "image_generation_runs_createdAt_idx" ON "image_generation_runs"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "image_generation_machines_title_idx" ON "image_generation_machines"("title")`,
  `CREATE INDEX IF NOT EXISTS "image_generation_machines_updatedAt_idx" ON "image_generation_machines"("updatedAt")`,
  `CREATE INDEX IF NOT EXISTS "image_generation_machine_images_machineId_idx" ON "image_generation_machine_images"("machineId")`,
  `CREATE INDEX IF NOT EXISTS "image_generation_kb_assets_category_idx" ON "image_generation_kb_assets"("category")`,
  `CREATE INDEX IF NOT EXISTS "image_generation_kb_assets_updatedAt_idx" ON "image_generation_kb_assets"("updatedAt")`,
  `CREATE INDEX IF NOT EXISTS "image_generation_kb_colors_updatedAt_idx" ON "image_generation_kb_colors"("updatedAt")`,
  `CREATE INDEX IF NOT EXISTS "image_generation_video_runs_createdAt_idx" ON "image_generation_video_runs"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "image_generation_video_runs_status_idx" ON "image_generation_video_runs"("status")`,
  `CREATE INDEX IF NOT EXISTS "image_generation_video_runs_openrouterJobId_idx" ON "image_generation_video_runs"("openrouterJobId")`,
].map((statement) => statement.replace(/\s+/g, ' ').trim());

let imageGenerationSchemaReady = false;
let imageGenerationSchemaPromise: Promise<void> | null = null;
let cachedModelStatuses:
  | {
      value: {
        chatModelStatus: ImageStudioModelStatus;
        imageModelStatus: ImageStudioModelStatus;
        videoModelStatus: ImageStudioModelStatus;
      };
      expiresAt: number;
      chatModel: string;
      imageModel: string;
      videoModel: string;
    }
  | null = null;

type IntentMode = 'help' | 'generate';

type RoutingResult = {
  mode: IntentMode;
  reason: string;
};

type PromptWriterResult = {
  finalPrompt: string;
  alt: string;
};

type MachineReferenceResult = {
  appearanceSummary: string;
  mustMatch: string[];
  mustAvoid: string[];
  outputHandling: string[];
};

type OpenRouterMessageImage = {
  type?: string;
  image_url?: { url?: string };
  imageUrl?: { url?: string };
  url?: string;
};

type OpenRouterMessage = {
  content?: unknown;
  images?: OpenRouterMessageImage[];
};

type OpenRouterInputContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type OpenRouterResponsePayload = {
  choices?: Array<{ message?: OpenRouterMessage }>;
  error?: { message?: string };
};

type ImageAttachment = {
  label: string;
  dataUrl: string;
};

function getConfiguredChatModel(): string {
  return process.env.IMAGE_OPENROUTER_CHAT_MODEL?.trim() || DEFAULT_IMAGE_STUDIO_CHAT_MODEL;
}

function getConfiguredImageModel(): string {
  return process.env.IMAGE_OPENROUTER_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_STUDIO_IMAGE_MODEL;
}

function getConfiguredVideoModel(): string {
  return process.env.IMAGE_OPENROUTER_VIDEO_MODEL?.trim() || DEFAULT_IMAGE_STUDIO_VIDEO_MODEL;
}

function getOpenRouterApiKey(): string | null {
  return process.env.IMAGE_OPENROUTER_API_KEY?.trim() || null;
}

export function isImageGenerationConfigured(): boolean {
  return Boolean(getOpenRouterApiKey());
}

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

async function getTableColumns(tableName: string): Promise<Set<string>> {
  const rows = (await prisma.$queryRawUnsafe(`PRAGMA table_info("${tableName}")`)) as Array<{ name?: string }>;
  return new Set(rows.map((row) => row.name).filter((value): value is string => Boolean(value)));
}

export async function ensureImageGenerationSchema(): Promise<void> {
  if (imageGenerationSchemaReady) return;
  if (imageGenerationSchemaPromise) {
    await imageGenerationSchemaPromise;
    return;
  }

  imageGenerationSchemaPromise = (async () => {
    for (const statement of IMAGE_GENERATION_SCHEMA_STATEMENTS) {
      await prisma.$executeRawUnsafe(statement);
    }

    const machineColumns = await getTableColumns('image_generation_machines');
    if (!machineColumns.has('notes')) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "image_generation_machines" ADD COLUMN "notes" TEXT NOT NULL DEFAULT ''`,
      );
    }

    imageGenerationSchemaReady = true;
  })();

  try {
    await imageGenerationSchemaPromise;
  } finally {
    imageGenerationSchemaPromise = null;
  }
}

function shouldUpgradeLegacyLinkedInAdPrompt(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('Create a single-image LinkedIn marketing visual for {{COMPANY_NAME}} featuring {{MACHINE_NAME}}.') ||
    trimmed.startsWith('Create a single-image LinkedIn ad poster for {{COMPANY_NAME}} featuring {{MACHINE_NAME}}.')
  ) && trimmed.includes('brochure');
}

function shouldUpgradeLegacyMachineContextTemplate(value: string): boolean {
  return value.includes('Brochure') || value.includes('brochure');
}

function normalizePromptSet(value: unknown): ImageStudioPromptSet {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    assistantGoalPrompt:
      typeof raw.assistantGoalPrompt === 'string' && raw.assistantGoalPrompt.trim()
        ? raw.assistantGoalPrompt
        : DEFAULT_IMAGE_STUDIO_PROMPTS.assistantGoalPrompt,
    intentRoutingPrompt:
      typeof raw.intentRoutingPrompt === 'string' && raw.intentRoutingPrompt.trim()
        ? raw.intentRoutingPrompt
        : DEFAULT_IMAGE_STUDIO_PROMPTS.intentRoutingPrompt,
    helpResponsePrompt:
      typeof raw.helpResponsePrompt === 'string' && raw.helpResponsePrompt.trim()
        ? raw.helpResponsePrompt
        : DEFAULT_IMAGE_STUDIO_PROMPTS.helpResponsePrompt,
    imagePlanningPrompt:
      typeof raw.imagePlanningPrompt === 'string' && raw.imagePlanningPrompt.trim()
        ? raw.imagePlanningPrompt
        : DEFAULT_IMAGE_STUDIO_PROMPTS.imagePlanningPrompt,
    imagePromptWriterPrompt:
      typeof raw.imagePromptWriterPrompt === 'string' && raw.imagePromptWriterPrompt.trim()
        ? raw.imagePromptWriterPrompt
        : DEFAULT_IMAGE_STUDIO_PROMPTS.imagePromptWriterPrompt,
    machineReferenceExtractionPrompt:
      typeof raw.machineReferenceExtractionPrompt === 'string' && raw.machineReferenceExtractionPrompt.trim()
        ? raw.machineReferenceExtractionPrompt
        : typeof raw.brochureReferenceExtractionPrompt === 'string' && raw.brochureReferenceExtractionPrompt.trim()
          ? raw.brochureReferenceExtractionPrompt
          : DEFAULT_IMAGE_STUDIO_PROMPTS.machineReferenceExtractionPrompt,
    linkedinAdImageSystemPrompt:
      typeof raw.linkedinAdImageSystemPrompt === 'string' && raw.linkedinAdImageSystemPrompt.trim()
        ? shouldUpgradeLegacyLinkedInAdPrompt(raw.linkedinAdImageSystemPrompt)
          ? DEFAULT_IMAGE_STUDIO_PROMPTS.linkedinAdImageSystemPrompt
          : raw.linkedinAdImageSystemPrompt
        : DEFAULT_IMAGE_STUDIO_PROMPTS.linkedinAdImageSystemPrompt,
    machineContextTemplate:
      typeof raw.machineContextTemplate === 'string' && raw.machineContextTemplate.trim()
        ? shouldUpgradeLegacyMachineContextTemplate(raw.machineContextTemplate)
          ? DEFAULT_IMAGE_STUDIO_PROMPTS.machineContextTemplate
          : raw.machineContextTemplate
        : DEFAULT_IMAGE_STUDIO_PROMPTS.machineContextTemplate,
    imageTypeContextTemplate:
      typeof raw.imageTypeContextTemplate === 'string' && raw.imageTypeContextTemplate.trim()
        ? raw.imageTypeContextTemplate
        : DEFAULT_IMAGE_STUDIO_PROMPTS.imageTypeContextTemplate,
    kbContextTemplate:
      typeof raw.kbContextTemplate === 'string' && raw.kbContextTemplate.trim()
        ? raw.kbContextTemplate
        : DEFAULT_IMAGE_STUDIO_PROMPTS.kbContextTemplate,
    imageResultSummaryPrompt:
      typeof raw.imageResultSummaryPrompt === 'string' && raw.imageResultSummaryPrompt.trim()
        ? raw.imageResultSummaryPrompt
        : DEFAULT_IMAGE_STUDIO_PROMPTS.imageResultSummaryPrompt,
  };
}

function parsePromptsJson(value: string): ImageStudioPromptSet {
  try {
    return normalizePromptSet(JSON.parse(value) as unknown);
  } catch {
    return { ...DEFAULT_IMAGE_STUDIO_PROMPTS };
  }
}

function serializePrompts(prompts: ImageStudioPromptSet): string {
  return JSON.stringify(prompts);
}

function serializePlanner(planner: ImageBrief & { finalPrompt: string; alt: string }): string {
  return JSON.stringify(planner);
}

function parsePlannerJson(value: string): (ImageBrief & { finalPrompt: string; alt: string }) | null {
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof raw.title !== 'string' ||
      typeof raw.summary !== 'string' ||
      typeof raw.creativeDirection !== 'string' ||
      typeof raw.composition !== 'string' ||
      !Array.isArray(raw.mustInclude) ||
      !Array.isArray(raw.avoid) ||
      typeof raw.aspectIntent !== 'string' ||
      typeof raw.finalPrompt !== 'string' ||
      typeof raw.alt !== 'string'
    ) {
      return null;
    }

    return {
      title: raw.title,
      summary: raw.summary,
      creativeDirection: raw.creativeDirection,
      composition: raw.composition,
      mustInclude: raw.mustInclude.filter((item): item is string => typeof item === 'string'),
      avoid: raw.avoid.filter((item): item is string => typeof item === 'string'),
      aspectIntent: raw.aspectIntent,
      finalPrompt: raw.finalPrompt,
      alt: raw.alt,
    };
  } catch {
    return null;
  }
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text;
        }
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

function extractFirstImageDataUrl(message: OpenRouterMessage | undefined): string | null {
  const images = message?.images;
  if (Array.isArray(images) && images.length > 0) {
    for (const image of images) {
      const nestedUrl =
        image?.image_url?.url ||
        image?.imageUrl?.url ||
        (typeof image?.url === 'string' ? image.url : null);

      if (typeof nestedUrl === 'string' && nestedUrl.startsWith('data:image/')) {
        return nestedUrl;
      }
    }
  }

  if (Array.isArray(message?.content)) {
    for (const item of message.content) {
      if (!item || typeof item !== 'object') continue;
      const block = item as { image_url?: { url?: unknown }; imageUrl?: { url?: unknown } };
      const nestedUrl =
        (typeof block.image_url?.url === 'string' && block.image_url.url) ||
        (typeof block.imageUrl?.url === 'string' && block.imageUrl.url) ||
        null;
      if (typeof nestedUrl === 'string' && nestedUrl.startsWith('data:image/')) {
        return nestedUrl;
      }
    }
  }

  return null;
}

function parseMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? 'image/png';
}

function toImageDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

function parseImageBytesFromDataUrl(dataUrl: string): Uint8Array {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match?.[1]) {
    throw new Error('Stored image data is invalid.');
  }
  return new Uint8Array(Buffer.from(match[1], 'base64'));
}

function formatContentPreview(content: unknown): string | null {
  const text = extractTextContent(content);
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 200 ? `${normalized.slice(0, 200)}...` : normalized;
}

function substituteTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, value), template);
}

function mapMachineImage(row: {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: Date;
  updatedAt: Date;
}): ImageGenerationMachineImageSummary {
  return {
    id: row.id,
    label: row.label,
    fileName: row.fileName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapImageGenerationMachine(row: {
  id: string;
  title: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  images?: Array<{
    id: string;
    label: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
}): ImageGenerationMachineSummary {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    images: (row.images ?? []).map(mapMachineImage),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapKBAsset(row: {
  id: string;
  category: string;
  label: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: Date;
  updatedAt: Date;
}): KBAssetSummary {
  return {
    id: row.id,
    category: row.category === 'logo' ? 'logo' : 'post',
    label: row.label,
    fileName: row.fileName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapKBColor(row: {
  id: string;
  name: string;
  hex: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}): KBColorEntry {
  return {
    id: row.id,
    name: row.name,
    hex: row.hex,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatSettingsResponse(input: {
  row: {
    id: string;
    provider: string;
    promptsJson: string;
    createdAt: Date;
    updatedAt: Date;
  };
  chatModelStatus: ImageStudioModelStatus;
  imageModelStatus: ImageStudioModelStatus;
  videoModelStatus: ImageStudioModelStatus;
}): ImageStudioSettingsResponse {
  return {
    id: input.row.id,
    provider: IMAGE_STUDIO_PROVIDER,
    chatModel: getConfiguredChatModel(),
    imageModel: getConfiguredImageModel(),
    videoModel: getConfiguredVideoModel(),
    prompts: parsePromptsJson(input.row.promptsJson),
    createdAt: input.row.createdAt.toISOString(),
    updatedAt: input.row.updatedAt.toISOString(),
    configured: isImageGenerationConfigured(),
    hint: isImageGenerationConfigured()
      ? undefined
      : 'Set IMAGE_OPENROUTER_API_KEY in your .env to enable Image Studio chat and image generation.',
    promptUsage: { ...IMAGE_STUDIO_PROMPT_USAGE },
    chatModelStatus: input.chatModelStatus,
    imageModelStatus: input.imageModelStatus,
    videoModelStatus: input.videoModelStatus,
  };
}

function buildRuntimeSettings(row: { promptsJson: string }) {
  return {
    prompts: parsePromptsJson(row.promptsJson),
    chatModel: getConfiguredChatModel(),
    imageModel: getConfiguredImageModel(),
    videoModel: getConfiguredVideoModel(),
  };
}

function buildMachineContext(machine: ImageGenerationMachineSummary, template: string): string {
  const noteSummary = machine.notes.trim() || 'No machine notes have been added yet.';
  const imageList =
    machine.images.length > 0
      ? machine.images.map((image, index) => `- Attached machine reference image ${index + 1}: ${image.label} (${image.fileName})`).join('\n')
      : '- No machine reference images uploaded yet';

  return substituteTemplate(template, {
    machine_name: machine.title,
    machine_family: 'Image Studio machine reference record',
    machine_positioning: 'Treat this as the selected machine to match during generation.',
    machine_summary: noteSummary,
    machine_source_status: `${machine.images.length} machine reference image(s) uploaded`,
    machine_health: machine.notes.trim() ? 'Machine notes available' : 'Waiting for more machine notes',
    machine_key_facts: noteSummary,
    machine_prompt_chips: imageList,
    machine_visual_rules:
      [
        '- Treat the uploaded machine reference images as attached visual inputs and the authoritative source for the machine',
        '- Match the selected machine shape, proportions, panels, rollers, feed path, controls, color blocking, materials, branding accents, and output handling',
        '- Do not generate competitor machines, generic industrial printers, fictional hardware, unsupported attachments, or unsupported machine claims',
      ].join('\n'),
  });
}

function buildImageTypeContext(imageType: ImageTypeValue, template: string): string {
  const variant = IMAGE_TYPE_VARIANTS[imageType];
  return substituteTemplate(template, {
    image_type_label: variant.label,
    image_type_aspect_intent: variant.aspectIntent,
  });
}

function buildKbContext(kb: ImageStudioKBResponse, template: string): string {
  const logos = kb.logos.length > 0 ? kb.logos.map((asset) => `- ${asset.label}`).join('\n') : '- No logos uploaded';
  const posts =
    kb.posts.length > 0 ? kb.posts.map((asset) => `- ${asset.label}`).join('\n') : '- No post references uploaded';
  const colors =
    kb.colors.length > 0
      ? kb.colors.map((color) => `- ${color.name}: ${color.hex}${color.notes ? ` (${color.notes})` : ''}`).join('\n')
      : '- No brand colors saved';

  return substituteTemplate(template, {
    kb_logos: logos,
    kb_posts: posts,
    kb_colors: colors,
  });
}

function buildLinkedInAdSystemPrompt(input: {
  template: string;
  machine: ImageGenerationMachineSummary | null;
}): string {
  return substituteTemplate(input.template, {
    COMPANY_NAME: 'Arrow Systems',
    MACHINE_NAME: input.machine?.title ?? 'the selected machine',
    BROCHURE_SUMMARY: input.machine?.notes.trim() || 'Use the selected machine notes and image references.',
    USER_REQUEST: 'Use the user message in this request as the rep request and creative direction.',
  });
}

function buildConversationContext(messages: ImageConversationMessage[]): string {
  if (!messages.length) return 'No prior conversation.';
  return messages
    .slice(-10)
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.text.trim()}`)
    .join('\n');
}

function buildSharedContext(input: {
  prompt: string;
  machineContext: string;
  imageTypeContext: string;
  kbContext: string;
  conversationContext: string;
}): string {
  return [
    'Recent conversation:',
    input.conversationContext,
    '',
    'Arrow Systems KB context:',
    input.kbContext,
    '',
    'Selected machine context:',
    input.machineContext,
    '',
    'Selected image type context:',
    input.imageTypeContext,
    '',
    'Newest user request:',
    input.prompt,
  ].join('\n');
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Model returned an empty response.');
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === '{') {
      if (depth === 0) startIndex = index;
      depth += 1;
      continue;
    }
    if (character === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && startIndex >= 0) return trimmed.slice(startIndex, index + 1);
    }
  }

  throw new Error('Model did not return a parsable JSON object.');
}

function parseJsonObject(raw: string, errorMessage: string): unknown {
  try {
    return JSON.parse(extractJsonObject(raw));
  } catch {
    throw new Error(errorMessage);
  }
}

function parseRoutingResult(raw: string): RoutingResult {
  const parsed = parseJsonObject(raw, 'Intent router returned invalid JSON.') as {
    mode?: unknown;
    reason?: unknown;
  };
  if ((parsed.mode !== 'help' && parsed.mode !== 'generate') || typeof parsed.reason !== 'string' || !parsed.reason.trim()) {
    throw new Error('Intent router returned an invalid mode.');
  }
  return { mode: parsed.mode, reason: parsed.reason.trim() };
}

function parseImagePlan(raw: string): ImageBrief {
  const parsed = parseJsonObject(raw, 'Image planning returned invalid JSON.') as Record<string, unknown>;
  const toStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
  if (
    typeof parsed.title !== 'string' ||
    typeof parsed.summary !== 'string' ||
    typeof parsed.creativeDirection !== 'string' ||
    typeof parsed.composition !== 'string' ||
    typeof parsed.aspectIntent !== 'string'
  ) {
    throw new Error('Image planning response is missing required fields.');
  }
  return {
    title: parsed.title.trim(),
    summary: parsed.summary.trim(),
    creativeDirection: parsed.creativeDirection.trim(),
    composition: parsed.composition.trim(),
    mustInclude: toStringArray(parsed.mustInclude),
    avoid: toStringArray(parsed.avoid),
    aspectIntent: parsed.aspectIntent.trim(),
  };
}

function parsePromptWriterResult(raw: string): PromptWriterResult {
  const parsed = parseJsonObject(raw, 'Image prompt writer returned invalid JSON.') as {
    finalPrompt?: unknown;
    alt?: unknown;
  };
  if (
    typeof parsed.finalPrompt !== 'string' ||
    !parsed.finalPrompt.trim() ||
    typeof parsed.alt !== 'string' ||
    !parsed.alt.trim()
  ) {
    throw new Error('Image prompt writer response is missing required fields.');
  }
  return {
    finalPrompt: parsed.finalPrompt.trim(),
    alt: parsed.alt.trim(),
  };
}

function parseMachineReferenceResult(raw: string): MachineReferenceResult {
  const parsed = parseJsonObject(raw, 'Machine reference extraction returned invalid JSON.') as Record<string, unknown>;
  const toStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
  if (typeof parsed.appearanceSummary !== 'string' || !parsed.appearanceSummary.trim()) {
    throw new Error('Machine reference extraction is missing the appearance summary.');
  }
  return {
    appearanceSummary: parsed.appearanceSummary.trim(),
    mustMatch: toStringArray(parsed.mustMatch),
    mustAvoid: toStringArray(parsed.mustAvoid),
    outputHandling: toStringArray(parsed.outputHandling),
  };
}

async function callOpenRouterText(input: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  imageAttachments?: ImageAttachment[];
}): Promise<string> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter is not configured. Set IMAGE_OPENROUTER_API_KEY to enable image orchestration.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEXT_REQUEST_TIMEOUT_MS);

  try {
    const userContent: string | OpenRouterInputContent[] =
      input.imageAttachments && input.imageAttachments.length > 0
        ? [
            { type: 'text', text: input.userPrompt },
            ...input.imageAttachments.map((attachment) => ({
              type: 'image_url' as const,
              image_url: { url: attachment.dataUrl },
            })),
          ]
        : input.userPrompt;

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://arrsys.com',
        'X-Title': 'Arrow Hub Image Studio',
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as OpenRouterResponsePayload;
    if (!response.ok) {
      throw new Error(`OpenRouter ${response.status}: ${payload.error?.message || 'Request failed'}`);
    }
    if (payload.error?.message) throw new Error(payload.error.message);
    const content = extractTextContent(payload.choices?.[0]?.message?.content);
    if (!content) throw new Error('OpenRouter returned an empty text response.');
    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenRouter request failed';
    if (message.toLowerCase().includes('abort')) {
      throw new Error('OpenRouter request timed out while processing the prompt.');
    }
    throw error instanceof Error ? error : new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenRouterJson<T>(input: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  imageAttachments?: ImageAttachment[];
  parse: (raw: string) => T;
  contractLabel: string;
}): Promise<T> {
  const tryParse = async (systemPrompt: string, userPrompt: string): Promise<T> => {
    const raw = await callOpenRouterText({
      model: input.model,
      systemPrompt,
      userPrompt,
      imageAttachments: input.imageAttachments,
    });
    return input.parse(raw);
  };

  try {
    return await tryParse(input.systemPrompt, input.userPrompt);
  } catch (error) {
    try {
      return await tryParse(
        [input.systemPrompt, '', 'Return only one valid JSON object with no markdown fences.'].join('\n'),
        [input.userPrompt, '', `Your last response did not satisfy the ${input.contractLabel} contract.`].join('\n'),
      );
    } catch {
      throw error instanceof Error ? error : new Error(`${input.contractLabel} returned invalid JSON.`);
    }
  }
}

async function callOpenRouterImage(input: {
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  imageAttachments?: ImageAttachment[];
}): Promise<GeneratedImage> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter is not configured. Set IMAGE_OPENROUTER_API_KEY to enable image generation.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_REQUEST_TIMEOUT_MS);

  try {
    const content: OpenRouterInputContent[] = [{ type: 'text', text: input.userPrompt }];
    for (const attachment of input.imageAttachments ?? []) {
      content.push({
        type: 'image_url',
        image_url: { url: attachment.dataUrl },
      });
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://arrsys.com',
        'X-Title': 'Arrow Hub Image Studio',
      },
      body: JSON.stringify({
        model: input.model,
        stream: false,
        modalities: ['image', 'text'],
        messages: [
          ...(input.systemPrompt ? [{ role: 'system', content: input.systemPrompt }] : []),
          { role: 'user', content },
        ],
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as OpenRouterResponsePayload;
    if (!response.ok) {
      const detail = payload.error?.message || 'Image generation failed';
      if (detail.toLowerCase().includes('not available')) {
        throw new Error(`The configured image model (${input.model}) is not currently available on OpenRouter.`);
      }
      throw new Error(`OpenRouter ${response.status}: ${detail}`);
    }
    if (payload.error?.message) throw new Error(payload.error.message);
    const message = payload.choices?.[0]?.message;
    const dataUrl = extractFirstImageDataUrl(message);
    if (!dataUrl) {
      const preview = formatContentPreview(message?.content);
      throw new Error(
        preview
          ? `The image model (${input.model}) returned text but no image: ${preview}`
          : `The image model (${input.model}) did not return an image.`,
      );
    }
    return {
      dataUrl,
      mimeType: parseMimeTypeFromDataUrl(dataUrl),
      alt: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenRouter image request failed';
    if (message.toLowerCase().includes('abort')) {
      throw new Error(`OpenRouter image generation timed out for ${input.model}. This model may be slow or unavailable right now.`);
    }
    throw error instanceof Error ? error : new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

async function getOpenRouterModelStatus(input: {
  model: string;
  outputModality: 'text' | 'image';
}): Promise<ImageStudioModelStatus> {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(`${OPENROUTER_MODELS_API_URL}?output_modalities=${encodeURIComponent(input.outputModality)}`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = (await response.json().catch(() => ({}))) as { data?: Array<Record<string, unknown>> };
    if (!response.ok || !Array.isArray(payload.data)) {
      return { state: 'unknown', detail: 'Could not verify model availability right now.', checkedAt };
    }
    const found = payload.data.some((entry) => {
      const id = (typeof entry.id === 'string' && entry.id) || (typeof entry.slug === 'string' && entry.slug) || '';
      return id === input.model;
    });
    return found
      ? { state: 'available', detail: 'Listed in the OpenRouter model catalog.', checkedAt }
      : { state: 'unavailable', detail: 'Not currently listed in the OpenRouter model catalog.', checkedAt };
  } catch {
    return { state: 'unknown', detail: 'Could not verify model availability right now.', checkedAt };
  } finally {
    clearTimeout(timeout);
  }
}

async function getOpenRouterVideoModelStatus(model: string): Promise<ImageStudioModelStatus> {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_VIDEO_MODELS_API_URL, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = (await response.json().catch(() => ({}))) as { data?: Array<Record<string, unknown>> };
    if (!response.ok || !Array.isArray(payload.data)) {
      return { state: 'unknown', detail: 'Could not verify video model availability right now.', checkedAt };
    }
    const found = payload.data.some((entry) => {
      const id = (typeof entry.id === 'string' && entry.id) || (typeof entry.canonical_slug === 'string' && entry.canonical_slug) || '';
      return id === model;
    });
    return found
      ? { state: 'available', detail: 'Listed in the OpenRouter video model catalog.', checkedAt }
      : { state: 'unavailable', detail: 'Not currently listed in the OpenRouter video model catalog.', checkedAt };
  } catch {
    return { state: 'unknown', detail: 'Could not verify video model availability right now.', checkedAt };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveModelStatuses(): Promise<{
  chatModelStatus: ImageStudioModelStatus;
  imageModelStatus: ImageStudioModelStatus;
  videoModelStatus: ImageStudioModelStatus;
}> {
  const chatModel = getConfiguredChatModel();
  const imageModel = getConfiguredImageModel();
  const videoModel = getConfiguredVideoModel();
  const now = Date.now();

  if (
    cachedModelStatuses &&
    cachedModelStatuses.expiresAt > now &&
    cachedModelStatuses.chatModel === chatModel &&
    cachedModelStatuses.imageModel === imageModel &&
    cachedModelStatuses.videoModel === videoModel
  ) {
    return cachedModelStatuses.value;
  }

  const [chatModelStatus, imageModelStatus, videoModelStatus] = await Promise.all([
    getOpenRouterModelStatus({ model: chatModel, outputModality: 'text' }),
    getOpenRouterModelStatus({ model: imageModel, outputModality: 'image' }),
    getOpenRouterVideoModelStatus(videoModel),
  ]);

  const value = { chatModelStatus, imageModelStatus, videoModelStatus };
  cachedModelStatuses = {
    value,
    expiresAt: now + MODEL_STATUS_CACHE_TTL_MS,
    chatModel,
    imageModel,
    videoModel,
  };
  return value;
}

function normalizeHex(hex: string): string {
  const trimmed = hex.trim().toUpperCase();
  if (!/^#?[0-9A-F]{6}$/.test(trimmed)) {
    throw new Error('Color hex must be a 6-digit hex value.');
  }
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function assertImageMimeType(mimeType: string): string {
  if (!mimeType.startsWith('image/')) {
    throw new Error('Only image uploads are supported for this action.');
  }
  return mimeType;
}

async function getMachineImageAttachments(machineId: string, limit = 4): Promise<ImageAttachment[]> {
  const rows = await prisma.imageGenerationMachineImage.findMany({
    where: { machineId },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      label: true,
      mimeType: true,
      imageBytes: true,
    },
  });
  return rows.map((row) => ({
    label: row.label,
    dataUrl: toImageDataUrl(new Uint8Array(row.imageBytes), row.mimeType),
  }));
}

async function getKbImageAttachments(category: 'logo' | 'post', limit: number): Promise<ImageAttachment[]> {
  const rows = await prisma.imageGenerationKBAsset.findMany({
    where: { category },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      label: true,
      mimeType: true,
      imageBytes: true,
    },
  });
  return rows.map((row) => ({
    label: row.label,
    dataUrl: toImageDataUrl(new Uint8Array(row.imageBytes), row.mimeType),
  }));
}

function buildImageAttachments(input: {
  machineAttachments: ImageAttachment[];
  logoAttachments: ImageAttachment[];
  postAttachments: ImageAttachment[];
}): ImageAttachment[] {
  return [
    ...input.machineAttachments.map((item) => ({ ...item, label: `Machine reference: ${item.label}` })),
    ...input.postAttachments.map((item) => ({ ...item, label: `Brand post reference: ${item.label}` })),
    ...input.logoAttachments.map((item) => ({ ...item, label: `Brand logo reference: ${item.label}` })),
  ];
}

async function extractMachineReference(input: {
  machine: ImageGenerationMachineSummary;
  prompts: ImageStudioPromptSet;
  machineAttachments: ImageAttachment[];
}): Promise<MachineReferenceResult | null> {
  try {
    return await callOpenRouterJson({
      model: getConfiguredChatModel(),
      systemPrompt: [input.prompts.assistantGoalPrompt, '', input.prompts.machineReferenceExtractionPrompt].join('\n'),
      userPrompt: [
        `Machine title: ${input.machine.title}`,
        `Machine notes: ${input.machine.notes || 'No notes provided.'}`,
        'Authoritative uploaded machine reference images are attached to this message. Extract only visual facts supported by those attached images and notes.',
        'Uploaded machine image labels:',
        input.machine.images.length > 0
          ? input.machine.images.map((image, index) => `- Attached reference ${index + 1}: ${image.label} (${image.fileName})`).join('\n')
          : '- None',
      ].join('\n'),
      imageAttachments: input.machineAttachments,
      parse: parseMachineReferenceResult,
      contractLabel: 'machine reference extractor',
    });
  } catch {
    return null;
  }
}

async function routeUserIntent(input: {
  sharedContext: string;
  prompts: ImageStudioPromptSet;
}): Promise<RoutingResult> {
  return callOpenRouterJson({
    model: getConfiguredChatModel(),
    systemPrompt: [input.prompts.assistantGoalPrompt, '', input.prompts.intentRoutingPrompt].join('\n'),
    userPrompt: input.sharedContext,
    parse: parseRoutingResult,
    contractLabel: 'intent router',
  });
}

async function buildHelpReply(input: {
  sharedContext: string;
  prompts: ImageStudioPromptSet;
}): Promise<string> {
  return callOpenRouterText({
    model: getConfiguredChatModel(),
    systemPrompt: [input.prompts.assistantGoalPrompt, '', input.prompts.helpResponsePrompt].join('\n'),
    userPrompt: input.sharedContext,
  });
}

async function buildImagePlan(input: {
  sharedContext: string;
  prompts: ImageStudioPromptSet;
}): Promise<ImageBrief> {
  return callOpenRouterJson({
    model: getConfiguredChatModel(),
    systemPrompt: [input.prompts.assistantGoalPrompt, '', input.prompts.imagePlanningPrompt].join('\n'),
    userPrompt: input.sharedContext,
    parse: parseImagePlan,
    contractLabel: 'image planner',
  });
}

async function buildFinalImagePrompt(input: {
  prompt: string;
  plan: ImageBrief;
  sharedContext: string;
  prompts: ImageStudioPromptSet;
}): Promise<PromptWriterResult> {
  return callOpenRouterJson({
    model: getConfiguredChatModel(),
    systemPrompt: [input.prompts.assistantGoalPrompt, '', input.prompts.imagePromptWriterPrompt].join('\n'),
    userPrompt: [
      input.sharedContext,
      '',
      'Image plan JSON:',
      JSON.stringify(input.plan, null, 2),
      '',
      'Original user prompt:',
      input.prompt,
    ].join('\n'),
    parse: parsePromptWriterResult,
    contractLabel: 'image prompt writer',
  });
}

async function buildImageResultSummary(input: {
  prompt: string;
  plan: ImageBrief;
  writer: PromptWriterResult;
  prompts: ImageStudioPromptSet;
  sharedContext: string;
}): Promise<string> {
  return callOpenRouterText({
    model: getConfiguredChatModel(),
    systemPrompt: [input.prompts.assistantGoalPrompt, '', input.prompts.imageResultSummaryPrompt].join('\n'),
    userPrompt: [
      input.sharedContext,
      '',
      'Image plan JSON:',
      JSON.stringify(input.plan, null, 2),
      '',
      'Final image prompt:',
      input.writer.finalPrompt,
      '',
      'Original user prompt:',
      input.prompt,
    ].join('\n'),
  });
}

function buildMachineAccuracySafetyBlock(input: {
  machine: ImageGenerationMachineSummary | null;
  machineReference: MachineReferenceResult | null;
  machineAttachments: ImageAttachment[];
}): string {
  if (!input.machine || input.machineAttachments.length === 0) {
    return [
      'Runtime machine-accuracy guardrail:',
      '- No selected machine reference images are attached. Do not invent or imply a specific Arrow Systems machine unless the user supplied enough detail.',
    ].join('\n');
  }

  const sections = [
    'Runtime machine-accuracy guardrail:',
    `- The selected machine is "${input.machine.title}".`,
    `- ${input.machineAttachments.length} authoritative machine reference image(s) are attached first in this request.`,
    '- The machine in the generated image must match those attached reference images before satisfying creative direction, layout style, copy, environment, or brand treatment.',
    '- Preserve visible machine shape, proportions, color blocking, panels, rollers, feed path, output path, controls, materials, branding accents, and supported outputs.',
    '- Do not replace it with a generic printer, competitor machine, invented machine, alternate model, fictional attachment, unsupported colorway, or unsupported hardware capability.',
  ];

  if (input.machineReference) {
    sections.push('', 'Extracted machine facts to enforce:', input.machineReference.appearanceSummary);
    if (input.machineReference.mustMatch.length > 0) {
      sections.push(...input.machineReference.mustMatch.map((item) => `- Must match: ${item}`));
    }
    if (input.machineReference.mustAvoid.length > 0) {
      sections.push(...input.machineReference.mustAvoid.map((item) => `- Must avoid: ${item}`));
    }
  }

  return sections.join('\n');
}

function appendMachineAccuracySafetyBlock(input: {
  finalPrompt: string;
  machine: ImageGenerationMachineSummary | null;
  machineReference: MachineReferenceResult | null;
  machineAttachments: ImageAttachment[];
}): string {
  return [
    input.finalPrompt,
    '',
    buildMachineAccuracySafetyBlock({
      machine: input.machine,
      machineReference: input.machineReference,
      machineAttachments: input.machineAttachments,
    }),
  ].join('\n');
}

function buildLinkedInAdUserPrompt(input: {
  userPrompt: string;
  machine: ImageGenerationMachineSummary | null;
  machineReference: MachineReferenceResult | null;
  kb: ImageStudioKBResponse;
  machineAttachments: ImageAttachment[];
}): string {
  const machineLabel = input.machine?.title ?? 'the selected machine';
  const brandColors =
    input.kb.colors.length > 0
      ? input.kb.colors.map((color) => `${color.name} ${color.hex}`).join(', ')
      : 'Use Arrow Systems brand colors from the KB when available.';
  const sections = [
    'Create a finished LinkedIn ad poster, not just a machine photo.',
    `User request: ${input.userPrompt}`,
    '',
    'Important:',
    `- ${input.machineAttachments.length} authoritative machine reference image(s) are attached first in this request.`,
    '- Match the selected machine using those uploaded machine reference images and machine notes.',
    '- Exact machine fidelity is the top priority. Creative direction, ad copy, and layout must adapt around the real machine, not redesign it.',
    '- Use the Arrow Systems KB as the default brand source for logos, color treatment, and layout direction.',
    '- Build a real ad composition with headline hierarchy, supporting copy, feature callouts, badges, and CTA energy.',
    '- Include strong in-image marketing text and ad structure by default.',
    `- The machine in the final image must visually match ${machineLabel}.`,
    `- Brand colors: ${brandColors}`,
  ];

  if (input.machineReference) {
    sections.push('', 'Machine appearance summary:', input.machineReference.appearanceSummary);
    if (input.machineReference.mustMatch.length > 0) {
      sections.push('', 'Must match:', ...input.machineReference.mustMatch.map((item) => `- ${item}`));
    }
    if (input.machineReference.outputHandling.length > 0) {
      sections.push('', 'Output/material clues:', ...input.machineReference.outputHandling.map((item) => `- ${item}`));
    }
    if (input.machineReference.mustAvoid.length > 0) {
      sections.push('', 'Must avoid:', ...input.machineReference.mustAvoid.map((item) => `- ${item}`));
    }
  }

  if (input.kb.posts.length > 0) {
    sections.push('', 'Brand post references:', ...input.kb.posts.slice(0, 3).map((asset) => `- ${asset.label}`));
  }

  if (input.kb.logos.length > 0) {
    sections.push('', 'Logos available:', ...input.kb.logos.slice(0, 2).map((asset) => `- ${asset.label}`));
  }

  return sections.join('\n');
}

function mapImageGenerationRun(row: {
  id: string;
  userPrompt: string;
  assistantReply: string;
  plannerJson: string;
  machineId: string | null;
  imageType: string;
  imageDataUrl?: string;
  imageMimeType: string;
  imageAlt: string;
  createdAt: Date;
}, machineTitle?: string | null, options?: { includeDataUrl?: boolean }): ImageGenerationHistoryRun {
  const planner = parsePlannerJson(row.plannerJson);
  return {
    id: row.id,
    userPrompt: row.userPrompt,
    replyText: row.assistantReply,
    planner: planner
      ? {
          finalPrompt: planner.finalPrompt,
          title: planner.title,
          summary: planner.summary,
        }
      : undefined,
    image: {
      ...(options?.includeDataUrl ? { dataUrl: row.imageDataUrl } : {}),
      url: `/api/image-generation/history/${row.id}/image`,
      mimeType: row.imageMimeType,
      alt: row.imageAlt,
    },
    machineId: row.machineId,
    machineTitle: machineTitle ?? null,
    imageType: isImageTypeValue(row.imageType) ? row.imageType : 'linkedin_ad',
    createdAt: row.createdAt.toISOString(),
  };
}

export async function ensureImageStudioSettingsRow() {
  await ensureImageGenerationSchema();
  const existing = await prisma.imageGenerationSettings.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.imageGenerationSettings.create({
    data: {
      id: 'default',
      provider: IMAGE_STUDIO_PROVIDER,
      orchestratorModel: getConfiguredChatModel(),
      promptsJson: serializePrompts(DEFAULT_IMAGE_STUDIO_PROMPTS),
    },
  });
}

export async function getImageStudioSettingsResponse(): Promise<ImageStudioSettingsResponse> {
  const row = await ensureImageStudioSettingsRow();
  const { chatModelStatus, imageModelStatus, videoModelStatus } = await resolveModelStatuses();
  return formatSettingsResponse({ row, chatModelStatus, imageModelStatus, videoModelStatus });
}

export async function updateImageStudioSettings(patch: ImageStudioSettingsUpdate): Promise<ImageStudioSettingsResponse> {
  await ensureImageGenerationSchema();
  const current = await ensureImageStudioSettingsRow();
  const currentPrompts = parsePromptsJson(current.promptsJson);
  const nextPrompts = normalizePromptSet({ ...currentPrompts, ...(patch.prompts ?? {}) });
  const updated = await prisma.imageGenerationSettings.update({
    where: { id: current.id },
    data: {
      promptsJson: serializePrompts(nextPrompts),
      provider: IMAGE_STUDIO_PROVIDER,
      orchestratorModel: getConfiguredChatModel(),
    },
  });
  const { chatModelStatus, imageModelStatus, videoModelStatus } = await resolveModelStatuses();
  return formatSettingsResponse({ row: updated, chatModelStatus, imageModelStatus, videoModelStatus });
}

export async function getImageGenerationMachines(): Promise<ImageGenerationMachineSummary[]> {
  await ensureImageGenerationSchema();
  const rows = await prisma.imageGenerationMachine.findMany({
    include: {
      images: {
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
  });
  return rows.map(mapImageGenerationMachine);
}

export async function getImageGenerationMachineById(id: string): Promise<ImageGenerationMachineSummary | null> {
  await ensureImageGenerationSchema();
  const row = await prisma.imageGenerationMachine.findUnique({
    where: { id },
    include: {
      images: {
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });
  return row ? mapImageGenerationMachine(row) : null;
}

export async function createImageGenerationMachine(input: {
  title: string;
  notes: string;
  images: Array<{
    label?: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    bytes: Uint8Array;
  }>;
}): Promise<ImageGenerationMachineSummary> {
  await ensureImageGenerationSchema();
  const title = input.title.trim();
  if (!title) throw new Error('Machine title is required.');
  if (input.images.length === 0) throw new Error('At least one machine image is required.');

  const created = await prisma.imageGenerationMachine.create({
    data: {
      title,
      notes: input.notes.trim(),
      brochureFilename: '',
      brochureMimeType: 'application/octet-stream',
      brochureByteSize: 0,
      brochurePdf: Buffer.alloc(0),
      images: {
        create: input.images.map((image, index) => {
          assertImageMimeType(image.mimeType);
          if (image.byteSize <= 0) throw new Error('Machine image is empty.');
          if (image.byteSize > MAX_IMAGE_BYTES) throw new Error('Machine image is too large. Keep uploads under 15 MB.');
          return {
            id: generateId('mimg'),
            label: image.label?.trim() || `Reference image ${index + 1}`,
            fileName: image.fileName,
            mimeType: image.mimeType,
            byteSize: image.byteSize,
            imageBytes: Buffer.from(image.bytes),
          };
        }),
      },
    },
    include: {
      images: {
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });

  return mapImageGenerationMachine(created);
}

export async function updateImageGenerationMachine(input: {
  id: string;
  title: string;
  notes: string;
}): Promise<ImageGenerationMachineSummary> {
  await ensureImageGenerationSchema();
  const title = input.title.trim();
  if (!title) throw new Error('Machine title is required.');
  const updated = await prisma.imageGenerationMachine.update({
    where: { id: input.id },
    data: {
      title,
      notes: input.notes.trim(),
    },
    include: {
      images: {
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });
  return mapImageGenerationMachine(updated);
}

export async function addImageGenerationMachineImages(input: {
  machineId: string;
  files: Array<{
    label?: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    bytes: Uint8Array;
  }>;
}): Promise<ImageGenerationMachineSummary> {
  await ensureImageGenerationSchema();
  if (input.files.length === 0) throw new Error('At least one machine image is required.');
  await prisma.$transaction(
    input.files.map((file, index) => {
      assertImageMimeType(file.mimeType);
      if (file.byteSize <= 0) throw new Error('Machine image is empty.');
      if (file.byteSize > MAX_IMAGE_BYTES) throw new Error('Machine image is too large. Keep uploads under 15 MB.');
      return prisma.imageGenerationMachineImage.create({
        data: {
          id: generateId('mimg'),
          machineId: input.machineId,
          label: file.label?.trim() || `Reference image ${index + 1}`,
          fileName: file.fileName,
          mimeType: file.mimeType,
          byteSize: file.byteSize,
          imageBytes: Buffer.from(file.bytes),
        },
      });
    }),
  );
  const machine = await getImageGenerationMachineById(input.machineId);
  if (!machine) throw new Error('Selected machine was not found.');
  return machine;
}

export async function getImageGenerationMachineImage(imageId: string): Promise<{
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
} | null> {
  await ensureImageGenerationSchema();
  const row = await prisma.imageGenerationMachineImage.findUnique({
    where: { id: imageId },
    select: {
      fileName: true,
      mimeType: true,
      imageBytes: true,
    },
  });
  if (!row) return null;
  return {
    fileName: row.fileName,
    mimeType: row.mimeType,
    bytes: new Uint8Array(row.imageBytes),
  };
}

export async function getImageStudioKBResponse(): Promise<ImageStudioKBResponse> {
  await ensureImageGenerationSchema();
  const [assets, colors] = await Promise.all([
    prisma.imageGenerationKBAsset.findMany({
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.imageGenerationKBColor.findMany({
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  return {
    logos: assets.filter((asset) => asset.category === 'logo').map(mapKBAsset),
    posts: assets.filter((asset) => asset.category === 'post').map(mapKBAsset),
    colors: colors.map(mapKBColor),
  };
}

export async function createImageStudioKBAsset(input: {
  category: 'logo' | 'post';
  label: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  bytes: Uint8Array;
}): Promise<KBAssetSummary> {
  await ensureImageGenerationSchema();
  const label = input.label.trim();
  if (!label) throw new Error('Asset label is required.');
  assertImageMimeType(input.mimeType);
  if (input.byteSize <= 0) throw new Error('Asset file is empty.');
  if (input.byteSize > MAX_IMAGE_BYTES) throw new Error('KB asset is too large. Keep uploads under 15 MB.');
  const created = await prisma.imageGenerationKBAsset.create({
    data: {
      id: generateId(input.category),
      category: input.category,
      label,
      fileName: input.fileName,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      imageBytes: Buffer.from(input.bytes),
    },
  });
  return mapKBAsset(created);
}

export async function getImageStudioKBAsset(assetId: string): Promise<{
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
} | null> {
  await ensureImageGenerationSchema();
  const row = await prisma.imageGenerationKBAsset.findUnique({
    where: { id: assetId },
    select: {
      fileName: true,
      mimeType: true,
      imageBytes: true,
    },
  });
  if (!row) return null;
  return {
    fileName: row.fileName,
    mimeType: row.mimeType,
    bytes: new Uint8Array(row.imageBytes),
  };
}

export async function createImageStudioKBColor(input: {
  name: string;
  hex: string;
  notes: string;
}): Promise<KBColorEntry> {
  await ensureImageGenerationSchema();
  const name = input.name.trim();
  if (!name) throw new Error('Color name is required.');
  const created = await prisma.imageGenerationKBColor.create({
    data: {
      id: generateId('kbcolor'),
      name,
      hex: normalizeHex(input.hex),
      notes: input.notes.trim(),
    },
  });
  return mapKBColor(created);
}

export async function updateImageStudioKBColor(input: {
  id: string;
  name: string;
  hex: string;
  notes: string;
}): Promise<KBColorEntry> {
  await ensureImageGenerationSchema();
  const name = input.name.trim();
  if (!name) throw new Error('Color name is required.');
  const updated = await prisma.imageGenerationKBColor.update({
    where: { id: input.id },
    data: {
      name,
      hex: normalizeHex(input.hex),
      notes: input.notes.trim(),
    },
  });
  return mapKBColor(updated);
}

export async function deleteImageStudioKBColor(id: string): Promise<void> {
  await ensureImageGenerationSchema();
  await prisma.imageGenerationKBColor.delete({ where: { id } });
}

async function persistImageGenerationRun(input: {
  userPrompt: string;
  replyText: string;
  planner: ImageBrief & { finalPrompt: string; alt: string };
  image: GeneratedImage;
  machineId?: string | null;
  imageType: ImageTypeValue;
}): Promise<ImageGenerationHistoryRun> {
  await ensureImageGenerationSchema();
  const created = await prisma.imageGenerationRun.create({
    data: {
      userPrompt: input.userPrompt,
      assistantReply: input.replyText,
      plannerJson: serializePlanner(input.planner),
      finalImagePrompt: input.planner.finalPrompt,
      chatModel: getConfiguredChatModel(),
      imageModel: getConfiguredImageModel(),
      machineId: input.machineId,
      imageType: input.imageType,
      imageDataUrl: input.image.dataUrl,
      imageMimeType: input.image.mimeType,
      imageAlt: input.image.alt,
    },
  });
  return mapImageGenerationRun(created, null, { includeDataUrl: true });
}

export async function getImageGenerationHistory(limit: number = HISTORY_LIMIT): Promise<ImageGenerationHistoryRun[]> {
  await ensureImageGenerationSchema();
  const rows = await prisma.imageGenerationRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      userPrompt: true,
      assistantReply: true,
      plannerJson: true,
      machineId: true,
      imageType: true,
      imageMimeType: true,
      imageAlt: true,
      createdAt: true,
    },
  });
  const machineIds = Array.from(new Set(rows.map((row) => row.machineId).filter((id): id is string => Boolean(id))));
  const machineRows = machineIds.length
    ? await prisma.imageGenerationMachine.findMany({
        where: { id: { in: machineIds } },
        select: { id: true, title: true },
      })
    : [];
  const machineTitleById = new Map(machineRows.map((row) => [row.id, row.title]));
  return rows.reverse().map((row) => mapImageGenerationRun(row, row.machineId ? machineTitleById.get(row.machineId) ?? null : null));
}

export async function getImageGenerationRunImage(runId: string): Promise<{
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
} | null> {
  await ensureImageGenerationSchema();
  const row = await prisma.imageGenerationRun.findUnique({
    where: { id: runId },
    select: {
      imageDataUrl: true,
      imageMimeType: true,
      imageType: true,
    },
  });
  if (!row?.imageDataUrl) return null;

  return {
    fileName: `${row.imageType || 'generated-image'}-${runId}.${row.imageMimeType === 'image/jpeg' ? 'jpg' : 'png'}`,
    mimeType: row.imageMimeType || parseMimeTypeFromDataUrl(row.imageDataUrl),
    bytes: parseImageBytesFromDataUrl(row.imageDataUrl),
  };
}

export function isImageTypeValue(value: unknown): value is ImageTypeValue {
  return typeof value === 'string' && value in IMAGE_TYPE_VARIANTS;
}

export async function createImageGenerationReply(input: {
  prompt: string;
  machineId?: string | null;
  imageType: ImageTypeValue;
  imageMode: boolean;
  messages: ImageConversationMessage[];
}): Promise<ImageGenerationChatResponse> {
  const settingsRow = await ensureImageStudioSettingsRow();
  const settings = buildRuntimeSettings(settingsRow);
  const [kb, machine] = await Promise.all([
    getImageStudioKBResponse(),
    input.machineId ? getImageGenerationMachineById(input.machineId) : Promise.resolve(null),
  ]);

  if (input.machineId && !machine) {
    throw new Error('Selected machine was not found.');
  }

  const machineContext = machine
    ? buildMachineContext(machine, settings.prompts.machineContextTemplate)
    : 'No machine selected. Use the Arrow Systems KB and the user request only.';
  const kbContext = buildKbContext(kb, settings.prompts.kbContextTemplate);
  const imageTypeContext = buildImageTypeContext(input.imageType, settings.prompts.imageTypeContextTemplate);
  const conversationContext = buildConversationContext(input.messages);
  const sharedContext = buildSharedContext({
    prompt: input.prompt,
    machineContext,
    imageTypeContext,
    kbContext,
    conversationContext,
  });

  if (!input.imageMode) {
    const replyText = await buildHelpReply({
      sharedContext: [
        sharedContext,
        '',
        'Current composer mode:',
        'Image mode is OFF.',
        'Answer as a text-only assistant. If the user is asking to generate an image, explain that they need to turn on the Image button first.',
      ].join('\n'),
      prompts: settings.prompts,
    });
    return { mode: 'help', replyText };
  }

  if (input.imageType === 'linkedin_ad' && !machine) {
    throw new Error(LINKEDIN_MACHINE_REFERENCE_REQUIRED_MESSAGE);
  }

  if (input.imageType === 'linkedin_ad' && (machine?.images.length ?? 0) === 0) {
    throw new Error(LINKEDIN_MACHINE_REFERENCE_REQUIRED_MESSAGE);
  }

  const routing = await routeUserIntent({
    sharedContext,
    prompts: settings.prompts,
  });

  if (routing.mode === 'help') {
    const replyText = await buildHelpReply({
      sharedContext,
      prompts: settings.prompts,
    });
    return { mode: 'help', replyText };
  }

  const imageModelStatus = await getOpenRouterModelStatus({
    model: settings.imageModel,
    outputModality: 'image',
  });
  if (imageModelStatus.state === 'unavailable') {
    throw new Error(`The configured image model (${settings.imageModel}) is not currently available on OpenRouter.`);
  }

  const [plan, machineAttachments, logoAttachments, postAttachments] = await Promise.all([
    buildImagePlan({ sharedContext, prompts: settings.prompts }),
    machine ? getMachineImageAttachments(machine.id, 4) : Promise.resolve([]),
    getKbImageAttachments('logo', 2),
    getKbImageAttachments('post', 3),
  ]);

  const machineReference =
    machine && machineAttachments.length > 0
      ? await extractMachineReference({ machine, prompts: settings.prompts, machineAttachments })
      : null;

  const rawWriter =
    input.imageType === 'linkedin_ad'
      ? {
          finalPrompt: buildLinkedInAdUserPrompt({
            userPrompt: input.prompt,
            machine,
            machineReference,
            kb,
            machineAttachments,
          }),
          alt: machine ? `${machine.title} LinkedIn ad` : 'LinkedIn ad',
        }
      : await buildFinalImagePrompt({
          prompt: input.prompt,
          plan,
          sharedContext,
          prompts: settings.prompts,
        });
  const writer = {
    ...rawWriter,
    finalPrompt: appendMachineAccuracySafetyBlock({
      finalPrompt: rawWriter.finalPrompt,
      machine,
      machineReference,
      machineAttachments,
    }),
  };

  const systemPrompt =
    input.imageType === 'linkedin_ad'
      ? buildLinkedInAdSystemPrompt({
          template: settings.prompts.linkedinAdImageSystemPrompt,
          machine,
        })
      : undefined;

  const generatedImage = await callOpenRouterImage({
    model: settings.imageModel,
    systemPrompt,
    userPrompt: writer.finalPrompt,
    imageAttachments: buildImageAttachments({
      machineAttachments,
      logoAttachments,
      postAttachments,
    }),
  });

  const replyText = await buildImageResultSummary({
    prompt: input.prompt,
    plan,
    writer,
    prompts: settings.prompts,
    sharedContext,
  });

  const persisted = await persistImageGenerationRun({
    userPrompt: input.prompt,
    replyText,
    planner: { ...plan, finalPrompt: writer.finalPrompt, alt: writer.alt },
    image: { ...generatedImage, alt: writer.alt },
    machineId: input.machineId ?? null,
    imageType: input.imageType,
  });

  return {
    mode: 'generate',
    replyText,
    image: persisted.image,
    generationId: persisted.id,
    planner: persisted.planner,
  };
}

export function getDefaultImageStudioPrompts(): ImageStudioPromptSet {
  return { ...DEFAULT_IMAGE_STUDIO_PROMPTS };
}

export function getPromptKeys(): ImageStudioPromptKey[] {
  return Object.keys(DEFAULT_IMAGE_STUDIO_PROMPTS) as ImageStudioPromptKey[];
}
