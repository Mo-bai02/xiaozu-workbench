import { create } from 'zustand';
import { api } from '@/lib/http';
import { cstDayKey } from '@/lib/time';
import { useGroupStore } from '@/store/group';

export interface FocusSession {
  id: string;
  minutes: number;
  taskId: string | null;
  taskLabel: string | null;
  groupId: string | null;
  endedAt: number;
}

interface FocusState {
  sessions: FocusSession[];
  focusMinutes: number;
  breakMinutes: number;
  loading: boolean;
  load: () => Promise<void>;
  add: (minutes: number, taskId: string | null, label?: string) => Promise<void>;
  setDurations: (focusMinutes: number, breakMinutes: number) => void;
}

const DURATION_KEY = 'ai-console:focus-duration';

function readDurations(): { focusMinutes: number; breakMinutes: number } {
  try {
    const raw = localStorage.getItem(DURATION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { focusMinutes?: number; breakMinutes?: number };
      return {
        focusMinutes: Math.min(180, Math.max(1, Number(parsed.focusMinutes) || 25)),
        breakMinutes: Math.min(60, Math.max(1, Number(parsed.breakMinutes) || 5)),
      };
    }
  } catch {
  }
  return { focusMinutes: 25, breakMinutes: 5 };
}

const durations = typeof window === 'undefined' ? { focusMinutes: 25, breakMinutes: 5 } : readDurations();

export const useFocusStore = create<FocusState>((set, get) => ({
  sessions: [],
  focusMinutes: durations.focusMinutes,
  breakMinutes: durations.breakMinutes,
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const data = await api<{ sessions: FocusSession[] }>('/focus');
      set({ sessions: data.sessions, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  add: async (minutes, taskId, label) => {
    await api('/focus', {
      method: 'POST',
      body: { minutes, taskId, label, groupId: useGroupStore.getState().activeId },
    });
    await get().load();
  },

  setDurations: (focusMinutes, breakMinutes) => {
    try {
      localStorage.setItem(DURATION_KEY, JSON.stringify({ focusMinutes, breakMinutes }));
    } catch {
    }
    set({ focusMinutes, breakMinutes });
  },
}));

export function minutesOnCstDay(sessions: FocusSession[], ts: number = Date.now()): number {
  const key = cstDayKey(ts);
  return sessions
    .filter((session) => cstDayKey(session.endedAt) === key)
    .reduce((sum, session) => sum + session.minutes, 0);
}

export function focusTrend(sessions: FocusSession[]): Array<{ label: string; value: number }> {
  const now = Date.now();
  const result: Array<{ label: string; value: number }> = [];
  for (let i = 6; i >= 0; i -= 1) {
    const ts = now - i * 86_400_000;
    const key = cstDayKey(ts);
    result.push({
      label: `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`,
      value: minutesOnCstDay(sessions, ts),
    });
  }
  return result;
}
