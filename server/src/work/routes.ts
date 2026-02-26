/**
 * Work Orchestration API Routes
 * MVP Endpoints: create, list, claim, status transitions
 */

import { Router } from 'express';
import { z } from 'zod';
import { WorkService } from './service';
import { WorkStatusEnum, CreateWorkItemSchema, UpdateWorkItemStatusSchema } from './types';
import { getDb } from '../database';

const router = Router();

// Get service instance (singleton per request)
function getWorkService() {
  return new WorkService(getDb());
}

// ============================================================================
// POST /api/work-items - Create new work item
// ============================================================================
router.post('/work-items', async (req, res) => {
  try {
    const parsed = CreateWorkItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const service = getWorkService();
    const workItem = await service.createWorkItem(parsed.data as any);

    // Check if this was an existing item (idempotency)
    const isExisting = req.body.idempotency_key && 
      workItem.created_at !== new Date().toISOString().split('T')[0];
    
    res.status(isExisting ? 200 : 201).json({
      id: workItem.id,
      status: workItem.status,
      team_id: workItem.team_id,
      priority: workItem.priority,
      idempotency_key: workItem.idempotency_key,
      created_at: workItem.created_at,
      existing: isExisting
    });
  } catch (err: any) {
    console.error('Error creating work item:', err);
    res.status(500).json({ error: err.message || 'Failed to create work item' });
  }
});

// ============================================================================
// GET /api/work-items - List work items with filters
// ============================================================================
const ListWorkItemsQuerySchema = z.object({
  team_id: z.string().uuid().optional(),
  status: WorkStatusEnum.optional(),
  assignee_agent_id: z.string().uuid().optional(),
  manager_agent_id: z.string().uuid().optional(),
  parent_work_item_id: z.union([z.string().uuid(), z.literal('null')]).optional(),
  limit: z.string().transform(Number).default('50')
});

router.get('/work-items', async (req, res) => {
  try {
    const parsed = ListWorkItemsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parsed.error.errors
      });
    }

    const filters: any = {
      team_id: parsed.data.team_id,
      status: parsed.data.status,
      assignee_agent_id: parsed.data.assignee_agent_id,
      manager_agent_id: parsed.data.manager_agent_id,
      limit: parsed.data.limit
    };

    if (parsed.data.parent_work_item_id === 'null') {
      filters.parent_work_item_id = null;
    } else if (parsed.data.parent_work_item_id) {
      filters.parent_work_item_id = parsed.data.parent_work_item_id;
    }

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) delete filters[key];
    });

    const service = getWorkService();
    const items = await service.listWorkItems(filters);

    res.json({
      count: items.length,
      items: items.map(item => ({
        id: item.id,
        status: item.status,
        team_id: item.team_id,
        parent_work_item_id: item.parent_work_item_id,
        priority: item.priority,
        manager_agent_id: item.manager_agent_id,
        assignee_agent_id: item.assignee_agent_id,
        attempt_count: item.attempt_count,
        created_at: item.created_at,
        claimed_at: item.claimed_at,
        completed_at: item.completed_at
      }))
    });
  } catch (err: any) {
    console.error('Error listing work items:', err);
    res.status(500).json({ error: err.message || 'Failed to list work items' });
  }
});

// ============================================================================
// GET /api/work-items/:id - Get single work item with history
// ============================================================================
router.get('/work-items/:id', async (req, res) => {
  try {
    const service = getWorkService();
    const item = await service.getWorkItem(req.params.id);
    
    if (!item) {
      return res.status(404).json({ error: 'Work item not found' });
    }

    const history = await service.getWorkItemHistory(item.id);

    res.json({
      ...item,
      input: item.input,
      structured_output: item.structured_output,
      history
    });
  } catch (err: any) {
    console.error('Error getting work item:', err);
    res.status(500).json({ error: err.message || 'Failed to get work item' });
  }
});

// ============================================================================
// POST /api/work-items/claim - Atomically claim work items
// ============================================================================
const ClaimWorkItemsSchema = z.object({
  limit: z.number().int().min(1).max(10).default(1),
  worker_id: z.string().default('anonymous')
});

router.post('/work-items/claim', async (req, res) => {
  try {
    const parsed = ClaimWorkItemsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const service = getWorkService();
    const claimed = await service.claimNextWorkItems(
      parsed.data.worker_id,
      parsed.data.limit
    );

    res.json({
      claimed: claimed.length,
      items: claimed.map(item => ({
        id: item.id,
        team_id: item.team_id,
        status: item.status,
        manager_agent_id: item.manager_agent_id,
        attempt_count: item.attempt_count,
        claimed_at: item.claimed_at
      }))
    });
  } catch (err: any) {
    console.error('Error claiming work items:', err);
    res.status(500).json({ error: err.message || 'Failed to claim work items' });
  }
});

// ============================================================================
// PATCH /api/work-items/:id/status - Transition status with state machine
// ============================================================================
router.patch('/work-items/:id/status', async (req, res) => {
  try {
    const parsed = UpdateWorkItemStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const service = getWorkService();
    
    try {
      const updated = await service.transitionStatus(
        req.params.id,
        parsed.data.status,
        req.body.actor_type || 'system',
        req.body.actor_id || null,
        {
          reason: parsed.data.reason,
          last_error: req.body.last_error,
          assignee_agent_id: req.body.assignee_agent_id
        }
      );

      res.json({
        id: updated.id,
        status: updated.status,
        previous_status: req.body.previous_status,
        updated_at: updated.updated_at
      });
    } catch (err: any) {
      // Check if it's a transition validation error
      if (err.message.includes('Invalid status transition')) {
        return res.status(400).json({
          error: 'Invalid status transition',
          message: err.message
        });
      }
      if (err.message.includes('max attempts')) {
        return res.status(400).json({
          error: 'Max attempts exceeded',
          message: err.message
        });
      }
      throw err;
    }
  } catch (err: any) {
    console.error('Error updating work item status:', err);
    res.status(500).json({ error: err.message || 'Failed to update status' });
  }
});

// ============================================================================
// POST /api/work-items/:id/assign - Assign to specialist
// ============================================================================
router.post('/work-items/:id/assign', async (req, res) => {
  try {
    const schema = z.object({
      specialist_agent_id: z.string().uuid(),
      assigned_by: z.string()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const service = getWorkService();
    const updated = await service.assignToSpecialist(
      req.params.id,
      parsed.data.specialist_agent_id,
      parsed.data.assigned_by
    );

    res.json({
      id: updated.id,
      status: updated.status,
      assignee_agent_id: updated.assignee_agent_id,
      updated_at: updated.updated_at
    });
  } catch (err: any) {
    console.error('Error assigning work item:', err);
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(400).json({ error: err.message });
  }
});

export default router;
