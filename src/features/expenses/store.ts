import { create } from 'zustand';
import { api } from '@/lib/http';
import { cstMonthKey } from '@/lib/time';
import type { Expense } from './settle';

interface ExpenseState {
  expenses: Expense[];
  month: string;
  loading: boolean;
  error: string | null;
  load: (month: string) => Promise<void>;
  add: (input: Omit<Expense, 'id' | 'date'> & { date?: number }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  expenses: [],
  month: cstMonthKey(),
  loading: false,
  error: null,

  load: async (month) => {
    set({ loading: true, error: null, month });
    const groupId = (await import('@/store/group')).useGroupStore.getState().activeId;
    if (!groupId) {
      set({ loading: false, expenses: [] });
      return;
    }
    try {
      const data = await api<{ expenses: Expense[] }>(`/groups/${groupId}/expenses?month=${month}`);
      set({ expenses: data.expenses, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : '账目加载失败' });
    }
  },

  add: async (input) => {
    const groupId = (await import('@/store/group')).useGroupStore.getState().activeId;
    if (!groupId) return;
    await api(`/groups/${groupId}/expenses`, {
      method: 'POST',
      body: { ...input, date: input.date ?? Date.now() },
    });
    await get().load(get().month);
  },

  remove: async (id) => {
    const groupId = (await import('@/store/group')).useGroupStore.getState().activeId;
    if (!groupId) return;
    await api(`/expenses/${id}?groupId=${groupId}`, { method: 'DELETE' });
    await get().load(get().month);
  },
}));
