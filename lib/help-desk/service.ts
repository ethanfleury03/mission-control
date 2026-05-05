import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { extractJsonObject, runChatCompletion } from '@/lib/rag/providers';
import {
  HELP_DESK_DEVELOPER_EMAIL,
  isTicketActivityEventType,
  isTicketAIPlanStatus,
  isTicketCategory,
  isTicketCommentVisibility,
  isTicketStatus,
  isTicketUrgency,
  isTicketVisibility,
  type TicketActivityEventDTO,
  type TicketActivityEventType,
  type TicketAIPlanDTO,
  type TicketCategory,
  type TicketCommentDTO,
  type TicketCommentVisibility,
  type TicketDTO,
  type TicketStatus,
  type TicketUrgency,
  type TicketVisibility,
} from './types';

export interface HelpDeskActor {
  appUserId: string | null;
  email: string;
}

type TicketRecord = {
  id: string;
  title: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  requestedDate: Date | null;
  nextStep?: string;
  businessImpact: string;
  attachmentNote: string;
  createdByUserId: string;
  createdByName: string;
  createdByEmail: string;
  requesterColor?: string;
  team: string;
  assignedToEmail: string;
  visibility: string;
  sortOrder: number;
  archivedAt: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  comments?: CommentRecord[];
  aiPlans?: AIPlanRecord[];
  activityEvents?: ActivityEventRecord[];
  _count?: { comments: number };
};

type CommentRecord = {
  id: string;
  ticketId: string;
  authorUserId: string;
  authorName: string;
  authorEmail: string;
  body: string;
  visibility?: string;
  createdAt: Date;
  updatedAt?: Date;
};

type AIPlanRecord = {
  id: string;
  ticketId: string;
  status: string;
  summary: string;
  stepsJson: string;
  suggestedPrompt: string;
  filesToInspectJson: string;
  questionsToAskJson: string;
  validationChecklistJson: string;
  riskNotesJson: string;
  errorMessage: string;
  generatedAt: Date;
  generatedByModel: string;
  createdAt: Date;
  updatedAt: Date;
};

type ActivityEventRecord = {
  id: string;
  ticketId: string;
  type: string;
  actorUserId: string;
  actorName: string;
  actorEmail: string;
  summary: string;
  metadataJson: string;
  createdAt: Date;
};

type ActorProfile = {
  appUserId: string;
  email: string;
  name: string;
};

type TicketMapOptions = {
  includeComments?: boolean;
  includeDeveloperData?: boolean;
};

type AIPlanPayload = {
  summary?: unknown;
  steps?: unknown;
  suggestedPrompt?: unknown;
};

const DEFAULT_AI_PLAN_MODEL = 'anthropic/claude-opus-4.7';
const DEFAULT_AI_PLAN_MAX_TOKENS = 8000;

export class HelpDeskHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HelpDeskHttpError';
    this.status = status;
  }
}

export function isDeveloperEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === HELP_DESK_DEVELOPER_EMAIL;
}

export async function getHelpDeskActor(actor: HelpDeskActor): Promise<ActorProfile> {
  const email = normalizeEmail(actor.email);
  if (shouldUseFileStore()) {
    return {
      appUserId: actor.appUserId ?? '',
      email,
      name: nameFromEmail(email),
    };
  }

  const user = actor.appUserId
    ? await prisma.appUser.findUnique({ where: { id: actor.appUserId } })
    : await prisma.appUser.findUnique({ where: { email } });

  return {
    appUserId: user?.id ?? actor.appUserId ?? '',
    email,
    name: user?.name?.trim() || nameFromEmail(email),
  };
}

export async function listVisibleTickets(actor: HelpDeskActor): Promise<TicketDTO[]> {
  if (shouldUseFileStore()) return listVisibleTicketsFromFile(actor);

  const email = normalizeEmail(actor.email);
  const developer = isDeveloperEmail(email);
  const tickets = await prisma.helpDeskTicket.findMany({
    where: developer ? { archivedAt: null } : visibleTicketWhere(email),
    orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { updatedAt: 'desc' }],
    include: ticketInclude({ includeDeveloperData: developer, list: true }),
  });

  return tickets.map((ticket) => mapTicket(ticket as TicketRecord, { includeDeveloperData: developer }));
}

export async function listDeveloperTickets(actor: HelpDeskActor): Promise<TicketDTO[]> {
  assertDeveloperActor(actor.email);
  if (shouldUseFileStore()) return listDeveloperTicketsFromFile(actor);

  const tickets = await prisma.helpDeskTicket.findMany({
    where: { archivedAt: null },
    orderBy: [{ urgency: 'desc' }, { updatedAt: 'desc' }],
    include: ticketInclude({ includeDeveloperData: true, list: true }),
  });

  return tickets.map((ticket) => mapTicket(ticket as TicketRecord, { includeDeveloperData: true }));
}

export async function getVisibleTicket(actor: HelpDeskActor, ticketId: string): Promise<TicketDTO> {
  if (shouldUseFileStore()) return getVisibleTicketFromFile(actor, ticketId);

  const email = normalizeEmail(actor.email);
  const developer = isDeveloperEmail(email);
  const ticket = await prisma.helpDeskTicket.findFirst({
    where: developer ? { id: ticketId, archivedAt: null } : { id: ticketId, ...visibleTicketWhere(email) },
    include: ticketInclude({ includeDeveloperData: developer, includeComments: true }),
  });
  if (!ticket) throw new HelpDeskHttpError(404, 'Ticket not found.');
  return mapTicket(ticket as TicketRecord, { includeComments: true, includeDeveloperData: developer });
}

