/**
 * Task Detail Panel Component
 * Popup overlay showing full task context, now using Work Kanban API.
 * Simplified for MVP to focus on basic task details and status.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, Trash2, Edit, Loader2 } from 'lucide-react';
import { cn } from '../app/lib/utils';

const WORK_API_BASE =
  (typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_GATEWAY_URL : undefined) ||
  'http://localhost:18792';
const WORK_ITEMS_URL = `${WORK_API_BASE.replace(/\/$/, '')}/mission-control/work/items`;
const AGENTS_URL_BASE = `${WORK_API_BASE.replace(/\/$/, '')}/mission-control/registry/teams`;

type KanbanColumn = 'queue' | 'ongoing' | 'need_human' | 'completed';

interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  status: KanbanColumn;
  priority: number;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

interface Agent {
  id: string;
  name: string;
}

const COLUMNS: { id: KanbanColumn; title: string }[] = [
  { id: 'queue', title: 'Queue' },
  { id: 'ongoing', title: 'Ongoing' },
  { id: 'need_human', title: 'Need Human Input' },
  { id: 'completed', title: 'Completed' },
];

const priorityOptions = [
  { value: -1, label: 'Low' },
  { value: 0, label: 'Medium' },
  { value: 2, label: 'High' },
];

export const TaskDetailPanel: React.FC<{ taskId: string; isOpen: boolean; onClose: () => void }> = (
  { taskId, isOpen, onClose }
) => {
  const [task, setTask] = useState<WorkItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<WorkItem>>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await fetch(`${WORK_ITEMS_URL}/${taskId}`);
      if (!res.ok) {
        if (res.status === 404) setTask(null);
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data: WorkItem = await res.json();
      setTask(data);
      setEditForm(data);
    } catch (err) {
      console.error('Failed to fetch task:', err);
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const fetchAgents = useCallback(async () => {
    try {
      const teamsRes = await fetch(`${AGENTS_URL_BASE}`);
      if (!teamsRes.ok) return;
      const teamsData = await teamsRes.json();
      const teams = teamsData.teams || [];
      if (teams.length === 0) return;
      const teamId = teams[0].id; // Assuming first team for now
      const agentsRes = await fetch(`${AGENTS_URL_BASE}/${teamId}/agents`);
      if (!agentsRes.ok) return;
      const agentsData = await agentsRes.json();
      setAgents(agentsData.agents || []);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTask();
      fetchAgents();
    }
  }, [isOpen, fetchTask, fetchAgents]);

  const getAgentName = (id: string | null) => {
    if (!id) return 'Unassigned';
    const agent = agents.find(a => a.id === id);
    return agent ? agent.name : id.slice(0, 8); // Fallback to partial ID
  };

  const handleSave = async () => {
    if (!task) return;
    setIsSaving(true);
    try {
      const updates: Partial<WorkItem> = {};
      if (editForm.title !== task.title) updates.title = editForm.title;
      if (editForm.description !== task.description) updates.description = editForm.description;
      if (editForm.status !== task.status) updates.status = editForm.status;
      if (editForm.priority !== task.priority) updates.priority = editForm.priority;
      if (editForm.agentId !== task.agentId) updates.agentId = editForm.agentId;

      if (Object.keys(updates).length > 0) {
        const res = await fetch(`${WORK_ITEMS_URL}/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const updatedTask: WorkItem = await res.json();
        setTask(updatedTask);
        setEditForm(updatedTask);
        setIsEditing(false);
      } else {
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Failed to save task:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    try {
      const res = await fetch(`${WORK_ITEMS_URL}/${taskId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      onClose(); // Close panel after deletion
    } catch (err) {
      console.error('Failed to delete task:', err);
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-secondary rounded-lg border border-white/10 max-w-2xl w-full flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            {!loading && task && (
              <div
                className={cn(
                  'px-2 py-1 text-xs font-semibold rounded-full',
                  task.status === 'queue' && 'bg-accent-cyan/20 text-accent-cyan',
                  task.status === 'ongoing' && 'bg-accent-yellow/20 text-accent-yellow',
                  task.status === 'need_human' && 'bg-accent-red/20 text-accent-red',
                  task.status === 'completed' && 'bg-accent-green/20 text-accent-green',
                )}
              >
                {task.status.replace(/_/g, ' ').toUpperCase()}
              </div>
            )}
            {isEditing ? (
              <input
                type="text"
                value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                className="flex-1 bg-bg-tertiary border border-white/5 rounded px-2 py-1 text-text-primary text-lg font-semibold focus:outline-none focus:border-accent-cyan/30"
              />
            ) : (
              <h3 className="text-lg font-semibold text-text-primary">{task?.title || 'Task Not Found'}</h3>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <button
                onClick={handleSave}
                disabled={isSaving || !editForm.title?.trim()}
                className="p-2 text-accent-cyan hover:bg-accent-cyan/10 rounded disabled:opacity-50"
                title="Save"
              >
                <Loader2 className={cn('w-4 h-4', isSaving && 'animate-spin')} />
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-text-muted hover:bg-white/5 rounded"
                title="Edit Task"
              >
                <Edit className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-2 text-text-muted hover:bg-white/5 rounded" title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="text-text-muted">Loading task details...</div>
          ) : task ? (
            <>
              <section>
                <h4 className="text-sm font-medium text-text-muted mb-2">Description</h4>
                {isEditing ? (
                  <textarea
                    value={editForm.description || ''}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    rows={4}
                    className="w-full bg-bg-tertiary border border-white/5 rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent-cyan/30 resize-y"
                  />
                ) : (
                  <p className="text-text-secondary text-sm">{task.description || 'No description provided.'}</p>
                )}
              </section>

              <div className="grid grid-cols-2 gap-4">
                <section>
                  <h4 className="text-sm font-medium text-text-muted mb-2">Status</h4>
                  {isEditing ? (
                    <select
                      value={editForm.status}
                      onChange={e => setEditForm(f => ({ ...f, status: e.target.value as KanbanColumn }))}
                      className="w-full px-3 py-2 bg-bg-tertiary border border-white/5 rounded text-text-primary focus:outline-none focus:border-accent-cyan/30"
                    >
                      {COLUMNS.map(col => (
                        <option key={col.id} value={col.id}>
                          {col.title}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div
                      className={cn(
                        'px-3 py-2 text-sm rounded border',
                        task.status === 'queue' && 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20',
                        task.status === 'ongoing' && 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
                        task.status === 'need_human' && 'bg-accent-red/10 text-accent-red border-accent-red/20',
                        task.status === 'completed' && 'bg-accent-green/10 text-accent-green border-accent-green/20',
                      )}
                    >
                      {task.status.replace(/_/g, ' ').toUpperCase()}
                    </div>
                  )}
                </section>

                <section>
                  <h4 className="text-sm font-medium text-text-muted mb-2">Priority</h4>
                  {isEditing ? (
                    <select
                      value={editForm.priority}
                      onChange={e => setEditForm(f => ({ ...f, priority: Number(e.target.value) }))}
                      className="w-full px-3 py-2 bg-bg-tertiary border border-white/5 rounded text-text-primary focus:outline-none focus:border-accent-cyan/30"
                    >
                      {priorityOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div
                      className={cn(
                        'px-3 py-2 text-sm rounded border',
                        task.priority === -1 && 'bg-accent-green/10 text-accent-green border-accent-green/20',
                        (task.priority === 0 || task.priority === 1) && 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
                        task.priority === 2 && 'bg-accent-red/10 text-accent-red border-accent-red/20',
                      )}
                    >
                      {priorityOptions.find(opt => opt.value === task.priority)?.label || 'Medium'}
                    </div>
                  )}
                </section>
              </div>

              <section>
                <h4 className="text-sm font-medium text-text-muted mb-2">Assignee</h4>
                {isEditing ? (
                  <select
                    value={editForm.agentId || ''}
                    onChange={e => setEditForm(f => ({ ...f, agentId: e.target.value || null }))}
                    className="w-full px-3 py-2 bg-bg-tertiary border border-white/5 rounded text-text-primary focus:outline-none focus:border-accent-cyan/30"
                  >
                    <option value="">Unassigned</option>
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-text-secondary text-sm">{getAgentName(task.agentId)}</p>
                )}
              </section>

              <div className="text-xs text-text-muted space-y-1">
                <p>Created: {new Date(task.createdAt).toLocaleString()}</p>
                <p>Last Updated: {new Date(task.updatedAt).toLocaleString()}</p>
              </div>

              {/* Delete confirmation */}
              {isEditing && (
                <div className="pt-4 border-t border-white/5 mt-4">
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-accent-red hover:bg-accent-red/10 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Task
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-text-muted">Are you sure you want to delete this task?</span>
                      <button
                        onClick={handleDelete}
                        className="px-3 py-1.5 bg-accent-red/20 text-accent-red rounded hover:bg-accent-red/30"
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1.5 text-text-muted hover:bg-white/5 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-text-muted">Task not found.</div>
          )}
        </div>
      </div>
    </div>
  );
};
