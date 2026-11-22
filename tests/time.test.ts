import { describe, expect, it } from 'vitest';
import { cstDayKey, cstDayRange, cstMonthKey, cstMonthRange, formatCst, isCstToday } from '@/lib/time';

describe('北京时间', () => {
  it('UTC 16:00 已经是北京的第二天', () => {
    // 2026-11-22T16:30Z = 2026-11-23 00:30 北京时间
    const ts = Date.parse('2026-11-22T16:30:00Z');
    expect(cstDayKey(ts)).toBe('2026-11-23');
  });

  it('UTC 15:30 还是北京的当天', () => {
    const ts = Date.parse('2026-11-22T15:30:00Z');
    expect(cstDayKey(ts)).toBe('2026-11-22');
  });

  it('今日区间恰好 24 小时，且包含当前时刻', () => {
    const ts = Date.parse('2026-11-22T16:30:00Z');
    const { start, end } = cstDayRange(ts);
    expect(end - start).toBe(24 * 60 * 60 * 1000);
    expect(ts).toBeGreaterThanOrEqual(start);
    expect(ts).toBeLessThan(end);
    expect(cstDayKey(start)).toBe('2026-11-23');
  });

  it('本月区间从月初到次月初，跨月正确', () => {
    const ts = Date.parse('2026-12-31T20:00:00Z'); // 北京时间 2027-01-01 04:00
    const { start, end } = cstMonthRange(ts);
    expect(cstDayKey(start)).toBe('2027-01-01');
    expect(cstDayKey(end)).toBe('2027-02-01');
    expect(cstMonthKey(ts)).toBe('2027-01');
  });

  it('跨年时月份正确', () => {
    const ts = Date.parse('2026-12-15T00:00:00Z');
    expect(cstMonthKey(ts)).toBe('2026-12');
  });

  it('isCstToday 能区分同一天和跨天', () => {
    const a = Date.parse('2026-11-22T16:30:00Z');
    const b = Date.parse('2026-11-23T10:00:00Z');
    const c = Date.parse('2026-11-23T15:59:00Z');
    expect(isCstToday(b, a)).toBe(true);
    expect(isCstToday(c, a)).toBe(true);
    expect(isCstToday(Date.parse('2026-11-23T16:30:00Z'), a)).toBe(false);
  });

  it('formatCst 输出北京时间的月日与时分', () => {
    const ts = Date.parse('2026-11-22T16:30:00Z');
    expect(formatCst(ts)).toBe('11/23');
    expect(formatCst(ts, true)).toBe('11/23 00:30');
  });
});