export async function createTicket(actor: HelpDeskActor, input: unknown): Promise<TicketDTO> {
  if (shouldUseFileStore()) return createTicketInFile(actor, input);

  const requester = await getHelpDeskActor(actor);
  const body = asObject(input);
  const developer = isDeveloperEmail(actor.email);
  const requesterEmail = developer
    ? optionalEmail(body.createdByEmail) || optionalEmail(body.requesterEmail) || requester.email
    : requester.email;
  const requesterName = developer
    ? optionalString(body.createdByName) || optionalString(body.requesterName) || nameFromEmail(requesterEmail)
    : requester.name;
  const status = optionalEnum<TicketStatus>(body.status, isTicketStatus) ?? 'open';
  const now = new Date();

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.helpDeskTicket.create({
      data: {
        title: requiredString(body.title, 'Title'),
        description: requiredString(body.description, 'Description'),
        urgency: optionalEnum<TicketUrgency>(body.urgency, isTicketUrgency) ?? 'normal',
        category: optionalEnum<TicketCategory>(body.category, isTicketCategory) ?? 'other',
        requestedDate: optionalDate(body.requestedDate),
        nextStep: optionalString(body.nextStep),
        businessImpact: optionalString(body.businessImpact),
        attachmentNote: optionalString(body.attachmentNote),
        createdByUserId: developer ? optionalString(body.createdByUserId) : requester.appUserId,
        createdByName: requesterName,
        createdByEmail: requesterEmail,
        requesterColor: optionalString(body.requesterColor) || stableRequesterColor(requesterEmail),
        team: optionalString(body.team),
        visibility: optionalEnum<TicketVisibility>(body.visibility, isTicketVisibility) ?? 'team',
        status,
        finishedAt: status === 'finished' ? now : null,
        assignedToEmail: HELP_DESK_DEVELOPER_EMAIL,
      },
    });
    await createActivityEventTx(tx, created.id, requester, 'create', 'Ticket created', {
      status,
      developerCreated: developer,
    });
    return tx.helpDeskTicket.findUniqueOrThrow({
      where: { id: created.id },
      include: ticketInclude({ includeDeveloperData: developer, includeComments: true }),
    });
  });

  return mapTicket(ticket as TicketRecord, { includeComments: true, includeDeveloperData: developer });
}

export async function updateTicket(
  actor: HelpDeskActor,
  ticketId: string,
  input: unknown,
): Promise<TicketDTO> {
  if (shouldUseFileStore()) return updateTicketInFile(actor, ticketId, input);

  const email = normalizeEmail(actor.email);
  const developer = isDeveloperEmail(email);
  const existing = await prisma.helpDeskTicket.findFirst({
    where: developer ? { id: ticketId, archivedAt: null } : { id: ticketId, ...visibleTicketWhere(email) },
  });
  if (!existing) throw new HelpDeskHttpError(404, 'Ticket not found.');

  const body = asObject(input);
  const data = buildTicketUpdateData(body, {
    developer,
    isOwner: normalizeEmail(existing.createdByEmail) === email,
    existingStatus: existing.status,
  });
  if (Object.keys(data).length === 0) {
    throw new HelpDeskHttpError(400, 'No ticket changes were provided.');
  }

  const actorProfile = await getHelpDeskActor(actor);
  const ticket = await prisma.$transaction(async (tx) => {
    const updated = await tx.helpDeskTicket.update({ where: { id: ticketId }, data });
    const changedStatus = typeof data.status === 'string' && data.status !== existing.status;
    await createActivityEventTx(
      tx,
      ticketId,
      actorProfile,
      changedStatus ? 'status' : 'update',
      changedStatus ? `Status changed to ${statusLabel(updated.status)}` : 'Ticket details updated',
      { changedFields: Object.keys(data), previousStatus: existing.status, status: updated.status },
    );
    return tx.helpDeskTicket.findUniqueOrThrow({
      where: { id: ticketId },
      include: ticketInclude({ includeDeveloperData: developer, includeComments: true }),
    });
  });

  return mapTicket(ticket as TicketRecord, { includeComments: true, includeDeveloperData: developer });
}

export async function archiveTicket(actor: HelpDeskActor, ticketId: string): Promise<void> {
  if (shouldUseFileStore()) return archiveTicketInFile(actor, ticketId);

  const email = normalizeEmail(actor.email);
  const developer = isDeveloperEmail(email);
  const existing = await prisma.helpDeskTicket.findFirst({
    where: developer ? { id: ticketId, archivedAt: null } : { id: ticketId, ...visibleTicketWhere(email) },
  });
  if (!existing) throw new HelpDeskHttpError(404, 'Ticket not found.');
  if (!developer && normalizeEmail(existing.createdByEmail) !== email) {
    throw new HelpDeskHttpError(403, 'Only the requester can delete this ticket.');
  }

  const actorProfile = await getHelpDeskActor(actor);
  await prisma.$transaction(async (tx) => {
    await tx.helpDeskTicket.update({ where: { id: ticketId }, data: { archivedAt: new Date() } });
    await createActivityEventTx(tx, ticketId, actorProfile, 'archive', 'Ticket archived', {});
  });
}

