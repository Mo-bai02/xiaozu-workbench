import { create } from 'zustand';
import { ApiError, api, getToken, setToken } from '@/lib/http';

export interface User {
  id: string;
  username: string;
  displayName: string;
}

interface AuthState {
  user: User | null;
  ready: boolean;
  pending: boolean;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    displayName: string,
    captcha: { id: string; text: string },
  ) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,
  pending: false,
  error: null,

  clearError: () => set({ error: null }),

  bootstrap: async () => {
    if (!getToken()) {
      set({ ready: true, user: null });
      return;
    }
    try {
      const data = await api<{ user: User }>('/auth/me');
      set({ user: data.user, ready: true });
    } catch (error) {
      // 只有明确失效才清 token；网络断了保留登录态，服务恢复后刷新即可
      if (error instanceof ApiError && error.status === 401) setToken(null);
      set({ user: null, ready: true });
    }
  },

  login: async (username, password) => {
    set({ pending: true, error: null });
    try {
      const data = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        anonymous: true,
        body: { username, password },
      });
      setToken(data.token);
      set({ user: data.user, pending: false });
    } catch (error) {
      set({ pending: false, error: error instanceof Error ? error.message : '登录失败' });
      throw error;
    }
  },

  register: async (username, password, displayName, captcha) => {
    set({ pending: true, error: null });
    try {
      const data = await api<{ token: string; user: User }>('/auth/register', {
        method: 'POST',
        anonymous: true,
        body: {
          username,
          password,
          displayName,
          captchaId: captcha.id,
          captchaText: captcha.text,
        },
      });
      setToken(data.token);
      set({ user: data.user, pending: false });
    } catch (error) {
      set({ pending: false, error: error instanceof Error ? error.message : '注册失败' });
      throw error;
    }
  },

  logout: async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
    }
    setToken(null);
    set({ user: null, error: null });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('ai-console:unauthorized', () => {
    useAuthStore.setState({ user: null });
  });
}
