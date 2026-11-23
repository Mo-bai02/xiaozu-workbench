export interface Expense {
  id: string;
  /** 以「分」为单位存整数，避免浮点累加误差 */
  amount: number;
  category: string;
  note: string;
  /** 谁垫的钱 */
  payerId: string;
  /** 这笔钱由谁一起分摊 */
  sharedBy: string[];
  date: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * AA 结算：把「谁垫了多少、谁该分摊多少」算成「谁转给谁多少」。
 *
 * 步骤：
 * 1. 算每个人的净额 = 垫付总额 − 应分摊总额（正数代表别人欠他）
 * 2. 贪心配对：欠最多的转给被欠最多的，一次结清一个
 *
 * 为什么不追求「绝对最少转账次数」：那是 NP-hard（等价于子集划分），
 * 对一次活动几十笔开销来说，贪心的笔数已经足够少，而且结果稳定、能解释。
 */
export function settle(expenses: Expense[], memberIds: string[]): Transfer[] {
  const net = new Map<string, number>();
  for (const id of memberIds) net.set(id, 0);

  for (const expense of expenses) {
    if (expense.sharedBy.length === 0) continue;
    net.set(expense.payerId, (net.get(expense.payerId) ?? 0) + expense.amount);
    // 先算每个人的份额（整数分），余数补给第一个人，保证总额守恒
    const base = Math.floor(expense.amount / expense.sharedBy.length);
    let remainder = expense.amount - base * expense.sharedBy.length;
    for (const id of expense.sharedBy) {
      const share = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      net.set(id, (net.get(id) ?? 0) - share);
    }
  }

  const debtors = [...net.entries()]
    .filter(([, value]) => value < -0.5)
    .map(([id, value]) => ({ id, value: -value }))
    .sort((a, b) => b.value - a.value);
  const creditors = [...net.entries()]
    .filter(([, value]) => value > 0.5)
    .map(([id, value]) => ({ id, value }))
    .sort((a, b) => b.value - a.value);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const amount = Math.min(debtor.value, creditor.value);
    if (amount >= 1) {
      transfers.push({ from: debtor.id, to: creditor.id, amount: Math.round(amount) });
    }
    debtor.value -= amount;
    creditor.value -= amount;
    if (debtor.value < 0.5) i += 1;
    if (creditor.value < 0.5) j += 1;
  }

  return transfers.sort((a, b) => b.amount - a.amount);
}

/** 某人在这批开销里垫了多少钱、该分摊多少 */
export function memberSummary(expenses: Expense[], memberId: string): { paid: number; owed: number } {
  let paid = 0;
  let owed = 0;
  for (const expense of expenses) {
    if (expense.payerId === memberId) paid += expense.amount;
    if (expense.sharedBy.includes(memberId) && expense.sharedBy.length > 0) {
      owed += expense.amount / expense.sharedBy.length;
    }
  }
  return { paid, owed: Math.round(owed) };
}

/** 按月汇总分类支出，给饼图用 */
export function categoryTotals(
  expenses: Expense[],
): Array<{ label: string; value: number; color: string }> {
  const palette: Record<string, string> = {
    餐饮: '#3b6ef6',
    交通: '#0f9d58',
    采购: '#d4a72c',
    场地: '#7a5cff',
    其他: '#8b95a7',
  };
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value: value / 100, color: palette[label] ?? '#8b95a7' }))
    .sort((a, b) => b.value - a.value);
}

/** 分 → 「¥12.30」 */
export function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

/**
 * 展示用的金额：大了换成「万 / 亿」，避免 1111111.00 把表格撑变形。
 * 结算和统计都走这个，原始分值仍然参与计算。
 */
export function money(cents: number): string {
  const value = cents / 100;
  const abs = Math.abs(value);
  if (abs >= 1e8) return `¥${(value / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `¥${(value / 1e4).toFixed(2)}万`;
  return `¥${value.toFixed(2)}`;
}
