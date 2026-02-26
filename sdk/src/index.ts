/**
 * Mission Control Agent SDK
 * 
 * This SDK is now standardized on the Work Kanban API.
 * Legacy task management methods (progress, toolCall, block, ask, complete, fail) are not supported
 * and will throw errors. The SDK focuses on creating and managing Work Items (Kanban tasks).
 *
 * Usage:
 * ```typescript
 * import { MissionControl } from '@mission-control/sdk';
 * 
 * const mc = new MissionControl({
 *   apiKey: 'your-api-key',
 *   agentId: 'sasha-1',
 *   apiUrl: 'http://localhost:3001' // Mission Control API URL
 * });
 * 
 * const task = await mc.createWorkItem({
 *   title: 'Check emails',
 *   description: 'Process unread emails from shaan@arrsys.com'
 * });
 * 
 * await mc.updateWorkItem(task.id, { status: 'ongoing' });
 * 
 * await mc.deleteWorkItem(task.id);
 * ```
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface MissionControlConfig {
  apiKey: string;
  agentId: string;
  apiUrl: string;
  wsUrl?: string;
  autoReconnect?: boolean;
}

export type KanbanStatus = 'queue' | 'ongoing' | 'need_human' | 'completed';

export interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  status: KanbanStatus;
  priority: number;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface CreateWorkItemConfig {
  title: string;
  description?: string | null;
  status?: KanbanStatus;
  priority?: number;
  agentId?: string | null;
  metadata?: Record<string, unknown>;
}

export class MissionControl extends EventEmitter {
  private config: MissionControlConfig;
  private currentWorkItem: WorkItem | null = null; // Renamed from currentTask
  private ws: WebSocket | null = null;
  // Removed pendingReviews as block/ask are not supported

  constructor(config: MissionControlConfig) {
    super();
    this.config = {
      autoReconnect: true,
      ...config
    };
    // WebSocket connection is optional if agent doesn't need real-time human interaction
    // For Work API, real-time updates are not currently via this SDK.
    // this.connectWebSocket(); // Disabled for now as Work API doesn't use this WS flow
  }

  /**
   * Create a new work item (Kanban task).
   */
  async createWorkItem(config: CreateWorkItemConfig): Promise<WorkItem> {
    const response = await this.apiCall('/work/items', {
      method: 'POST',
      body: {
        ...config,
        status: config.status || 'queue',
        agentId: config.agentId || this.config.agentId,
        priority: config.priority ?? 0,
      }
    });
    if (!response) {
      throw new Error('Mission Control SDK: createWorkItem returned null WorkItem');
    }
    const workItem: WorkItem = response;
    this.currentWorkItem = workItem;
    this.emit('workItemCreated', workItem);
    return workItem;
  }

  /**
   * Get a work item by ID.
   */
  async getWorkItem(itemId: string): Promise<WorkItem> {
    return this.apiCall(`/work/items/${itemId}`, { method: 'GET' });
  }

  /**
   * Update an existing work item.
   */
  async updateWorkItem(itemId: string, updates: Partial<WorkItem>): Promise<WorkItem> {
    const response = await this.apiCall(`/work/items/${itemId}`, {
      method: 'PATCH',
      body: updates,
    });
    if (this.currentWorkItem?.id === itemId) {
      this.currentWorkItem = { ...this.currentWorkItem, ...response };
    }
    this.emit('workItemUpdated', response);
    return response;
  }

  /**
   * Move a work item to a new status (convenience for drag/drop).
   */
  async moveWorkItem(itemId: string, newStatus: KanbanStatus): Promise<WorkItem> {
    const response = await this.apiCall(`/work/items/${itemId}/move`, {
      method: 'POST',
      body: { status: newStatus },
    });
    if (this.currentWorkItem?.id === itemId) {
      this.currentWorkItem = { ...this.currentWorkItem, status: newStatus };
    }
    this.emit('workItemMoved', response);
    return response;
  }

  /**
   * Delete a work item.
   */
  async deleteWorkItem(itemId: string): Promise<void> {
    await this.apiCall(`/work/items/${itemId}`, { method: 'DELETE' });
    if (this.currentWorkItem?.id === itemId) {
      this.currentWorkItem = null;
    }
    this.emit('workItemDeleted', itemId);
  }

  /**
   * Get the current active work item.
   */
  getCurrentWorkItem(): WorkItem | null {
    return this.currentWorkItem;
  }

  // --- Unsupported Legacy Task Methods (now throw errors) ---

  async startTask(_config: any): Promise<any> {
    throw new Error("Not implemented: Legacy startTask() is replaced by createWorkItem() in Work API");
  }

  async progress(_message: string, _metadata?: any): Promise<void> {
    throw new Error("Not implemented: Legacy progress() is not part of Work API workflow");
  }

  async toolCall(_tool: string, _input: any, _result?: any): Promise<void> {
    throw new Error("Not implemented: Legacy toolCall() is not part of Work API workflow");
  }

  async block(_message: string, _context?: any): Promise<boolean> {
    throw new Error("Not implemented: Legacy block() is not part of Work API workflow");
  }

  async ask(_message: string): Promise<string> {
    throw new Error("Not implemented: Legacy ask() is not part of Work API workflow");
  }

  async complete(_message: string): Promise<void> {
    throw new Error("Not implemented: Legacy complete() is not part of Work API workflow");
  }

  async fail(_error: string): Promise<void> {
    throw new Error("Not implemented: Legacy fail() is not part of Work API workflow");
  }

  // --- Internal API call helper ---

  private async apiCall(path: string, options: { method: string; body?: any }): Promise<any> {
    const url = `${this.config.apiUrl}${path}`;
    
    const response = await fetch(url, {
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-Agent-ID': this.config.agentId
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error ${response.status}: ${error}`);
    }

    // DELETE and POST /move might return 204 No Content
    if (response.status === 204) {
      return null; // or undefined, depending on desired behavior for no content
    }

    return response.json();
  }

  // --- WebSocket (currently disabled for Work API) ---

  private connectWebSocket(): void {
    // WebSocket connection is currently not used by the Work API SDK workflow.
    // If real-time updates for Work Items are needed, this method would be re-enabled
    // and the Work API would need to expose a WebSocket endpoint for item updates.
    console.warn("WebSocket connection is disabled for Mission Control SDK (Work API mode).");
  }

  private handleWebSocketMessage(_message: any): void {
    // No WebSocket message handling for Work API in this SDK version.
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // No pending reviews to clear as block/ask are not supported.
  }
}

export default MissionControl;
