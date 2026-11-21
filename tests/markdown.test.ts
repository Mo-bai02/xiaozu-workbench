import { describe, expect, it } from 'vitest';
import { isInsideFence, renderMarkdown, repairStreamingMarkdown } from '@/lib/markdown';

describe('repairStreamingMarkdown', () => {
  it('补全未闭合的代码围栏', () => {
    const partial = '看代码：\n\n```ts\nconst a = 1;';
    expect(isInsideFence(partial)).toBe(true);
    const repaired = repairStreamingMarkdown(partial);
    expect(isInsideFence(repaired)).toBe(false);
    expect(repaired.endsWith('```')).toBe(true);
  });

  it('已闭合的输入保持不变', () => {
    const complete = '```ts\nconst a = 1;\n```\n结束';
    expect(repairStreamingMarkdown(complete)).toBe(complete);
  });

  it('补全未闭合的加粗标记', () => {
    const partial = '这里是**重点';
    expect(repairStreamingMarkdown(partial).endsWith('**')).toBe(true);
  });

  it('不会把代码块里的星号当成加粗', () => {
    const text = '```js\nconst x = a ** b;\n```';
    expect(repairStreamingMarkdown(text)).toBe(text);
  });
});

describe('renderMarkdown', () => {
  it('渲染基础结构', () => {
    const html = renderMarkdown('# 标题\n\n- 一\n- 二');
    expect(html).toContain('<h1');
    expect(html).toContain('<li>一</li>');
  });

  it('半成品代码块也能渲染出 pre', () => {
    const html = renderMarkdown('```ts\nconst a = 1;');
    expect(html).toContain('<pre>');
    expect(html).toContain('const a = 1;');
  });

  it('过滤脚本注入', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n正常内容');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('正常内容');
  });

  it('外链带 noopener', () => {
    const html = renderMarkdown('[链接](https://example.com)');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('空输入返回空串', () => {
    expect(renderMarkdown('   ')).toBe('');
  });
});
