import { useEffect, useRef, useState } from 'react';
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined, StopOutlined } from '@ant-design/icons';
import type { LiveMetrics } from '@/features/chat/useChat';
import { cn, formatMs } from '@/lib/utils';

interface Props {
  streaming: boolean;
  status?: 'streaming' | 'done' | 'error' | 'aborted';
  metrics: LiveMetrics;
  error?: string;
  onStop: () => void;
  onRetry: () => void;
}

/**
 * 灵动岛：把「生成状态」从页面里抽出来，做成固定在顶部的一个胶囊。
 *
 * 为什么值得做？
 * - 用户往上翻历史时，也能知道"还在生成 / 已经完成"；
 * - 状态、耗时、停止按钮集中在一处，不用去找；
 * - 它是一块独立的组件 + 一套状态机，面试时可以直接讲"我怎么做这个交互"。
 *
 * 交互：生成中展开可看指标与停止；完成后停留 1.8s 自动收起；失败常驻，点一下重试。
 */
export function DynamicIsland({ streaming, status, metrics, error, onStop, onRetry }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (streaming) {
      startRef.current = performance.now();
      setElapsed(0);
      setExpanded(false);
      setVisible(true);
      const timer = window.setInterval(() => setElapsed(performance.now() - startRef.current), 100);
      return () => window.clearInterval(timer);
    }
    if (status === 'error') {
      setVisible(true);
      setExpanded(true);
      return;
    }
    if (status === 'done' || status === 'aborted') {
      const timer = window.setTimeout(() => {
        setVisible(false);
        setExpanded(false);
      }, 1800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [streaming, status]);

  const tone = streaming ? 'live' : status === 'error' ? 'error' : 'done';
  const label = streaming
    ? '正在生成'
    : status === 'error'
      ? '生成失败'
      : status === 'aborted'
        ? '已停止'
        : '已完成';

  return (
    <div
      className={cn('island', visible && 'is-visible', expanded && 'is-expanded', `is-${tone}`)}
      onClick={() => setExpanded((v) => !v)}
      role="status"
      aria-live="polite"
    >
      <div className="island-main">
        <span className="island-icon">
          {streaming ? <LoadingOutlined spin /> : status === 'error' ? <CloseCircleFilled /> : <CheckCircleFilled />}
        </span>
        <span className="island-label">{label}</span>
        <span className="island-time">
          {streaming ? formatMs(elapsed) : status === 'error' ? '' : formatMs(elapsed || metrics.ttftMs)}
        </span>
      </div>

      <div className="island-extra">
        <span>首字 {formatMs(metrics.ttftMs)}</span>
        <span>{metrics.chars} 字符</span>
        <span>{metrics.renders} 次渲染</span>
        {streaming ? (
          <button
            type="button"
            className="island-action"
            onClick={(event) => {
              event.stopPropagation();
              onStop();
            }}
          >
            <StopOutlined /> 停止
          </button>
        ) : status === 'error' ? (
          <button
            type="button"
            className="island-action"
            onClick={(event) => {
              event.stopPropagation();
              onRetry();
            }}
          >
            重试
          </button>
        ) : null}
      </div>

      {status === 'error' && error && <div className="island-error">{error.slice(0, 120)}</div>}
    </div>
  );
}
