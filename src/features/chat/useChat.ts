import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, type ChatMessage, type StreamStats } from '@/lib/stream';
import { uid } from '@/lib/utils';
import { useUIStore } from '@/store/ui';

export type ChatStatus = 'streaming' | 'done' | 'error' | 'aborted';
export type RenderStrategy = 'raf' | 'per-token';

export interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: ChatStatus;
  stats?: StreamStats;
  error?: string;
}

export interface LiveMetrics {
  chars: number;
  /** React 实际提交的渲染次数 —— 量化"卡不卡"的指标 */
  renders: number;
  ttftMs: number;
}

const EMPTY_METRICS: LiveMetrics = { chars: 0, renders: 0, ttftMs: 0 };

/**
 * 对话状态机。
 *
 * 关键点都在「怎么把 token 变成 UI」上：
 * - 逐 token setState：一次流式回答要提交几百次渲染，移动端直接掉帧；
 * - rAF 批量：把同一帧内到达的 token 合并成一次提交，渲染次数 ≈ 帧数。
 */
export function useChat() {
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [metrics, setMetrics] = useState<LiveMetrics>(EMPTY_METRICS);
  const [strategy, setStrategy] = useState<RenderStrategy>('raf');
  const modelId = useUIStore((s) => s.modelId);

  const bufferRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rendersRef = useRef(0);
  const charsRef = useRef(0);
  const ttftRef = useRef(0);
  const startedAtRef = useRef(0);
  const strategyRef = useRef<RenderStrategy>('raf');

  useEffect(() => {
    strategyRef.current = strategy;
  }, [strategy]);

  const patchLast = useCallback((patch: (item: ChatItem) => ChatItem) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      const last = next[next.length - 1];
      if (!last) return prev;
      next[next.length - 1] = patch(last);
      return next;
    });
  }, []);

  const flush = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    rafRef.current = null;
    const text = bufferRef.current;
    if (!text) return;
    bufferRef.current = '';
    rendersRef.current += 1;
    patchLast((item) => ({ ...item, content: item.content + text }));
    setMetrics((m) => ({ ...m, chars: charsRef.current, renders: rendersRef.current }));
  }, [patchLast]);

  const onDelta = useCallback(
    (text: string) => {
      charsRef.current += text.length;
      if (ttftRef.current === 0) {
        ttftRef.current = performance.now() - startedAtRef.current;
        setMetrics((m) => ({ ...m, ttftMs: ttftRef.current }));
      }

      if (strategyRef.current === 'per-token') {
        rendersRef.current += 1;
        patchLast((item) => ({ ...item, content: item.content + text }));
        setMetrics((m) => ({ ...m, chars: charsRef.current, renders: rendersRef.current }));
        return;
      }

      bufferRef.current += text;
      if (rafRef.current === null) {
        const frameId = requestAnimationFrame(flush);
        rafRef.current = frameId;
        // 后台标签页里 rAF 会被暂停，用 120ms 兜底，避免文字"冻住"
        timeoutRef.current = window.setTimeout(() => {
          if (rafRef.current === frameId) {
            cancelAnimationFrame(frameId);
            flush();
          }
        }, 120);
      }
    },
    [flush, patchLast],
  );

  /** 真正跑一次请求：history 是"喂给模型的历史"，addUser 决定要不要在界面上追加用户气泡 */
  const run = useCallback(
    async (text: string, history: ChatMessage[], addUser: boolean) => {
      if (streaming) return;

      const controller = new AbortController();
      abortRef.current = controller;
      bufferRef.current = '';
      rendersRef.current = 0;
      charsRef.current = 0;
      ttftRef.current = 0;
      startedAtRef.current = performance.now();
      setMetrics(EMPTY_METRICS);
      setStreaming(true);

      setMessages((prev) => [
        ...prev,
        ...(addUser ? [{ id: uid('u'), role: 'user' as const, content: text, status: 'done' as const }] : []),
        { id: uid('a'), role: 'assistant' as const, content: '', status: 'streaming' as const },
      ]);

      try {
        const stats = await streamChat({
          messages: [...history, { role: 'user', content: text }],
          onDelta,
          signal: controller.signal,
          model: modelId || undefined,
        });
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        const rest = bufferRef.current;
        bufferRef.current = '';
        if (rest) rendersRef.current += 1;
        patchLast((item) => ({
          ...item,
          content: item.content + rest,
          status: controller.signal.aborted ? 'aborted' : 'done',
          stats,
        }));
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === 'AbortError';
        patchLast((item) => ({
          ...item,
          status: aborted ? 'aborted' : 'error',
          error: aborted ? undefined : error instanceof Error ? error.message : String(error),
        }));
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setMetrics((m) => ({ ...m, chars: charsRef.current, renders: rendersRef.current }));
      }
    },
    [modelId, onDelta, patchLast, streaming],
  );

  const send = useCallback(
    (input: string) => {
      const text = input.trim();
      if (!text || streaming) return;
      const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
      void run(text, history, true);
    },
    [messages, run, streaming],
  );

  /** 重新生成最后一条回答：去掉它，用同样的上下文再问一次 */
  const regenerate = useCallback(() => {
    if (streaming) return;
    const lastUserIndex = [...messages].map((m) => m.role).lastIndexOf('user');
    if (lastUserIndex < 0) return;
    const lastUser = messages[lastUserIndex];
    if (!lastUser) return;

    const history: ChatMessage[] = messages
      .slice(0, lastUserIndex)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => {
      const next = prev.slice(0, lastUserIndex + 1);
      return next[next.length - 1]?.role === 'user' ? next : prev;
    });
    void run(lastUser.content, history, false);
  }, [messages, run, streaming]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    if (streaming) return;
    setMessages([]);
    setMetrics(EMPTY_METRICS);
  }, [streaming]);

  /** 切换到另一个会话时，把历史消息灌进来（不动正在跑的流） */
  const loadMessages = useCallback(
    (items: ChatItem[]) => {
      if (streaming) return;
      setMessages(items);
      setMetrics(EMPTY_METRICS);
    },
    [streaming],
  );

  /**
   * 只在页面真正卸载时中断请求，而**不在组件卸载时**中断。
   * 原因：React StrictMode 在开发环境会「挂载 → 卸载 → 再挂载」，
   * 如果在 effect 清理里 abort，开发环境第一个请求会被自己掐断（表现为已停止）。
   */
  useEffect(() => {
    const onPageHide = () => abortRef.current?.abort();
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  return { messages, streaming, metrics, strategy, setStrategy, send, regenerate, stop, clear, loadMessages };
}
