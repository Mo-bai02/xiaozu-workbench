import { create } from 'zustand';
import { uid } from '@/lib/utils';

export interface FocusSession {
  id: string;
  minutes: number;
  taskId: string | null;
  endedAt: number;
}

interface FocusState {
  sessions: FocusSession[];
  add: (minutes: number, taskId: string | null) => void;
  reset: () => void;
}

const KEY = 'ai-console:focus';
const DAY = 86_400_000;

function seed(): FocusSession[] {
  const now = Date.now();
  return [
    { id: uid('f'), minutes: 25, taskId: 't3', endedAt: now - 3 * 3_600_000 },
    { id: uid('f'), minutes: 25, taskId: 't3', endedAt: now - 2 * 3_600_000 },
    { id: uid('f'), minutes: 15, taskId: 't4', endedAt: now - 26 * 3_600_000 },
    { id: uid('f'), minutes: 25, taskId: 't1', endedAt: now - 2 * DAY },
  ];
}

function load(): FocusSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FocusSession[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* 忽略 */
  }
  return seed();
}

function persist(sessions: FocusSession[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions));
  } catch {
    /* 忽略 */
  }
}

const boot = typeof window === 'undefined' ? seed() : load();

export const useFocusStore = create<FocusState>((set, get) => ({
  sessions: boot,
  add: (minutes, taskId) => {
    const session: FocusSession = { id: uid('f'), minutes, taskId, endedAt: Date.now() };
    const sessions = [session, ...get().sessions].slice(0, 200);
    persist(sessions);
    set({ sessions });
  },
  reset: () => {
    persist([]);
    set({ sessions: [] });
  },
}));

export function minutesOnDay(sessions: FocusSession[], day: Date): number {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = start + DAY;
  return sessions
    .filter((session) => session.endedAt >= start && session.endedAt < end)
    .reduce((sum, session) => sum + session.minutes, 0);
}

/** 最近 7 天的专注时长（分钟），给柱状图用 */
export function focusTrend(sessions: FocusSession[]): Array<{ label: string; value: number }> {
  const result: Array<{ label: string; value: number }> = [];
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    result.push({
      label: `${day.getMonth() + 1}/${day.getDate()}`,
      value: minutesOnDay(sessions, day),
    });
  }
  return result;
}
