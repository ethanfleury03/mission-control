/**
 * Org Chart API Routes - PostgreSQL-backed
 */

import { Router, Request, Response } from 'express';
import * as orgRepo from '../org/repository';

const router = Router();

/** Build nodes/edges from DB for ReactFlow */
function buildNodesAndEdges(people: Awaited<ReturnType<typeof orgRepo.getAllPeople>>, departments: Awaited<ReturnType<typeof orgRepo.getAllDepartments>>) {
  const deptMap = new Map(departments.map(d => [d.id, d]));
  const deptNameById = new Map<string, string>();
  departments.forEach(d => deptNameById.set(d.id, d.name));

  const nodes = people.map(p => {
    const deptName = p.department_name ?? (p.department_id ? deptNameById.get(p.department_id) : null) ?? 'Unknown';
    const perms = p.permissions ? (JSON.parse(p.permissions) as string[]) : [];
    const directReports = people.filter(c => c.manager_id === p.id).map(c => c.id);
    return {
      id: p.id,
      type: 'orgNode',
      position: { x: p.pos_x, y: p.pos_y },
      data: {
        id: p.id,
        name: p.name,
        role: p.role,
        email: p.email,
        department: deptName,
        level: p.level,
        status: p.status,
        type: p.type,
        managerId: p.manager_id,
        directReports,
        avatar: p.avatar,
        permissions: perms,
        profileFile: p.profile_file,
      },
    };
  });

  const edges = people
    .filter(p => p.manager_id)
    .map(p => ({
      id: `e-${p.manager_id}-${p.id}`,
      source: p.manager_id!,
      target: p.id,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#6366f1', strokeWidth: 2 },
    }));

  return { nodes, edges };
}

