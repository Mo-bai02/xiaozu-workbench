import { create } from 'zustand';
import type { ChatItem } from '@/features/chat/useChat';
import { uid } from '@/lib/utils';

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatItem[];
}

interface SessionState {
  sessions: Session[];
  activeId: string;
  create: () => string;
  select: (id: string) => void;
  remove: (id: string) => void;
  rename: (id: string, title: string) => void;
  updateMessages: (id: string, messages: ChatItem[]) => void;
  reset: () => void;
}

const KEY = 'ai-console:sessions';
const MAX_SESSIONS = 20;
const MAX_MESSAGES = 200;
const DEFAULT_TITLE = '新对话';

function newSession(): Session {
  const now = Date.now();
  return { id: uid('s'), title: DEFAULT_TITLE, createdAt: now, updatedAt: now, messages: [] };
}

function persist(sessions: Session[], activeId: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sessions, activeId }));
  } catch {
  }
}

function restore(): { sessions: Session[]; activeId: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { sessions?: Session[]; activeId?: string };
      const sessions = (parsed.sessions ?? []).filter((s) => s && typeof s.id === 'string');
      if (sessions.length > 0) {
        const activeId =
          parsed.activeId && sessions.some((s) => s.id === parsed.activeId)
            ? parsed.activeId
            : sessions[0]!.id;
        return { sessions, activeId };
      }
    }
  } catch {
  }
  const first = newSession();
  return { sessions: [first], activeId: first.id };
}

const initial = typeof window === 'undefined' ? { sessions: [newSession()], activeId: '' } : restore();

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: initial.sessions,
  activeId: initial.activeId || initial.sessions[0]?.id || '',

  create: () => {
    const session = newSession();
    set((state) => {
      const sessions = [session, ...state.sessions].slice(0, MAX_SESSIONS);
      persist(sessions, session.id);
      return { sessions, activeId: session.id };
    });
    return session.id;
  },

  select: (id) => {
    set((state) => {
      persist(state.sessions, id);
      return { activeId: id };
    });
  },

  remove: (id) => {
    const { sessions, activeId } = get();
    const next = sessions.filter((s) => s.id !== id);
    if (next.length === 0) {
      const session = newSession();
      persist([session], session.id);
      set({ sessions: [session], activeId: session.id });
      return;
    }
    const nextActive = activeId === id ? next[0]!.id : activeId;
    persist(next, nextActive);
    set({ sessions: next, activeId: nextActive });
  },

  rename: (id, title) => {
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.id === id ? { ...s, title: title.trim().slice(0, 30) || DEFAULT_TITLE, updatedAt: Date.now() } : s,
      );
      persist(sessions, state.activeId);
      return { sessions };
    });
  },

  updateMessages: (id, messages) => {
    set((state) => {
      const sessions = state.sessions.map((s) => {
        if (s.id !== id) return s;
        const firstUser = messages.find((m) => m.role === 'user');
        const title =
          s.title === DEFAULT_TITLE && firstUser ? firstUser.content.slice(0, 18) : s.title;
        return {
          ...s,
          title,
          updatedAt: Date.now(),
          messages: messages.slice(-MAX_MESSAGES),
        };
      });
      persist(sessions, state.activeId);
      return { sessions };
    });
  },

  reset: () => {
    const session = newSession();
    persist([session], session.id);
    set({ sessions: [session], activeId: session.id });
  },
}));
