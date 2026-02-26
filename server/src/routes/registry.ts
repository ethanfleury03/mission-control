import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getDb } from '../database';
import { RegistryRepository, RegistryService } from '../registry';
import { exportSnapshot, importFromJson, writeBackup } from '../registry/importExport';
import { notifyRegistryUpdated } from '../webhook';
import type { JsonAgent, JsonTeam } from '../registry/importExport';

const router = Router();
const DATA_DIR = path.join(process.cwd(), 'data');
const AGENTS_PATH = path.join(DATA_DIR, 'agents.json');
const TEAMS_PATH = path.join(DATA_DIR, 'teams.json');

// GET /api/export/agents-teams - Export snapshot (admin)
router.get('/export/agents-teams', async (req, res) => {
  try {
    const repo = new RegistryRepository(getDb());
    const teamId = req.query.teamId as string | undefined;
    const data = await exportSnapshot(repo, teamId);
    res.json(data);
  } catch (err: any) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message || 'Export failed' });
  }
});

// POST /api/import/agents-teams - Import from JSON (admin/dev)
router.post('/import/agents-teams', async (req, res) => {
  try {
    const { agents, teams } = req.body;
    if (!agents || !Array.isArray(agents)) {
      return res.status(400).json({ error: 'agents array required' });
    }
    if (!teams || !Array.isArray(teams)) {
      return res.status(400).json({ error: 'teams array required' });
    }

    const repo = new RegistryRepository(getDb());
    const result = await importFromJson(
      repo,
      { agents },
      { teams },
      req.headers['x-user-id'] as string
    );
    notifyRegistryUpdated(['teams', 'agents', 'members']);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

// POST /api/import/agents-teams/file - Import from data/ files (admin)
router.post('/import/agents-teams/file', async (req, res) => {
  try {
    const [agentsBuf, teamsBuf] = await Promise.all([
      fs.readFile(AGENTS_PATH, 'utf-8').catch(() => null),
      fs.readFile(TEAMS_PATH, 'utf-8').catch(() => null),
    ]);

    if (!agentsBuf || !teamsBuf) {
      return res.status(400).json({
        error: 'Missing data/agents.json or data/teams.json',
      });
    }

    const agentsJson = JSON.parse(agentsBuf) as { agents: JsonAgent[] };
    const teamsJson = JSON.parse(teamsBuf) as { teams: JsonTeam[] };

    const repo = new RegistryRepository(getDb());
    const result = await importFromJson(repo, agentsJson, teamsJson);
    notifyRegistryUpdated(['teams', 'agents', 'members']);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Import from file error:', err);
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

// POST /api/export/backup - Create timestamped backup in data/backups/
router.post('/export/backup', async (req, res) => {
  try {
    const repo = new RegistryRepository(getDb());
    const data = await exportSnapshot(repo);
    const base = await writeBackup(data);
    res.json({ success: true, backupId: base });
  } catch (err: any) {
    console.error('Backup error:', err);
    res.status(500).json({ error: err.message || 'Backup failed' });
  }
});

// GET /api/audit
router.get('/audit', async (req, res) => {
  try {
    const { entity_type, entity_id, limit } = req.query;
    const registry = new RegistryService();
    const { rows } = await registry.listAudit({
      entity_type: entity_type as string,
      entity_id: entity_id as string,
      limit: limit ? parseInt(limit as string) : 50,
    });
    res.json({ entries: rows });
  } catch (err: any) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch audit' });
  }
});

export default router;
