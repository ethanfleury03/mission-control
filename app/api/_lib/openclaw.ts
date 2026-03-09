import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type OpenClawStatus = {
  sessions?: {
    count?: number;
    recent?: Array<{
      key?: string;
      agentId?: string;
      kind?: string;
      model?: string;
      updatedAt?: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    }>;
  };
  agents?: {
    agents?: Array<{
      id: string;
      lastActiveAgeMs?: number;
    }>;
  };
  heartbeat?: {
    agents?: Array<{
      agentId: string;
      enabled: boolean;
      every?: string;
    }>;
  };
  securityAudit?: {
    summary?: {
      critical?: number;
      warn?: number;
      info?: number;
    };
  };
  queuedSystemEvents?: any[];
};

export async function getOpenClawStatus(): Promise<OpenClawStatus | null> {
  try {
    const { stdout } = await execFileAsync('openclaw', ['status', '--json'], {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    return JSON.parse(stdout || '{}') as OpenClawStatus;
  } catch (err) {
    console.error('openclaw status failed', err);
    return null;
  }
}
