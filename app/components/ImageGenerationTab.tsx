'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  Database,
  FilePlus2,
  FileText,
  Film,
  ImagePlus,
  Layers3,
  LayoutDashboard,
  Loader2,
  Palette,
  RefreshCw,
  SendHorizontal,
  Settings2,
  Sparkles,
  Upload,
} from 'lucide-react';
import remarkGfm from 'remark-gfm';

import {
  addImageGenerationMachineImages,
  createVideoRun,
  createImageGenerationMachine,
  createImageStudioKBAsset,
  createImageStudioKBPostAssets,
  createImageStudioKBColor,
  deleteImageStudioKBColor,
  fetchImageGenerationHistory,
  fetchImageGenerationMachines,
  fetchImageStudioKB,
  fetchImageStudioSettings,
  fetchVideoRun,
  fetchVideoRuns,
  getImageGenerationKbAssetUrl,
  getImageGenerationMachineImageUrl,
  getImageGenerationRunImageUrl,
  getVideoRunContentUrl,
  getVideoRunSourceImageUrl,
  sendImageGenerationPrompt,
  updateImageGenerationMachine,
  updateImageStudioKBColor,
  updateImageStudioSettings,
} from '@/lib/image-generation/api';
import { DEFAULT_IMAGE_STUDIO_PROMPTS } from '@/lib/image-generation/defaults';
import { getImageTypeLabel, IMAGE_TYPE_OPTIONS, NO_MACHINE_VALUE } from '@/lib/image-generation/machines';
import type {
  GeneratedImage,
  ImageConversationMessage,
  ImageGenerationHistoryRun,
  ImageGenerationMachineSummary,
  ImagePlannerResult,
  ImageStudioAgentContext,
  ImageStudioGenerationMode,
  ImageStudioKBResponse,
  ImageStudioPromptKey,
  ImageStudioPromptSet,
  ImageStudioSettingsResponse,
  ImageStudioSettingsTab,
  ImageTypeValue,
  KBAssetSummary,
  KBColorEntry,
  GeneratedVideoClip,
  VideoDurationSeconds,
  VideoGenerationRunSummary,
  VideoSourceKind,
} from '@/lib/image-generation/types';

import { cn } from '../lib/utils';

type ImageGenPage = 'home' | 'generate' | 'gallery' | 'settings';
type GalleryTab = 'machines' | 'images' | 'videos';
type KBSection = 'logos' | 'posts' | 'colors';
type GenerationMode = ImageStudioGenerationMode;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status?: 'idle' | 'sending' | 'error';
  image?: GeneratedImage;
  video?: GeneratedVideoClip;
  videoRunId?: string;
  videoStatus?: VideoGenerationRunSummary['status'];
  planner?: ImagePlannerResult;
  meta?: string;
};

const LINKEDIN_MACHINE_REFERENCE_REQUIRED_MESSAGE =
  'Select a machine with uploaded reference images before generating a LinkedIn ad.';

const PROMPT_ENTRIES: Array<{ key: ImageStudioPromptKey; label: string }> = [
  { key: 'assistantGoalPrompt', label: 'Assistant Goal Prompt' },
  { key: 'intentRoutingPrompt', label: 'Intent Routing Prompt' },
  { key: 'helpResponsePrompt', label: 'Help Response Prompt' },
  { key: 'imagePlanningPrompt', label: 'Image Planning Prompt' },
  { key: 'imagePromptWriterPrompt', label: 'Image Prompt Writer Prompt' },
  { key: 'machineReferenceExtractionPrompt', label: 'Machine Reference Extraction Prompt' },
  { key: 'linkedinAdImageSystemPrompt', label: 'LinkedIn Ad Image System Prompt' },
  { key: 'machineContextTemplate', label: 'Machine Context Template' },
  { key: 'imageTypeContextTemplate', label: 'Image Type Context Template' },
  { key: 'kbContextTemplate', label: 'KB Context Template' },
  { key: 'imageResultSummaryPrompt', label: 'Image Result Summary Prompt' },
];

const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'Describe what you want to create and Image Studio will generate with your Arrow brand KB and machine references in mind.',
    status: 'idle',
  },
];

const NAV_ITEMS: Array<{ id: ImageGenPage; label: string; description: string; icon: LucideIcon }> = [
  { id: 'home', label: 'Home', description: 'Overview and studio status', icon: LayoutDashboard },
  { id: 'generate', label: 'Generate', description: 'Chat-driven image creation', icon: Sparkles },
  { id: 'gallery', label: 'Gallery', description: 'Machines and saved images', icon: FileText },
  { id: 'settings', label: 'Settings', description: 'Prompts, machines, and Brand KB', icon: Settings2 },
];

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

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-7 text-stone-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-2 last:mb-0">{children}</ol>,
          ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-2 last:mb-0">{children}</ul>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-stone-950">{children}</strong>,
          code: ({ children }) => (
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[0.9em] text-stone-800">{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function getMachineLabel(machine: ImageGenerationMachineSummary | null): string {
  return machine?.title ?? 'No Machine';
}