export async function addTicketComment(
  actor: HelpDeskActor,
  ticketId: string,
  input: unknown,
): Promise<TicketDTO> {
  if (shouldUseFileStore()) return addTicketCommentInFile(actor, ticketId, input);

  const email = normalizeEmail(actor.email);
  const developer = isDeveloperEmail(email);
  const existing = await prisma.helpDeskTicket.findFirst({
    where: developer ? { id: ticketId, archivedAt: null } : { id: ticketId, ...visibleTicketWhere(email) },
  });
  if (!existing) throw new HelpDeskHttpError(404, 'Ticket not found.');
  const body = asObject(input);
  const visibility = developer
    ? optionalEnum<TicketCommentVisibility>(body.visibility, isTicketCommentVisibility) ?? 'public'
    : 'public';
  const author = await getHelpDeskActor(actor);

  const ticket = await prisma.$transaction(async (tx) => {
    await tx.helpDeskTicketComment.create({
      data: {
        ticketId,
        authorUserId: author.appUserId,
        authorName: author.name,
        authorEmail: author.email,
        body: requiredString(body.body, 'Comment'),
        visibility,
      },
    });
    await tx.helpDeskTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
    await createActivityEventTx(
      tx,
      ticketId,
      author,
      'comment',
      visibility === 'internal' ? 'Internal note added' : 'Public update added',
      { visibility },
    );
    return tx.helpDeskTicket.findUniqueOrThrow({
      where: { id: ticketId },
      include: ticketInclude({ includeDeveloperData: developer, includeComments: true }),
    });
  });

  return mapTicket(ticket as TicketRecord, { includeComments: true, includeDeveloperData: developer });
}

export async function listTicketComments(actor: HelpDeskActor, ticketId: string): Promise<TicketCommentDTO[]> {
  const ticket = await getVisibleTicket(actor, ticketId);
  return ticket.comments ?? [];
}

