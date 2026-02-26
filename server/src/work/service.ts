/**
 * Work Orchestration Service
 * Business logic: state machines, manager assignment, retry logic
 */

import type { Pool } from 'pg';
import { WorkRepository } from './repository';
import {
  type WorkItem,
  type WorkStatus,
  type CreateWorkItemInput,
  WORK_STATUS_TRANSITIONS,
  type ClaimedWorkItem
} from './types';
import { RegistryService } from '../registry/registryService';

export class WorkService {
  private repo: WorkRepository;
  private registry: RegistryService;

  constructor(
    db: Pool,
    registry?: RegistryService
  ) {
    this.repo = new WorkRepository(db);
    this.registry = registry || new RegistryService(db);
  }

  // ============================================================================
  // WORK ITEM CRUD
  // ============================================================================

  async createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
    // Validate team exists
    const team = await this.registry.getTeam(input.team_id);
    if (!team) {
      throw new Error(`Team not found: ${input.team_id}`);
    }

    // Idempotency: if key provided, check for existing
    if (input.idempotency_key) {
      const existing = await this.repo.getWorkItemByIdempotencyKey(input.idempotency_key);
      if (existing) {
        return existing; // Return existing without creating new
      }
    }

    const workItem = await this.repo.createWorkItem(input);

    // Log creation event
    await this.repo.appendWorkEvent({
      work_item_id: workItem.id,
      event_type: 'CREATED',
      actor_type: input.requested_by_type === 'human' ? 'human' : 'system',
      actor_id: input.requested_by_id ?? null,
      new_value: { 
        status: workItem.status, 
        team_id: workItem.team_id,
        priority: workItem.priority 
      },
      message: 'Work item created'
    });

