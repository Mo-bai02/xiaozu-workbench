// 中国没有夏令时，UTC+8 是固定偏移
const CST_OFFSET = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export function cstDayKey(ts: number = Date.now()): string {
  return new Date(ts + CST_OFFSET).toISOString().slice(0, 10);
}

export function cstMonthKey(ts: number = Date.now()): string {
  return cstDayKey(ts).slice(0, 7);
}

export function cstDayRange(ts: number = Date.now()): { start: number; end: number } {
  const shifted = new Date(ts + CST_OFFSET);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - CST_OFFSET;
  return { start, end: start + DAY };
}

export function cstMonthRange(ts: number = Date.now()): { start: number; end: number } {
  const shifted = new Date(ts + CST_OFFSET);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - CST_OFFSET;
  const end = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1) - CST_OFFSET;
  return { start, end };
}

export function isCstToday(ts: number, base: number = Date.now()): boolean {
  return cstDayKey(ts) === cstDayKey(base);
}

export function cstDayProgress(ts: number = Date.now()): number {
  const { start, end } = cstDayRange(ts);
  return Math.min(1, Math.max(0, (ts - start) / (end - start)));
}

export function formatCst(ts: number, withTime = false): string {
  const date = new Date(ts + CST_OFFSET);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (!withTime) return `${month}/${day}`;
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}
