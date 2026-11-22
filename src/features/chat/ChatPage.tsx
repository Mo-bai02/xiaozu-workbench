import { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Button, Empty, Input, Segmented, Space, Tooltip, Typography } from 'antd';
import {
  ClearOutlined,
  CopyOutlined,
  DownOutlined,
  ReloadOutlined,
  RobotOutlined,
  SendOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { DynamicIsland } from '@/components/DynamicIsland';
import { FloatingBall } from '@/components/FloatingBall';
import { Markdown } from '@/components/Markdown';
import { formatMs, formatNumber } from '@/lib/utils';
import { useUIStore } from '@/store/ui';
import { useChat, type ChatItem, type RenderStrategy } from './useChat';

const SUGGESTIONS = [
  '用 React 写一个防抖 hook，并说明常见的坑',
  '对比几种前端动画方案的首屏体积',
  'SSE 流式渲染为什么要用 requestAnimationFrame 批量更新？',
];

interface BubbleProps {
  item: ChatItem;
  isLast: boolean;
  onRegenerate: () => void;
}

function Bubble({ item, isLast, onRegenerate }: BubbleProps) {
  const isUser = item.role === 'user';
  const streaming = item.status === 'streaming';
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={isUser ? 'msg msg-user' : 'msg msg-ai'}>
      <Avatar
        size={30}
        className="msg-avatar"
        icon={isUser ? <UserOutlined /> : <RobotOutlined />}
        style={isUser ? undefined : { background: 'var(--accent)' }}
      />
      <div className="msg-body">
        <div className="msg-meta">
          <span>{isUser ? '我' : 'Assistant'}</span>
          {item.stats && item.status === 'done' && (
            <span className="msg-stats">
              首字 {formatMs(item.stats.ttftMs)} · {item.stats.chunks} 块 ·{' '}
              {formatNumber(item.stats.usage?.completionTokens ?? 0)} tokens
            </span>
          )}
          {item.status === 'aborted' && <span className="msg-stats">已停止</span>}
        </div>

        {isUser ? (
          <div className="msg-text">{item.content}</div>
        ) : (
          <Markdown source={item.content} streaming={streaming} />
        )}

        {streaming && item.content === '' && (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        )}

        {item.status === 'error' && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 8 }}
            message="生成失败"
            description={item.error ?? '请检查网络或后端服务'}
          />
        )}

        {!isUser && !streaming && item.content && (
          <div className="msg-actions">
            <button type="button" onClick={copy}>
              <CopyOutlined /> {copied ? '已复制' : '复制'}
            </button>
            {isLast && (
              <button type="button" onClick={onRegenerate}>
                <ReloadOutlined /> 重新生成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatPage() {
  const { messages, streaming, metrics, strategy, setStrategy, send, regenerate, stop, clear } = useChat();
  const [input, setInput] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const demoStarted = useRef(false);
  const toggleDark = useUIStore((s) => s.toggleDark);

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastAssistantId = lastAssistant?.id;
  const lastContent = messages[messages.length - 1]?.content ?? '';

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    pinnedRef.current = true;
    setAtBottom(true);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lastContent, messages.length]);

  // ?demo=1：打开即自动跑一段回答，方便录屏 / 截图 / 面试演示
  useEffect(() => {
    if (demoStarted.current) return;
    if (new URLSearchParams(window.location.search).get('demo') !== '1') return;
    demoStarted.current = true;
    void send('SSE 流式渲染为什么要用 requestAnimationFrame 批量更新？');
  }, [send]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    pinnedRef.current = nearBottom;
    setAtBottom(nearBottom);
  };

  const submit = () => {
    if (!input.trim() || streaming) return;
    void send(input);
    setInput('');
    pinnedRef.current = true;
    setAtBottom(true);
  };

  return (
    <div className="chat-page">
      <DynamicIsland
        streaming={streaming}
        status={lastAssistant?.status}
        metrics={metrics}
        error={lastAssistant?.error}
        onStop={stop}
        onRetry={regenerate}
      />

      <div className="metrics-bar">
        <Space size={8} wrap>
          <span className="metric">
            <ThunderboltOutlined /> 首字延迟 <b>{formatMs(metrics.ttftMs)}</b>
          </span>
          <span className="metric">
            字符 <b>{formatNumber(metrics.chars)}</b>
          </span>
          <span className="metric">
            React 渲染 <b>{formatNumber(metrics.renders)}</b> 次
          </span>
        </Space>

        <Tooltip title="同一个回答，两种更新策略的渲染次数对比。逐 token 模式会明显更卡。">
          <Segmented
            size="small"
            value={strategy}
            onChange={(value) => setStrategy(value as RenderStrategy)}
            options={[
              { label: 'rAF 批量', value: 'raf' },
              { label: '逐 token', value: 'per-token' },
            ]}
          />
        </Tooltip>
      </div>

      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span>
                  问点什么吧 —— 回答会流式输出，顶部胶囊会实时告诉你进度
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    右下角悬浮球可以拖动，点开有快捷操作
                  </Typography.Text>
                </span>
              }
            />
            <div className="suggestions">
              {SUGGESTIONS.map((text) => (
                <button key={text} type="button" className="suggestion" onClick={() => void send(text)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="msg-list">
            {messages.map((item) => (
              <Bubble
                key={item.id}
                item={item}
                isLast={item.id === lastAssistantId}
                onRegenerate={regenerate}
              />
            ))}
          </div>
        )}
      </div>

      {!atBottom && messages.length > 0 && (
        <button type="button" className="to-bottom" onClick={() => scrollToBottom()}>
          <DownOutlined /> 最新
        </button>
      )}

      <div className="composer">
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          autoSize={{ minRows: 1, maxRows: 5 }}
          placeholder="输入问题，Enter 发送"
          disabled={streaming}
          className="composer-input"
        />
        {streaming ? (
          <Button danger icon={<StopOutlined />} onClick={stop}>
            停止
          </Button>
        ) : (
          <Button type="primary" icon={<SendOutlined />} onClick={submit} disabled={!input.trim()}>
            发送
          </Button>
        )}
        <Tooltip title="清空对话">
          <Button icon={<ClearOutlined />} onClick={clear} disabled={streaming || messages.length === 0} />
        </Tooltip>
      </div>

      <FloatingBall
        onNewChat={clear}
        onScrollBottom={() => scrollToBottom()}
        onToggleTheme={toggleDark}
      />
    </div>
  );
}
