import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, type ChatMessage, type StreamStats } from '@/lib/stream';
import { uid } from '@/lib/utils';

export type ChatStatus = 'streaming' | 'done' | 'error' | 'aborted';

export interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: ChatStatus;
  stats?: StreamStats;
  error?: string;
}

export type RenderStrategy = 'raf' | 'per-token';

export interface LiveMetrics {
  chars: number;
  /** React 实际提交的渲染次数 —— 这就是量化"卡不卡"的指标 */
  renders: number;
  ttftMs: number;
}

const EMPTY_METRICS: LiveMetrics = { chars: 0, renders: 0, ttftMs: 0 };

/**
 * 对话状态机。
 *
 * 关键点都在「怎么把 token 变成 UI」上：
 * - 逐 token setState：React 一次流式回答要提交几百次渲染，移动端直接掉帧；
 * - rAF 批量：把同一帧内到达的 token 合并成一次提交，渲染次数 ≈ 帧数。
 * 页面上那排指标（渲染次数、首字延迟）是实测出来的，不是写死的文案。
 */
export function useChat() {
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [metrics, setMetrics] = useState<LiveMetrics>(EMPTY_METRICS);
  const [strategy, setStrategy] = useState<RenderStrategy>('raf');

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
        // 对照组：每个 token 直接提交一次
        rendersRef.current += 1;
        patchLast((item) => ({ ...item, content: item.content + text }));
        setMetrics((m) => ({ ...m, chars: charsRef.current, renders: rendersRef.current }));
        return;
      }

      bufferRef.current += text;
      if (rafRef.current === null) {
        const frameId = requestAnimationFrame(flush);
        rafRef.current = frameId;
        // 后台标签页里 rAF 会被暂停，加一个 120ms 的兜底，避免文字"冻住"
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

  const send = useCallback(
    async (input: string) => {
      const text = input.trim();
      if (!text || streaming) return;

      const controller = new AbortController();
      abortRef.current = controller;
      bufferRef.current = '';
      rendersRef.current = 0;
      charsRef.current = 0;
      ttftRef.current = 0;
      startedAtRef.current = performance.now();
      setMetrics(EMPTY_METRICS);
      setStreaming(true);

      const history: ChatMessage[] = messages
        .filter((m) => m.status !== 'error')
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [
        ...prev,
        { id: uid('u'), role: 'user', content: text, status: 'done' },
        { id: uid('a'), role: 'assistant', content: '', status: 'streaming' },
      ]);

      try {
        const stats = await streamChat({
          messages: [...history, { role: 'user', content: text }],
          onDelta,
          signal: controller.signal,
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
    [messages, onDelta, patchLast, streaming],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    if (streaming) return;
    setMessages([]);
    setMetrics(EMPTY_METRICS);
  }, [streaming]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  return { messages, streaming, metrics, strategy, setStrategy, send, stop, clear };
}
