import { describe, expect, it } from 'vitest';
import { categoryTotals, memberSummary, settle, yuan, type Expense } from '@/features/expenses/settle';

const E = (
  id: string,
  amount: number,
  payerId: string,
  sharedBy: string[],
  category = '餐饮',
): Expense => ({ id, amount, payerId, sharedBy, category, note: '', date: 0 });

describe('settle', () => {
  it('两人平摊：一人转给另一人', () => {
    const transfers = settle([E('a', 10000, 'm1', ['m1', 'm2'])], ['m1', 'm2']);
    expect(transfers).toEqual([{ from: 'm2', to: 'm1', amount: 5000 }]);
  });

  it('账目平的就没有转账', () => {
    const transfers = settle(
      [E('a', 10000, 'm1', ['m1', 'm2']), E('b', 10000, 'm2', ['m1', 'm2'])],
      ['m1', 'm2'],
    );
    expect(transfers).toHaveLength(0);
  });

  it('四人多笔：转账总额等于欠款总额，且不超过 3 笔', () => {
    const expenses = [
      E('a', 3000, 'm1', ['m1', 'm2', 'm3', 'm4']),
      E('b', 4500, 'm4', ['m1', 'm2', 'm3', 'm4']),
      E('c', 1800, 'm2', ['m1', 'm2', 'm4']),
      E('d', 6800, 'm3', ['m1', 'm2', 'm3', 'm4']),
    ];
    const transfers = settle(expenses, ['m1', 'm2', 'm3', 'm4']);

    const totalDebt = transfers.reduce((sum, item) => sum + item.amount, 0);
    const balances = new Map<string, number>();
    for (const id of ['m1', 'm2', 'm3', 'm4']) balances.set(id, 0);
    for (const expense of expenses) {
      balances.set(expense.payerId, (balances.get(expense.payerId) ?? 0) + expense.amount);
      const share = Math.floor(expense.amount / expense.sharedBy.length);
      for (const id of expense.sharedBy) balances.set(id, (balances.get(id) ?? 0) - share);
    }
    const shouldPay = [...balances.values()].filter((v) => v < -0.5).reduce((s, v) => s - v, 0);

    expect(totalDebt).toBeGreaterThan(0);
    expect(Math.abs(totalDebt - shouldPay)).toBeLessThan(5); // 允许分摊余数的几厘误差
    expect(transfers.length).toBeLessThanOrEqual(3); // 4 个人最多 3 笔就能结清
  });

  it('不参与的人不受影响', () => {
    const transfers = settle([E('a', 10000, 'm1', ['m1', 'm2'])], ['m1', 'm2', 'm3']);
    expect(transfers.some((t) => t.from === 'm3' || t.to === 'm3')).toBe(false);
  });

  it('金额为奇数分时总额守恒', () => {
    const transfers = settle([E('a', 10001, 'm1', ['m1', 'm2', 'm3'])], ['m1', 'm2', 'm3']);
    const paid = transfers.reduce((sum, item) => sum + item.amount, 0);
    expect(paid).toBeGreaterThanOrEqual(6666);
    expect(paid).toBeLessThanOrEqual(6668);
  });
});

describe('memberSummary', () => {
  it('统计垫付与应分摊', () => {
    const summary = memberSummary([E('a', 10000, 'm1', ['m1', 'm2'])], 'm1');
    expect(summary.paid).toBe(10000);
    expect(summary.owed).toBe(5000);
  });
});

describe('categoryTotals', () => {
  it('按分类聚合，返回元', () => {
    const data = categoryTotals([
      E('a', 3000, 'm1', ['m1'], '餐饮'),
      E('b', 1000, 'm1', ['m1'], '餐饮'),
      E('c', 5000, 'm1', ['m1'], '交通'),
    ]);
    expect(data.find((item) => item.label === '餐饮')?.value).toBe(40);
    expect(data.find((item) => item.label === '交通')?.value).toBe(50);
  });
});

describe('yuan', () => {
  it('分转成两位小数', () => {
    expect(yuan(1234)).toBe('¥12.34');
    expect(yuan(0)).toBe('¥0.00');
  });
});
