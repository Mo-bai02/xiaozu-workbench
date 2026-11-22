import { describe, expect, it } from 'vitest';
import { passwordStrength } from '@/lib/password';

describe('passwordStrength', () => {
  it('空密码不显示任何档位', () => {
    const result = passwordStrength('');
    expect(result.score).toBe(0);
    expect(result.tips).toHaveLength(0);
  });

  it('太短判为弱', () => {
    expect(passwordStrength('abc123').score).toBe(1);
    expect(passwordStrength('abc123').label).toBe('弱');
  });

  it('长度足够但只有小写字母，不会超过一般', () => {
    const result = passwordStrength('abcdefghijklmn');
    expect(result.score).toBeLessThanOrEqual(2);
    expect(result.tips.length).toBeGreaterThan(0);
  });

  it('大小写 + 数字 + 符号 + 够长 = 很强', () => {
    const result = passwordStrength('Kx7#mQ2pLw9!');
    expect(result.score).toBe(4);
    expect(result.label).toBe('很强');
  });

  it('常见密码直接降到弱', () => {
    expect(passwordStrength('password').score).toBe(1);
    expect(passwordStrength('admin123').tips.join()).toContain('常见');
  });

  it('连续字符会被扣分并给出提示', () => {
    const result = passwordStrength('abcd1234');
    expect(result.tips.join()).toContain('重复');
  });

  it('重复字符扣分', () => {
    const result = passwordStrength('aaaa1111');
    expect(result.tips.join()).toContain('重复');
  });

  it('提示最多三条，避免把文案堆满', () => {
    expect(passwordStrength('aaa').tips.length).toBeLessThanOrEqual(3);
  });
});
