import { describe, expect, it } from 'vitest';
import { createSSEParser } from '@/lib/sse';

describe('createSSEParser', () => {
  it('解析单个完整事件', () => {
    const parser = createSSEParser();
    const events = parser.feed('event: delta\ndata: {"text":"你好"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'delta', data: '{"text":"你好"}' });
  });

  it('事件被拆到两个 chunk 时，仍只产出一个事件', () => {
    const parser = createSSEParser();
    expect(parser.feed('event: delta\ndata: {"te')).toHaveLength(0);
    const events = parser.feed('xt":"你好"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('{"text":"你好"}');
  });

  it('一个 chunk 里包含多个事件', () => {
    const parser = createSSEParser();
    const events = parser.feed('data: a\n\ndata: b\n\ndata: c\n\n');
    expect(events.map((e) => e.data)).toEqual(['a', 'b', 'c']);
  });

  it('多行 data 用换行拼接', () => {
    const parser = createSSEParser();
    const events = parser.feed('data: line1\ndata: line2\n\n');
    expect(events[0]?.data).toBe('line1\nline2');
  });

  it('忽略注释与心跳行', () => {
    const parser = createSSEParser();
    const events = parser.feed(': ping\n\n');
    expect(events).toHaveLength(0);
  });

  it('默认事件名为 message', () => {
    const parser = createSSEParser();
    expect(parser.feed('data: hi\n\n')[0]?.event).toBe('message');
  });

  it('兼容 CRLF 换行', () => {
    const parser = createSSEParser();
    const events = parser.feed('event: delta\r\ndata: x\r\n\r\n');
    expect(events[0]).toEqual({ event: 'delta', data: 'x' });
  });

  it('流结束时 flush 出没有空行结尾的最后一个事件', () => {
    const parser = createSSEParser();
    parser.feed('data: tail');
    const events = parser.flush();
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('tail');
  });
});
