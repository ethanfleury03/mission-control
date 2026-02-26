/**
 * OpenClaw Agent Mission Control Integration
 * 
 * Drop-in wrapper for OpenClaw agents to auto-report to Mission Control.
 * 
 * INSTALLATION:
 * 1. Copy this file to your agent workspace
 * 2. Import and wrap your agent functions
 * 3. Set MC_API_URL and MC_API_KEY in environment
 */

import { MissionControl } from '../sdk/src/index';

interface MCConfig {
  apiUrl: string;
  apiKey: string;
  agentId?: string;
}

// Global instance for the current session
let globalMC: MissionControl | null = null;
let currentTaskId: string | null = null;

/**
 * Initialize Mission Control for this agent session
 */
export function initMissionControl(config: MCConfig): MissionControl {
  if (globalMC) return globalMC;
  
  globalMC = new MissionControl({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    agentId: config.agentId || 'openclaw-agent',
    autoReconnect: true
  });
  
  return globalMC;
}

/**
 * Auto-create task when agent starts working on a user request
 */
export async function autoTask(request: string, context?: { user?: string; channel?: string }): Promise<MissionControl> {
  const mc = initMissionControl({
    apiUrl: process.env.MC_API_URL || 'http://localhost:3001',
    apiKey: process.env.MC_API_KEY || 'test-key',
    agentId: process.env.MC_AGENT_ID || 'sasha'
  });
  
  const title = extractTaskTitle(request);
  const description = buildDescription(request, context);
  
  const task = await mc.startTask({
    title,
    description,
    priority: inferPriority(request),
    tags: ['openclaw', context?.channel || 'unknown']
  });
  
  currentTaskId = task.id;
  console.log(`[MC] Task created: ${task.id} - ${title}`);
  
  return mc;
}

/**
 * Report progress on current task
 */
export async function progress(message: string, metadata?: Record<string, any>): Promise<void> {
  if (!globalMC || !currentTaskId) {
    console.log(`[MC] No active task, skipping progress: ${message}`);
    return;
  }
  
  await globalMC.progress(message, metadata);
}

/**
 * Log tool call to current task
 */
export async function toolCall(
  tool: string, 
  input: any, 
  result: { output?: any; error?: string; durationMs: number }
): Promise<void> {
  if (!globalMC || !currentTaskId) return;
  
  await globalMC.toolCall(tool, input, result);
}

/**
 * Block for human approval
 */
export async function block(message: string, context?: Record<string, any>): Promise<boolean> {
  if (!globalMC || !currentTaskId) {
    console.log(`[MC] No active task, can't block: ${message}`);
    return false;
  }
  
  return await globalMC.block(message, context);
}

/**
 * Complete current task
 */
export async function complete(message: string): Promise<void> {
  if (!globalMC || !currentTaskId) return;
  
  await globalMC.complete(message);
  currentTaskId = null;
  console.log(`[MC] Task completed: ${message}`);
}

/**
 * Fail current task
 */
export async function fail(error: string): Promise<void> {
  if (!globalMC || !currentTaskId) return;
  
  await globalMC.fail(error);
  currentTaskId = null;
  console.log(`[MC] Task failed: ${error}`);
}

/**
 * Wrap any function to auto-report as a task
 */
export function wrapAsTask<T extends (...args: any[]) => Promise<any>>(
  name: string,
  fn: T,
  priority?: 'low' | 'medium' | 'high'
): T {
  return (async (...args: any[]) => {
    const mc = initMissionControl({
      apiUrl: process.env.MC_API_URL || 'http://localhost:3001',
      apiKey: process.env.MC_API_KEY || 'test-key'
    });
    
    await mc.startTask({
      title: name,
      description: `Auto-wrapped function: ${name}`,
      priority: priority || 'medium'
    });
    
    const startTime = Date.now();
    
    try {
      await mc.progress('Starting execution...');
      const result = await fn(...args);
      const durationMs = Date.now() - startTime;
      
      await mc.complete(`Completed in ${durationMs}ms`);
      return result;
    } catch (err) {
      await mc.fail(String(err));
      throw err;
    }
  }) as T;
}

// Helper functions
function extractTaskTitle(request: string): string {
  // Extract first sentence or first 60 chars
  const firstSentence = request.split(/[.!?]/)[0];
  const title = firstSentence.length > 60 
    ? firstSentence.substring(0, 57) + '...'
    : firstSentence;
  return title || 'Untitled Task';
}

function buildDescription(request: string, context?: { user?: string; channel?: string }): string {
  let desc = request;
  if (context?.user) desc += `\n\nRequested by: ${context.user}`;
  if (context?.channel) desc += `\nChannel: ${context.channel}`;
  return desc;
}

function inferPriority(request: string): 'low' | 'medium' | 'high' {
  const lower = request.toLowerCase();
  if (lower.includes('urgent') || lower.includes('asap') || lower.includes('critical')) return 'high';
  if (lower.includes('whenever') || lower.includes('eventually') || lower.includes('low priority')) return 'low';
  return 'medium';
}

/**
 * Wrap tool calls to auto-log them
 * Usage: const trackedWebSearch = wrapTool('web_search', web_search);
 */
export function wrapTool<T extends (...args: any[]) => Promise<any>>(
  toolName: string,
  toolFn: T
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    let output: any;
    let error: string | undefined;
    
    try {
      output = await toolFn(...args);
      return output;
    } catch (err) {
      error = String(err);
      throw err;
    } finally {
      const durationMs = Date.now() - startTime;
      await toolCall(toolName, { args }, { output, error, durationMs });
    }
  }) as T;
}

export default {
  init: initMissionControl,
  autoTask,
  progress,
  toolCall,
  block,
  complete,
  fail,
  wrapAsTask,
  wrapTool
};
