import { create } from 'zustand';
import { uid } from '@/lib/utils';
import type { Expense } from './settle';

interface ExpenseState {
  expenses: Expense[];
  add: (input: Omit<Expense, 'id' | 'date'> & { date?: number }) => void;
  remove: (id: string) => void;
}

const KEY = 'ai-console:expenses';
const DAY = 86_400_000;

function seed(): Expense[] {
  const now = Date.now();
  const all = ['m1', 'm2', 'm3', 'm4'];
  return [
    { id: 'e1', amount: 3000, category: '采购', note: '打印答辩海报', payerId: 'm1', sharedBy: all, date: now - 2 * DAY },
    { id: 'e2', amount: 4500, category: '场地', note: '活动室布置', payerId: 'm4', sharedBy: all, date: now - 2 * DAY },
    { id: 'e3', amount: 1800, category: '餐饮', note: '开会矿泉水', payerId: 'm2', sharedBy: ['m1', 'm2', 'm4'], date: now - DAY },
    { id: 'e4', amount: 6800, category: '餐饮', note: '小组聚餐', payerId: 'm3', sharedBy: all, date: now - DAY },
    { id: 'e5', amount: 1200, category: '交通', note: '打车去打印店', payerId: 'm1', sharedBy: ['m1', 'm3'], date: now - 3_600_000 },
  ];
}

function load(): Expense[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Expense[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return seed();
}

function persist(expenses: Expense[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(expenses));
  } catch {
    /* 忽略 */
  }
}

const boot = typeof window === 'undefined' ? seed() : load();

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  expenses: boot,

  add: (input) => {
    const expense: Expense = {
      id: uid('e'),
      ...input,
      date: input.date ?? Date.now(),
    };
    const expenses = [expense, ...get().expenses];
    persist(expenses);
    set({ expenses });
  },

  remove: (id) => {
    const expenses = get().expenses.filter((expense) => expense.id !== id);
    persist(expenses);
    set({ expenses });
  },
}));
