export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('zh-CN').format(n);
}

/** 粗略的成本估算：按 ¥0.002 / 1K tokens 计，仅用于演示 */
export function estimateCost(tokens: number): string {
  return `¥${((tokens / 1000) * 0.002).toFixed(4)}`;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
