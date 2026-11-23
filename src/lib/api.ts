import { env } from '@/env';
import { getToken } from './http';
import { getVisitorId } from './visitor';

/**
 * 统一的请求入口：自动带上访客标识。
 * 所有 /api 请求都走这里，避免某个地方漏了 header 导致日志串到 anonymous 分组。
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Visitor-Id', getVisitorId());
  // 带上登录态：调用日志按用户落库，没有这个头就只会写进匿名分组
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
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


export interface SharedNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  views: number;
}

/** 把一条笔记上传成只读分享，返回分享 id */
export async function createShare(note: { title: string; content: string }): Promise<string> {
  const res = await apiFetch('/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note),
  });
  if (!res.ok) throw new Error('分享失败，请稍后再试');
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function getShare(id: string): Promise<SharedNote> {
  const res = await apiFetch(`/shares/${id}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ error: '读取失败' }));
    throw new Error(detail.error ?? '读取失败');
  }
  return (await res.json()) as SharedNote;
}

export async function revokeShare(id: string): Promise<void> {
  await apiFetch(`/shares/${id}`, { method: 'DELETE' });
}
