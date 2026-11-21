import { describe, expect, it } from 'vitest';
import { mockSpec, validateSpec } from '@/features/generator/schema';

const VALID = {
  title: '测试表单',
  layout: 'form',
  fields: [
    { name: 'name', label: '姓名', type: 'input', required: true },
    { name: 'dept', label: '部门', type: 'select', options: ['A', 'B'] },
  ],
};

describe('validateSpec', () => {
  it('接受合法 Schema', () => {
    const result = validateSpec(VALID);
    expect(result.ok).toBe(true);
    expect(result.spec?.fields).toHaveLength(2);
  });

  it('拒绝未知的字段类型', () => {
    const result = validateSpec({
      ...VALID,
      fields: [{ name: 'x', label: 'X', type: 'rich-text' }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('type');
  });

  it('拒绝缺少字段的 Schema', () => {
    const result = validateSpec({ title: '空', layout: 'form', fields: [] });
    expect(result.ok).toBe(false);
  });

  it('拒绝非法的 layout', () => {
    expect(validateSpec({ ...VALID, layout: 'grid' }).ok).toBe(false);
  });

  it('错误信息包含路径，方便定位', () => {
    const result = validateSpec({ ...VALID, fields: [{}] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/fields\.0/);
  });
});

describe('mockSpec', () => {
  it('按关键词命中员工表单', () => {
    const spec = mockSpec('做一个员工入职登记表');
    expect(spec.title).toContain('员工');
    expect(spec.layout).toBe('form');
  });

  it('按关键词命中列表', () => {
    expect(mockSpec('订单列表查询').layout).toBe('table');
  });

  it('没有关键词时返回兜底 Schema 且结构合法', () => {
    const spec = mockSpec('随便来点什么');
    expect(validateSpec(spec).ok).toBe(true);
  });
});
