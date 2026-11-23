/**
 * 带登录态的请求封装。
 *
 * 401 统一处理：清掉本地 token 并广播事件，由 App 层跳转登录页 ——
 * 避免每个页面各自判断"没登录"。
 */
const TOKEN_KEY = 'ai-console:token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 隐私模式忽略 */
  }
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** 登录/注册这类接口不需要带 token */
  anonymous?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token && !options.anonymous) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 401) {
    const detail = await response.json().catch(() => ({ error: '请求失败' }));

    // 登录/注册（anonymous）返回 401 是"账号或密码不对"，不能当成会话过期
    if (!options.anonymous && token) {
      setToken(null);
      window.dispatchEvent(new Event('ai-console:unauthorized'));
      throw new ApiError('登录已过期，请重新登录', 401);
    }

    throw new ApiError(detail.error ?? '请求失败', 401);
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => ({ error: '请求失败' }));
    throw new ApiError(detail.error ?? '请求失败', response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
