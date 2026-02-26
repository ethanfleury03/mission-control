import { Router } from 'express';
import { RegistryService } from '../registry';
import { toLegacyAgent } from '../registry/adapter';
import { notifyRegistryUpdated } from '../webhook';

const router = Router();
const registry = new RegistryService();

function resolveTeamId(registry: RegistryService, teamId: string): Promise<string> {
  return registry.getRepository().getLegacyId(teamId).then((id) => id ?? teamId);
}

// GET /api/agents - List all agents (with optional teamId filter)
router.get('/', async (req, res) => {
  try {
    let teamId = req.query.teamId as string | undefined;
    if (teamId) {
      teamId = await resolveTeamId(registry, teamId);
    }
    const agents = await registry.getAgents(teamId);
    const repo = registry.getRepository();
    const managerIds = await repo.listAllManagerAgentIds();

    const legacyAgents = agents.map((a) => {
      const tid = a.primary_team_id ?? '';
      const isManager = managerIds.has(a.id);
      return toLegacyAgent(a, tid, isManager);
    });

    res.json({ agents: legacyAgents });
  } catch (err: any) {
    console.error('Error fetching agents:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch agents' });
  }
});

// GET /api/agents/:id - Get single agent
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let agent = await registry.getAgent(id);
    if (!agent) agent = await registry.getAgentByLegacyId(id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const tid = agent.primary_team_id ?? '';
    const repo = registry.getRepository();
    const managers = tid ? await repo.listTeamManagers(tid) : [];
    const isManager = managers.some((m) => m.agent_id === agent!.id);
    const legacy = toLegacyAgent(agent, tid, isManager);

    res.json(legacy);
  } catch (err: any) {
    console.error('Error fetching agent:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch agent' });
  }
});

// POST /api/agents - Create new agent
router.post('/', async (req, res) => {
  try {
    const { name, teamId, model, runtime, status, description, avatarType, tokens } = req.body;

    if (!name || !teamId || !model || !runtime) {
      return res.status(400).json({
        error: 'Missing required fields: name, teamId, model, runtime',
      });
    }

    const resolvedTeamId = await resolveTeamId(registry, teamId);
    const newAgent = await registry.createAgent({
      name,
      model,
      runtime,
      description,
      avatar_type: avatarType || 'robot-teal',
      primary_team_id: resolvedTeamId,
    });

    await registry.getRepository().inviteMember(resolvedTeamId, newAgent.id, 'specialist');
    const member = await registry.getRepository().findTeamMemberByTeamAndAgent(
      resolvedTeamId,
      newAgent.id
    );
    if (member) {
      await registry.setMemberStatus(member.id, 'active');
    }

    const legacy = toLegacyAgent(newAgent, resolvedTeamId, false);
    if (req.app.locals.wss) {
      req.app.locals.wss.broadcast({ type: 'agents:updated', payload: { agent: legacy } });
    }
    notifyRegistryUpdated(['agents', 'members']);
    res.status(201).json(legacy);
  } catch (err: any) {
    console.error('Error creating agent:', err);
    res.status(500).json({ error: err.message || 'Failed to create agent' });
  }
});

// PUT /api/agents/:id - Update agent (supports version for optimistic locking)
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body;
    delete updates.id;

    let agent = await registry.getAgent(id);
    if (!agent) agent = await registry.getAgentByLegacyId(id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const expectedVersion = updates.version;
    delete updates.version;

    const mapped: Record<string, unknown> = {};
    if (updates.name !== undefined) mapped.name = updates.name;
    if (updates.model !== undefined) mapped.model = updates.model;
    if (updates.runtime !== undefined) mapped.runtime = updates.runtime;
    if (updates.description !== undefined) mapped.description = updates.description;
    if (updates.avatarType !== undefined) mapped.avatar_type = updates.avatarType;
    if (updates.teamId !== undefined) {
      mapped.primary_team_id = await resolveTeamId(registry, updates.teamId);
    }

    const updatedAgent = await registry.updateAgent(
      agent.id,
      mapped,
      expectedVersion,
      req.headers['x-user-id'] as string
    );

    const tid = updatedAgent.primary_team_id ?? '';
    const repo = registry.getRepository();
    const managers = tid ? await repo.listTeamManagers(tid) : [];
    const isManager = managers.some((m) => m.agent_id === updatedAgent.id);
    const legacy = toLegacyAgent(updatedAgent, tid, isManager);

    if (req.app.locals.wss) {
      req.app.locals.wss.broadcast({ type: 'agents:updated', payload: { agent: legacy } });
    }
    notifyRegistryUpdated(['agents']);
    res.json(legacy);
  } catch (err: any) {
    if (err.message?.includes('Conflict')) {
      return res.status(409).json({ error: err.message });
    }
    console.error('Error updating agent:', err);
    res.status(500).json({ error: err.message || 'Failed to update agent' });
  }
});

// DELETE /api/agents/:id - Soft delete (set is_active = false)
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let agent = await registry.getAgent(id);
    if (!agent) agent = await registry.getAgentByLegacyId(id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    await registry.updateAgent(
      agent.id,
      { is_active: false },
      undefined,
      req.headers['x-user-id'] as string
    );

    if (req.app.locals.wss) {
      req.app.locals.wss.broadcast({ type: 'agents:updated', payload: { deletedAgentId: id } });
    }
    notifyRegistryUpdated(['agents', 'members']);
    res.json({ success: true, message: 'Agent deactivated' });
  } catch (err: any) {
    console.error('Error deleting agent:', err);
    res.status(500).json({ error: err.message || 'Failed to delete agent' });
  }
});

export default router;
