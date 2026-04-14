'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn, formatTimeAgo } from '../lib/utils';
import { Plus, MoreHorizontal, Clock, AlertCircle, CheckCircle2, User, X, GripVertical, RefreshCw, Trash2 } from 'lucide-react';

const WORK_BOARD_URL = '/api/work';

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
  teamId?: string;
}

const COLUMNS: { id: KanbanColumn; title: string; icon: typeof Clock; color: string }[] = [
  { id: 'queue', title: 'Queue', icon: Clock, color: 'text-accent-cyan' },
  { id: 'ongoing', title: 'Ongoing', icon: AlertCircle, color: 'text-accent-yellow' },
  { id: 'completed', title: 'Completed', icon: CheckCircle2, color: 'text-accent-green' },
  { id: 'need_human', title: 'Need Human Input', icon: User, color: 'text-accent-red' },
];

const priorityLabels: Record<number, string> = {
  0: 'medium',
  1: 'medium',
  '-1': 'low',
  2: 'high',
};

export function KanbanBoard({ initialContextKey = 'channel:1469858204237299956' }: { initialContextKey?: string } = {}) {
  const [tasks, setTasks] = useState<WorkItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [draggedTask, setDraggedTask] = useState<WorkItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<KanbanColumn | null>(null);
  const [newTask, setNewTask] = useState({ title: '', priority: 0, agentId: '' });
  const [contextKey, setContextKey] = useState(initialContextKey);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<WorkItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageTask, setMessageTask] = useState({ messageId: '', text: '', author: 'Ethan Fleury', priority: 0 });
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      const qs = contextKey.trim() ? `?contextKey=${encodeURIComponent(contextKey.trim())}` : '';
      const res = await fetch(`${WORK_BOARD_URL}/board${qs}`);
      if (res.ok) {
        const data = await res.json();
        const all: WorkItem[] = [];
        for (const col of data.columns || []) {
          for (const item of col.items || []) {
            all.push({
              id: item.id,
              title: item.title,
              description: item.description ?? null,
              status: item.status,
              priority: item.priority ?? 0,
              agentId: item.agentId ?? null,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              metadata: item.metadata ?? {},
            });
          }
        }
        setTasks(all);
      }
    } catch (err) {
      console.error('Failed to load work board:', err);
    } finally {
      setIsLoading(false);
    }
  }, [contextKey]);

  const loadAgents = useCallback(async () => {
    try {
      const teamsRes = await fetch('/api/registry/teams');
      if (!teamsRes.ok) return;
      const teamsData = await teamsRes.json();
      const teams = teamsData.teams || [];
      if (teams.length === 0) return;
      const teamId = teams[0].id;
      const teamRes = await fetch(`/api/registry/teams/${teamId}`);
      if (!teamRes.ok) return;
      const teamData = await teamRes.json();
      setAgents(teamData.agents || []);
    } catch (err) {
      console.error('Failed to load agents:', err);
    }
  }, []);

  useEffect(() => {
    setContextKey(initialContextKey);
  }, [initialContextKey]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    const startPolling = () => {
      if (pollingIntervalRef.current) return;
      pollingIntervalRef.current = setInterval(loadBoard, 5000);
    };
    const stopPolling = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
    const handleVisibility = () => {
      if (document.hidden) stopPolling();
      else startPolling();
    };
    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadBoard]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadBoard();
    setIsRefreshing(false);
  };

  const openEditModal = (task: WorkItem) => {
    setSelectedTask(task);
    setShowEditModal(true);
    loadAgents();
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setSelectedTask(null);
    setShowDeleteConfirm(false);
  };

  const handleDragStart = (task: WorkItem) => setDraggedTask(task);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = async (e: React.DragEvent, column: KanbanColumn) => {
    e.preventDefault();
    if (!draggedTask) return;
    setTasks(prev =>
      prev.map(t => (t.id === draggedTask.id ? { ...t, status: column } : t))
    );
    try {
      const res = await fetch(`${WORK_BOARD_URL}/items/${draggedTask.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: column }),
      });
      if (!res.ok) loadBoard();
    } catch {
      loadBoard();
    }
    setDraggedTask(null);
  };

  const getColumnTasks = (column: KanbanColumn) =>
    tasks.filter(t => t.status === column);

  const handleAddTask = async () => {
    if (!newTask.title.trim() || !selectedColumn) return;
    try {
      const res = await fetch(`${WORK_BOARD_URL}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTask.title.trim(),
          status: selectedColumn,
          priority: newTask.priority,
          agentId: newTask.agentId || null,
          metadata: {
            contextKey: contextKey.trim() || 'global',
            source: 'manual-ui',
          },
        }),
      });
      if (res.ok) {
        await loadBoard();
        setNewTask({ title: '', priority: 0, agentId: '' });
        setShowModal(false);
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const openAddModal = (column: KanbanColumn) => {
    setSelectedColumn(column);
    setShowModal(true);
    loadAgents();
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-primary">
        <div className="text-text-muted">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      <div className="px-6 py-4 border-b border-hub-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Task Board</h2>
          <span className="text-sm text-text-muted">{tasks.length} tasks</span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 text-text-muted hover:text-accent-cyan hover:bg-accent-cyan/10 rounded transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={contextKey}
            onChange={e => setContextKey(e.target.value)}
            placeholder="Context key (ex: channel:146...)"
            className="w-72 px-3 py-1.5 bg-bg-tertiary border border-hub-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-cyan/30"
          />
          <button
            onClick={() => setContextKey('')}
            className="px-2 py-1.5 text-xs text-text-muted hover:text-text-primary"
            title="Show all contexts"
          >
            All
          </button>
          <button
            onClick={() => setShowMessageModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-accent-yellow/10 text-accent-yellow rounded-md border border-accent-yellow/20 hover:bg-accent-yellow/20 transition-colors text-sm"
          >
            From Message
          </button>
          <button
            onClick={() => openAddModal('queue')}
            className="flex items-center gap-2 px-3 py-1.5 bg-accent-cyan/10 text-accent-cyan rounded-md border border-accent-cyan/20 hover:bg-accent-cyan/20 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex gap-4 p-6 min-w-max">
          {COLUMNS.map(column => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={getColumnTasks(column.id)}
              agents={agents}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onAddTask={openAddModal}
              onTaskClick={openEditModal}
            />
          ))}
        </div>
      </div>

      {showEditModal && selectedTask && (
        <EditTaskModal
          task={selectedTask}
          agents={agents}
          onClose={closeEditModal}
          onSave={async (updates) => {
            try {
              const res = await fetch(`${WORK_BOARD_URL}/items/${selectedTask.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
              });
              if (res.ok) {
                const updated = await res.json();
                setTasks(prev =>
                  prev.map(t => (t.id === updated.id ? { ...t, ...updated } : t))
                );
                setSelectedTask(updated);
              }
            } catch (err) {
              console.error('Failed to save:', err);
            }
          }}
          onDelete={async () => {
            try {
              const res = await fetch(`${WORK_BOARD_URL}/items/${selectedTask.id}`, {
                method: 'DELETE',
              });
              if (res.ok) {
                setTasks(prev => prev.filter(t => t.id !== selectedTask.id));
                closeEditModal();
              }
            } catch (err) {
              console.error('Failed to delete:', err);
            }
            setShowDeleteConfirm(false);
          }}
          showDeleteConfirm={showDeleteConfirm}
          setShowDeleteConfirm={setShowDeleteConfirm}
        />
      )}

      {showMessageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-secondary rounded-lg border border-neutral-200 p-6 w-[34rem]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Create Task From Message</h3>
              <button onClick={() => setShowMessageModal(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={messageTask.messageId}
                onChange={e => setMessageTask({ ...messageTask, messageId: e.target.value })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-hub-border rounded text-text-primary"
                placeholder="Message ID"
              />
              <input
                type="text"
                value={messageTask.author}
                onChange={e => setMessageTask({ ...messageTask, author: e.target.value })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-hub-border rounded text-text-primary"
                placeholder="Author"
              />
              <textarea
                value={messageTask.text}
                onChange={e => setMessageTask({ ...messageTask, text: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 bg-bg-tertiary border border-hub-border rounded text-text-primary resize-none"
                placeholder="Paste the message content"
              />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowMessageModal(false)} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary">Cancel</button>
              <button
                onClick={async () => {
                  if (!messageTask.messageId.trim() || !messageTask.text.trim()) return;
                  const channelId = contextKey.startsWith('channel:') ? contextKey.slice('channel:'.length) : undefined;
                  const res = await fetch(`${WORK_BOARD_URL}/items/from-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      messageId: messageTask.messageId.trim(),
                      text: messageTask.text.trim(),
                      author: messageTask.author.trim() || undefined,
                      channelId,
                      contextKey: contextKey.trim() || undefined,
                      priority: messageTask.priority,
                    }),
                  });
                  if (res.ok) {
                    await loadBoard();
                    setShowMessageModal(false);
                    setMessageTask({ messageId: '', text: '', author: 'Ethan Fleury', priority: 0 });
                  }
                }}
                className="px-4 py-2 bg-accent-yellow/10 text-accent-yellow rounded border border-accent-yellow/20 hover:bg-accent-yellow/20 text-sm"
              >
                Create from Message
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-secondary rounded-lg border border-neutral-200 p-6 w-96">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">New Task</h3>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">Title</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-hub-border rounded text-text-primary focus:outline-none focus:border-accent-cyan/30"
                  placeholder="What needs to be done?"
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Priority</label>
                <select
                  value={newTask.priority}
                  onChange={e => setNewTask({ ...newTask, priority: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-hub-border rounded text-text-primary focus:outline-none focus:border-accent-cyan/30"
                >
                  <option value={-1}>Low</option>
                  <option value={0}>Medium</option>
                  <option value={2}>High</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Assign To</label>
                <select
                  value={newTask.agentId}
                  onChange={e => setNewTask({ ...newTask, agentId: e.target.value })}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-hub-border rounded text-text-primary focus:outline-none focus:border-accent-cyan/30"
                >
                  <option value="">Unassigned</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTask}
                disabled={!newTask.title.trim()}
                className="px-4 py-2 bg-accent-cyan/10 text-accent-cyan rounded border border-accent-cyan/20 hover:bg-accent-cyan/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface EditTaskModalProps {
  task: WorkItem;
  agents: Agent[];
  onClose: () => void;
  onSave: (updates: Partial<WorkItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (v: boolean) => void;
}

function EditTaskModal({
  task,
  agents,
  onClose,
  onSave,
  onDelete,
  showDeleteConfirm,
  setShowDeleteConfirm,
}: EditTaskModalProps) {
  const [editForm, setEditForm] = useState({
    title: task.title,
    description: task.description || '',
    priority: task.priority,
    status: task.status,
    agentId: task.agentId || '',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setEditForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      status: task.status,
      agentId: task.agentId || '',
    });
  }, [task.id]);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave({
      title: editForm.title,
      description: editForm.description || null,
      priority: editForm.priority,
      status: editForm.status,
      agentId: editForm.agentId || null,
    });
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-secondary rounded-lg border border-neutral-200 max-w-lg w-full">
        <div className="flex items-center justify-between p-4 border-b border-hub-border">
          <h3 className="text-lg font-semibold text-text-primary">Edit Task</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Title</label>
            <input
              type="text"
              value={editForm.title}
              onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 bg-bg-tertiary border border-hub-border rounded text-text-primary focus:outline-none focus:border-accent-cyan/30"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Description</label>
            <textarea
              value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 bg-bg-tertiary border border-hub-border rounded text-text-primary focus:outline-none focus:border-accent-cyan/30 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-muted mb-1">Priority</label>
              <select
                value={editForm.priority}
                onChange={e => setEditForm(f => ({ ...f, priority: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-bg-tertiary border border-hub-border rounded text-text-primary focus:outline-none focus:border-accent-cyan/30"
              >
                <option value={-1}>Low</option>
                <option value={0}>Medium</option>
                <option value={2}>High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Status</label>
              <select
                value={editForm.status}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value as KanbanColumn }))}
                className="w-full px-3 py-2 bg-bg-tertiary border border-hub-border rounded text-text-primary focus:outline-none focus:border-accent-cyan/30"
              >
                {COLUMNS.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Assignee</label>
            <select
              value={editForm.agentId}
              onChange={e => setEditForm(f => ({ ...f, agentId: e.target.value }))}
              className="w-full px-3 py-2 bg-bg-tertiary border border-hub-border rounded text-text-primary focus:outline-none focus:border-accent-cyan/30"
            >
              <option value="">Unassigned</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-4 text-xs text-text-muted">
            <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
            <span>Updated: {new Date(task.updatedAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex items-center justify-between p-4 border-t border-hub-border">
          <div>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 text-sm text-accent-red hover:bg-accent-red/10 rounded transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Task
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted">Delete this task?</span>
                <button
                  onClick={onDelete}
                  className="px-3 py-1.5 text-sm bg-accent-red/20 text-accent-red rounded hover:bg-accent-red/30"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-accent-cyan/10 text-accent-cyan rounded border border-accent-cyan/20 hover:bg-accent-cyan/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  column: (typeof COLUMNS)[0];
  tasks: WorkItem[];
  agents: Agent[];
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, column: KanbanColumn) => void;
  onDragStart: (task: WorkItem) => void;
  onAddTask: (column: KanbanColumn) => void;
  onTaskClick: (task: WorkItem) => void;
}

function KanbanColumn({
  column,
  tasks,
  agents,
  onDragOver,
  onDrop,
  onDragStart,
  onAddTask,
  onTaskClick,
}: KanbanColumnProps) {
  const Icon = column.icon;
  const getAgentName = (id: string | null) => {
    if (!id) return 'Unassigned';
    const a = agents.find(x => x.id === id);
    return a?.name || id.slice(0, 8);
  };

  return (
    <div
      className="w-80 flex flex-col bg-bg-secondary rounded-lg border border-hub-border"
      onDragOver={onDragOver}
      onDrop={e => onDrop(e, column.id)}
    >
      <div className="p-4 border-b border-hub-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn('w-4 h-4', column.color)} />
            <span className="font-medium text-text-primary">{column.title}</span>
            <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-full">
              {tasks.length}
            </span>
          </div>
          <button className="text-text-muted hover:text-text-primary">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tasks.map(task => (
          <KanbanCard
            key={task.id}
            task={task}
            agentName={getAgentName(task.agentId)}
            onDragStart={() => onDragStart(task)}
            onTaskClick={() => onTaskClick(task)}
          />
        ))}
        <button
          onClick={() => onAddTask(column.id)}
          className="w-full py-2 flex items-center justify-center gap-2 text-sm text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-md transition-colors border border-dashed border-neutral-200 hover:border-white/20"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>
    </div>
  );
}

interface KanbanCardProps {
  task: WorkItem;
  agentName: string;
  onDragStart: () => void;
  onTaskClick: () => void;
}

function KanbanCard({ task, agentName, onDragStart, onTaskClick }: KanbanCardProps) {
  const priorityKey = priorityLabels[task.priority] || 'medium';
  const priorityColors: Record<string, string> = {
    low: 'bg-accent-green/10 text-accent-green border-accent-green/20',
    medium: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
    high: 'bg-accent-red/10 text-accent-red border-accent-red/20',
  };

  return (
    <div className="bg-bg-tertiary rounded-lg border border-hub-border hover:border-accent-cyan/30 group transition-all hover:shadow-lg hover:shadow-accent-cyan/5 flex">
      <div
        draggable
        onDragStart={onDragStart}
        className="p-2 cursor-grab active:cursor-grabbing text-text-muted hover:text-text-primary self-stretch flex items-center"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div onClick={onTaskClick} className="flex-1 p-3 cursor-pointer min-w-0">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm text-text-primary font-medium line-clamp-2 flex-1 pr-2">
            {task.title}
          </h3>
          <button className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary transition-opacity">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded border',
              priorityColors[priorityKey] || priorityColors.medium
            )}
          >
            {priorityKey}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-accent-cyan/20 flex items-center justify-center text-accent-cyan font-medium text-xs">
              {agentName.charAt(0).toUpperCase()}
            </div>
            <span className="truncate max-w-[100px]">{agentName}</span>
          </div>
          <span>{formatTimeAgo(new Date(task.updatedAt))}</span>
        </div>
      </div>
    </div>
  );
}
