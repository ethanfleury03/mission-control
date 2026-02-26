/**
 * Minimal Work Dispatcher
 * Polls for work, claims atomically, assigns managers, emits events
 * Runs as part of the API server process
 */

import { WorkService } from './service';
import { getDb } from '../database';
import type { DispatcherConfig } from './types';

export class WorkDispatcher {
  private service: WorkService;
  private config: DispatcherConfig;
  private isRunning: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private activeClaims: Set<string> = new Set();

  constructor(config?: Partial<DispatcherConfig>) {
    this.service = new WorkService(getDb());
    this.config = {
      pollIntervalMs: 2000,
      claimBatchSize: 5,
      maxConcurrentWork: 10,
      workerId: `worker_${Date.now()}`,
      ...config
    };
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log(`[Dispatcher] Starting with workerId: ${this.config.workerId}`);
    
    // Run immediately, then on interval
    this.poll();
    this.timer = setInterval(() => this.poll(), this.config.pollIntervalMs);
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[Dispatcher] Stopped');
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;
    
    // Don't poll if at max concurrency
    if (this.activeClaims.size >= this.config.maxConcurrentWork) {
      return;
    }

    try {
      // Calculate how many we can claim
      const availableSlots = this.config.maxConcurrentWork - this.activeClaims.size;
      const claimCount = Math.min(availableSlots, this.config.claimBatchSize);

      if (claimCount <= 0) return;

      // Claim work items atomically
      const claimed = await this.service.claimNextWorkItems(
        this.config.workerId,
        claimCount
      );

      if (claimed.length > 0) {
        console.log(`[Dispatcher] Claimed ${claimed.length} work items`);
        
        // Process each claimed item
        for (const item of claimed) {
          this.activeClaims.add(item.id);
          
          // Process asynchronously - don't await to allow parallel processing
          this.processWorkItem(item).finally(() => {
            this.activeClaims.delete(item.id);
          });
        }
      }
    } catch (err: any) {
      console.error('[Dispatcher] Poll error:', err.message);
    }
  }

  private async processWorkItem(item: any): Promise<void> {
    try {
      console.log(`[Dispatcher] Processing work item ${item.id.substring(0, 8)}... (team: ${item.team_id.substring(0, 8)}...)`);

      // Transition to working
      await this.service.transitionStatus(
        item.id,
        'working',
        'system',
        this.config.workerId
      );

      console.log(`[Dispatcher] Work item ${item.id.substring(0, 8)}... is now working`);

      // Note: In a real implementation, this would:
      // 1. Spawn the manager agent session
      // 2. Pass the input + context
      // 3. Wait for output
      // 4. Handle delegation to specialists
      // 5. Mark complete or failed

      // For MVP, we just simulate work and mark as done
      // In production, this would delegate to actual agent execution
      
      // Simulate some "work" time (remove in production)
      await new Promise(r => setTimeout(r, 100));

      // For demo purposes, if there's a manager, consider it "done"
      // In real implementation, this would wait for agent completion
      if (item.manager_agent_id) {
        await this.service.completeWorkItem(
          item.id,
          { processed: true, demo: true },
          'Demo completion log',
          this.config.workerId
        );
        console.log(`[Dispatcher] Work item ${item.id.substring(0, 8)}... completed`);
      }
    } catch (err: any) {
      console.error(`[Dispatcher] Error processing ${item.id}:`, err.message);
      
      try {
        await this.service.failWorkItem(item.id, err.message, this.config.workerId);
      } catch (failErr) {
        console.error(`[Dispatcher] Failed to mark item as failed:`, failErr);
      }
    }
  }

  getStatus(): {
    isRunning: boolean;
    activeClaims: number;
    workerId: string;
  } {
    return {
      isRunning: this.isRunning,
      activeClaims: this.activeClaims.size,
      workerId: this.config.workerId
    };
  }
}

// Singleton instance
let dispatcherInstance: WorkDispatcher | null = null;

export function getDispatcher(config?: Partial<DispatcherConfig>): WorkDispatcher {
  if (!dispatcherInstance) {
    dispatcherInstance = new WorkDispatcher(config);
  }
  return dispatcherInstance;
}

export function startDispatcher(config?: Partial<DispatcherConfig>): WorkDispatcher {
  const dispatcher = getDispatcher(config);
  dispatcher.start();
  return dispatcher;
}

export function stopDispatcher(): void {
  if (dispatcherInstance) {
    dispatcherInstance.stop();
  }
}
