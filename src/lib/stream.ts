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
  /** 选中的模型，服务端据此路由到对应供应商 */
  model?: string;
}

/**
 * 流式请求。
 *
 * 前端只有这一条路径 —— 背后是真模型还是 mock，由服务端决定（看有没有配 LLM_API_KEY）。
 * 少一个分支，就少一类"本地好使、线上不对"的 bug。
 */
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
      /* 忽略非 JSON 响应 */
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
          /* usage 可为空 */
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
          /* 允许服务端直接返回纯文本 */
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
