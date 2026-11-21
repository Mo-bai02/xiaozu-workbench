/**
 * SSE 解析器（纯函数、可单测，不依赖 fetch / DOM）。
 *
 * 为什么不用 EventSource？
 * - EventSource 只能 GET，且拿不到 request body，多轮对话要把 history 塞进 URL，很快超长；
 * - 无法设置自定义 header（鉴权、trace id）；
 * - 不能 POST 就意味着不能带大 payload。
 * 所以用 fetch + ReadableStream 自己解协议 —— 这也是 Vercel AI SDK 的做法。
 *
 * 真正的坑在「分包」：一个事件可能被拆到两次 read 里，比如
 *   chunk1: 'data: {"te'      chunk2: 'xt":"你好"}\n\n'
 * 解析器必须持有缓冲区，只在遇到空行（\n\n）时才落地一个事件。
 */

export interface SSEEvent {
  event: string;
  data: string;
  id?: string;
}

export interface SSEParser {
  feed(chunk: string): SSEEvent[];
  /** 流结束时调用：处理没有以空行结尾的最后一个事件 */
  flush(): SSEEvent[];
}

function parseBlock(block: string): SSEEvent | null {
  let event = 'message';
  let id: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue; // 空行与注释（心跳）

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
    else if (field === 'id') id = value;
    // retry / 其它字段忽略
  }

  if (dataLines.length === 0) return null; // 只有注释或 retry
  return id === undefined ? { event, data: dataLines.join('\n') } : { event, data: dataLines.join('\n'), id };
}

export function createSSEParser(): SSEParser {
  let buffer = '';

  const drain = (): SSEEvent[] => {
    const events: SSEEvent[] = [];
    let index = buffer.indexOf('\n\n');
    while (index !== -1) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const event = parseBlock(block);
      if (event) events.push(event);
      index = buffer.indexOf('\n\n');
    }
    return events;
  };

  return {
    feed(chunk: string): SSEEvent[] {
      buffer += chunk;
      // 统一换行，避免 \r\n 被拆到两个 chunk 里导致分隔符匹配不上
      buffer = buffer.replace(/\r\n/g, '\n');
      return drain();
    },
    flush(): SSEEvent[] {
      const events = drain();
      const rest = buffer.trim();
      buffer = '';
      if (rest) {
        const event = parseBlock(rest);
        if (event) events.push(event);
      }
      return events;
    },
  };
}
