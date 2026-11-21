import { create } from 'zustand';

type ThemeMode = 'light' | 'dark';

interface UIState {
  dark: boolean;
  collapsed: boolean;
  toggleDark: () => void;
  setCollapsed: (value: boolean) => void;
}

const STORAGE_KEY = 'ai-console:theme';

function initialDark(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}

function persist(dark: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  } catch {
    /* 隐私模式下忽略 */
  }
}

export const useUIStore = create<UIState>((set) => ({
  dark: initialDark(),
  collapsed: false,
  toggleDark: () =>
    set((state) => {
      const dark = !state.dark;
      persist(dark);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      return { dark };
    }),
  setCollapsed: (collapsed) => set({ collapsed }),
}));
