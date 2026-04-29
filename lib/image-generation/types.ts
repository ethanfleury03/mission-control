export type ImageTypeValue = 'linkedin_ad' | 'youtube_thumbnail' | 'blog_image';
export type VideoDurationSeconds = 4 | 6 | 8;
export type VideoGenerationStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type VideoSourceKind = 'upload' | 'generated';
export type ImageStudioGenerationMode = 'chat' | 'image' | 'video';

export type ImageStudioSettingsTab = 'prompts' | 'machines' | 'kb';

export type ImageStudioPromptKey =
  | 'assistantGoalPrompt'
  | 'intentRoutingPrompt'
  | 'helpResponsePrompt'
  | 'imagePlanningPrompt'
  | 'imagePromptWriterPrompt'
  | 'machineReferenceExtractionPrompt'
  | 'linkedinAdImageSystemPrompt'
  | 'machineContextTemplate'
  | 'imageTypeContextTemplate'
  | 'kbContextTemplate'
  | 'imageResultSummaryPrompt';

export type ImageStudioPromptSet = Record<ImageStudioPromptKey, string>;

export interface ImageStudioModelStatus {
  state: 'available' | 'unavailable' | 'unknown';
  detail: string;
  checkedAt?: string;
}

export interface KBAssetSummary {
  id: string;
  category: 'logo' | 'post';
  label: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface KBColorEntry {
  id: string;
  name: string;
  hex: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImageStudioKBResponse {
  logos: KBAssetSummary[];
  posts: KBAssetSummary[];
  colors: KBColorEntry[];
}

export interface ImageStudioSettings {
  id: string;
  provider: 'openrouter';
  chatModel: string;
  imageModel: string;
  videoModel: string;
  prompts: ImageStudioPromptSet;
  createdAt: string;
  updatedAt: string;
}

export interface ImageStudioSettingsResponse extends ImageStudioSettings {
  configured: boolean;
  hint?: string;
  promptUsage: Record<ImageStudioPromptKey, string>;
  chatModelStatus: ImageStudioModelStatus;
  imageModelStatus: ImageStudioModelStatus;
  videoModelStatus: ImageStudioModelStatus;
}

export interface ImageStudioSettingsUpdate {
  prompts?: Partial<ImageStudioPromptSet>;
}

export interface ImageGenerationMachineImageSummary {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImageGenerationMachineSummary {
  id: string;
  title: string;
  notes: string;
  images: ImageGenerationMachineImageSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface ImageBrief {
  title: string;
  summary: string;
  creativeDirection: string;
  composition: string;
  mustInclude: string[];
  avoid: string[];
  aspectIntent: string;
}

export interface GeneratedImage {
  dataUrl?: string;
  url?: string;
  mimeType: string;
  alt: string;
}

export interface ImagePlannerResult {
  finalPrompt: string;
  title: string;
  summary: string;
}

export interface ImageConversationMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ImageStudioAgentContext {
  activePage?: 'home' | 'generate' | 'gallery' | 'settings';
  galleryTab?: 'machines' | 'images' | 'videos';
  settingsTab?: ImageStudioSettingsTab;
  kbSection?: 'logos' | 'posts' | 'colors';
  generationMode: ImageStudioGenerationMode;
  imageType: ImageTypeValue;
  selectedMachineId?: string | null;
  selectedMachineTitle?: string | null;
  selectedMachineNotes?: string | null;
  selectedMachineImageCount?: number;
  machineCount?: number;
  kbSummary?: {
    logoCount: number;
    postCount: number;
    colorCount: number;
    colorNames: string[];
  };
  settingsSummary?: {
    configured: boolean;
    chatModel: string;
    imageModel: string;
    videoModel: string;
  };
  historySummary?: {
    imageCount: number;
    videoCount: number;
    recentImages: Array<{
      id: string;
      prompt: string;
      machineTitle?: string | null;
      imageType: ImageTypeValue;
      createdAt: string;
    }>;
    recentVideos: Array<{
      id: string;
      prompt: string;
      status: VideoGenerationStatus;
      durationSeconds: VideoDurationSeconds;
      sourceKind: VideoSourceKind;
      createdAt: string;
    }>;
  };
  videoSetup?: {
    sourceKind: VideoSourceKind;
    hasUploadSource: boolean;
    selectedSourceImageRunId?: string | null;
    hasGeneratedSource: boolean;
    selectedDuration?: VideoDurationSeconds | null;
  };
}

export interface ImageGenerationChatResponse {
  mode: 'help' | 'generate';
  replyText: string;
  image?: GeneratedImage;
  generationId?: string;
  planner?: ImagePlannerResult;
}

export interface ImageGenerationHistoryRun {
  id: string;
  userPrompt: string;
  replyText: string;
  planner?: ImagePlannerResult;
  image: GeneratedImage;
  machineId?: string | null;
  machineTitle?: string | null;
  imageType: ImageTypeValue;
  createdAt: string;
}

export interface GeneratedVideoClip {
  fileName: string;
  mimeType: string;
  byteSize: number;
  durationSeconds: VideoDurationSeconds;
  resolution: string;
  aspectRatio: string;
}

export interface VideoGenerationRunSummary {
  id: string;
  userPrompt: string;
  assistantReply: string;
  sourceKind: VideoSourceKind;
  sourceImageRunId?: string | null;
  sourceImageFileName: string;
  sourceImageMimeType: string;
  sourceImageByteSize: number;
  videoModel: string;
  openrouterJobId: string;
  openrouterGenerationId?: string | null;
  status: VideoGenerationStatus;
  errorMessage?: string | null;
  durationSeconds: VideoDurationSeconds;
  resolution: string;
  aspectRatio: string;
  video?: GeneratedVideoClip;
  createdAt: string;
  updatedAt: string;
}
