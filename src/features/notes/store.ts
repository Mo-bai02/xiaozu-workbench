import { create } from 'zustand';
import { uid } from '@/lib/utils';

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  /** 已分享的 id；为空表示未分享 */
  shareId?: string;
  createdAt: number;
  updatedAt: number;
}

interface NoteState {
  notes: Note[];
  create: () => string;
  update: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'tags' | 'shareId'>>) => void;
  togglePin: (id: string) => void;
  remove: (id: string) => void;
}

const KEY = 'ai-console:notes';
const DAY = 86_400_000;

function seed(): Note[] {
  const now = Date.now();
  return [
    {
      id: 'n1',
      title: '第一次小组会 · 分工与时间点',
      content: [
        '## 结论',
        '- 前端：陈鹏宇，负责工作台页面与 AI 模块',
        '- 后端：周野，负责账号与任务接口',
        '- 设计：苏芮，周五前出首页高保真',
        '',
        '## 待确认',
        '1. 是否需要移动端？先做响应式，暂不单独出 App',
        '2. 经费从班费出，需在账本里记一笔',
      ].join('\n'),
      tags: ['会议', '分工'],
      pinned: true,
      createdAt: now - 2 * DAY,
      updatedAt: now - 2 * DAY,
    },
    {
      id: 'n2',
      title: '答辩可能会问的问题',
      content: [
        '- 为什么不用 ECharts？',
        '- 拖拽怎么兼容移动端？',
        '- 数据存 localStorage 有什么风险？',
      ].join('\n'),
      tags: ['答辩'],
      pinned: false,
      createdAt: now - DAY,
      updatedAt: now - DAY,
    },
    {
      id: 'n3',
      title: '班费支出备忘',
      content: '打印海报 30，场地布置 45，矿泉水 18。已记进账本，月底统一结算。',
      tags: ['经费'],
      pinned: false,
      createdAt: now - 3_600_000,
      updatedAt: now - 3_600_000,
    },
  ];
}

function load(): Note[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Note[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* 损坏就重新播种 */
  }
  return seed();
}

function persist(notes: Note[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    /* 忽略 */
  }
}

const boot = typeof window === 'undefined' ? seed() : load();

export const useNotesStore = create<NoteState>((set, get) => ({
  notes: boot,

  create: () => {
    const note: Note = {
      id: uid('n'),
      title: '未命名笔记',
      content: '',
      tags: [],
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const notes = [note, ...get().notes];
    persist(notes);
    set({ notes });
    return note.id;
  },

  update: (id, patch) => {
    const notes = get().notes.map((note) =>
      note.id === id ? { ...note, ...patch, updatedAt: Date.now() } : note,
    );
    persist(notes);
    set({ notes });
  },

  togglePin: (id) => {
    const notes = get().notes.map((note) =>
      note.id === id ? { ...note, pinned: !note.pinned, updatedAt: Date.now() } : note,
    );
    persist(notes);
    set({ notes });
  },

  remove: (id) => {
    const notes = get().notes.filter((note) => note.id !== id);
    persist(notes);
    set({ notes });
  },
}));

/** 搜索 + 标签过滤，抽出来方便单测 */
export function filterNotes(
  notes: Note[],
  options: { keyword?: string; tag?: string | null } = {},
): Note[] {
  const keyword = (options.keyword ?? '').trim().toLowerCase();
  const tag = options.tag ?? null;

  return notes
    .filter((note) => {
      if (tag && !note.tags.includes(tag)) return false;
      if (!keyword) return true;
      return (
        note.title.toLowerCase().includes(keyword) ||
        note.content.toLowerCase().includes(keyword) ||
        note.tags.some((t) => t.toLowerCase().includes(keyword))
      );
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
}

/** 从正文里抽 #话题 形式的标签，输入时自动补全用 */
export function extractTags(content: string): string[] {
  const matched = content.match(/#[\u4e00-\u9fa5a-zA-Z0-9_-]{1,12}/g) ?? [];
  return [...new Set(matched.map((tag) => tag.slice(1)))];
}
