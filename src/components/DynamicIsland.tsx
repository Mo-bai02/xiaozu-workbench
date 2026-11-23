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
