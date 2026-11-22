/**
 * 北京时间工具。
 *
 * 中国不实行夏令时，UTC+8 是固定偏移，所以可以直接「时间戳 + 8 小时」再取 UTC 字段。
 * 这样得到的「今天」和「本月」在国内任何设备上一致 —— 不依赖浏览器时区设置，
 * 也不受用户把系统时区改成别处的影响。
 *
 * 注意：如果哪天真要支持多时区，这套就要换成按 IANA 规则换算，不能再用固定偏移。
 */
const CST_OFFSET = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** 北京时间的 YYYY-MM-DD */
export function cstDayKey(ts: number = Date.now()): string {
  return new Date(ts + CST_OFFSET).toISOString().slice(0, 10);
}

/** 北京时间的 YYYY-MM */
export function cstMonthKey(ts: number = Date.now()): string {
  return cstDayKey(ts).slice(0, 7);
}

/** 北京时间「今天」的起止 */
export function cstDayRange(ts: number = Date.now()): { start: number; end: number } {
  const shifted = new Date(ts + CST_OFFSET);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - CST_OFFSET;
  return { start, end: start + DAY };
}

/** 北京时间「本月」的起止 */
export function cstMonthRange(ts: number = Date.now()): { start: number; end: number } {
  const shifted = new Date(ts + CST_OFFSET);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - CST_OFFSET;
  const end = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1) - CST_OFFSET;
  return { start, end };
}

/** 用来判断某个时间戳是不是「今天」（北京时间） */
export function isCstToday(ts: number, base: number = Date.now()): boolean {
  return cstDayKey(ts) === cstDayKey(base);
}

/** 北京时间当天已过的时间占比 0-1，给"今日进度"这类展示用 */
export function cstDayProgress(ts: number = Date.now()): number {
  const { start, end } = cstDayRange(ts);
  return Math.min(1, Math.max(0, (ts - start) / (end - start)));
}

/** 显示用：北京时间的日期时间 */
export function formatCst(ts: number, withTime = false): string {
  const date = new Date(ts + CST_OFFSET);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (!withTime) return `${month}/${day}`;
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}
