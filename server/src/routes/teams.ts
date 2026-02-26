import { Router } from 'express';
import { RegistryService } from '../registry';
import { toLegacyTeam, toLegacyAgent } from '../registry/adapter';
import { notifyRegistryUpdated } from '../webhook';

const router = Router();
const registry = new RegistryService();

function resolveTeamId(registry: RegistryService, teamId: string) {
  return registry.getRepository().getLegacyId(teamId).then((id) => id ?? teamId);
}

// GET /api/teams - List all teams
router.get('/', async (req, res) => {
  try {
    const teams = await registry.getTeams();
    const legacy = teams.map((t) =>
      toLegacyTeam(t, t.primary_manager_agent_id ?? undefined)
    );
    res.json({ teams: legacy });
  } catch (err: any) {
    console.error('Error fetching teams:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch teams' });
  }
});

// GET /api/teams/:id - Get single team with agents
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let team = await registry.getTeam(id);
    if (!team) team = await registry.getTeamByLegacyId(id);

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const agents = await registry.getAgents(team.id);
    const repo = registry.getRepository();
    const managers = await repo.listTeamManagers(team.id);
    const legacyAgents = agents.map((a) => {
      const isManager = managers.some((m) => m.agent_id === a.id);
      return toLegacyAgent(a, team!.id, isManager);
    });

    const legacy = toLegacyTeam(team, team.primary_manager_agent_id ?? undefined);
    res.json({ ...legacy, agents: legacyAgents });
  } catch (err: any) {
    console.error('Error fetching team:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch team' });
  }
});

// POST /api/teams - Create new team
router.post('/', async (req, res) => {
  try {
    const { name, description, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const newTeam = await registry.createTeam({
      name,
      description: description || '',
      color: color || '#22d3ee',
    });

    const legacy = toLegacyTeam(newTeam);
    if (req.app.locals.wss) {
      req.app.locals.wss.broadcast({ type: 'teams:updated', payload: { team: legacy } });
    }
    notifyRegistryUpdated(['teams']);
    res.status(201).json(legacy);
  } catch (err: any) {
    console.error('Error creating team:', err);
    res.status(500).json({ error: err.message || 'Failed to create team' });
  }
});

// PUT /api/teams/:id - Update team (supports version for optimistic locking)
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body;
    delete updates.id;
    delete updates.createdAt;

    let team = await registry.getTeam(id);
    if (!team) team = await registry.getTeamByLegacyId(id);

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const expectedVersion = updates.version;
    delete updates.version;

    const mapped: Record<string, unknown> = {};
    if (updates.name !== undefined) mapped.name = updates.name;
    if (updates.description !== undefined) mapped.description = updates.description;
    if (updates.color !== undefined) mapped.color = updates.color;

    const updatedTeam = await registry.updateTeam(
      team.id,
      mapped,
      expectedVersion,
      req.headers['x-user-id'] as string
    );

    const legacy = toLegacyTeam(updatedTeam, updatedTeam.primary_manager_agent_id ?? undefined);
    if (req.app.locals.wss) {
      req.app.locals.wss.broadcast({ type: 'teams:updated', payload: { team: legacy } });
    }
    notifyRegistryUpdated(['teams']);
    res.json(legacy);
  } catch (err: any) {
    if (err.message?.includes('Conflict')) {
      return res.status(409).json({ error: err.message });
    }
    console.error('Error updating team:', err);
    res.status(500).json({ error: err.message || 'Failed to update team' });
  }
});

// DELETE /api/teams/:id - Archive team (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { moveAgentsToTeam } = req.query;
    const id = req.params.id;

    let team = await registry.getTeam(id);
    if (!team) team = await registry.getTeamByLegacyId(id);

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (moveAgentsToTeam) {
      const resolved = await resolveTeamId(registry, moveAgentsToTeam as string);
      const agents = await registry.getAgents(team.id);
      const repo = registry.getRepository();
      for (const a of agents) {
        await repo.updateAgent(a.id, { primary_team_id: resolved });
      }
    }

    await registry.setTeamStatus(team.id, 'archived', team.version);
    if (req.app.locals.wss) {
      req.app.locals.wss.broadcast({ type: 'teams:updated', payload: { deletedTeamId: id } });
    }
    notifyRegistryUpdated(['teams', 'members']);
    res.json({ success: true, message: 'Team archived' });
  } catch (err: any) {
    console.error('Error deleting team:', err);
    res.status(500).json({ error: err.message || 'Failed to delete team' });
  }
});

export default router;
