import { create } from 'zustand';

type ThemeMode = 'light' | 'dark';

interface UIState {
  dark: boolean;
  collapsed: boolean;
  paletteOpen: boolean;
  /** 当前选中的模型 id；空串表示"跟随服务端默认" */
  modelId: string;
  toggleDark: () => void;
  setCollapsed: (value: boolean) => void;
  setModelId: (value: string) => void;
  setPaletteOpen: (value: boolean) => void;
}

const THEME_KEY = 'ai-console:theme';
const MODEL_KEY = 'ai-console:model';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式忽略 */
  }
}

function initialDark(): boolean {
  const saved = read(THEME_KEY) as ThemeMode | null;
  if (saved === 'dark') return true;
  if (saved === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export const useUIStore = create<UIState>((set) => ({
  dark: initialDark(),
  collapsed: false,
  paletteOpen: false,
  modelId: read(MODEL_KEY) ?? '',
  toggleDark: () =>
    set((state) => {
      const dark = !state.dark;
      write(THEME_KEY, dark ? 'dark' : 'light');
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      return { dark };
    }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setModelId: (modelId) => {
    write(MODEL_KEY, modelId);
    set({ modelId });
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