    return workItem;
  }

  async getWorkItem(id: string): Promise<WorkItem | null> {
    return this.repo.getWorkItemById(id);
  }

  async listWorkItems(filters: {
    team_id?: string;
    status?: WorkStatus;
    assignee_agent_id?: string;
    manager_agent_id?: string;
    parent_work_item_id?: string;
    limit?: number;
  } = {}): Promise<WorkItem[]> {
    return this.repo.listWorkItems(filters);
  }

  // ============================================================================
  // CLAIMING (atomic with SKIP LOCKED)
  // ============================================================================

  async claimNextWorkItems(
    workerId: string,
    limit: number = 1
  ): Promise<Array<ClaimedWorkItem & { manager_agent_id: string | null }>> {
    // Claim items atomically
    const claimed = await this.repo.claimNextWorkItems(workerId, limit);
    if (claimed.length === 0) return [];

    // Assign managers from team manager pool
    const result: Array<ClaimedWorkItem & { manager_agent_id: string | null }> = [];

    for (const item of claimed) {
      const managerPool = await this.repo.getTeamManagerPool(item.team_id);
      
      let managerId: string | null = null;
      
      if (managerPool.length > 0) {
        // Pick first active manager by priority
        managerId = managerPool[0].agent_id;
        
        // Update work item with manager
        await this.repo.updateWorkItemStatus(
          item.id,
          'claimed', // stays claimed, now has manager
          'system',
          workerId,
          { manager_agent_id: managerId }
        );

        // Log assignment
        await this.repo.appendWorkEvent({
          work_item_id: item.id,
          event_type: 'MANAGER_ASSIGNED',
          actor_type: 'system',
          actor_id: workerId,
          new_value: { manager_agent_id: managerId },
          message: `Manager assigned from pool (priority: ${managerPool[0].priority})`
        });
      }

      result.push({ ...item, manager_agent_id: managerId });
    }

    return result;
  }

  // ============================================================================
  // STATE MACHINE TRANSITIONS
  // ============================================================================

  async transitionStatus(
    workItemId: string,
    newStatus: WorkStatus,
    actorType: 'system' | 'agent' | 'human',
    actorId: string | null,
    options: {
      reason?: string;
      assignee_agent_id?: string;
      last_error?: string;
    } = {}
  ): Promise<WorkItem> {
    const item = await this.repo.getWorkItemById(workItemId);
    if (!item) {
      throw new Error(`Work item not found: ${workItemId}`);
    }

    // Validate transition
    const allowedTransitions = WORK_STATUS_TRANSITIONS[item.status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${item.status} -> ${newStatus}. ` +
        `Allowed: ${allowedTransitions.join(', ') || 'none'}`
      );
    }

    // Special handling for retry
    if (newStatus === 'queued' && item.status === 'failed') {
      if (item.attempt_count >= item.max_attempts) {
        throw new Error(
          `Cannot retry: max attempts (${item.max_attempts}) exceeded. ` +
          `Current attempt: ${item.attempt_count}`
        );
      }
    }

    // Perform transition
    const updated = await this.repo.updateWorkItemStatus(
      workItemId,
      newStatus,
      actorType,
      actorId,
      {
        assignee_agent_id: options.assignee_agent_id,
        last_error: options.last_error
      }
    );

    if (!updated) {
      throw new Error('Failed to update work item status');
    }

    return updated;
  }

  // ============================================================================
  // ASSIGNMENT
  // ============================================================================

  async assignToSpecialist(
    workItemId: string,
    specialistAgentId: string,
    assignedBy: string
  ): Promise<WorkItem> {
    const item = await this.repo.getWorkItemById(workItemId);
    if (!item) throw new Error(`Work item not found: ${workItemId}`);

    // Only allow assignment in claimed or working states
    if (!['claimed', 'working'].includes(item.status)) {
      throw new Error(`Cannot assign: work item is ${item.status}`);
    }

    const updated = await this.repo.updateWorkItemStatus(
      workItemId,
      'working',
      'agent',
      assignedBy,
      { assignee_agent_id: specialistAgentId }
    );

    if (!updated) throw new Error('Failed to assign work item');

    await this.repo.appendWorkEvent({
      work_item_id: workItemId,
      event_type: 'ASSIGNED',
      actor_type: 'agent',
      actor_id: assignedBy,
      new_value: { assignee_agent_id: specialistAgentId },
      message: `Assigned to specialist ${specialistAgentId}`
    });

    return updated;
  }

  // ============================================================================
  // COMPLETION
  // ============================================================================

  async completeWorkItem(
    workItemId: string,
    output: Record<string, unknown>,
    rawLog: string,
    completedBy: string
  ): Promise<WorkItem> {
    const item = await this.repo.getWorkItemById(workItemId);
    if (!item) throw new Error(`Work item not found: ${workItemId}`);

    if (item.status !== 'working') {
      throw new Error(`Cannot complete: work item is ${item.status}`);
    }

    const updated = await this.repo.updateWorkItemStatus(
      workItemId,
      'done',
      'agent',
      completedBy,
      {
        structured_output: output,
        raw_log: rawLog
      }
    );

    if (!updated) throw new Error('Failed to complete work item');

    await this.repo.appendWorkEvent({
      work_item_id: workItemId,
      event_type: 'COMPLETED',
      actor_type: 'agent',
      actor_id: completedBy,
      new_value: { status: 'done', output_keys: Object.keys(output) },
      message: 'Work item completed successfully'
    });

    return updated;
  }

  async failWorkItem(
    workItemId: string,
    error: string,
    failedBy: string
  ): Promise<WorkItem> {
    const item = await this.repo.getWorkItemById(workItemId);
    if (!item) throw new Error(`Work item not found: ${workItemId}`);

    const updated = await this.repo.updateWorkItemStatus(
      workItemId,
      'failed',
      'system',
      failedBy,
      { last_error: error }
    );

    if (!updated) throw new Error('Failed to mark work item as failed');

    await this.repo.appendWorkEvent({
      work_item_id: workItemId,
      event_type: 'FAILED',
      actor_type: 'system',
      actor_id: failedBy,
      new_value: { status: 'failed', error: error.substring(0, 200) },
      message: `Failed: ${error.substring(0, 100)}`
    });

    return updated;
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  async getWorkItemHistory(workItemId: string): Promise<any[]> {
    return this.repo.getWorkEvents(workItemId);
  }
}
