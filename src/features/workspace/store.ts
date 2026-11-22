import { create } from 'zustand';
import { uid } from '@/lib/utils';
import type { Activity, Member, Priority, Task, TaskStatus } from './types';

interface WorkspaceState {
  members: Member[];
  tasks: Task[];
  activities: Activity[];
  addTask: (input: Partial<Task> & { title: string }) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  moveTask: (id: string, status: TaskStatus, beforeId?: string) => void;
  removeTask: (id: string) => void;
  addMember: (input: Pick<Member, 'name' | 'role' | 'email'>) => void;
  updateMember: (id: string, patch: Partial<Member>) => void;
  removeMembers: (ids: string[]) => void;
  reset: () => void;
}

const KEY = 'ai-console:workspace';
const DAY = 86_400_000;

function daysAgo(n: number): number {
  return Date.now() - n * DAY;
}

function seed(): { members: Member[]; tasks: Task[]; activities: Activity[] } {
  const members: Member[] = [
    { id: 'm1', name: '陈鹏宇', role: '前端开发', email: 'mo_bai02@163.com', status: 'active', joinedAt: daysAgo(120) },
    { id: 'm2', name: '林晓', role: '产品经理', email: 'lin@example.com', status: 'active', joinedAt: daysAgo(90) },
    { id: 'm3', name: '周野', role: '后端开发', email: 'zhou@example.com', status: 'away', joinedAt: daysAgo(60) },
    { id: 'm4', name: '苏芮', role: 'UI 设计', email: 'su@example.com', status: 'active', joinedAt: daysAgo(30) },
  ];

  const raw: Array<[string, TaskStatus, Priority, string, string, number | null]> = [
    ['接入模型切换与供应商注册表', 'done', 'high', 'm1', '已支持 DeepSeek / 百炼 / 硅基流动', 1],
    ['会话列表本地持久化', 'done', 'mid', 'm1', '刷新不丢历史，最多保留 20 个会话', 1],
    ['命令面板（⌘K）', 'doing', 'high', 'm1', '键盘导航 + 模糊搜索', 2],
    ['任务看板拖拽交互', 'doing', 'mid', 'm1', '三列之间拖拽，落点高亮', 3],
    ['成员批量操作', 'todo', 'low', 'm1', '多选删除、状态筛选', -2],
    ['数据看板图表', 'todo', 'mid', 'm4', '手写 SVG，不引图表库', 4],
    ['移动端适配走查', 'todo', 'high', 'm4', '375 / 390 / 768 三档', -1],
    ['接口错误提示统一', 'done', 'mid', 'm3', '上游 4xx/5xx 透传原始信息', 2],
    ['日志按访客隔离', 'done', 'high', 'm3', 'X-Visitor-Id 分组', 3],
    ['导出对话为 Markdown', 'todo', 'low', 'm1', '含标题与时间戳', 7],
    ['首屏体积优化', 'done', 'mid', 'm1', '路由懒加载，436KB → 272KB', 5],
    ['无障碍：流式区域 aria-live', 'todo', 'mid', 'm4', '读屏能播报增量', 8],
  ];

  const tasks: Task[] = raw.map(([title, status, priority, assigneeId, desc, dueIn], index) => ({
    id: `t${index + 1}`,
    title,
    desc,
    status,
    priority,
    assigneeId,
    tags: index % 3 === 0 ? ['前端'] : index % 3 === 1 ? ['协作'] : ['体验'],
    createdAt: daysAgo(10 - (index % 8)),
    dueAt: dueIn === null ? null : Date.now() + dueIn * DAY,
    completedAt: status === 'done' ? daysAgo(index % 7) : null,
  }));

  const activities: Activity[] = [
    { id: uid('a'), time: Date.now() - 3_600_000, actor: '陈鹏宇', action: '完成了任务', target: '日志按访客隔离' },
    { id: uid('a'), time: Date.now() - 7_200_000, actor: '苏芮', action: '评论了任务', target: '移动端适配走查' },
    { id: uid('a'), time: Date.now() - 18_000_000, actor: '林晓', action: '新建了任务', target: '命令面板（⌘K）' },
    { id: uid('a'), time: daysAgo(2), actor: '周野', action: '更新了任务', target: '接口错误提示统一' },
  ];

  return { members, tasks, activities };
}

function load(): { members: Member[]; tasks: Task[]; activities: Activity[] } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReturnType<typeof seed>>;
      if (parsed.members?.length && Array.isArray(parsed.tasks)) {
        return {
          members: parsed.members,
          tasks: parsed.tasks,
          activities: parsed.activities ?? [],
        };
      }
    }
  } catch {
    /* 数据损坏就重新播种，别白屏 */
  }
  return seed();
}

