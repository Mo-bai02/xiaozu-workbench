import { env } from '@/env';
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
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 演示用的假回答：按关键词切换，覆盖代码块 / 表格 / 列表三种结构 */
function mockReply(prompt: string): string {
  if (/代码|防抖|hook|debounce/i.test(prompt)) {
    return [
      '防抖的核心是「等用户停下来再执行」。下面是一个带泛型的实现：',
      '',
      '```ts',
      'export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {',
      '  let timer: ReturnType<typeof setTimeout> | null = null;',
      '  return (...args: Parameters<T>) => {',
      '    if (timer) clearTimeout(timer);',
      '    timer = setTimeout(() => fn(...args), wait);',
      '  };',
      '}',
      '```',
      '',
      '**三个容易踩的坑：**',
      '',
      '1. 组件卸载时没有 `clearTimeout`，导致内存泄漏；',
      '2. 依赖项写成内联函数，每次渲染都重新创建，防抖失效；',
      '3. 需要「立即执行」场景时没做 `leading` 支持。',
      '',
      '> 在 React 里更推荐 `useDebouncedValue` 这种声明式写法，副作用更可控。',
    ].join('\n');
  }

  if (/表格|对比|选型/i.test(prompt)) {
    return [
      '下面按「首屏体积」和「上手成本」两个维度做个对比：',
      '',
      '| 方案 | 首屏体积 | 上手成本 | 适用场景 |',
      '| --- | --- | --- | --- |',
      '| 纯 CSS 动画 | 0 KB | 低 | 简单过渡 |',
      '| Framer Motion | ~38 KB | 中 | 复杂编排 |',
      '| GSAP | ~70 KB | 高 | 时间轴动画 |',
      '',
      '结论：**演示型页面优先纯 CSS**，交互编排复杂时再引入动画库。',
    ].join('\n');
  }

  return [
    '这个问题可以从三个层面拆开看：',
    '',
    '### 1. 渲染层',
    '流式输出时，每来一个 token 就 `setState` 会触发整棵树重渲染。',
    '更好的做法是用 `requestAnimationFrame` 把增量合并成每秒 60 帧的批量更新。',
    '',
    '### 2. 数据层',
    '一个 SSE 事件可能被 TCP 分包切成两半，必须自己维护缓冲区，',
    '只在遇到空行 `\\n\\n` 时才认为一个事件结束。',
    '',
    '### 3. 体验层',
    '- 首字延迟（TTFT）决定「快不快」的感知；',
    '- 打字机节奏决定「顺不顺」的感知；',
    '- 错误重试决定「靠不靠谱」的感知。',
    '',
    '如果你愿意，我可以把这三层分别展开讲，并给出可直接跑的代码。',
  ].join('\n');
}

async function mockStream({ messages, onDelta, signal }: StreamParams): Promise<StreamStats> {
  const prompt = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const full = mockReply(prompt);
  const startedAt = performance.now();

  await sleep(320); // 模拟首字延迟
  const ttftMs = performance.now() - startedAt;

  let sent = 0;
  let chunks = 0;
  while (sent < full.length) {
    if (signal?.aborted) break;
    const size = 2 + Math.floor(Math.random() * 6);
    const piece = full.slice(sent, sent + size);
    sent += piece.length;
    chunks += 1;
    onDelta(piece);
    await sleep(4 + Math.random() * 8);
  }

  return {
    ttftMs,
    totalMs: performance.now() - startedAt,
    chars: sent,
    chunks,
    usage: { promptTokens: Math.ceil(prompt.length / 2), completionTokens: Math.ceil(sent / 2) },
  };
}

async function realStream({ messages, onDelta, signal }: StreamParams): Promise<StreamStats> {
  const startedAt = performance.now();
  let ttftMs = 0;
  let chars = 0;
  let chunks = 0;
  let usage: StreamStats['usage'];

  const response = await fetch(`${env.apiBase}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`请求失败：${response.status} ${await response.text().catch(() => '')}`);
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
          /* 忽略格式不对的 usage */
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

export function streamChat(params: StreamParams): Promise<StreamStats> {
  return env.useMock ? mockStream(params) : realStream(params);
}
