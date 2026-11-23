import { create } from 'zustand';
import { api } from '@/lib/http';
import { cstDayKey } from '@/lib/time';
import type { Role } from '@/store/group';

export type TaskStatus = 'todo' | 'doing' | 'done';
export type Priority = 'low' | 'mid' | 'high';

export interface Member {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  joinedAt: number;
  openTasks: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  tags: string[];
  createdAt: number;
  dueAt: number | null;
  completedAt: number | null;
  important: boolean;
}

export interface Activity {
  id: string;
  who: string;
  action: string;
  target: string;
  at: number;
}

export interface TaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: string | null;
  dueAt?: number | null;
  tags?: string[];
  important?: boolean;
}

interface WorkspaceState {
  groupId: string | null;
  members: Member[];
  tasks: Task[];
  activities: Activity[];
  loading: boolean;
  error: string | null;
  load: (groupId: string) => Promise<void>;
  refresh: () => Promise<void>;
  addTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<void>;
  moveTask: (id: string, column: 'todo' | 'overdue' | 'done') => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  removeMembers: (ids: string[]) => Promise<void>;
  setMemberRole: (id: string, role: 'admin' | 'member') => Promise<void>;
  refreshMembers: () => Promise<void>;
}

function deriveActivities(tasks: Task[], members: Member[]): Activity[] {
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]));
  const events: Activity[] = [];
  for (const task of tasks) {
    const who = task.assigneeId ? (nameOf.get(task.assigneeId) ?? '未指派') : '未指派';
    if (task.status === 'done' && task.completedAt) {
      events.push({ id: `c-${task.id}`, who, action: '完成了', target: task.title, at: task.completedAt });
      continue;
    }
    const action = task.status === 'doing' ? '正在做' : '待办';
    events.push({ id: `n-${task.id}`, who, action, target: task.title, at: task.createdAt });
  }
  return events.sort((a, b) => b.at - a.at).slice(0, 6);
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  groupId: null,
  members: [],
  tasks: [],
  activities: [],
  loading: false,
  error: null,

  load: async (groupId) => {
    set({ loading: true, error: null, groupId });
    try {
      const [taskData, memberData] = await Promise.all([
        api<{ tasks: Task[] }>(`/groups/${groupId}/tasks`),
        api<{ members: Member[] }>(`/groups/${groupId}/members`),
      ]);
      set({
        tasks: taskData.tasks,
        members: memberData.members,
        activities: deriveActivities(taskData.tasks, memberData.members),
        loading: false,
      });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : '加载失败' });
    }
  },

  refresh: async () => {
    const groupId = get().groupId;
    if (groupId) await get().load(groupId);
  },

  refreshMembers: async () => {
    const groupId = get().groupId;
    if (!groupId) return;
    const data = await api<{ members: Member[] }>(`/groups/${groupId}/members`);
    set({ members: data.members, activities: deriveActivities(get().tasks, data.members) });
  },

  addTask: async (input) => {
    const groupId = get().groupId;
    if (!groupId) return;
    await api(`/groups/${groupId}/tasks`, { method: 'POST', body: input });
    await get().load(groupId);
  },

  updateTask: async (id, patch) => {
    const groupId = get().groupId;
    if (!groupId) return;
    await api(`/tasks/${id}`, { method: 'PATCH', body: { groupId, patch } });
    await get().load(groupId);
  },

  moveTask: async (id, column) => {
    const groupId = get().groupId;
    if (!groupId) return;
    const task = get().tasks.find((item) => item.id === id);
    if (!task) return;

    const patch: { status: TaskStatus; dueAt?: number | null } = {
      status: column === 'done' ? 'done' : 'todo',
    };
    if (column === 'overdue') patch.dueAt = Date.now() - 3_600_000;
    else if (column === 'todo' && task.dueAt !== null && task.dueAt < Date.now()) {
      const today = new Date();
      patch.dueAt = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        18,
        0,
        0,
      ).getTime();
    }

    const snapshot = get().tasks;
    set({ tasks: snapshot.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
    try {
      await api(`/tasks/${id}`, { method: 'PATCH', body: { groupId, patch } });
      await get().load(groupId);
    } catch {
      set({ tasks: snapshot });
    }
  },

  removeTask: async (id) => {
    const groupId = get().groupId;
    if (!groupId) return;
    await api(`/tasks/${id}?groupId=${groupId}`, { method: 'DELETE' });
    await get().load(groupId);
  },

  removeMembers: async (ids) => {
    const groupId = get().groupId;
    if (!groupId) return;
    for (const id of ids) {
      await api(`/groups/${groupId}/members/${id}`, { method: 'DELETE' });
    }
    await get().load(groupId);
  },

  setMemberRole: async (id, role) => {
    const groupId = get().groupId;
    if (!groupId) return;
    await api(`/groups/${groupId}/members/${id}`, { method: 'PATCH', body: { role } });
    await get().refreshMembers();
  },
}));

export function completionTrend(tasks: Task[], days = 7): Array<{ label: string; value: number }> {
  const buckets = new Map<string, number>();
  const now = Date.now();
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = cstDayKey(now - i * 86_400_000);
    buckets.set(key, 0);
    labels.push(key);
  }
  for (const task of tasks) {
    if (task.status !== 'done' || !task.completedAt) continue;
    const key = cstDayKey(task.completedAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return labels.map((key) => ({
    label: `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`,
    value: buckets.get(key) ?? 0,
  }));
}

export function taskStats(tasks: Task[], now = Date.now()) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === 'done').length;
  const doing = tasks.filter((task) => task.status === 'doing').length;
  const overdue = tasks.filter(
    (task) => task.status !== 'done' && task.dueAt !== null && task.dueAt < now,
  ).length;
  return {
    total,
    done,
    doing,
    overdue,
    todo: total - done - doing,
    rate: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}