function persist(state: Pick<WorkspaceState, 'members' | 'tasks' | 'activities'>): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ members: state.members, tasks: state.tasks, activities: state.activities }),
    );
  } catch {
    /* 空间不足时忽略 */
  }
}

const boot = typeof window === 'undefined' ? seed() : load();

/**
 * 工作台数据（纯前端 mock）。
 *
 * 为什么放 localStorage 而不是先做后端：这个项目的定位是「前端作品」，
 * 数据层用一个可替换的 store 就够了；将来接真接口，只要把这几个 action 换成 fetch。
 */
export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const commit = (next: {
    members?: Member[];
    tasks?: Task[];
    activities?: Activity[];
  }) => {
    set((state) => {
      const merged = { members: next.members ?? state.members, tasks: next.tasks ?? state.tasks, activities: next.activities ?? state.activities };
      persist(merged);
      return merged;
    });
  };

  const log = (action: string, target: string) => {
    const activity: Activity = { id: uid('a'), time: Date.now(), actor: '陈鹏宇', action, target };
    commit({ activities: [activity, ...get().activities].slice(0, 30) });
  };

  return {
    members: boot.members,
    tasks: boot.tasks,
    activities: boot.activities,

    addTask: (input) => {
      const task: Task = {
        id: uid('t'),
        title: input.title,
        desc: input.desc ?? '',
        status: input.status ?? 'todo',
        priority: input.priority ?? 'mid',
        assigneeId: input.assigneeId ?? null,
        tags: input.tags ?? [],
        createdAt: Date.now(),
        dueAt: input.dueAt ?? null,
        completedAt: null,
      };
      commit({ tasks: [task, ...get().tasks] });
      log('新建了任务', task.title);
      return task.id;
    },

    updateTask: (id, patch) => {
      const tasks = get().tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
      commit({ tasks });
      const target = tasks.find((task) => task.id === id);
      if (target && patch.status === 'done') log('完成了任务', target.title);
      else if (target) log('更新了任务', target.title);
    },

    moveTask: (id, status, beforeId) => {
      const tasks = get().tasks.slice();
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) return;
      const [task] = tasks.splice(index, 1);
      if (!task) return;
      const moved: Task = {
        ...task,
        status,
        completedAt: status === 'done' ? Date.now() : null,
      };
      const insertAt = beforeId ? tasks.findIndex((t) => t.id === beforeId) : -1;
      const targetIndex = tasks.filter((t) => t.status === status).length;
      if (insertAt >= 0) tasks.splice(insertAt, 0, moved);
      else {
        // 插到该列末尾
        let lastOfStatus = -1;
        tasks.forEach((t, i) => {
          if (t.status === status) lastOfStatus = i;
        });
        tasks.splice(lastOfStatus >= 0 ? lastOfStatus + 1 : Math.min(targetIndex, tasks.length), 0, moved);
      }
      commit({ tasks });
      if (status === 'done') log('完成了任务', moved.title);
      else log('移动了任务', moved.title);
    },

    removeTask: (id) => {
      const target = get().tasks.find((task) => task.id === id);
      commit({ tasks: get().tasks.filter((task) => task.id !== id) });
      if (target) log('删除了任务', target.title);
    },

    addMember: (input) => {
      const member: Member = {
        id: uid('m'),
        name: input.name,
        role: input.role,
        email: input.email,
        status: 'active',
        joinedAt: Date.now(),
      };
      commit({ members: [...get().members, member] });
      log('添加了成员', member.name);
    },

    updateMember: (id, patch) => {
      const members = get().members.map((member) => (member.id === id ? { ...member, ...patch } : member));
      commit({ members });
    },

    removeMembers: (ids) => {
      const set_ = new Set(ids);
      const removed = get().members.filter((m) => set_.has(m.id));
      commit({
        members: get().members.filter((m) => !set_.has(m.id)),
        // 成员删除后，任务上的负责人置空，避免出现"幽灵人"
        tasks: get().tasks.map((task) =>
          task.assigneeId && set_.has(task.assigneeId) ? { ...task, assigneeId: null } : task,
        ),
      });
      if (removed.length) log('移除了成员', removed.map((m) => m.name).join('、'));
    },

    reset: () => {
      const fresh = seed();
      commit(fresh);
    },
  };
});

/** 供页面派生统计用：最近 7 天每天的完成数 */
export function completionTrend(tasks: Task[], days = 7): Array<{ label: string; value: number }> {
  const result: Array<{ label: string; value: number }> = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const start = day.getTime();
    const end = start + DAY;
    const value = tasks.filter(
      (task) => task.completedAt !== null && task.completedAt >= start && task.completedAt < end,
    ).length;
    result.push({ label: `${day.getMonth() + 1}/${day.getDate()}`, value });
  }
  return result;
}
