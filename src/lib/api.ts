import { env } from '@/env';
import { getVisitorId } from './visitor';

/**
 * 统一的请求入口：自动带上访客标识。
 * 所有 /api 请求都走这里，避免某个地方漏了 header 导致日志串到 anonymous 分组。
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Visitor-Id', getVisitorId());
  return fetch(`${env.apiBase}${path}`, { ...init, headers });
}

export interface LogEntry {
  id: string;
  time: number;
  kind: 'chat' | 'ui';
  model: string;
  modelLabel: string;
  status: 'success' | 'failed';
  error?: string;
  latency: number;
  promptTokens: number;
  completionTokens: number;
  question: string;
  answer: string;
}

export async function fetchLogs(): Promise<LogEntry[]> {
  const res = await apiFetch('/logs');
  if (!res.ok) throw new Error(`获取日志失败：${res.status}`);
  const data = (await res.json()) as { logs: LogEntry[] };
  return data.logs ?? [];
}

export async function clearLogs(): Promise<void> {
  await apiFetch('/logs', { method: 'DELETE' });
}