/** GET /api/org/context - Org context for AI/LLM */
router.get('/context', async (req: Request, res: Response) => {
  try {
    const [people, departments] = await Promise.all([
      orgRepo.getAllPeople(),
      orgRepo.getAllDepartments(),
    ]);
    const { nodes, edges } = buildNodesAndEdges(people, departments);

    const members = nodes.map((n: { id: string; data: Record<string, unknown> }) => ({
      id: n.data.id,
      name: n.data.name,
      role: n.data.role,
      email: n.data.email,
      department: n.data.department,
      status: n.data.status,
      permissions: n.data.permissions ?? [],
      level: n.data.level,
      managerId: n.data.managerId,
      directReports: n.data.directReports ?? [],
    }));

    const hierarchy: Record<string, { managerId: string | null; directReports: string[]; level: number }> = {};
    nodes.forEach((n: { id: string; data: Record<string, unknown> }) => {
      hierarchy[n.id] = {
        managerId: n.data.managerId as string | null,
        directReports: (n.data.directReports as string[]) ?? [],
        level: (n.data.level as number) ?? 1,
      };
    });
    const rootNode = nodes.find((n: { data: { managerId: unknown } }) => n.data.managerId === null);

    const format = (req.query.format as string) || 'json';
    const memberId = req.query.memberId as string | undefined;
    const department = req.query.department as string | undefined;

    if (memberId) {
      const member = members.find(m => m.id === memberId);
      if (!member) return res.status(404).json({ error: 'Member not found' });
      const hierarchyInfo = hierarchy[memberId];
      const manager = hierarchyInfo?.managerId ? members.find(m => m.id === hierarchyInfo.managerId) : null;
      const reports = (hierarchyInfo?.directReports ?? []).map(id => members.find(m => m.id === id)).filter(Boolean);
      if (format === 'markdown') {
        const lines = [
          `# ${member.name}`,
          '',
          `**Role:** ${member.role}`,
          `**Department:** ${member.department}`,
          `**Level:** ${member.level}`,
          `**Status:** ${member.status}`,
          ...(member.email ? [`**Email:** ${member.email}`] : []),
          '',
          ...(manager ? [`**Manager:** ${manager.name} (${manager.role})`] : []),
          ...(reports.length ? ['', '**Direct Reports:**', ...reports.map(r => `- ${r!.name} (${r!.role})`)] : []),
          ...((Array.isArray(member.permissions) && member.permissions.length) ? ['', `**Permissions:** ${(member.permissions as string[]).join(', ')}`] : []),
        ];
        return res.setHeader('Content-Type', 'text/markdown').send(lines.join('\n'));
      }
      return res.json({ member, manager: manager ?? null, directReports: reports, peers: [] });
    }

    if (department) {
      const deptMembers = members.filter(m => m.department === department);
      if (format === 'markdown') {
        const lines = [
          `# ${department} Department`,
          '',
          `**Members:** ${deptMembers.length}`,
          '',
          '## Team',
          '',
          ...deptMembers.map(m => `- **${m.name}** - ${m.role} (Level ${m.level})`),
        ];
        return res.setHeader('Content-Type', 'text/markdown').send(lines.join('\n'));
      }
      return res.json({ department, memberCount: deptMembers.length, members: deptMembers });
    }

    const context = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      rootId: rootNode?.id ?? '',
      members,
      hierarchy,
    };

    if (format === 'markdown') {
      const lines = [
        '# Organization Structure',
        '',
        `**Version:** ${context.version}`,
        `**Last Updated:** ${context.lastUpdated}`,
        `**Total Members:** ${context.members.length}`,
        '',
        '## Departments',
        '',
        ...Object.entries(
          members.reduce((acc, m) => {
            const dept = String(m.department ?? '');
            acc[dept] = (acc[dept] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ).map(([dept, count]) => `- **${dept}:** ${count} member${count !== 1 ? 's' : ''}`),
        '',
      ];
      return res.setHeader('Content-Type', 'text/markdown').send(lines.join('\n'));
    }

    return res.json({ context });
  } catch (err) {
    console.error('Error in GET /api/org/context:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/org/context - Update org (simplified - stores as snapshot) */
router.post('/context', async (req: Request, res: Response) => {
  try {
    const { members, hierarchy, rootId, version } = req.body;
    await orgRepo.createSnapshot({
      name: `Context update ${new Date().toISOString()}`,
      description: 'Context update from API',
      data: { members, hierarchy, rootId, version },
    });
    return res.json({
      success: true,
      message: 'Context update stored',
      context: {
        version: version || '1.0',
        lastUpdated: new Date().toISOString(),
        memberCount: members?.length || 0,
      },
    });
  } catch (err) {
    console.error('Error in POST /api/org/context:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/org/events */
router.get('/events', async (req: Request, res: Response) => {
  try {
    const since = req.query.since as string | undefined;
    const personId = req.query.personId as string | undefined;
    const type = req.query.type as string | undefined;
    const limit = parseInt(req.query.limit as string || '50', 10);
    const format = req.query.format as string | undefined;

    const events = await orgRepo.getOrgEvents({ since, person_id: personId, type, limit });
    const stats = {
      totalEvents: events.length,
      returnedEvents: events.length,
      byType: events.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      lastEventId: events[0]?.id ?? null,
      lastEventTime: events[0]?.created_at ?? null,
    };

    const payload = { events, stats, pagination: { limit, hasMore: false } };

    if (format === 'sse') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      const keepAlive = setInterval(() => res.write(':keep-alive\n\n'), 30000);
      req.on('close', () => clearInterval(keepAlive));
      return;
    }
    return res.json(payload);
  } catch (err) {
    console.error('Error in GET /api/org/events:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PATCH /api/org/events - Batch create events */
router.patch('/events', async (req: Request, res: Response) => {
  try {
    const { events: newEvents } = req.body;
    if (!Array.isArray(newEvents)) {
      return res.status(400).json({ error: 'events array required' });
    }
    const created: Array<{ id: string; type: string; person_id: string }> = [];
    for (const e of newEvents) {
      if (!e.type || !e.personId) continue;
      const id = await orgRepo.addOrgEvent({
        type: e.type,
        person_id: e.personId,
        field: e.field ?? null,
        old_value: e.oldValue != null ? JSON.stringify(e.oldValue) : null,
        new_value: e.newValue != null ? JSON.stringify(e.newValue) : null,
        metadata: e.metadata ? JSON.stringify(e.metadata) : null,
      });
      created.push({ id, type: e.type, person_id: e.personId });
    }
    return res.json({ success: true, events: created, count: created.length });
  } catch (err) {
    console.error('Error in PATCH /api/org/events:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/org/events */
router.post('/events', async (req: Request, res: Response) => {
  try {
    const { type, personId, personName, field, oldValue, newValue, metadata } = req.body;
    if (!type || !personId) {
      return res.status(400).json({ error: 'Type and personId are required' });
    }
    const validTypes = ['create', 'update', 'delete', 'move', 'promote', 'demote', 'reorder'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid event type. Must be one of: ${validTypes.join(', ')}` });
    }
    const id = await orgRepo.addOrgEvent({
      type,
      person_id: personId,
      field: field ?? null,
      old_value: oldValue != null ? JSON.stringify(oldValue) : null,
      new_value: newValue != null ? JSON.stringify(newValue) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
    const created = await orgRepo.getOrgEventById(id);
    return res.json({ success: true, event: created ?? { id, type, person_id: personId, created_at: new Date().toISOString() } });
  } catch (err) {
    console.error('Error in POST /api/org/events:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/org/snapshot - Full org or specific snapshot */
router.get('/snapshot', async (req: Request, res: Response) => {
  try {
    const id = req.query.id as string | undefined;
    const list = req.query.list === 'true';
    const format = req.query.format as string | undefined;

    if (id) {
      const snapshot = await orgRepo.getSnapshot(id);
      if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
      if (format === 'full') {
        const org = snapshot.data as { nodes?: unknown[]; edges?: unknown[] };
        return res.json({ snapshot: { ...snapshot, org } });
      }
      return res.json({ snapshot });
    }

    if (list) {
      const snapshots = await orgRepo.listSnapshots();
      return res.json({ snapshots });
    }

    const [people, departments] = await Promise.all([
      orgRepo.getAllPeople(),
      orgRepo.getAllDepartments(),
    ]);
    const { nodes, edges } = buildNodesAndEdges(people, departments);
    const deptCounts = new Map<string, number>();
    let maxDepth = 0;
    people.forEach(p => {
      const name = p.department_name ?? 'Unknown';
      deptCounts.set(name, (deptCounts.get(name) ?? 0) + 1);
      maxDepth = Math.max(maxDepth, p.level);
    });
    const rootNode = nodes.find((n: { data: { managerId: unknown } }) => n.data.managerId === null);
    const org = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      stats: {
        totalPeople: people.length,
        totalDepartments: deptCounts.size,
        maxDepth,
      },
      departments: Array.from(deptCounts.entries()).map(([name, count]) => ({
        id: name,
        name,
        color: '#6366f1',
        memberCount: count,
      })),
      people: people.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        email: p.email,
        department: p.department_name ?? 'Unknown',
        level: p.level,
        status: p.status,
        managerId: p.manager_id,
        directReports: people.filter(c => c.manager_id === p.id).map(c => c.id),
        permissions: p.permissions ? JSON.parse(p.permissions) : [],
        avatar: p.avatar,
      })),
      hierarchy: {
        rootId: rootNode?.id ?? '',
        edges: edges.map((e: { id: string; source: string; target: string }) => ({ id: e.id, source: e.source, target: e.target })),
      },
    };
    return res.json({ org });
  } catch (err) {
    console.error('Error in GET /api/org/snapshot:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/org/snapshot */
router.post('/snapshot', async (req: Request, res: Response) => {
  try {
    const { id, name, description, nodes, edges, action } = req.body;

    if (action === 'autosave') {
      const autoId = 'autosave-' + new Date().toISOString().split('T')[0];
      await orgRepo.createSnapshot({
        id: autoId,
        name: 'Auto-save ' + new Date().toLocaleString(),
        description: 'Automatically saved',
        data: { nodes: nodes ?? [], edges: edges ?? [] },
      });
      return res.json({ success: true, snapshot: { id: autoId } });
    }

    if (!id) {
      const newId = await orgRepo.createSnapshot({
        name: name || 'Untitled Snapshot',
        description,
        data: { nodes: nodes ?? [], edges: edges ?? [] },
      });
      return res.json({ success: true, snapshot: { id: newId } });
    }

    const updated = await orgRepo.updateSnapshot(id, {
      name: name ?? undefined,
      description: description ?? undefined,
      data: nodes != null || edges != null ? { nodes: nodes ?? [], edges: edges ?? [] } : undefined,
    });
    if (!updated) return res.status(404).json({ error: 'Snapshot not found' });
    return res.json({ success: true, snapshot: { id } });
  } catch (err) {
    console.error('Error in POST /api/org/snapshot:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** DELETE /api/org/snapshot */
router.delete('/snapshot', async (req: Request, res: Response) => {
  try {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Snapshot ID required' });
    const deleted = await orgRepo.deleteSnapshot(id);
    if (!deleted) return res.status(404).json({ error: 'Snapshot not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/org/snapshot:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
