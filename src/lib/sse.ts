export interface SSEEvent {
  event: string;
  data: string;
  id?: string;
}

export interface SSEParser {
  feed(chunk: string): SSEEvent[];
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
