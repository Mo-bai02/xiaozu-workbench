import { create } from 'zustand';
import { api, getToken, setToken } from '@/lib/http';

export interface User {
  id: string;
  username: string;
  displayName: string;
}

interface AuthState {
  user: User | null;
  /** 首次拉取 /me 完成前为 false，用来避免闪一下登录页 */
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
    } catch {
      setToken(null);
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
      /* 即使服务端失败，本地也要清干净 */
    }
    setToken(null);
    set({ user: null, error: null });
  },
}));

// 任何请求收到 401 都会广播这个事件，这里统一退出，页面会被路由守卫带回登录页
if (typeof window !== 'undefined') {
  window.addEventListener('ai-console:unauthorized', () => {
    useAuthStore.setState({ user: null });
  });
}
