import { describe, expect, it } from 'vitest';
import { extractTags, filterNotes, type Note } from '@/features/notes/store';

const N = (id: string, title: string, content: string, tags: string[], pinned = false, updatedAt = 0): Note => ({
  id,
  title,
  content,
  tags,
  pinned,
  createdAt: 0,
  updatedAt,
});

const notes: Note[] = [
  N('n1', '第一次小组会', '分工：前端陈鹏宇，后端周野', ['会议'], true, 100),
  N('n2', '答辩问题', '为什么不用 ECharts？', ['答辩'], false, 300),
  N('n3', '班费备忘', '打印海报 30 元', ['经费', '会议'], false, 200),
];

describe('filterNotes', () => {
  it('按关键词搜索标题和正文', () => {
    expect(filterNotes(notes, { keyword: '答辩' }).map((n) => n.id)).toEqual(['n2']);
    expect(filterNotes(notes, { keyword: '海报' }).map((n) => n.id)).toEqual(['n3']);
  });

  it('按标签过滤', () => {
    expect(filterNotes(notes, { tag: '会议' }).map((n) => n.id)).toEqual(['n1', 'n3']);
  });

  it('置顶的排在最前，其余按更新时间倒序', () => {
    expect(filterNotes(notes).map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('没有匹配返回空数组', () => {
    expect(filterNotes(notes, { keyword: '不存在的词' })).toHaveLength(0);
  });
});

describe('extractTags', () => {
  it('抽出 #标签', () => {
    expect(extractTags('今天 #会议 讨论了 #预算 问题')).toEqual(['会议', '预算']);
  });

  it('去重', () => {
    expect(extractTags('#会议 #会议')).toEqual(['会议']);
  });

  it('没有标签返回空', () => {
    expect(extractTags('普通文本')).toEqual([]);
  });
});
