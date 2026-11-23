import { apiFetch } from './api';
import { createSSEParser } from './sse';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamStats {
  ttftMs: number;
  totalMs: number;
  chars: number;
  chunks: number;
  usage?: { promptTokens: number; completionTokens: number };
}

interface StreamParams {
  messages: ChatMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
  model?: string;
}

export async function streamChat({ messages, onDelta, signal, model }: StreamParams): Promise<StreamStats> {
  const startedAt = performance.now();
  let ttftMs = 0;
  let chars = 0;
  let chunks = 0;
  let usage: StreamStats['usage'];

  const response = await apiFetch('/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ messages, model }),
    signal,
  });

  if (!response.ok || !response.body) {
    let detail = '';
    try {
      detail = (await response.json()).error ?? '';
    } catch {
    }
    throw new Error(detail || `请求失败：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSSEParser();

  const consume = (events: ReturnType<typeof parser.feed>) => {
    for (const event of events) {
      if (event.event === 'error') throw new Error(event.data);
      if (event.event === 'done') {
        try {
          usage = JSON.parse(event.data).usage;
        } catch {
        }
        continue;
      }
      if (event.data === '[DONE]') continue;
      if (event.event === 'delta' || event.event === 'message') {
        let text = event.data;
        try {
          const parsed = JSON.parse(event.data) as { text?: string };
          if (typeof parsed.text === 'string') text = parsed.text;
        } catch {
        }
        if (!text) continue;
        if (!ttftMs) ttftMs = performance.now() - startedAt;
        chars += text.length;
        chunks += 1;
        onDelta(text);
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    consume(parser.feed(decoder.decode(value, { stream: true })));
  }
  consume(parser.flush());

  return { ttftMs, totalMs: performance.now() - startedAt, chars, chunks, usage };
}
