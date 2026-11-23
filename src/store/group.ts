import { create } from 'zustand';
import { api } from '@/lib/http';

export type Role = 'owner' | 'admin' | 'member';

export interface GroupSummary {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  role: Role;
  memberCount: number;
  openTasks: number;
  overdue: number;
  dueToday: number;
  doneCount: number;
  starred: number;
}

interface GroupState {
  groups: GroupSummary[];
  activeId: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchGroups: () => Promise<void>;
  createGroup: (name: string) => Promise<GroupSummary>;
  join: (code: string) => Promise<void>;
  setActive: (id: string) => void;
  active: () => GroupSummary | null;
  myRole: () => Role | null;
  canManage: () => boolean;
}

const ACTIVE_KEY = 'ai-console:active-group';

function readActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActive(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
  }
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  activeId: readActive(),
  loading: false,
  loaded: false,
  error: null,

  fetchGroups: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api<{ groups: GroupSummary[] }>('/groups');
      const groups = data.groups;
      const stored = get().activeId;
      const activeId = groups.some((g) => g.id === stored) ? stored : (groups[0]?.id ?? null);
      writeActive(activeId);
      set({ groups, activeId, loading: false, loaded: true });
    } catch (error) {
      set({
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : '小组加载失败',
      });
    }
  },

  createGroup: async (name) => {
    const data = await api<{ group: { id: string; name: string; invite_code?: string; inviteCode?: string } }>(
      '/groups',
      { method: 'POST', body: { name } },
    );
    await get().fetchGroups();
    set({ activeId: data.group.id });
    writeActive(data.group.id);
    const created = get().groups.find((g) => g.id === data.group.id);
    if (!created) throw new Error('创建成功但读取失败，请刷新');
    return created;
  },

  join: async (code) => {
    const data = await api<{ group: { id: string } }>('/groups/join', { method: 'POST', body: { code } });
    await get().fetchGroups();
    set({ activeId: data.group.id });
    writeActive(data.group.id);
  },

  setActive: (id) => {
    writeActive(id);
    set({ activeId: id });
  },

  active: () => {
    const { groups, activeId } = get();
    return groups.find((group) => group.id === activeId) ?? null;
  },

  myRole: () => get().active()?.role ?? null,

  canManage: () => {
    const role = get().active()?.role;
    return role === 'owner' || role === 'admin';
  },
}));
