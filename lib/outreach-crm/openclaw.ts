import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildArrowSignature } from './service-auth';

const execFileAsync = promisify(execFile);

export type OpenClawTransport = 'auto' | 'cli' | 'gateway';

export interface OpenClawDispatchInput {
  jobId: string;
  actionType: string;
  agentId?: string;
  prompt: string;
  payload: Record<string, unknown>;
}

export interface OpenClawDispatchResult {
  ok: boolean;
  transport: 'cli' | 'gateway';
  agentId: string;
  rawOutput: string;
  parsedOutput?: unknown;
  error?: string;
}

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function configuredTransport(): OpenClawTransport {
  const value = env('OUTREACH_CRM_OPENCLAW_TRANSPORT').toLowerCase();
  return value === 'cli' || value === 'gateway' || value === 'auto' ? value : 'auto';
}

export function outreachOpenClawAgentId(): string {
  return env('OUTREACH_CRM_OPENCLAW_AGENT_ID') || 'sasha-outreach';
}

function gatewayUrl(): string {
  return env('OUTREACH_CRM_OPENCLAW_GATEWAY_URL') || env('OPENCLAW_GATEWAY_URL');
}

function cliCandidates(): string[] {
  return [
    env('OUTREACH_CRM_OPENCLAW_CLI_PATH'),
    'openclaw',
    '/opt/homebrew/bin/openclaw',
    '/usr/local/bin/openclaw',
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
}

function unwrapParsedOutput(value: unknown, depth = 0): unknown | undefined {
  if (depth > 5 || value == null) return undefined;
  if (typeof value === 'string') return parseMaybeJson(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = unwrapParsedOutput(item, depth + 1);
      if (parsed) return parsed;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  if (record.activitySnapshot && typeof record.activitySnapshot === 'object') return record;

  for (const key of ['text', 'output', 'stdout', 'rawOutput', 'message', 'content', 'result', 'payload', 'payloads']) {
    const parsed = unwrapParsedOutput(record[key], depth + 1);
    if (parsed) return parsed;
  }

  return undefined;
}

function parseMaybeJson(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return unwrapParsedOutput(parsed) ?? parsed;
  } catch {
    return undefined;
  }
}

async function dispatchViaCli(input: OpenClawDispatchInput, agentId: string): Promise<OpenClawDispatchResult> {
  let lastError: unknown;
  for (const cli of cliCandidates()) {
    try {
      const { stdout, stderr } = await execFileAsync(
        cli,
        ['agent', '--agent', agentId, '--message', input.prompt, '--json'],
        { timeout: 600_000, maxBuffer: 8 * 1024 * 1024 },
      );
      const rawOutput = `${stdout ?? ''}${stderr ? `\n${stderr}` : ''}`.trim();
      return {
        ok: true,
        transport: 'cli',
        agentId,
        rawOutput,
        parsedOutput: parseMaybeJson(String(stdout ?? '')),
      };
    } catch (error) {
      lastError = error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('OpenClaw CLI dispatch failed');
}

async function dispatchViaGateway(input: OpenClawDispatchInput, agentId: string): Promise<OpenClawDispatchResult> {
  const url = gatewayUrl();
  if (!url) throw new Error('OUTREACH_CRM_OPENCLAW_GATEWAY_URL is not configured');

  const body = JSON.stringify({
    agentId,
    jobId: input.jobId,
    actionType: input.actionType,
    prompt: input.prompt,
    payload: input.payload,
  });
  const signature = buildArrowSignature(body, { eventId: input.jobId });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-arrow-event-id': signature.eventId,
      'x-arrow-timestamp': signature.timestamp,
      'x-arrow-signature': signature.signature,
    },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const rawOutput = await response.text();
  if (!response.ok) throw new Error(`OpenClaw gateway HTTP ${response.status}: ${rawOutput.slice(0, 500)}`);

  return {
    ok: true,
    transport: 'gateway',
    agentId,
    rawOutput,
    parsedOutput: parseMaybeJson(rawOutput),
  };
}

export async function dispatchOpenClaw(input: OpenClawDispatchInput): Promise<OpenClawDispatchResult> {
  const agentId = input.agentId || outreachOpenClawAgentId();
  const transport = configuredTransport();

  if (transport === 'cli') return dispatchViaCli(input, agentId);
  if (transport === 'gateway') return dispatchViaGateway(input, agentId);

  try {
    return await dispatchViaCli(input, agentId);
  } catch (cliError) {
    if (!gatewayUrl()) {
      return {
        ok: false,
        transport: 'cli',
        agentId,
        rawOutput: '',
        error: cliError instanceof Error ? cliError.message : 'OpenClaw CLI dispatch failed',
      };
    }
    try {
      return await dispatchViaGateway(input, agentId);
    } catch (gatewayError) {
      return {
        ok: false,
        transport: 'gateway',
        agentId,
        rawOutput: '',
        error: [
          cliError instanceof Error ? cliError.message : 'OpenClaw CLI dispatch failed',
          gatewayError instanceof Error ? gatewayError.message : 'OpenClaw gateway dispatch failed',
        ].join(' | '),
      };
    }
  }
}