export function ImageGenerationTab() {
  const initialLoadRef = useRef(false);
  const [activePage, setActivePage] = useState<ImageGenPage>('home');
  const [galleryTab, setGalleryTab] = useState<GalleryTab>('machines');
  const [settingsTab, setSettingsTab] = useState<ImageStudioSettingsTab>('prompts');
  const [kbSection, setKbSection] = useState<KBSection>('logos');

  const [machines, setMachines] = useState<ImageGenerationMachineSummary[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState<string>(NO_MACHINE_VALUE);

  const [kbData, setKbData] = useState<ImageStudioKBResponse>({ logos: [], posts: [], colors: [] });
  const [kbLoading, setKbLoading] = useState(false);

  const [settingsData, setSettingsData] = useState<ImageStudioSettingsResponse | null>(null);
  const [settingsForm, setSettingsForm] = useState<ImageStudioPromptSet>(DEFAULT_IMAGE_STUDIO_PROMPTS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [historyRuns, setHistoryRuns] = useState<ImageGenerationHistoryRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [videoRuns, setVideoRuns] = useState<VideoGenerationRunSummary[]>([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT_MESSAGES);
  const [isSending, setIsSending] = useState(false);

  const [imageType, setImageType] = useState<ImageTypeValue>('linkedin_ad');
  const [generationMode, setGenerationMode] = useState<GenerationMode>('chat');
  const [draft, setDraft] = useState('');
  const [videoSourceKind, setVideoSourceKind] = useState<VideoSourceKind>('upload');
  const [videoSourceFile, setVideoSourceFile] = useState<File | null>(null);
  const [videoSourcePreviewUrl, setVideoSourcePreviewUrl] = useState<string | null>(null);
  const [selectedSourceImageRunId, setSelectedSourceImageRunId] = useState<string | null>(null);
  const [selectedVideoDuration, setSelectedVideoDuration] = useState<VideoDurationSeconds | null>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [newMachineTitle, setNewMachineTitle] = useState('');
  const [newMachineNotes, setNewMachineNotes] = useState('');
  const [newMachineFiles, setNewMachineFiles] = useState<File[]>([]);
  const [machineSaving, setMachineSaving] = useState(false);

  const [manageMachineId, setManageMachineId] = useState<string>(NO_MACHINE_VALUE);
  const [manageMachineTitle, setManageMachineTitle] = useState('');
  const [manageMachineNotes, setManageMachineNotes] = useState('');
  const [manageMachineFiles, setManageMachineFiles] = useState<File[]>([]);
  const [machineUpdating, setMachineUpdating] = useState(false);

  const [kbAssetLabel, setKbAssetLabel] = useState('');
  const [kbAssetFile, setKbAssetFile] = useState<File | null>(null);
  const [kbPostFiles, setKbPostFiles] = useState<File[]>([]);
  const [kbAssetSaving, setKbAssetSaving] = useState(false);

  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('');
  const [newColorNotes, setNewColorNotes] = useState('');
  const [colorSaving, setColorSaving] = useState(false);
  const [colorDrafts, setColorDrafts] = useState<Record<string, KBColorEntry>>({});

  const selectedMachine = useMemo(
    () => machines.find((machine) => machine.id === selectedMachineId) ?? null,
    [machines, selectedMachineId],
  );
  const managedMachine = useMemo(
    () => machines.find((machine) => machine.id === manageMachineId) ?? null,
    [machines, manageMachineId],
  );

  const loadMachines = async () => {
    setMachinesLoading(true);
    try {
      const nextMachines = await fetchImageGenerationMachines();
      setMachines(nextMachines);
      setSelectedMachineId((current) => {
        if (current === NO_MACHINE_VALUE) return current;
        return nextMachines.some((machine) => machine.id === current) ? current : NO_MACHINE_VALUE;
      });
      setManageMachineId((current) => {
        if (current !== NO_MACHINE_VALUE && nextMachines.some((machine) => machine.id === current)) return current;
        return nextMachines[0]?.id ?? NO_MACHINE_VALUE;
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not load machines.');
    } finally {
      setMachinesLoading(false);
    }
  };

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const response = await fetchImageStudioSettings();
      setSettingsData(response);
      setSettingsForm(response.prompts);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not load Image Studio settings.');
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadKb = async () => {
    setKbLoading(true);
    try {
      const response = await fetchImageStudioKB();
      setKbData(response);
      setColorDrafts(Object.fromEntries(response.colors.map((color) => [color.id, color])));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not load the Brand KB.');
    } finally {
      setKbLoading(false);
    }
  };

  const loadHistory = async (limit?: number) => {
    setHistoryLoading(true);
    try {
      const runs = await fetchImageGenerationHistory(limit);
      setHistoryRuns(runs);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not load saved images.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadVideoRuns = async (limit?: number) => {
    setVideoLoading(true);
    try {
      const runs = await fetchVideoRuns(limit);
      setVideoRuns(runs);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not load saved videos.');
    } finally {
      setVideoLoading(false);
    }
  };

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void loadMachines();
    void loadSettings();
    void loadKb();
  }, []);

  useEffect(() => {
    if (activePage === 'generate') {
      setMessages(INITIAL_CHAT_MESSAGES);
      setDraft('');
      setIsSending(false);
      return;
    }

    if (activePage === 'gallery' && galleryTab === 'images') {
      void loadHistory(24);
    }

    if (activePage === 'gallery' && galleryTab === 'videos') {
      void loadVideoRuns(24);
    }
  }, [activePage, galleryTab]);

  useEffect(() => {
    if (generationMode === 'video' || videoSourceKind === 'generated') {
      void loadHistory(24);
    }
  }, [generationMode, videoSourceKind]);

  useEffect(() => {
    if (!videoSourceFile) {
      setVideoSourcePreviewUrl((current) => {
        if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    const previewUrl = URL.createObjectURL(videoSourceFile);
    setVideoSourcePreviewUrl((current) => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
      return previewUrl;
    });

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [videoSourceFile]);

  useEffect(() => {
    if (!managedMachine) return;
    setManageMachineTitle(managedMachine.title);
    setManageMachineNotes(managedMachine.notes);
  }, [managedMachine?.id]);

  const handleGenerationModeChange = (value: GenerationMode) => {
    setGenerationMode(value);
  };

  const handleVideoSourceKindChange = (value: VideoSourceKind) => {
    setVideoSourceKind(value);
    if (value === 'upload') {
      setSelectedSourceImageRunId(null);
      return;
    }
    setVideoSourceFile(null);
  };

  const handleVideoSourceFileChange = (file: File | null) => {
    setVideoSourceFile(file);
    if (file) {
      setSelectedSourceImageRunId(null);
    }
  };

  const handleSourceImageRunChange = (runId: string | null) => {
    setSelectedSourceImageRunId(runId);
    if (runId) {
      setVideoSourceFile(null);
    }
  };

  const buildAgentContext = (): ImageStudioAgentContext => ({
    activePage,
    galleryTab,
    settingsTab,
    kbSection,
    generationMode,
    imageType,
    selectedMachineId: selectedMachine?.id ?? null,
    selectedMachineTitle: selectedMachine?.title ?? null,
    selectedMachineNotes: selectedMachine?.notes ?? null,
    selectedMachineImageCount: selectedMachine?.images.length ?? 0,
    machineCount: machines.length,
    kbSummary: {
      logoCount: kbData.logos.length,
      postCount: kbData.posts.length,
      colorCount: kbData.colors.length,
      colorNames: kbData.colors.slice(0, 8).map((color) => color.name),
    },
    settingsSummary: settingsData
      ? {
          configured: settingsData.configured,
          chatModel: settingsData.chatModel,
          imageModel: settingsData.imageModel,
          videoModel: settingsData.videoModel,
        }
      : undefined,
    historySummary: {
      imageCount: historyRuns.length,
      videoCount: videoRuns.length,
      recentImages: historyRuns.slice(0, 6).map((run) => ({
        id: run.id,
        prompt: run.userPrompt,
        machineTitle: run.machineTitle ?? null,
        imageType: run.imageType,
        createdAt: run.createdAt,
      })),
      recentVideos: videoRuns.slice(0, 6).map((run) => ({
        id: run.id,
        prompt: run.userPrompt,
        status: run.status,
        durationSeconds: run.durationSeconds,
        sourceKind: run.sourceKind,
        createdAt: run.createdAt,
      })),
    },
    videoSetup: {
      sourceKind: videoSourceKind,
      hasUploadSource: Boolean(videoSourceFile),
      selectedSourceImageRunId,
      hasGeneratedSource: Boolean(selectedSourceImageRunId),
      selectedDuration: selectedVideoDuration,
    },
  });

  const upsertVideoRun = (run: VideoGenerationRunSummary) => {
    setVideoRuns((current) =>
      [run, ...current.filter((entry) => entry.id !== run.id)].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    );
  };

  const pollVideoRunUntilSettled = async (runId: string, pendingId: string) => {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));

      try {
        const run = await fetchVideoRun(runId);
        upsertVideoRun(run);

        if (run.status === 'completed') {
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingId
                ? {
                    ...message,
                    text: run.assistantReply,
                    video: run.video,
                    videoRunId: run.id,
                    videoStatus: run.status,
                    status: 'idle',
                  }
                : message,
            ),
          );
          return;
        }

        if (run.status === 'failed') {
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingId
                ? {
                    ...message,
                    text: run.errorMessage ?? run.assistantReply,
                    videoRunId: run.id,
                    videoStatus: run.status,
                    status: 'error',
                  }
                : message,
            ),
          );
          return;
        }

        setMessages((current) =>
          current.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  text: run.assistantReply,
                  videoRunId: run.id,
                  videoStatus: run.status,
                  status: 'sending',
                }
              : message,
          ),
        );
      } catch (error) {
        setMessages((current) =>
          current.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  text: error instanceof Error ? error.message : 'Video generation failed while polling.',
                  status: 'error',
                }
              : message,
          ),
        );
        return;
      }
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === pendingId
          ? {
              ...message,
              text: 'Video generation is still in progress. Check the Videos gallery for the latest status.',
              status: 'error',
            }
          : message,
      ),
    );
  };

  const handleSubmitPrompt = async () => {
    const trimmedPrompt = draft.trim();
    if (!trimmedPrompt || isSending) return;
    if (generationMode === 'image' && imageType === 'linkedin_ad' && (!selectedMachine || selectedMachine.images.length === 0)) {
      setStatusMessage(LINKEDIN_MACHINE_REFERENCE_REQUIRED_MESSAGE);
      setMessages((current) => [
        ...current,
        {
          id: `guardrail-${Date.now()}`,
          role: 'assistant',
          text: LINKEDIN_MACHINE_REFERENCE_REQUIRED_MESSAGE,
          status: 'error',
        },
      ]);
      return;
    }

    if (generationMode === 'video' && !selectedVideoDuration) {
      setStatusMessage('Select a video duration before generating.');
      return;
    }

    if (generationMode === 'video' && videoSourceKind === 'upload' && !videoSourceFile) {
      setStatusMessage('Upload an image before generating a video.');
      return;
    }

    if (generationMode === 'video' && videoSourceKind === 'generated' && !selectedSourceImageRunId) {
      setStatusMessage('Select a generated image before generating a video.');
      return;
    }

    const pendingId = `pending-${Date.now()}`;
    const modeLabel =
      generationMode === 'image' ? 'Image mode on' : generationMode === 'video' ? 'Video mode on' : 'Chat only';
    const userMeta =
      generationMode === 'video'
        ? `Context: Video • ${selectedVideoDuration ?? '?'}s • ${videoSourceKind === 'upload' ? 'Uploaded image' : 'Generated image'}`
        : `Context: ${getMachineLabel(selectedMachine)} • ${getImageTypeLabel(imageType)} • ${modeLabel}`;

    setMessages((current) => [
      ...current,
      {
        id: `${pendingId}-user`,
        role: 'user',
        text: trimmedPrompt,
        status: 'idle',
        meta: userMeta,
      },
      {
        id: pendingId,
        role: 'assistant',
        text: generationMode === 'video' ? 'Queuing your video...' : '',
        status: 'sending',
      },
    ]);
    setDraft('');
    setIsSending(true);

    if (generationMode === 'video' && selectedVideoDuration) {
      try {
        const run = await createVideoRun({
          prompt: trimmedPrompt,
          duration: selectedVideoDuration,
          sourceKind: videoSourceKind,
          sourceFile: videoSourceKind === 'upload' ? videoSourceFile : null,
          sourceImageRunId: videoSourceKind === 'generated' ? selectedSourceImageRunId : null,
          messages: messages.filter((message) => message.status !== 'sending').map((message) => ({
            role: message.role,
            text: message.text,
          })) as ImageConversationMessage[],
        });

        upsertVideoRun(run);
        setMessages((current) =>
          current.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  text: run.assistantReply,
                  videoRunId: run.id,
                  videoStatus: run.status,
                  video: run.video,
                  status: run.status === 'failed' ? 'error' : run.status === 'completed' ? 'idle' : 'sending',
                }
              : message,
          ),
        );
        setStatusMessage(null);
        setIsSending(false);
        void loadVideoRuns(24);

        if (run.status === 'pending' || run.status === 'in_progress') {
          void pollVideoRunUntilSettled(run.id, pendingId);
        }
      } catch (error) {
        setMessages((current) =>
          current.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  text: error instanceof Error ? error.message : 'Video generation failed.',
                  status: 'error',
                }
              : message,
          ),
        );
        setIsSending(false);
      }
      return;
    }

    try {
      const payload = await sendImageGenerationPrompt({
        prompt: trimmedPrompt,
        machineId: selectedMachine?.id ?? null,
        imageType,
        imageMode: generationMode === 'image',
        generationMode,
        studioContext: buildAgentContext(),
        messages: messages.filter((message) => message.status !== 'sending').map((message) => ({
          role: message.role,
          text: message.text,
        })) as ImageConversationMessage[],
      });

      setMessages((current) =>
        current.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                text: payload.replyText,
                image: payload.image,
                planner: payload.planner,
                status: 'idle',
              }
            : message,
        ),
      );

      if (payload.mode === 'generate') {
        void loadHistory(24);
      }
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                text: error instanceof Error ? error.message : 'Generation failed.',
                status: 'error',
              }
            : message,
        ),
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleSavePrompts = async () => {
    setSettingsSaving(true);
    setStatusMessage(null);
    try {
      const response = await updateImageStudioSettings({ prompts: settingsForm });
      setSettingsData(response);
      setSettingsForm(response.prompts);
      setStatusMessage('Prompt settings saved.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not save prompt settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleCreateMachine = async () => {
    if (!newMachineTitle.trim() || newMachineFiles.length === 0 || machineSaving) return;
    setMachineSaving(true);
    setStatusMessage(null);
    try {
      const created = await createImageGenerationMachine({
        title: newMachineTitle,
        notes: newMachineNotes,
        files: newMachineFiles,
      });
      setNewMachineTitle('');
      setNewMachineNotes('');
      setNewMachineFiles([]);
      await loadMachines();
      setSelectedMachineId(created.id);
      setManageMachineId(created.id);
      setStatusMessage(`Machine "${created.title}" created.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not create machine.');
    } finally {
      setMachineSaving(false);
    }
  };

  const handleUpdateMachine = async () => {
    if (!managedMachine || machineUpdating) return;
    setMachineUpdating(true);
    setStatusMessage(null);
    try {
      await updateImageGenerationMachine({
        id: managedMachine.id,
        title: manageMachineTitle,
        notes: manageMachineNotes,
      });
      if (manageMachineFiles.length > 0) {
        await addImageGenerationMachineImages({
          machineId: managedMachine.id,
          files: manageMachineFiles,
        });
      }
      setManageMachineFiles([]);
      await loadMachines();
      setStatusMessage(`Machine "${manageMachineTitle}" updated.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not update machine.');
    } finally {
      setMachineUpdating(false);
    }
  };

  const handleCreateKbAsset = async () => {
    if (kbSection === 'logos' && (!kbAssetLabel.trim() || !kbAssetFile || kbAssetSaving)) return;
    if (kbSection === 'posts' && (kbPostFiles.length === 0 || kbAssetSaving)) return;
    setKbAssetSaving(true);
    setStatusMessage(null);
    try {
      if (kbSection === 'posts') {
        await createImageStudioKBPostAssets(kbPostFiles);
        setKbPostFiles([]);
      } else if (kbAssetFile) {
        await createImageStudioKBAsset({
          category: 'logo',
          label: kbAssetLabel,
          file: kbAssetFile,
        });
        setKbAssetLabel('');
        setKbAssetFile(null);
      }
      await loadKb();
      setStatusMessage(`${kbSection === 'logos' ? 'Logo' : 'Post reference'} added to Brand KB.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not save Brand KB asset.');
    } finally {
      setKbAssetSaving(false);
    }
  };

  const handleCreateColor = async () => {
    if (!newColorName.trim() || !newColorHex.trim() || colorSaving) return;
    setColorSaving(true);
    setStatusMessage(null);
    try {
      await createImageStudioKBColor({
        name: newColorName,
        hex: newColorHex,
        notes: newColorNotes,
      });
      setNewColorName('');
      setNewColorHex('');
      setNewColorNotes('');
      await loadKb();
      setStatusMessage('Brand KB color added.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not add Brand KB color.');
    } finally {
      setColorSaving(false);
    }
  };

  const handleUpdateColor = async (colorId: string) => {
    const color = colorDrafts[colorId];
    if (!color) return;
    try {
      await updateImageStudioKBColor(color);
      await loadKb();
      setStatusMessage(`Updated ${color.name}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not update color.');
    }
  };

  const handleDeleteColor = async (colorId: string) => {
    try {
      await deleteImageStudioKBColor(colorId);
      await loadKb();
      setStatusMessage('Color removed.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not delete color.');
    }
  };

  return (
    <main className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-[#f6f0ea]">
      <div className="relative h-full w-full px-2 py-3 sm:px-3 lg:px-3 lg:py-4">
        <section className="h-full overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,252,248,0.96),rgba(255,247,239,0.92))] shadow-[0_22px_72px_rgba(57,28,11,0.11)] backdrop-blur-xl">
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)]">
            <aside className="border-b border-stone-200/80 bg-[linear-gradient(180deg,#2b221e_0%,#3c2d28_55%,#533a31_100%)] text-white lg:border-b-0 lg:border-r">
              <div className="flex h-full flex-col px-4 py-4 sm:px-5 lg:px-5">
                <div className="rounded-[28px] border border-white/14 bg-white/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/14 bg-white/12 text-brand">
                      <ImagePlus className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">Arrow Systems</p>
                      <h1 className="mt-1 text-lg font-semibold tracking-tight text-white">Image Studio</h1>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-white/82">
                    Brand-aware image creation with Brand KB assets, machine reference galleries, and guided prompt orchestration.
                  </p>
                </div>

                <nav className="mt-5 flex flex-col gap-2">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activePage === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActivePage(item.id)}
                        className={cn(
                          'w-full rounded-[22px] border px-4 py-3 text-left transition-all',
                          isActive
                            ? 'border-white/24 bg-white text-stone-950 shadow-lg'
                            : 'border-white/12 bg-white/7 text-white/92 hover:border-white/18 hover:bg-white/12',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
                            isActive ? 'border-brand/20 bg-brand/10 text-brand' : 'border-white/14 bg-white/8 text-white/82')}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{item.label}</span>
                            <span className={cn('mt-1 block text-xs leading-5', isActive ? 'text-stone-500' : 'text-white/68')}>
                              {item.description}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </nav>

                <div className="mt-5 rounded-[26px] border border-white/14 bg-white/8 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Selected Machine</p>
                      <p className="mt-1 text-sm font-semibold text-white">{getMachineLabel(selectedMachine)}</p>
                    </div>
                    <span className="rounded-full border border-white/14 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">
                      {machines.length} in DB
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/80">
                    {selectedMachine
                      ? `${selectedMachine.images.length} reference image(s) • ${selectedMachine.notes ? 'notes added' : 'notes pending'}`
                      : 'Generate still works without a machine. Brand KB is always applied by default.'}
                  </p>
                </div>
              </div>
            </aside>

            <div className="min-w-0 h-full overflow-hidden">
              {statusMessage ? (
                <div className="border-b border-stone-200 bg-brand/5 px-5 py-3 text-sm text-stone-700">{statusMessage}</div>
              ) : null}

              {activePage === 'home' ? (
                <HomeView
                  machines={machines}
                  kbData={kbData}
                  selectedMachine={selectedMachine}
                  onOpenGenerate={() => setActivePage('generate')}
                  onOpenGallery={() => setActivePage('gallery')}
                  onOpenSettings={(tab) => {
                    setSettingsTab(tab);
                    setActivePage('settings');
                  }}
                />
              ) : activePage === 'generate' ? (
                <GenerateView
                  machines={machines}
                  selectedMachine={selectedMachine}
                  selectedMachineId={selectedMachineId}
                  imageType={imageType}
                  generationMode={generationMode}
                  draft={draft}
                  messages={messages}
                  isSending={isSending}
                  historyRuns={historyRuns}
                  historyLoading={historyLoading}
                  videoSourceKind={videoSourceKind}
                  videoSourceFile={videoSourceFile}
                  videoSourcePreviewUrl={videoSourcePreviewUrl}
                  selectedSourceImageRunId={selectedSourceImageRunId}
                  selectedVideoDuration={selectedVideoDuration}
                  onMachineChange={setSelectedMachineId}
                  onImageTypeChange={setImageType}
                  onGenerationModeChange={handleGenerationModeChange}
                  onDraftChange={setDraft}
                  onVideoSourceKindChange={handleVideoSourceKindChange}
                  onVideoSourceFileChange={handleVideoSourceFileChange}
                  onSourceImageRunChange={handleSourceImageRunChange}
                  onVideoDurationChange={setSelectedVideoDuration}
                  onSubmitPrompt={handleSubmitPrompt}
                />
              ) : activePage === 'gallery' ? (
                <GalleryView
                  machines={machines}
                  selectedMachine={selectedMachine}
                  selectedMachineId={selectedMachineId}
                  historyRuns={historyRuns}
                  historyLoading={historyLoading}
                  videoRuns={videoRuns}
                  videoLoading={videoLoading}
                  galleryTab={galleryTab}
                  onGalleryTabChange={setGalleryTab}
                  onMachineChange={setSelectedMachineId}
                  onOpenSettings={() => {
                    setSettingsTab('machines');
                    setActivePage('settings');
                  }}
                />
              ) : (
                <SettingsView
                  activeTab={settingsTab}
                  onTabChange={setSettingsTab}
                  settingsData={settingsData}
                  settingsForm={settingsForm}
                  settingsLoading={settingsLoading}
                  settingsSaving={settingsSaving}
                  onPromptChange={(key, value) => setSettingsForm((current) => ({ ...current, [key]: value }))}
                  onSavePrompts={() => void handleSavePrompts()}
                  onRefreshSettings={() => void loadSettings()}
                  machines={machines}
                  machinesLoading={machinesLoading}
                  manageMachineId={manageMachineId}
                  onManageMachineIdChange={setManageMachineId}
                  newMachineTitle={newMachineTitle}
                  newMachineNotes={newMachineNotes}
                  newMachineFiles={newMachineFiles}
                  onNewMachineTitleChange={setNewMachineTitle}
                  onNewMachineNotesChange={setNewMachineNotes}
                  onNewMachineFilesChange={setNewMachineFiles}
                  machineSaving={machineSaving}
                  onCreateMachine={() => void handleCreateMachine()}
                  managedMachine={managedMachine}
                  manageMachineTitle={manageMachineTitle}
                  manageMachineNotes={manageMachineNotes}
                  manageMachineFiles={manageMachineFiles}
                  onManageMachineTitleChange={setManageMachineTitle}
                  onManageMachineNotesChange={setManageMachineNotes}
                  onManageMachineFilesChange={setManageMachineFiles}
                  machineUpdating={machineUpdating}
                  onUpdateMachine={() => void handleUpdateMachine()}
                  kbData={kbData}
                  kbLoading={kbLoading}
                  kbSection={kbSection}
                  onKbSectionChange={setKbSection}
                  kbAssetLabel={kbAssetLabel}
                  kbAssetFile={kbAssetFile}
                  kbPostFiles={kbPostFiles}
                  onKbAssetLabelChange={setKbAssetLabel}
                  onKbAssetFileChange={setKbAssetFile}
                  onKbPostFilesChange={setKbPostFiles}
                  kbAssetSaving={kbAssetSaving}
                  onCreateKbAsset={() => void handleCreateKbAsset()}
                  newColorName={newColorName}
                  newColorHex={newColorHex}
                  newColorNotes={newColorNotes}
                  onNewColorNameChange={setNewColorName}
                  onNewColorHexChange={setNewColorHex}
                  onNewColorNotesChange={setNewColorNotes}
                  colorSaving={colorSaving}
                  onCreateColor={() => void handleCreateColor()}
                  colorDrafts={colorDrafts}
                  onColorDraftChange={(id, updater) =>
                    setColorDrafts((current) => ({ ...current, [id]: updater(current[id]) }))
                  }
                  onUpdateColor={(id) => void handleUpdateColor(id)}
                  onDeleteColor={(id) => void handleDeleteColor(id)}
                  onRefreshKb={() => void loadKb()}
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function HomeView({
  machines,
  kbData,
  selectedMachine,
  onOpenGenerate,
  onOpenGallery,
  onOpenSettings,
}: {
  machines: ImageGenerationMachineSummary[];
  kbData: ImageStudioKBResponse;
  selectedMachine: ImageGenerationMachineSummary | null;
  onOpenGenerate: () => void;
  onOpenGallery: () => void;
  onOpenSettings: (tab: ImageStudioSettingsTab) => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-5 lg:p-6">
      <section className="rounded-[30px] border border-stone-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(255,244,236,0.92))] p-5 shadow-sm sm:p-6 lg:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-brand shadow-sm">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Home Overview
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-4xl">
              Build from your Brand KB, then generate from chat
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 sm:text-[15px]">
              Image Studio now uses the Arrow Systems Brand KB and machine image references as the source of truth. Add logos, post references, brand colors, and machine image sets before you generate.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onOpenGenerate}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-red-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(196,30,58,0.28)]"
            >
              Open Generate
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onOpenSettings('kb')}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-800"
            >
              Open Brand KB
              <Palette className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <MetricCard icon={Database} label="Machines" value={String(machines.length)} />
          <MetricCard icon={ImagePlus} label="Logos" value={String(kbData.logos.length)} />
          <MetricCard icon={FileText} label="Post Refs" value={String(kbData.posts.length)} />
          <MetricCard icon={Layers3} label="Current Selection" value={getMachineLabel(selectedMachine)} />
        </div>
      </section>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-[30px] border border-stone-200 bg-white/85 p-5 shadow-sm sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">Workflow</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">What this phase unlocks</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <OverviewStep number="01" title="Build the Brand KB" detail="Add logos, post references, and brand colors in Settings > Brand KB." />
            <OverviewStep number="02" title="Load machine references" detail="Each machine can now carry multiple reference images and machine notes." />
            <OverviewStep number="03" title="Generate with both" detail="Every image generation uses the Arrow Brand KB plus selected machine context by default." />
          </div>
        </section>

        <SidebarCard eyebrow="Quick Access" title="Jump to setup" icon={Settings2} footer="The more Brand KB and machine references you add, the stronger the outputs become.">
          <div className="space-y-3">
            <button type="button" onClick={() => onOpenSettings('machines')} className="w-full rounded-[20px] border border-stone-200 bg-[#fffaf5] px-4 py-3 text-left text-sm font-semibold text-stone-900">
              Manage Machines
            </button>
            <button type="button" onClick={() => onOpenSettings('kb')} className="w-full rounded-[20px] border border-stone-200 bg-[#fffaf5] px-4 py-3 text-left text-sm font-semibold text-stone-900">
              Manage Brand KB
            </button>
            <button type="button" onClick={onOpenGallery} className="w-full rounded-[20px] border border-stone-200 bg-[#fffaf5] px-4 py-3 text-left text-sm font-semibold text-stone-900">
              Open Gallery
            </button>
          </div>
        </SidebarCard>
      </div>
    </div>
  );
}

function GenerateView({
  machines,
  selectedMachine,
  selectedMachineId,
  imageType,
  generationMode,
  draft,
  messages,
  isSending,
  historyRuns,
  historyLoading,
  videoSourceKind,
  videoSourceFile,
  videoSourcePreviewUrl,
  selectedSourceImageRunId,
  selectedVideoDuration,
  onMachineChange,
  onImageTypeChange,
  onGenerationModeChange,
  onDraftChange,
  onVideoSourceKindChange,
  onVideoSourceFileChange,
  onSourceImageRunChange,
  onVideoDurationChange,
  onSubmitPrompt,
}: {
  machines: ImageGenerationMachineSummary[];
  selectedMachine: ImageGenerationMachineSummary | null;
  selectedMachineId: string;
  imageType: ImageTypeValue;
  generationMode: GenerationMode;
  draft: string;
  messages: ChatMessage[];
  isSending: boolean;
  historyRuns: ImageGenerationHistoryRun[];
  historyLoading: boolean;
  videoSourceKind: VideoSourceKind;
  videoSourceFile: File | null;
  videoSourcePreviewUrl: string | null;
  selectedSourceImageRunId: string | null;
  selectedVideoDuration: VideoDurationSeconds | null;
  onMachineChange: (value: string) => void;
  onImageTypeChange: (value: ImageTypeValue) => void;
  onGenerationModeChange: (value: GenerationMode) => void;
  onDraftChange: (value: string) => void;
  onVideoSourceKindChange: (value: VideoSourceKind) => void;
  onVideoSourceFileChange: (file: File | null) => void;
  onSourceImageRunChange: (runId: string | null) => void;
  onVideoDurationChange: (value: VideoDurationSeconds) => void;
  onSubmitPrompt: () => Promise<void>;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const selectedGeneratedImageRun =
    historyRuns.find((run) => run.id === selectedSourceImageRunId) ?? null;
  const generatedSourceOptions = historyRuns.slice().reverse();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const linkedinNeedsMachineReference =
    generationMode === 'image' && imageType === 'linkedin_ad' && (!selectedMachine || selectedMachine.images.length === 0);
  const videoNeedsSource =
    generationMode === 'video' &&
    ((videoSourceKind === 'upload' && !videoSourceFile) ||
      (videoSourceKind === 'generated' && !selectedSourceImageRunId));
  const videoNeedsDuration = generationMode === 'video' && !selectedVideoDuration;
  const submitDisabled = isSending || !draft.trim() || linkedinNeedsMachineReference || videoNeedsSource || videoNeedsDuration;
  const modeSummary =
    generationMode === 'image' ? 'Image On' : generationMode === 'video' ? 'Video On' : 'Chat Only';
  const draftPlaceholder =
    generationMode === 'image'
      ? 'Describe the image you want to create...'
      : generationMode === 'video'
        ? 'Describe how the selected image should animate...'
        : 'Ask how to improve a prompt or how to use Image Studio...';

  return (
    <div className="grid h-full min-h-0 overflow-hidden grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] border-b border-stone-200/80 bg-[linear-gradient(180deg,#fffdfa_0%,#fbf5ef_100%)] xl:border-b-0 xl:border-r">
        <div className="border-b border-stone-200/80 bg-white/75 px-5 py-3 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">Generate</p>
              <p className="mt-1 text-sm text-stone-600">{getMachineLabel(selectedMachine)} session</p>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn('flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs',
                generationMode === 'chat' ? 'border-stone-200 bg-white text-stone-500' : 'border-brand/20 bg-brand/10 text-brand')}>
                {generationMode === 'video' ? <Film className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
                {modeSummary}
              </div>
              <div className={cn('flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-500',
                generationMode !== 'image' && 'opacity-60')}>
                <Sparkles className="h-3.5 w-3.5 text-brand" />
                {generationMode === 'video' ? '720p • 16:9' : getImageTypeLabel(imageType)}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-end gap-5">
            {messages.map((message) => (
              <div key={message.id} className={cn('flex gap-4', message.role === 'user' ? 'justify-end' : 'items-start')}>
                {message.role === 'assistant' ? (
                  <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand/15 bg-brand/10 text-brand shadow-sm">
                    {message.status === 'sending' ? <span className="h-2.5 w-2.5 rounded-full bg-brand animate-pulse" /> : <Bot className="h-4 w-4" />}
                  </span>
                ) : null}

                <div className={cn('max-w-4xl', message.role === 'user' ? 'flex flex-col items-end' : 'flex flex-col items-start')}>
                  <div className={cn('rounded-[26px] px-5 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.05)] ring-1',
                    message.role === 'user'
                      ? 'bg-[linear-gradient(180deg,#4d3830_0%,#342621_100%)] text-white ring-[#4a342d]'
                      : message.status === 'error'
                        ? 'bg-red-50 text-red-900 ring-red-200'
                        : 'bg-white text-stone-800 ring-stone-200/80')}>
                    {message.status === 'sending' ? (
                      <p className="text-sm leading-7 text-stone-800">{message.text || 'Working...'}</p>
                    ) : message.role === 'assistant' ? (
                      <AssistantMarkdown content={message.text} />
                    ) : (
                      <p className="text-sm leading-7 whitespace-pre-wrap text-white/95">{message.text}</p>
                    )}
                  </div>
                  {message.meta ? <div className="mt-2 text-xs text-stone-500">{message.meta}</div> : null}
                  {message.image ? (
                    <div className="mt-4 w-full max-w-4xl overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                      <img src={message.image.dataUrl} alt={message.image.alt} className="block max-h-[30rem] w-full bg-[#f8f1eb] object-contain" />
                      {message.planner ? (
                        <div className="border-t border-stone-200 bg-[#fffaf5] px-5 py-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">{message.planner.title}</p>
                          <p className="mt-2 text-sm leading-6 text-stone-600">{message.planner.summary}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {message.video && message.videoRunId ? (
                    <div className="mt-4 w-full max-w-4xl overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                      <video
                        controls
                        src={getVideoRunContentUrl(message.videoRunId)}
                        className="block max-h-[30rem] w-full bg-[#f8f1eb]"
                      />
                      <div className="border-t border-stone-200 bg-[#fffaf5] px-5 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
                          {message.video.durationSeconds}s video
                        </p>
                        <p className="mt-2 text-sm leading-6 text-stone-600">
                          {message.video.resolution} • {message.video.aspectRatio} • {message.video.fileName}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="shrink-0 border-t border-stone-200/80 bg-white/90 px-4 py-3 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-5xl">
            <div className="rounded-[26px] border border-stone-200 bg-white shadow-[0_12px_28px_rgba(0,0,0,0.05)]">
              <div className="px-5 pt-4">
                <textarea
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void onSubmitPrompt();
                    }
                  }}
                  rows={2}
                  placeholder={draftPlaceholder}
                  className="w-full resize-none border-0 bg-transparent text-[15px] leading-6 text-stone-800 placeholder:text-stone-400 focus:outline-none"
                />
              </div>
              <div className="border-t border-stone-200 px-5 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    {generationMode === 'image' ? (
                      <>
                        <SelectField
                          label="Machine"
                          value={selectedMachineId}
                          onChange={onMachineChange}
                          options={[
                            { value: NO_MACHINE_VALUE, label: 'No Machine' },
                            ...machines.map((machine) => ({ value: machine.id, label: machine.title })),
                          ]}
                        />
                        <SelectField
                          label="Image Type"
                          value={imageType}
                          onChange={(value) => onImageTypeChange(value as ImageTypeValue)}
                          options={IMAGE_TYPE_OPTIONS}
                        />
                      </>
                    ) : null}
                    <div className="sm:min-w-[220px]">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">Mode</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onGenerationModeChange(generationMode === 'image' ? 'chat' : 'image')}
                          className={cn('inline-flex h-[46px] items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition-colors',
                            generationMode === 'image'
                              ? 'border-brand/20 bg-brand/12 text-brand shadow-[0_10px_24px_rgba(196,30,58,0.14)]'
                              : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300')}
                        >
                          <ImagePlus className="h-4 w-4" />
                          Image
                        </button>
                        <button
                          type="button"
                          onClick={() => onGenerationModeChange(generationMode === 'video' ? 'chat' : 'video')}
                          className={cn('inline-flex h-[46px] items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition-colors',
                            generationMode === 'video'
                              ? 'border-brand/20 bg-brand/12 text-brand shadow-[0_10px_24px_rgba(196,30,58,0.14)]'
                              : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300')}
                        >
                          <Film className="h-4 w-4" />
                          Video
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void onSubmitPrompt()}
                    disabled={submitDisabled}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-red-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(196,30,58,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSending ? 'Working...' : generationMode === 'image' ? 'Generate Image' : generationMode === 'video' ? 'Generate Video' : 'Send'}
                    <SendHorizontal className="h-4 w-4" />
                  </button>
                </div>
                {linkedinNeedsMachineReference ? (
                  <p className="mt-3 text-sm font-medium text-red-700">{LINKEDIN_MACHINE_REFERENCE_REQUIRED_MESSAGE}</p>
                ) : generationMode === 'video' ? (
                  <p className="mt-3 text-sm text-stone-600">
                    {selectedVideoDuration ? `${selectedVideoDuration}s selected` : 'Pick 4s, 6s, or 8s'} • 720p • 16:9 • source image becomes the first frame
                  </p>
                ) : selectedMachine && selectedMachine.images.length > 0 ? (
                  <p className="mt-3 text-sm text-stone-600">
                    {selectedMachine.images.length} machine reference image(s) will be sent as authoritative visual inputs.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="min-h-0 overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,248,0.98),rgba(249,240,232,0.98))]">
        <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4 py-4 sm:px-5 lg:px-5">
          {generationMode === 'video' ? (
            <SidebarCard eyebrow="Video Source" title="Required image input" icon={Film} footer="Upload or choose a saved image before generating.">
              <div className="inline-flex w-full rounded-full border border-stone-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => onVideoSourceKindChange('upload')}
                  className={cn('flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                    videoSourceKind === 'upload' ? 'bg-brand text-white' : 'text-stone-600 hover:text-stone-950')}
                >
                  Upload
                </button>
                <button
                  type="button"
                  onClick={() => onVideoSourceKindChange('generated')}
                  className={cn('flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                    videoSourceKind === 'generated' ? 'bg-brand text-white' : 'text-stone-600 hover:text-stone-950')}
                >
                  Generated
                </button>
              </div>

              {videoSourceKind === 'upload' ? (
                <div className="mt-4 space-y-3">
                  <label className="block rounded-[22px] border border-dashed border-stone-300 bg-white px-4 py-4 text-sm text-stone-600">
                    <span className="block font-semibold text-stone-900">Upload start-frame image</span>
                    <span className="mt-1 block">Choose one image from your computer.</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-3 block w-full text-sm text-stone-600"
                      onChange={(event) => onVideoSourceFileChange(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {videoSourcePreviewUrl ? (
                    <div className="overflow-hidden rounded-[22px] border border-stone-200 bg-white">
                      <img src={videoSourcePreviewUrl} alt={videoSourceFile?.name ?? 'Uploaded source'} className="h-52 w-full bg-[#f8f1eb] object-contain" />
                      <div className="border-t border-stone-200 px-4 py-3 text-sm text-stone-600">
                        {videoSourceFile?.name ?? 'Uploaded source'}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-stone-600">No upload selected yet.</p>
                  )}
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {historyLoading ? (
                    <div className="flex items-center gap-2 text-sm text-stone-600">
                      <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
                      Loading generated images...
                    </div>
                  ) : generatedSourceOptions.length === 0 ? (
                    <p className="text-sm leading-6 text-stone-600">Generate an image first, then it will appear here as a video source option.</p>
                  ) : (
                    <div className="space-y-3">
                      {generatedSourceOptions.map((run) => (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() => onSourceImageRunChange(run.id)}
                          className={cn('flex w-full items-center gap-3 rounded-[22px] border bg-white p-3 text-left transition-colors',
                            selectedSourceImageRunId === run.id ? 'border-brand/30 shadow-[0_10px_24px_rgba(196,30,58,0.14)]' : 'border-stone-200 hover:border-stone-300')}
                        >
                      <img src={run.image.url ?? getImageGenerationRunImageUrl(run.id)} alt={run.image.alt} className="h-20 w-20 rounded-2xl border border-stone-200 bg-[#f8f1eb] object-contain" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-stone-950">
                              {run.planner?.title ?? getImageTypeLabel(run.imageType)}
                            </span>
                            <span className="mt-1 block text-sm text-stone-600">{run.userPrompt}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedGeneratedImageRun ? (
                    <div className="rounded-[22px] border border-stone-200 bg-[#fffaf5] px-4 py-3 text-sm text-stone-600">
                      Selected source: {selectedGeneratedImageRun.planner?.title ?? getImageTypeLabel(selectedGeneratedImageRun.imageType)}
                    </div>
                  ) : null}
                </div>
              )}

              <div className="mt-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">Duration</p>
                <div className="grid grid-cols-3 gap-2">
                  {([4, 6, 8] as VideoDurationSeconds[]).map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => onVideoDurationChange(duration)}
                      className={cn('inline-flex h-[46px] items-center justify-center rounded-2xl border text-sm font-semibold transition-colors',
                        selectedVideoDuration === duration
                          ? 'border-brand/20 bg-brand/12 text-brand shadow-[0_10px_24px_rgba(196,30,58,0.14)]'
                          : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300')}
                    >
                      {duration}s
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-600">Fixed output: 720p • 16:9 • the source image becomes the first frame.</p>
              </div>
            </SidebarCard>
          ) : (
            <SidebarCard eyebrow="Selected Machine" title={getMachineLabel(selectedMachine)} icon={Layers3} footer={selectedMachine ? `${selectedMachine.images.length} machine image(s)` : 'Machine context is optional'}>
              {selectedMachine ? (
                <div className="space-y-3 text-sm text-stone-600">
                  {selectedMachine.notes ? <p className="max-h-64 overflow-y-auto pr-1 leading-6">{selectedMachine.notes}</p> : <p>No machine notes added yet.</p>}
                  {selectedMachine.images.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {selectedMachine.images.slice(0, 4).map((image) => (
                        <img
                          key={image.id}
                          src={getImageGenerationMachineImageUrl(image.id)}
                          alt={image.label}
                          className="h-24 w-full rounded-2xl border border-stone-200 bg-[#f8f1eb] object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm leading-6 text-stone-600">No machine is selected. The Brand KB and your prompt will still guide the generation.</p>
              )}
            </SidebarCard>
          )}
        </div>
      </aside>
    </div>
  );
}

function GalleryView({
  machines,
  selectedMachine,
  selectedMachineId,
  historyRuns,
  historyLoading,
  videoRuns,
  videoLoading,
  galleryTab,
  onGalleryTabChange,
  onMachineChange,
  onOpenSettings,
}: {
  machines: ImageGenerationMachineSummary[];
  selectedMachine: ImageGenerationMachineSummary | null;
  selectedMachineId: string;
  historyRuns: ImageGenerationHistoryRun[];
  historyLoading: boolean;
  videoRuns: VideoGenerationRunSummary[];
  videoLoading: boolean;
  galleryTab: GalleryTab;
  onGalleryTabChange: (value: GalleryTab) => void;
  onMachineChange: (value: string) => void;
  onOpenSettings: () => void;
}) {
  const galleryMachine = selectedMachine ?? machines[0] ?? null;

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-6 lg:p-8">
      <section className="rounded-[30px] border border-stone-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(255,244,236,0.92))] p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">Gallery</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-stone-950">Machines and saved studio outputs</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">Browse machine reference sets, saved images, and generated videos from the chat workflow.</p>
          </div>

          <div className="inline-flex rounded-full border border-stone-200 bg-white p-1 shadow-sm">
            <button type="button" onClick={() => onGalleryTabChange('machines')} className={cn('rounded-full px-4 py-2 text-sm font-semibold transition-colors', galleryTab === 'machines' ? 'bg-brand text-white' : 'text-stone-600 hover:text-stone-950')}>
              Machines
            </button>
            <button type="button" onClick={() => onGalleryTabChange('images')} className={cn('rounded-full px-4 py-2 text-sm font-semibold transition-colors', galleryTab === 'images' ? 'bg-brand text-white' : 'text-stone-600 hover:text-stone-950')}>
              Images
            </button>
            <button type="button" onClick={() => onGalleryTabChange('videos')} className={cn('rounded-full px-4 py-2 text-sm font-semibold transition-colors', galleryTab === 'videos' ? 'bg-brand text-white' : 'text-stone-600 hover:text-stone-950')}>
              Videos
            </button>
          </div>
        </div>
      </section>

      {galleryTab === 'machines' ? (
        machines.length === 0 ? (
          <section className="mt-5 rounded-[30px] border border-stone-200 bg-white p-6 shadow-sm">
            <EmptyState icon={Database} title="No machines in the database yet" detail="Add your first machine with notes and reference images in Settings > Machines." actionLabel="Open Machine Settings" onAction={onOpenSettings} />
          </section>
        ) : galleryMachine ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <SidebarCard eyebrow="Machine Record" title={galleryMachine.title} icon={Database} footer="Machine reference set">
              <SelectField
                label="Machine"
                value={selectedMachineId === NO_MACHINE_VALUE ? galleryMachine.id : selectedMachineId}
                onChange={onMachineChange}
                options={machines.map((machine) => ({ value: machine.id, label: machine.title }))}
              />
              <div className="mt-4 space-y-3 text-sm text-stone-600">
                <InfoRow label="Images" value={String(galleryMachine.images.length)} />
                <InfoRow label="Updated" value={formatDate(galleryMachine.updatedAt)} />
              </div>
              <div className="mt-4 rounded-[20px] border border-stone-200 bg-[#fffaf5] px-4 py-3 text-sm leading-6 text-stone-700">
                {galleryMachine.notes || 'No machine notes added yet.'}
              </div>
            </SidebarCard>

            <section className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-200 bg-[#fffaf5] px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">Machine References</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-stone-950">{galleryMachine.title}</h3>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                {galleryMachine.images.map((image) => (
                  <div key={image.id} className="overflow-hidden rounded-[22px] border border-stone-200 bg-[#fffaf5]">
                    <img src={getImageGenerationMachineImageUrl(image.id)} alt={image.label} className="h-52 w-full bg-[#f8f1eb] object-cover" />
                    <div className="px-4 py-3">
                      <p className="text-sm font-semibold text-stone-950">{image.label}</p>
                      <p className="mt-1 text-sm text-stone-600">{image.fileName}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null
      ) : galleryTab === 'images' ? historyLoading ? (
        <section className="mt-5 rounded-[30px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 text-sm text-stone-600">
            <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
            Loading saved images...
          </div>
        </section>
      ) : historyRuns.length === 0 ? (
        <section className="mt-5 rounded-[30px] border border-stone-200 bg-white p-6 shadow-sm">
          <EmptyState icon={ImagePlus} title="No saved images yet" detail="Generate an image in the chat and successful outputs will appear here automatically." />
        </section>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {historyRuns.slice().reverse().map((run) => (
            <section key={run.id} className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-200 bg-[#fffaf5] px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">{run.planner?.title ?? getImageTypeLabel(run.imageType)}</p>
                    <h3 className="mt-2 truncate text-lg font-semibold tracking-tight text-stone-950">{run.machineTitle ?? 'No Machine'}</h3>
                  </div>
                  <span className="shrink-0 text-xs text-stone-500">{formatDate(run.createdAt)}</span>
                </div>
              </div>
              <img src={run.image.url ?? getImageGenerationRunImageUrl(run.id)} alt={run.image.alt} className="block h-[22rem] w-full bg-[#f8f1eb] object-contain" />
              <div className="space-y-3 px-5 py-4">
                <p className="text-sm leading-6 text-stone-600">{run.replyText}</p>
                <div className="rounded-[20px] border border-stone-200 bg-[#fffaf5] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">Original Prompt</p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{run.userPrompt}</p>
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : videoLoading ? (
        <section className="mt-5 rounded-[30px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 text-sm text-stone-600">
            <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
            Loading saved videos...
          </div>
        </section>
      ) : videoRuns.length === 0 ? (
        <section className="mt-5 rounded-[30px] border border-stone-200 bg-white p-6 shadow-sm">
          <EmptyState icon={Film} title="No saved videos yet" detail="Generate a video in the chat and it will appear here automatically." />
        </section>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {videoRuns.map((run) => (
            <section key={run.id} className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-200 bg-[#fffaf5] px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
                      {run.durationSeconds}s video • {run.status.replace('_', ' ')}
                    </p>
                    <h3 className="mt-2 truncate text-lg font-semibold tracking-tight text-stone-950">
                      {run.sourceKind === 'generated' ? 'Generated Image Source' : 'Uploaded Image Source'}
                    </h3>
                  </div>
                  <span className="shrink-0 text-xs text-stone-500">{formatDate(run.createdAt)}</span>
                </div>
              </div>

              {run.status === 'completed' && run.video ? (
                <video controls src={getVideoRunContentUrl(run.id)} className="block h-[22rem] w-full bg-[#f8f1eb]" />
              ) : (
                <div className="flex h-[22rem] items-center justify-center bg-[#f8f1eb] px-6 text-center text-sm text-stone-600">
                  {run.status === 'failed'
                    ? run.errorMessage ?? 'Video generation failed.'
                    : 'Video generation is still processing.'}
                </div>
              )}

              <div className="space-y-3 px-5 py-4">
                <div className="overflow-hidden rounded-[22px] border border-stone-200 bg-white">
                  <img
                    src={getVideoRunSourceImageUrl(run.id)}
                    alt={run.sourceImageFileName}
                    className="h-48 w-full bg-[#f8f1eb] object-contain"
                  />
                  <div className="border-t border-stone-200 px-4 py-3 text-sm text-stone-600">
                    {run.sourceImageFileName}
                  </div>
                </div>
                <p className="text-sm leading-6 text-stone-600">{run.status === 'failed' ? run.errorMessage ?? run.assistantReply : run.assistantReply}</p>
                <div className="rounded-[20px] border border-stone-200 bg-[#fffaf5] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">Original Prompt</p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{run.userPrompt}</p>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsView(props: {
  activeTab: ImageStudioSettingsTab;
  onTabChange: (tab: ImageStudioSettingsTab) => void;
  settingsData: ImageStudioSettingsResponse | null;
  settingsForm: ImageStudioPromptSet;
  settingsLoading: boolean;
  settingsSaving: boolean;
  onPromptChange: (key: ImageStudioPromptKey, value: string) => void;
  onSavePrompts: () => void;
  onRefreshSettings: () => void;
  machines: ImageGenerationMachineSummary[];
  machinesLoading: boolean;
  manageMachineId: string;
  onManageMachineIdChange: (value: string) => void;
  newMachineTitle: string;
  newMachineNotes: string;
  newMachineFiles: File[];
  onNewMachineTitleChange: (value: string) => void;
  onNewMachineNotesChange: (value: string) => void;
  onNewMachineFilesChange: (files: File[]) => void;
  machineSaving: boolean;
  onCreateMachine: () => void;
  managedMachine: ImageGenerationMachineSummary | null;
  manageMachineTitle: string;
  manageMachineNotes: string;
  manageMachineFiles: File[];
  onManageMachineTitleChange: (value: string) => void;
  onManageMachineNotesChange: (value: string) => void;
  onManageMachineFilesChange: (files: File[]) => void;
  machineUpdating: boolean;
  onUpdateMachine: () => void;
  kbData: ImageStudioKBResponse;
  kbLoading: boolean;
  kbSection: KBSection;
  onKbSectionChange: (section: KBSection) => void;
  kbAssetLabel: string;
  kbAssetFile: File | null;
  kbPostFiles: File[];
  onKbAssetLabelChange: (value: string) => void;
  onKbAssetFileChange: (file: File | null) => void;
  onKbPostFilesChange: (files: File[]) => void;
  kbAssetSaving: boolean;
  onCreateKbAsset: () => void;
  newColorName: string;
  newColorHex: string;
  newColorNotes: string;
  onNewColorNameChange: (value: string) => void;
  onNewColorHexChange: (value: string) => void;
  onNewColorNotesChange: (value: string) => void;
  colorSaving: boolean;
  onCreateColor: () => void;
  colorDrafts: Record<string, KBColorEntry>;
  onColorDraftChange: (id: string, updater: (current: KBColorEntry) => KBColorEntry) => void;
  onUpdateColor: (id: string) => void;
  onDeleteColor: (id: string) => void;
  onRefreshKb: () => void;
}) {
  const {
    activeTab,
    onTabChange,
    settingsData,
    settingsForm,
    settingsLoading,
    settingsSaving,
    onPromptChange,
    onSavePrompts,
    onRefreshSettings,
    machines,
    machinesLoading,
    manageMachineId,
    onManageMachineIdChange,
    newMachineTitle,
    newMachineNotes,
    newMachineFiles,
    onNewMachineTitleChange,
    onNewMachineNotesChange,
    onNewMachineFilesChange,
    machineSaving,
    onCreateMachine,
    managedMachine,
    manageMachineTitle,
    manageMachineNotes,
    manageMachineFiles,
    onManageMachineTitleChange,
    onManageMachineNotesChange,
    onManageMachineFilesChange,
    machineUpdating,
    onUpdateMachine,
    kbData,
    kbLoading,
    kbSection,
    onKbSectionChange,
    kbAssetLabel,
    kbAssetFile,
    kbPostFiles,
    onKbAssetLabelChange,
    onKbAssetFileChange,
    onKbPostFilesChange,
    kbAssetSaving,
    onCreateKbAsset,
    newColorName,
    newColorHex,
    newColorNotes,
    onNewColorNameChange,
    onNewColorHexChange,
    onNewColorNotesChange,
    colorSaving,
    onCreateColor,
    colorDrafts,
    onColorDraftChange,
    onUpdateColor,
    onDeleteColor,
    onRefreshKb,
  } = props;

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-6 lg:p-8">
      <section className="rounded-[30px] border border-stone-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(255,244,236,0.92))] p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">Settings</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-stone-950">Prompts, machine references, and Brand KB controls</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">Prompts define orchestration. Machines define visual truth. Brand KB defines Arrow brand identity across every generated image.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs text-stone-500">
            <span className={cn('h-2.5 w-2.5 rounded-full', settingsData?.configured ? 'bg-emerald-500' : 'bg-amber-500')} />
            {settingsData?.configured ? 'OpenRouter configured' : 'OpenRouter missing key'}
          </div>
        </div>

        <div className="mt-5 inline-flex rounded-full border border-stone-200 bg-white p-1 shadow-sm">
          {(['prompts', 'machines', 'kb'] as ImageStudioSettingsTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn('rounded-full px-4 py-2 text-sm font-semibold transition-colors', activeTab === tab ? 'bg-brand text-white' : 'text-stone-600 hover:text-stone-950')}
            >
              {tab === 'prompts' ? 'Prompts' : tab === 'machines' ? 'Machines' : 'Brand KB'}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {activeTab === 'prompts' ? (
          <>
            <section className="rounded-[30px] border border-stone-200 bg-white/88 p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">Prompt Stack</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Prompts</h3>
                </div>
                {settingsLoading ? <Loader2 className="h-5 w-5 animate-spin text-stone-400" /> : null}
              </div>
              <div className="mt-5 space-y-4">
                {PROMPT_ENTRIES.map((entry) => (
                  <PromptEditorField
                    key={entry.key}
                    label={entry.label}
                    detail={settingsData?.promptUsage[entry.key] ?? ''}
                    value={settingsForm[entry.key]}
                    disabled={settingsLoading || settingsSaving}
                    onChange={(value) => onPromptChange(entry.key, value)}
                  />
                ))}
              </div>
            </section>

            <SidebarCard eyebrow="Model Summary" title="OpenRouter model routing" icon={Settings2} footer={settingsData?.hint}>
              <div className="space-y-3 text-sm text-stone-600">
                <InfoRow label="Chat model" value={settingsData?.chatModel ?? 'Loading...'} />
                <InfoRow label="Image model" value={settingsData?.imageModel ?? 'Loading...'} />
                <InfoRow label="Video model" value={settingsData?.videoModel ?? 'Loading...'} />
                <InfoRow label="Updated" value={settingsData?.updatedAt ? formatDate(settingsData.updatedAt) : 'Not loaded'} />
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <button type="button" onClick={onSavePrompts} disabled={settingsSaving} className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-red-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                  {settingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
                  Save prompts
                </button>
                <button type="button" onClick={onRefreshSettings} className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700">
                  Refresh settings
                </button>
              </div>
            </SidebarCard>
          </>
        ) : activeTab === 'machines' ? (
          <>
            <section className="rounded-[30px] border border-stone-200 bg-white/88 p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">Machine References</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Machines</h3>
                </div>
                {machinesLoading ? <Loader2 className="h-5 w-5 animate-spin text-stone-400" /> : null}
              </div>

              <div className="mt-5 rounded-[24px] border border-stone-200 bg-[#fffaf5] p-4">
                <p className="text-sm font-semibold text-stone-950">Create machine</p>
                <div className="mt-4 space-y-4">
                  <input value={newMachineTitle} onChange={(event) => onNewMachineTitleChange(event.target.value)} placeholder="ArrowJet UV 330H" className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-900 outline-none focus:border-brand/30" />
                  <textarea value={newMachineNotes} onChange={(event) => onNewMachineNotesChange(event.target.value)} rows={4} placeholder="Machine facts, capabilities, selling points..." className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-brand/30" />
                  <input type="file" multiple accept="image/*" onChange={(event) => onNewMachineFilesChange(Array.from(event.target.files ?? []))} className="block w-full text-sm text-stone-600 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-stone-700" />
                  {newMachineFiles.length > 0 ? <p className="text-sm text-stone-600">{newMachineFiles.length} image(s) ready to upload.</p> : null}
                  <button type="button" onClick={onCreateMachine} disabled={!newMachineTitle.trim() || newMachineFiles.length === 0 || machineSaving} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-red-700 px-5 text-sm font-semibold text-white disabled:opacity-60">
                    {machineSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                    Add machine
                  </button>
                </div>
              </div>

              {machines.length > 0 ? (
                <div className="mt-5 rounded-[24px] border border-stone-200 bg-white p-4">
                  <p className="text-sm font-semibold text-stone-950">Manage existing machine</p>
                  <div className="mt-4 space-y-4">
                    <SelectField label="Machine" value={manageMachineId} onChange={onManageMachineIdChange} options={machines.map((machine) => ({ value: machine.id, label: machine.title }))} />
                    <input value={manageMachineTitle} onChange={(event) => onManageMachineTitleChange(event.target.value)} placeholder="Machine title" className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-900 outline-none focus:border-brand/30" />
                    <textarea value={manageMachineNotes} onChange={(event) => onManageMachineNotesChange(event.target.value)} rows={4} placeholder="Machine notes" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-brand/30" />
                    <input type="file" multiple accept="image/*" onChange={(event) => onManageMachineFilesChange(Array.from(event.target.files ?? []))} className="block w-full text-sm text-stone-600 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-stone-700" />
                    {managedMachine ? (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {managedMachine.images.map((image) => (
                          <img key={image.id} src={getImageGenerationMachineImageUrl(image.id)} alt={image.label} className="h-28 w-full rounded-2xl border border-stone-200 bg-[#f8f1eb] object-cover" />
                        ))}
                      </div>
                    ) : null}
                    <button type="button" onClick={onUpdateMachine} disabled={!managedMachine || machineUpdating} className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-stone-200 bg-[#fffaf5] px-5 text-sm font-semibold text-stone-800 disabled:opacity-60">
                      {machineUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Save machine
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyState icon={Database} title="No machines in the database yet" detail="Create the first machine with notes and multiple reference images to start grounding generations." />
                </div>
              )}
            </section>

            <SidebarCard eyebrow="Machine Summary" title="Database status" icon={Database} footer="Machines are now image-first instead of brochure-first">
              <div className="space-y-3 text-sm text-stone-600">
                <InfoRow label="Machines" value={String(machines.length)} />
                <InfoRow label="Selected" value={managedMachine?.title ?? 'None'} />
                <InfoRow label="Reference images" value={String(machines.reduce((count, machine) => count + machine.images.length, 0))} />
              </div>
            </SidebarCard>
          </>
        ) : (
          <>
            <section className="rounded-[30px] border border-stone-200 bg-white/88 p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">Arrow Brand KB</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Brand Knowledge Base</h3>
                </div>
                {kbLoading ? <Loader2 className="h-5 w-5 animate-spin text-stone-400" /> : null}
              </div>

              <div className="mt-5 inline-flex rounded-full border border-stone-200 bg-white p-1 shadow-sm">
                {(['logos', 'posts', 'colors'] as KBSection[]).map((section) => (
                  <button key={section} type="button" onClick={() => onKbSectionChange(section)} className={cn('rounded-full px-4 py-2 text-sm font-semibold transition-colors', kbSection === section ? 'bg-brand text-white' : 'text-stone-600 hover:text-stone-950')}>
                    {section === 'logos' ? 'Logos' : section === 'posts' ? 'Posts' : 'Color Scheme'}
                  </button>
                ))}
              </div>

              {kbSection !== 'colors' ? (
                <div className="mt-5 space-y-5">
	                  <div className="rounded-[24px] border border-stone-200 bg-[#fffaf5] p-4">
	                    <p className="text-sm font-semibold text-stone-950">Add {kbSection === 'logos' ? 'logo' : 'post references'}</p>
	                    {kbSection === 'logos' ? (
	                      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px_auto] md:items-end">
	                        <input value={kbAssetLabel} onChange={(event) => onKbAssetLabelChange(event.target.value)} placeholder="Primary horizontal logo" className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-900 outline-none focus:border-brand/30" />
	                        <input type="file" accept="image/*" onChange={(event) => onKbAssetFileChange(event.target.files?.[0] ?? null)} className="block w-full text-sm text-stone-600 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-stone-700" />
	                        <button type="button" onClick={onCreateKbAsset} disabled={!kbAssetLabel.trim() || !kbAssetFile || kbAssetSaving} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-red-700 px-5 text-sm font-semibold text-white disabled:opacity-60">
	                          {kbAssetSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
	                          Upload
	                        </button>
	                      </div>
	                    ) : (
	                      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
	                        <div>
	                          <input type="file" multiple accept="image/*" onChange={(event) => onKbPostFilesChange(Array.from(event.target.files ?? []))} className="block w-full text-sm text-stone-600 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-stone-700" />
	                          <p className="mt-2 text-sm text-stone-600">
	                            {kbPostFiles.length > 0 ? `${kbPostFiles.length} post reference image(s) ready to upload.` : 'Upload downloaded LinkedIn post images. Filenames will be used automatically.'}
	                          </p>
	                        </div>
	                        <button type="button" onClick={onCreateKbAsset} disabled={kbPostFiles.length === 0 || kbAssetSaving} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-red-700 px-5 text-sm font-semibold text-white disabled:opacity-60">
	                          {kbAssetSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
	                          Upload posts
	                        </button>
	                      </div>
	                    )}
	                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {(kbSection === 'logos' ? kbData.logos : kbData.posts).map((asset) => (
                      <AssetCard key={asset.id} asset={asset} imageUrl={getImageGenerationKbAssetUrl(asset.id)} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <div className="rounded-[24px] border border-stone-200 bg-[#fffaf5] p-4">
                    <p className="text-sm font-semibold text-stone-950">Add brand color</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)_auto] md:items-end">
                      <input value={newColorName} onChange={(event) => onNewColorNameChange(event.target.value)} placeholder="Arrow Red" className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-900 outline-none focus:border-brand/30" />
                      <input value={newColorHex} onChange={(event) => onNewColorHexChange(event.target.value)} placeholder="#C41E3A" className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-900 outline-none focus:border-brand/30" />
                      <input value={newColorNotes} onChange={(event) => onNewColorNotesChange(event.target.value)} placeholder="Primary CTA and accent color" className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-900 outline-none focus:border-brand/30" />
                      <button type="button" onClick={onCreateColor} disabled={!newColorName.trim() || !newColorHex.trim() || colorSaving} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-red-700 px-5 text-sm font-semibold text-white disabled:opacity-60">
                        {colorSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />}
                        Add color
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {kbData.colors.map((color) => {
                      const draft = colorDrafts[color.id] ?? color;
                      return (
                        <div key={color.id} className="rounded-[24px] border border-stone-200 bg-white p-4 shadow-sm">
                          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)_auto_auto] md:items-end">
                            <input value={draft.name} onChange={(event) => onColorDraftChange(color.id, (current) => ({ ...current, name: event.target.value }))} className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-900 outline-none focus:border-brand/30" />
                            <input value={draft.hex} onChange={(event) => onColorDraftChange(color.id, (current) => ({ ...current, hex: event.target.value }))} className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-900 outline-none focus:border-brand/30" />
                            <input value={draft.notes} onChange={(event) => onColorDraftChange(color.id, (current) => ({ ...current, notes: event.target.value }))} className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-900 outline-none focus:border-brand/30" />
                            <button type="button" onClick={() => onUpdateColor(color.id)} className="inline-flex h-12 items-center justify-center rounded-full border border-stone-200 bg-[#fffaf5] px-4 text-sm font-semibold text-stone-800">
                              Save
                            </button>
                            <button type="button" onClick={() => onDeleteColor(color.id)} className="inline-flex h-12 items-center justify-center rounded-full border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700">
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <SidebarCard eyebrow="Brand KB Summary" title="Brand coverage" icon={Palette} footer="Brand KB is applied to every generation by default">
              <div className="space-y-3 text-sm text-stone-600">
                <InfoRow label="Logos" value={String(kbData.logos.length)} />
                <InfoRow label="Post refs" value={String(kbData.posts.length)} />
                <InfoRow label="Colors" value={String(kbData.colors.length)} />
              </div>
              <button type="button" onClick={onRefreshKb} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700">
                <RefreshCw className="h-4 w-4" />
                Refresh Brand KB
              </button>
            </SidebarCard>
          </>
        )}
      </div>
    </div>
  );
}

function AssetCard({ asset, imageUrl }: { asset: KBAssetSummary; imageUrl: string }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-stone-200 bg-white shadow-sm">
      <img src={imageUrl} alt={asset.label} className="h-44 w-full bg-[#f8f1eb] object-cover" />
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-stone-950">{asset.label}</p>
        <p className="mt-1 text-sm text-stone-600">{asset.fileName}</p>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-stone-200 bg-white/80 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-brand/15 bg-brand/5 text-brand">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{label}</p>
          <p className="mt-1 text-sm font-semibold text-stone-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function OverviewStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-stone-200 bg-[#fffaf5] p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand">{number}</p>
      <h4 className="mt-3 text-lg font-semibold tracking-tight text-stone-950">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-stone-600">{detail}</p>
    </div>
  );
}

function SidebarCard({
  eyebrow,
  title,
  icon: Icon,
  footer,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: LucideIcon;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-stone-200 bg-white/90 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{eyebrow}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">{title}</h3>
        </div>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand/15 bg-brand/5 text-brand">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-4">{children}</div>
      {footer ? <p className="mt-4 text-sm leading-6 text-stone-500">{footer}</p> : null}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-stone-200 bg-white/90 px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{label}</p>
      <p className="mt-1 text-sm leading-6 text-stone-700">{value}</p>
    </div>
  );
}

function PromptEditorField({
  label,
  detail,
  value,
  disabled,
  onChange,
}: {
  label: string;
  detail: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-[24px] border border-stone-200 bg-[#fffaf5] p-4 shadow-sm">
      <p className="text-sm font-semibold text-stone-950">{label}</p>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">{detail}</p>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        className="mt-4 w-full rounded-[20px] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none focus:border-brand/30 disabled:cursor-not-allowed disabled:bg-stone-50"
      />
    </label>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-stone-300 bg-[#fffaf5] px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/15 bg-brand/5 text-brand">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-xl font-semibold tracking-tight text-stone-950">{title}</h3>
      <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">{detail}</p>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-red-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(196,30,58,0.28)]">
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block sm:min-w-[220px]">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{label}</p>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-[46px] w-full appearance-none rounded-2xl border border-stone-200 bg-white px-4 pr-10 text-sm font-medium text-stone-800 outline-none focus:border-brand/30"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
      </div>
    </label>
  );
}
