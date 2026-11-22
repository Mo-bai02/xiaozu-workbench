import { describe, expect, it } from 'vitest';
import { filterCommands } from '@/components/CommandPalette';

const cmd = (id: string, title: string, hint?: string) => ({
  id,
  title,
  hint,
  group: '页面' as const,
  icon: null,
  run: () => undefined,
});

const commands = [
  cmd('board', '任务看板'),
  cmd('notes', '笔记'),
  cmd('new-note', '新建笔记', '创建后跳到笔记页'),
  cmd('theme', '切换深浅色主题', '当前设置会记住'),
  cmd('logs', 'AI 调用记录'),
];

describe('filterCommands', () => {
  it('空查询返回全部', () => {
    expect(filterCommands(commands, '   ')).toHaveLength(commands.length);
  });

  it('按标题包含匹配', () => {
    expect(filterCommands(commands, '笔记').map((c) => c.id)).toEqual(['notes', 'new-note']);
  });

  it('提示文案也参与匹配', () => {
    expect(filterCommands(commands, '记住').map((c) => c.id)).toEqual(['theme']);
  });

  it('前缀命中的排在前面', () => {
    const result = filterCommands(commands, '笔记');
    expect(result[0]?.id).toBe('notes');
  });

  it('没有匹配返回空数组', () => {
    expect(filterCommands(commands, '不存在的命令')).toEqual([]);
  });

  it('忽略大小写', () => {
    expect(filterCommands(commands, 'ai').map((c) => c.id)).toEqual(['logs']);
  });
});