export async function generateTicketAIPlan(actor: HelpDeskActor, ticketId: string): Promise<TicketDTO> {
  assertDeveloperActor(actor.email);
  if (shouldUseFileStore()) return generateTicketAIPlanInFile(actor, ticketId);

  const actorProfile = await getHelpDeskActor(actor);
  const ticket = await prisma.helpDeskTicket.findFirst({
    where: { id: ticketId, archivedAt: null },
    include: ticketInclude({ includeDeveloperData: true, includeComments: true }),
  });
  if (!ticket) throw new HelpDeskHttpError(404, 'Ticket not found.');

  let planId = '';
  await prisma.$transaction(async (tx) => {
    const plan = await tx.helpDeskTicketAIPlan.create({
      data: {
        ticketId,
        status: 'generating',
        generatedAt: new Date(),
        generatedByModel: '',
      },
    });
    planId = plan.id;
    await createActivityEventTx(tx, ticketId, actorProfile, 'ai', 'AI plan generation started', {});
  });

  try {
    const result = await runChatCompletion({
      task: 'long_context',
      provider: 'openrouter',
      model: getAIPlanModel(),
      responseFormat: 'json',
      temperature: 0.2,
      maxTokens: getAIPlanMaxTokens(),
      timeoutMs: 60_000,
      messages: aiPlanMessages(mapTicket(ticket as TicketRecord, {
        includeComments: true,
        includeDeveloperData: true,
      })),
    });
    const parsed = extractJsonObject<AIPlanPayload>(result.content);
    if (!parsed) throw new Error('AI plan response was not valid JSON.');
    await prisma.$transaction(async (tx) => {
      await tx.helpDeskTicketAIPlan.update({
        where: { id: planId },
        data: {
          status: 'ready',
          summary: stringValue(parsed.summary),
          stepsJson: JSON.stringify(normalizeStringArray(parsed.steps)),
          suggestedPrompt: stringValue(parsed.suggestedPrompt),
          filesToInspectJson: '[]',
          questionsToAskJson: '[]',
          validationChecklistJson: '[]',
          riskNotesJson: '[]',
          errorMessage: '',
          generatedAt: new Date(),
          generatedByModel: result.model,
        },
      });
      await createActivityEventTx(tx, ticketId, actorProfile, 'ai', 'AI plan generated', {
        model: result.model,
        provider: result.provider,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI plan generation failed.';
    await prisma.$transaction(async (tx) => {
      await tx.helpDeskTicketAIPlan.update({
        where: { id: planId },
        data: {
          status: 'failed',
          errorMessage: message,
          generatedAt: new Date(),
        },
      });
      await createActivityEventTx(tx, ticketId, actorProfile, 'ai', 'AI plan generation failed', { error: message });
    });
  }

  return getVisibleTicket(actor, ticketId);
}

export function helpDeskErrorResponse(error: unknown) {
  if (error instanceof HelpDeskHttpError) {
    return { status: error.status, message: error.message };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : 'Help Desk request failed.',
  };
}

function ticketInclude(options: { includeDeveloperData: boolean; includeComments?: boolean; list?: boolean }) {
  const commentWhere = options.includeDeveloperData ? undefined : { visibility: 'public' };
  const comments = options.includeComments
    ? { where: commentWhere, orderBy: { createdAt: 'asc' as const } }
    : { where: commentWhere, orderBy: { createdAt: 'desc' as const }, take: 1 };
  return {
    comments,
    aiPlans: options.includeDeveloperData
      ? { orderBy: { generatedAt: 'desc' as const }, take: 1 }
      : false,
    activityEvents: options.includeDeveloperData && !options.list
      ? { orderBy: { createdAt: 'asc' as const } }
      : false,
    _count: { select: { comments: { where: commentWhere } } },
  };
}

function visibleTicketWhere(email: string) {
  return {
    archivedAt: null,
    OR: [
      { createdByEmail: email },
      { visibility: { in: ['team', 'company'] } },
    ],
  };
}

function assertDeveloperActor(email: string) {
  if (!isDeveloperEmail(email)) {
    throw new HelpDeskHttpError(403, 'Developer ticket data is restricted to Ethan.');
  }
}

function buildTicketUpdateData(
  body: Record<string, unknown>,
  options: { developer: boolean; isOwner: boolean; existingStatus: string },
): Record<string, unknown> {
  const ownerFields = [
    'title',
    'description',
    'urgency',
    'category',
    'requestedDate',
    'businessImpact',
    'attachmentNote',
    'team',
    'visibility',
  ];
  const developerFields = [
    ...ownerFields,
    'nextStep',
    'createdByName',
    'createdByEmail',
    'requesterColor',
    'assignedToEmail',
  ];
  const requestedProtectedEdit = (options.developer ? developerFields : ownerFields).some((field) =>
    Object.prototype.hasOwnProperty.call(body, field),
  );
  if (!options.developer && requestedProtectedEdit && !options.isOwner) {
    throw new HelpDeskHttpError(403, 'Only the requester can edit ticket details.');
  }

  const data: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = enumValue<TicketStatus>(body.status, isTicketStatus, 'Status');
    data.status = status;
    if (status === 'finished' && options.existingStatus !== 'finished') data.finishedAt = new Date();
    if (status !== 'finished' && options.existingStatus === 'finished') data.finishedAt = null;
  }
  if (options.developer || options.isOwner) {
    if (Object.prototype.hasOwnProperty.call(body, 'title')) data.title = requiredString(body.title, 'Title');
    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      data.description = requiredString(body.description, 'Description');
    }
    if (Object.prototype.hasOwnProperty.call(body, 'urgency')) {
      data.urgency = enumValue<TicketUrgency>(body.urgency, isTicketUrgency, 'Urgency');
    }
    if (Object.prototype.hasOwnProperty.call(body, 'category')) {
      data.category = enumValue<TicketCategory>(body.category, isTicketCategory, 'Category');
    }
    if (Object.prototype.hasOwnProperty.call(body, 'requestedDate')) data.requestedDate = optionalDate(body.requestedDate);
    if (Object.prototype.hasOwnProperty.call(body, 'businessImpact')) data.businessImpact = optionalString(body.businessImpact);
    if (Object.prototype.hasOwnProperty.call(body, 'attachmentNote')) data.attachmentNote = optionalString(body.attachmentNote);
    if (Object.prototype.hasOwnProperty.call(body, 'team')) data.team = optionalString(body.team);
    if (Object.prototype.hasOwnProperty.call(body, 'visibility')) {
      data.visibility = enumValue<TicketVisibility>(body.visibility, isTicketVisibility, 'Visibility');
    }
  }
  if (options.developer) {
    if (Object.prototype.hasOwnProperty.call(body, 'nextStep')) data.nextStep = optionalString(body.nextStep);
    if (Object.prototype.hasOwnProperty.call(body, 'createdByName')) data.createdByName = optionalString(body.createdByName);
    if (Object.prototype.hasOwnProperty.call(body, 'createdByEmail')) {
      data.createdByEmail = optionalEmail(body.createdByEmail) || '';
      data.requesterColor = optionalString(body.requesterColor) || stableRequesterColor(String(data.createdByEmail));
    }
    if (Object.prototype.hasOwnProperty.call(body, 'requesterColor')) data.requesterColor = optionalString(body.requesterColor);
    if (Object.prototype.hasOwnProperty.call(body, 'assignedToEmail')) {
      data.assignedToEmail = optionalEmail(body.assignedToEmail) || HELP_DESK_DEVELOPER_EMAIL;
    }
  }
  return data;
}

async function createActivityEventTx(
  tx: Prisma.TransactionClient,
  ticketId: string,
  actor: ActorProfile,
  type: TicketActivityEventType,
  summary: string,
  metadata: Record<string, unknown>,
) {
  await tx.helpDeskTicketActivityEvent.create({
    data: {
      ticketId,
      type,
      actorUserId: actor.appUserId,
      actorName: actor.name,
      actorEmail: actor.email,
      summary,
      metadataJson: JSON.stringify(metadata),
    },
  });
}

function aiPlanMessages(ticket: TicketDTO) {
  return [
    {
      role: 'system' as const,
      content: [
        'You are the AI engineer who builds practical solutions for Arrow Systems. Your job is to turn an internal help desk ticket into a short, useful implementation plan Ethan can act on.',
        '',
        'Keep the plan proportional to the ticket. For simple access/config/admin requests, be brief. For ambiguous tickets, mention the one or two clarifications needed inside the steps instead of creating separate question or risk sections.',
        '',
        'Use the ticket fields, public updates, and internal notes as the source of truth. Do not invent business requirements, credentials, approvals, files, APIs, or external systems that are not implied by the ticket. If the safest answer is no code change, say that plainly.',
        '',
        'Return strict JSON only. The JSON must have exactly these keys:',
        '- summary: 1 short sentence, maximum 28 words.',
        '- steps: 3 to 5 concise implementation actions, each maximum 18 words.',
        '- suggestedPrompt: a compact Codex prompt Ethan can run if code or config work is needed. If no code is needed, provide a short operational instruction instead.',
        '',
        'Do not include filesToInspect, questionsToAsk, validationChecklist, riskNotes, markdown fences, headings, or commentary outside the JSON object.',
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: JSON.stringify(
        {
          ticket: {
            title: ticket.title,
            requester: `${ticket.createdByName} <${ticket.createdByEmail}>`,
            team: ticket.team,
            category: ticket.category,
            urgency: ticket.urgency,
            status: ticket.status,
            requestedDate: ticket.requestedDate,
            attachmentNote: ticket.attachmentNote,
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt,
            description: ticket.description,
            businessImpact: ticket.businessImpact,
            nextStep: ticket.nextStep,
            comments: (ticket.comments ?? []).map((comment) => ({
              author: `${comment.authorName} <${comment.authorEmail}>`,
              visibility: comment.visibility,
              body: comment.body,
            })),
          },
        },
        null,
        2,
      ),
    },
  ];
}

function getAIPlanModel(): string {
  return process.env.HELP_DESK_AI_PLAN_MODEL?.trim() || DEFAULT_AI_PLAN_MODEL;
}

function getAIPlanMaxTokens(): number {
  const raw = process.env.HELP_DESK_AI_PLAN_MAX_TOKENS?.trim();
  if (!raw) return DEFAULT_AI_PLAN_MAX_TOKENS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1000) return DEFAULT_AI_PLAN_MAX_TOKENS;
  return Math.min(parsed, 16000);
}

type FileTicketRecord = {
  id: string;
  title: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  requestedDate: string | null;
  nextStep?: string;
  businessImpact: string;
  attachmentNote: string;
  createdByUserId: string;
  createdByName: string;
  createdByEmail: string;
  requesterColor?: string;
  team: string;
  assignedToEmail: string;
  visibility: string;
  sortOrder: number;
  archivedAt: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type FileCommentRecord = {
  id: string;
  ticketId: string;
  authorUserId: string;
  authorName: string;
  authorEmail: string;
  body: string;
  visibility?: string;
  createdAt: string;
  updatedAt?: string;
};

type FileAIPlanRecord = Omit<AIPlanRecord, 'generatedAt' | 'createdAt' | 'updatedAt'> & {
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
};

type FileActivityEventRecord = Omit<ActivityEventRecord, 'createdAt'> & {
  createdAt: string;
};

type FileStoreState = {
  tickets: FileTicketRecord[];
  comments: FileCommentRecord[];
  aiPlans: FileAIPlanRecord[];
  activityEvents: FileActivityEventRecord[];
};

const FILE_STORE_PATH = path.join(process.cwd(), 'data', 'help-desk-tickets.json');

function shouldUseFileStore(): boolean {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  return process.env.HELP_DESK_FILE_STORE === '1' || !/^postgres(?:ql)?:\/\//i.test(databaseUrl);
}

async function listVisibleTicketsFromFile(actor: HelpDeskActor): Promise<TicketDTO[]> {
  const email = normalizeEmail(actor.email);
  const developer = isDeveloperEmail(email);
  const state = await readFileStore();
  return state.tickets
    .filter((ticket) => canSeeFileTicket(ticket, email))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((ticket) => mapFileTicket(ticket, state, { includeDeveloperData: developer }));
}

async function listDeveloperTicketsFromFile(actor: HelpDeskActor): Promise<TicketDTO[]> {
  assertDeveloperActor(actor.email);
  const state = await readFileStore();
  return state.tickets
    .filter((ticket) => !ticket.archivedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((ticket) => mapFileTicket(ticket, state, { includeDeveloperData: true }));
}

async function getVisibleTicketFromFile(actor: HelpDeskActor, ticketId: string): Promise<TicketDTO> {
  const email = normalizeEmail(actor.email);
  const developer = isDeveloperEmail(email);
  const state = await readFileStore();
  const ticket = state.tickets.find((item) => item.id === ticketId && canSeeFileTicket(item, email));
  if (!ticket) throw new HelpDeskHttpError(404, 'Ticket not found.');
  return mapFileTicket(ticket, state, { includeComments: true, includeDeveloperData: developer });
}

async function createTicketInFile(actor: HelpDeskActor, input: unknown): Promise<TicketDTO> {
  const requester = await getHelpDeskActor(actor);
  const body = asObject(input);
  const developer = isDeveloperEmail(actor.email);
  const requesterEmail = developer
    ? optionalEmail(body.createdByEmail) || optionalEmail(body.requesterEmail) || requester.email
    : requester.email;
  const now = new Date().toISOString();
  const status = optionalEnum<TicketStatus>(body.status, isTicketStatus) ?? 'open';
  const ticket: FileTicketRecord = {
    id: createId('ticket'),
    title: requiredString(body.title, 'Title'),
    description: requiredString(body.description, 'Description'),
    urgency: optionalEnum<TicketUrgency>(body.urgency, isTicketUrgency) ?? 'normal',
    category: optionalEnum<TicketCategory>(body.category, isTicketCategory) ?? 'other',
    requestedDate: optionalDate(body.requestedDate)?.toISOString() ?? null,
    nextStep: optionalString(body.nextStep),
    businessImpact: optionalString(body.businessImpact),
    attachmentNote: optionalString(body.attachmentNote),
    createdByUserId: developer ? optionalString(body.createdByUserId) : requester.appUserId,
    createdByName: developer
      ? optionalString(body.createdByName) || optionalString(body.requesterName) || nameFromEmail(requesterEmail)
      : requester.name,
    createdByEmail: requesterEmail,
    requesterColor: optionalString(body.requesterColor) || stableRequesterColor(requesterEmail),
    team: optionalString(body.team),
    visibility: optionalEnum<TicketVisibility>(body.visibility, isTicketVisibility) ?? 'team',
    status,
    assignedToEmail: HELP_DESK_DEVELOPER_EMAIL,
    sortOrder: 0,
    archivedAt: null,
    finishedAt: status === 'finished' ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  const state = await readFileStore();
  state.tickets.unshift(ticket);
  state.activityEvents.push(fileActivity(ticket.id, requester, 'create', 'Ticket created', { status }));
  await writeFileStore(state);
  return mapFileTicket(ticket, state, { includeComments: true, includeDeveloperData: developer });
}

async function updateTicketInFile(actor: HelpDeskActor, ticketId: string, input: unknown): Promise<TicketDTO> {
  const email = normalizeEmail(actor.email);
  const developer = isDeveloperEmail(email);
  const body = asObject(input);
  const state = await readFileStore();
  const index = state.tickets.findIndex((item) => item.id === ticketId && canSeeFileTicket(item, email));
  if (index < 0) throw new HelpDeskHttpError(404, 'Ticket not found.');
  const existing = state.tickets[index];
  if (!existing) throw new HelpDeskHttpError(404, 'Ticket not found.');
  const data = buildTicketUpdateData(body, {
    developer,
    isOwner: normalizeEmail(existing.createdByEmail) === email,
    existingStatus: existing.status,
  });
  if (Object.keys(data).length === 0) throw new HelpDeskHttpError(400, 'No ticket changes were provided.');
  const next: FileTicketRecord = { ...existing };
  for (const [key, value] of Object.entries(data)) {
    (next as Record<string, unknown>)[key] = value instanceof Date ? value.toISOString() : value;
  }
  next.updatedAt = new Date().toISOString();
  state.tickets[index] = next;
  const actorProfile = await getHelpDeskActor(actor);
  state.activityEvents.push(
    fileActivity(
      ticketId,
      actorProfile,
      data.status && data.status !== existing.status ? 'status' : 'update',
      data.status && data.status !== existing.status ? `Status changed to ${statusLabel(String(data.status))}` : 'Ticket details updated',
      { changedFields: Object.keys(data), previousStatus: existing.status, status: next.status },
    ),
  );
  await writeFileStore(state);
  return mapFileTicket(next, state, { includeComments: true, includeDeveloperData: developer });
}

async function archiveTicketInFile(actor: HelpDeskActor, ticketId: string): Promise<void> {
  const email = normalizeEmail(actor.email);
  const developer = isDeveloperEmail(email);
  const state = await readFileStore();
  const index = state.tickets.findIndex((item) => item.id === ticketId && canSeeFileTicket(item, email));
  if (index < 0) throw new HelpDeskHttpError(404, 'Ticket not found.');
  const existing = state.tickets[index];
  if (!existing) throw new HelpDeskHttpError(404, 'Ticket not found.');
  if (!developer && normalizeEmail(existing.createdByEmail) !== email) {
    throw new HelpDeskHttpError(403, 'Only the requester can delete this ticket.');
  }
  const actorProfile = await getHelpDeskActor(actor);
  state.tickets[index] = { ...existing, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  state.activityEvents.push(fileActivity(ticketId, actorProfile, 'archive', 'Ticket archived', {}));
  await writeFileStore(state);
}

async function addTicketCommentInFile(actor: HelpDeskActor, ticketId: string, input: unknown): Promise<TicketDTO> {
  const email = normalizeEmail(actor.email);
  const developer = isDeveloperEmail(email);
  const state = await readFileStore();
  const index = state.tickets.findIndex((item) => item.id === ticketId && canSeeFileTicket(item, email));
  if (index < 0) throw new HelpDeskHttpError(404, 'Ticket not found.');
  const existing = state.tickets[index];
  if (!existing) throw new HelpDeskHttpError(404, 'Ticket not found.');
  const body = asObject(input);
  const author = await getHelpDeskActor(actor);
  const now = new Date().toISOString();
  const visibility = developer
    ? optionalEnum<TicketCommentVisibility>(body.visibility, isTicketCommentVisibility) ?? 'public'
    : 'public';
  state.comments.push({
    id: createId('comment'),
    ticketId,
    authorUserId: author.appUserId,
    authorName: author.name,
    authorEmail: author.email,
    body: requiredString(body.body, 'Comment'),
    visibility,
    createdAt: now,
    updatedAt: now,
  });
  state.tickets[index] = { ...existing, updatedAt: now };
  state.activityEvents.push(
    fileActivity(ticketId, author, 'comment', visibility === 'internal' ? 'Internal note added' : 'Public update added', {
      visibility,
    }),
  );
  await writeFileStore(state);
  return mapFileTicket(state.tickets[index], state, { includeComments: true, includeDeveloperData: developer });
}

async function generateTicketAIPlanInFile(actor: HelpDeskActor, ticketId: string): Promise<TicketDTO> {
  const state = await readFileStore();
  const ticket = state.tickets.find((item) => item.id === ticketId && !item.archivedAt);
  if (!ticket) throw new HelpDeskHttpError(404, 'Ticket not found.');
  const actorProfile = await getHelpDeskActor(actor);
  const now = new Date().toISOString();
  const plan: FileAIPlanRecord = {
    id: createId('plan'),
    ticketId,
    status: 'generating',
    summary: '',
    stepsJson: '[]',
    suggestedPrompt: '',
    filesToInspectJson: '[]',
    questionsToAskJson: '[]',
    validationChecklistJson: '[]',
    riskNotesJson: '[]',
    errorMessage: '',
    generatedAt: now,
    generatedByModel: '',
    createdAt: now,
    updatedAt: now,
  };
  state.aiPlans.push(plan);
  state.activityEvents.push(fileActivity(ticketId, actorProfile, 'ai', 'AI plan generation started', {}));
  await writeFileStore(state);

  try {
    const result = await runChatCompletion({
      task: 'long_context',
      provider: 'openrouter',
      model: getAIPlanModel(),
      responseFormat: 'json',
      temperature: 0.2,
      maxTokens: getAIPlanMaxTokens(),
      timeoutMs: 60_000,
      messages: aiPlanMessages(mapFileTicket(ticket, state, { includeComments: true, includeDeveloperData: true })),
    });
    const parsed = extractJsonObject<AIPlanPayload>(result.content);
    if (!parsed) throw new Error('AI plan response was not valid JSON.');
    const nextState = await readFileStore();
    const nextPlan = nextState.aiPlans.find((item) => item.id === plan.id);
    if (nextPlan) {
      nextPlan.status = 'ready';
      nextPlan.summary = stringValue(parsed.summary);
      nextPlan.stepsJson = JSON.stringify(normalizeStringArray(parsed.steps));
      nextPlan.suggestedPrompt = stringValue(parsed.suggestedPrompt);
      nextPlan.filesToInspectJson = '[]';
      nextPlan.questionsToAskJson = '[]';
      nextPlan.validationChecklistJson = '[]';
      nextPlan.riskNotesJson = '[]';
      nextPlan.errorMessage = '';
      nextPlan.generatedAt = new Date().toISOString();
      nextPlan.generatedByModel = result.model;
      nextPlan.updatedAt = nextPlan.generatedAt;
    }
    nextState.activityEvents.push(fileActivity(ticketId, actorProfile, 'ai', 'AI plan generated', { model: result.model }));
    await writeFileStore(nextState);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI plan generation failed.';
    const nextState = await readFileStore();
    const nextPlan = nextState.aiPlans.find((item) => item.id === plan.id);
    if (nextPlan) {
      nextPlan.status = 'failed';
      nextPlan.errorMessage = message;
      nextPlan.generatedAt = new Date().toISOString();
      nextPlan.updatedAt = nextPlan.generatedAt;
    }
    nextState.activityEvents.push(fileActivity(ticketId, actorProfile, 'ai', 'AI plan generation failed', { error: message }));
    await writeFileStore(nextState);
  }

  return getVisibleTicketFromFile(actor, ticketId);
}

async function readFileStore(): Promise<FileStoreState> {
  try {
    const raw = await readFile(FILE_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<FileStoreState>;
    return {
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      aiPlans: Array.isArray(parsed.aiPlans) ? parsed.aiPlans : [],
      activityEvents: Array.isArray(parsed.activityEvents) ? parsed.activityEvents : [],
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { tickets: [], comments: [], aiPlans: [], activityEvents: [] };
    }
    throw error;
  }
}

async function writeFileStore(state: FileStoreState): Promise<void> {
  await mkdir(path.dirname(FILE_STORE_PATH), { recursive: true });
  const temporaryPath = `${FILE_STORE_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, FILE_STORE_PATH);
}

function canSeeFileTicket(ticket: FileTicketRecord, email: string): boolean {
  if (ticket.archivedAt) return false;
  if (isDeveloperEmail(email)) return true;
  if (normalizeEmail(ticket.createdByEmail) === email) return true;
  return ticket.visibility === 'team' || ticket.visibility === 'company';
}

function mapTicket(ticket: TicketRecord, options: TicketMapOptions = {}): TicketDTO {
  const comments = ticket.comments ?? [];
  const latest = options.includeComments ? comments[comments.length - 1] : comments[0];
  const aiPlan = options.includeDeveloperData ? ticket.aiPlans?.[0] ?? null : null;
  const dto: TicketDTO = {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    category: isTicketCategory(ticket.category) ? ticket.category : 'other',
    urgency: isTicketUrgency(ticket.urgency) ? ticket.urgency : 'normal',
    status: isTicketStatus(ticket.status) ? ticket.status : 'open',
    requestedDate: toIso(ticket.requestedDate),
    nextStep: ticket.nextStep ?? '',
    businessImpact: ticket.businessImpact,
    attachmentNote: ticket.attachmentNote,
    createdByUserId: ticket.createdByUserId,
    createdByName: ticket.createdByName || nameFromEmail(ticket.createdByEmail),
    createdByEmail: ticket.createdByEmail,
    requesterColor: ticket.requesterColor || stableRequesterColor(ticket.createdByEmail),
    team: ticket.team,
    assignedToEmail: ticket.assignedToEmail,
    visibility: isTicketVisibility(ticket.visibility) ? ticket.visibility : 'team',
    sortOrder: ticket.sortOrder,
    archivedAt: toIso(ticket.archivedAt),
    finishedAt: toIso(ticket.finishedAt ?? null),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    commentCount: ticket._count?.comments ?? comments.length,
    latestComment: latest ? mapComment(latest) : null,
    aiPlan: aiPlan ? mapAIPlan(aiPlan) : null,
  };
  if (options.includeComments) dto.comments = comments.map(mapComment);
  if (options.includeDeveloperData) dto.activity = (ticket.activityEvents ?? []).map(mapActivityEvent);
  return dto;
}

function mapFileTicket(ticket: FileTicketRecord, state: FileStoreState, options: TicketMapOptions = {}): TicketDTO {
  const allComments = state.comments
    .filter((comment) => comment.ticketId === ticket.id)
    .filter((comment) => options.includeDeveloperData || (comment.visibility ?? 'public') === 'public')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const latest = allComments[allComments.length - 1] ?? null;
  const latestPlan = options.includeDeveloperData
    ? state.aiPlans
        .filter((plan) => plan.ticketId === ticket.id)
        .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0] ?? null
    : null;
  const dto: TicketDTO = {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    category: isTicketCategory(ticket.category) ? ticket.category : 'other',
    urgency: isTicketUrgency(ticket.urgency) ? ticket.urgency : 'normal',
    status: isTicketStatus(ticket.status) ? ticket.status : 'open',
    requestedDate: ticket.requestedDate,
    nextStep: ticket.nextStep ?? '',
    businessImpact: ticket.businessImpact,
    attachmentNote: ticket.attachmentNote,
    createdByUserId: ticket.createdByUserId,
    createdByName: ticket.createdByName || nameFromEmail(ticket.createdByEmail),
    createdByEmail: ticket.createdByEmail,
    requesterColor: ticket.requesterColor || stableRequesterColor(ticket.createdByEmail),
    team: ticket.team,
    assignedToEmail: ticket.assignedToEmail,
    visibility: isTicketVisibility(ticket.visibility) ? ticket.visibility : 'team',
    sortOrder: ticket.sortOrder,
    archivedAt: ticket.archivedAt,
    finishedAt: ticket.finishedAt ?? null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    commentCount: allComments.length,
    latestComment: latest ? mapFileComment(latest) : null,
    aiPlan: latestPlan ? mapFileAIPlan(latestPlan) : null,
  };
  if (options.includeComments) dto.comments = allComments.map(mapFileComment);
  if (options.includeDeveloperData) {
    dto.activity = state.activityEvents
      .filter((event) => event.ticketId === ticket.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(mapFileActivityEvent);
  }
  return dto;
}

function mapComment(comment: CommentRecord): TicketCommentDTO {
  const visibility = isTicketCommentVisibility(comment.visibility) ? comment.visibility : 'public';
  return {
    id: comment.id,
    ticketId: comment.ticketId,
    authorUserId: comment.authorUserId,
    authorName: comment.authorName || nameFromEmail(comment.authorEmail),
    authorEmail: comment.authorEmail,
    body: comment.body,
    visibility,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: (comment.updatedAt ?? comment.createdAt).toISOString(),
  };
}

function mapFileComment(comment: FileCommentRecord): TicketCommentDTO {
  const visibility = isTicketCommentVisibility(comment.visibility) ? comment.visibility : 'public';
  return {
    id: comment.id,
    ticketId: comment.ticketId,
    authorUserId: comment.authorUserId,
    authorName: comment.authorName || nameFromEmail(comment.authorEmail),
    authorEmail: comment.authorEmail,
    body: comment.body,
    visibility,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt ?? comment.createdAt,
  };
}

function mapAIPlan(plan: AIPlanRecord): TicketAIPlanDTO {
  return {
    id: plan.id,
    ticketId: plan.ticketId,
    status: isTicketAIPlanStatus(plan.status) ? plan.status : 'failed',
    summary: plan.summary,
    steps: parseStringArray(plan.stepsJson),
    suggestedPrompt: plan.suggestedPrompt,
    filesToInspect: parseStringArray(plan.filesToInspectJson),
    questionsToAsk: parseStringArray(plan.questionsToAskJson),
    validationChecklist: parseStringArray(plan.validationChecklistJson),
    riskNotes: parseStringArray(plan.riskNotesJson),
    errorMessage: plan.errorMessage,
    generatedAt: plan.generatedAt.toISOString(),
    generatedByModel: plan.generatedByModel,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function mapFileAIPlan(plan: FileAIPlanRecord): TicketAIPlanDTO {
  return {
    id: plan.id,
    ticketId: plan.ticketId,
    status: isTicketAIPlanStatus(plan.status) ? plan.status : 'failed',
    summary: plan.summary,
    steps: parseStringArray(plan.stepsJson),
    suggestedPrompt: plan.suggestedPrompt,
    filesToInspect: parseStringArray(plan.filesToInspectJson),
    questionsToAsk: parseStringArray(plan.questionsToAskJson),
    validationChecklist: parseStringArray(plan.validationChecklistJson),
    riskNotes: parseStringArray(plan.riskNotesJson),
    errorMessage: plan.errorMessage,
    generatedAt: plan.generatedAt,
    generatedByModel: plan.generatedByModel,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function mapActivityEvent(event: ActivityEventRecord): TicketActivityEventDTO {
  return {
    id: event.id,
    ticketId: event.ticketId,
    type: isTicketActivityEventType(event.type) ? event.type : 'update',
    actorUserId: event.actorUserId,
    actorName: event.actorName || nameFromEmail(event.actorEmail),
    actorEmail: event.actorEmail,
    summary: event.summary,
    metadata: parseObject(event.metadataJson),
    createdAt: event.createdAt.toISOString(),
  };
}

function mapFileActivityEvent(event: FileActivityEventRecord): TicketActivityEventDTO {
  return {
    id: event.id,
    ticketId: event.ticketId,
    type: isTicketActivityEventType(event.type) ? event.type : 'update',
    actorUserId: event.actorUserId,
    actorName: event.actorName || nameFromEmail(event.actorEmail),
    actorEmail: event.actorEmail,
    summary: event.summary,
    metadata: parseObject(event.metadataJson),
    createdAt: event.createdAt,
  };
}

function fileActivity(
  ticketId: string,
  actor: ActorProfile,
  type: TicketActivityEventType,
  summary: string,
  metadata: Record<string, unknown>,
): FileActivityEventRecord {
  return {
    id: createId('activity'),
    ticketId,
    type,
    actorUserId: actor.appUserId,
    actorName: actor.name,
    actorEmail: actor.email,
    summary,
    metadataJson: JSON.stringify(metadata),
    createdAt: new Date().toISOString(),
  };
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HelpDeskHttpError(400, 'Invalid JSON payload.');
  }
  return input as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HelpDeskHttpError(400, `${label} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function optionalEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = normalizeEmail(value);
  return normalized.includes('@') ? normalized : '';
}

function enumValue<T extends string>(
  value: unknown,
  validator: (value: unknown) => value is T,
  label: string,
): T {
  if (!validator(value)) {
    throw new HelpDeskHttpError(400, `${label} is invalid.`);
  }
  return value;
}

function optionalEnum<T extends string>(value: unknown, validator: (value: unknown) => value is T): T | null {
  if (value === undefined || value === null || value === '') return null;
  if (!validator(value)) throw new HelpDeskHttpError(400, 'Invalid ticket option.');
  return value;
}

function optionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new HelpDeskHttpError(400, 'Requested date is invalid.');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) throw new HelpDeskHttpError(400, 'Requested date is invalid.');
  return date;
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return normalizeStringArray(parsed);
  } catch {
    return [];
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* empty */
  }
  return {};
}

function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

function stableRequesterColor(email: string): string {
  const palette = ['#2f6fc4', '#168b65', '#6b46b8', '#b77900', '#cf1f4b', '#00857f', '#7c3aed', '#d9480f'];
  const normalized = normalizeEmail(email);
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length];
}

function statusLabel(status: string): string {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'needs_input') return 'Needs Input';
  if (status === 'finished') return 'Finished';
  return 'Open';
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || 'Arrow User';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
