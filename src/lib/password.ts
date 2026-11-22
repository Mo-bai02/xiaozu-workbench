/**
 * 密码强度评估。
 *
 * 刻意不追求"学术正确"，只要三件事：
 * 1. 能给出可解释的分档（弱/一般/强/很强）
 * 2. 能告诉用户缺什么，而不是只甩一句"密码太弱"
 * 3. 常见弱密码直接降档 —— 满足长度和字符集也没用
 *
 * 真正的安全靠服务端：目前只强制 6 位；强度提示是引导，不是门槛。
 */
export interface PasswordStrength {
  /** 0-4，0 表示还没输入 */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  tips: string[];
}

const COMMON = new Set([
  '123456',
  '12345678',
  '123456789',
  'password',
  'qwerty',
  'abc123',
  '111111',
  '000000',
  'admin123',
  'iloveyou',
  'a123456',
  '123123',
]);

const LENGTH_TIP = '至少 8 位更稳妥';
const MIX_TIP = '大小写字母混用';
const DIGIT_TIP = '加个数字';
const SYMBOL_TIP = '加个符号（如 ! @ #）';
const REPEAT_TIP = '别用重复或连续字符';

export function passwordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: '', color: 'var(--border)', tips: [] };
  }

  const tips: string[] = [];
  const lower = /[a-z]/.test(password);
  const upper = /[A-Z]/.test(password);
  const digit = /\d/.test(password);
  const symbol = /[^A-Za-z0-9]/.test(password);

  let score = 0;
  if (password.length >= 8) score += 1;
  else tips.push(LENGTH_TIP);
  if (password.length >= 12) score += 1;
  if ((lower && upper) || (lower && digit) || (upper && digit)) score += 1;
  else tips.push(MIX_TIP);
  if (digit && (lower || upper)) score += 1;
  else tips.push(DIGIT_TIP);
  if (symbol) score += 1;
  else tips.push(SYMBOL_TIP);

  // 重复字符或顺序字符，直接扣一档
  if (/(.)\1{2,}/.test(password) || /012|123|234|345|456|567|678|789|abc|qwe/i.test(password)) {
    score -= 1;
    tips.push(REPEAT_TIP);
  }

  if (COMMON.has(password.toLowerCase())) {
    score = 1;
    tips.length = 0;
    tips.push('这是常见密码，换一个');
  }

  const clamped = Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4;
  const meta = {
    1: { label: '弱', color: '#e5484d' },
    2: { label: '一般', color: '#d4a72c' },
    3: { label: '强', color: '#2f9e63' },
    4: { label: '很强', color: '#0f9d58' },
  }[clamped];

  return { score: clamped, label: meta.label, color: meta.color, tips: tips.slice(0, 3) };
}
