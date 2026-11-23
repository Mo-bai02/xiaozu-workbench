import { create } from 'zustand';
import { api } from '@/lib/http';

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

interface NoteState {
  notes: Note[];
  shareIds: Record<string, string>;
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  create: () => Promise<string>;
  update: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setShareId: (id: string, shareId: string | undefined) => void;
}

const SHARE_KEY = 'ai-console:note-shares';

function readShareIds(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SHARE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
  }
  return {};
}

function writeShareIds(map: Record<string, string>): void {
  try {
    localStorage.setItem(SHARE_KEY, JSON.stringify(map));
  } catch {
  }
}

export const useNotesStore = create<NoteState>((set, get) => ({
  notes: [],
  shareIds: typeof window === 'undefined' ? {} : readShareIds(),
  loading: false,
  loaded: false,

  load: async () => {
    set({ loading: true });
    try {
      const data = await api<{ notes: Note[] }>('/notes');
      set({ notes: data.notes, loading: false, loaded: true });
    } catch {
      set({ loading: false, loaded: true });
    }
  },

  create: async () => {
    const data = await api<{ note: Note }>('/notes', { method: 'POST' });
    const note: Note = {
      ...data.note,
      tags: [],
      pinned: Boolean(data.note.pinned),
    };
    set({ notes: [note, ...get().notes] });
    return note.id;
  },

  update: async (id, patch) => {
    const snapshot = get().notes;
    set({
      notes: snapshot.map((note) =>
        note.id === id ? { ...note, ...patch, updatedAt: Date.now() } : note,
      ),
    });
    try {
      await api(`/notes/${id}`, { method: 'PATCH', body: { patch } });
    } catch {
      set({ notes: snapshot });
    }
  },

  togglePin: async (id) => {
    const target = get().notes.find((note) => note.id === id);
    if (!target) return;
    const next = !target.pinned;
    set({
      notes: get().notes.map((note) => (note.id === id ? { ...note, pinned: next } : note)),
    });
    try {
      await api(`/notes/${id}`, { method: 'PATCH', body: { patch: { pinned: next } } });
    } catch {
      set({ notes: get().notes.map((note) => (note.id === id ? { ...note, pinned: !next } : note)) });
    }
  },

  remove: async (id) => {
    const snapshot = get().notes;
    set({ notes: snapshot.filter((note) => note.id !== id) });
    try {
      await api(`/notes/${id}`, { method: 'DELETE' });
      const shareIds = { ...get().shareIds };
      delete shareIds[id];
      writeShareIds(shareIds);
      set({ shareIds });
    } catch {
      set({ notes: snapshot });
    }
  },

  setShareId: (id, shareId) => {
    const shareIds = { ...get().shareIds };
    if (shareId) shareIds[id] = shareId;
    else delete shareIds[id];
    writeShareIds(shareIds);
    set({ shareIds });
  },
}));

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

export function extractTags(content: string): string[] {
  const matched = content.match(/#[\u4e00-\u9fa5a-zA-Z0-9_-]{1,12}/g) ?? [];
  return [...new Set(matched.map((tag) => tag.slice(1)))];
}
