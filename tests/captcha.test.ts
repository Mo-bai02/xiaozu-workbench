import { describe, expect, it } from 'vitest';
import { issueCaptcha, verifyCaptcha } from '../server/captcha.mjs';

/** 从返回的 SVG 里把字符抠出来 —— 相当于"人眼看图"，用来验证整条链路 */
function readCaptcha(image: string): string {
  const svg = Buffer.from(image.split(',')[1] ?? '', 'base64').toString('utf8');
  const chars = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
  return chars.join('');
}

describe('captcha', () => {
  it('返回图片和 id，图片里是 4 个字符', () => {
    const { id, image } = issueCaptcha();
    expect(id).toHaveLength(18);
    expect(image.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(readCaptcha(image)).toHaveLength(4);
  });

  it('输入正确的码可以通过（大小写不敏感）', () => {
    const { id, image } = issueCaptcha();
    const text = readCaptcha(image);
    expect(verifyCaptcha(id, text.toLowerCase())).toBe(true);
  });

  it('一次性：同一个 code 不能重复使用', () => {
    const { id, image } = issueCaptcha();
    const text = readCaptcha(image);
    expect(verifyCaptcha(id, text)).toBe(true);
    expect(verifyCaptcha(id, text)).toBe(false);
  });

  it('输错了会作废，不能拿同一个 id 再试', () => {
    const { id, image } = issueCaptcha();
    const text = readCaptcha(image);
    expect(verifyCaptcha(id, 'ZZZZ')).toBe(false);
    expect(verifyCaptcha(id, text)).toBe(false);
  });

  it('不存在的 id 直接失败', () => {
    expect(verifyCaptcha('not-a-real-id', 'ABCD')).toBe(false);
  });

  it('空输入直接失败', () => {
    const { id } = issueCaptcha();
    expect(verifyCaptcha(id, '')).toBe(false);
  });
});
