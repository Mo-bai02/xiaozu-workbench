import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Avatar,
  Button,
  Drawer,
  Empty,
  Grid,
  Input,
  Segmented,
  Space,
  Tooltip,
  Typography,
} from 'antd';
import {
  AudioOutlined,
  ClearOutlined,
  CopyOutlined,
  DownOutlined,
  DownloadOutlined,
  HistoryOutlined,
  ReloadOutlined,
  RobotOutlined,
  SendOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { DynamicIsland } from '@/components/DynamicIsland';
import { Markdown } from '@/components/Markdown';
import { SpeechRecognizer, speechSupported } from '@/lib/speech';
import { formatMs, formatNumber } from '@/lib/utils';
import { useSessionStore } from '@/store/sessions';
import { useChat, type ChatItem, type RenderStrategy } from './useChat';
import { SessionRail } from './SessionRail';

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
  const { messages, streaming, metrics, strategy, setStrategy, send, regenerate, stop, loadMessages } =
    useChat();

  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const createSession = useSessionStore((s) => s.create);
  const selectSession = useSessionStore((s) => s.select);
  const removeSession = useSessionStore((s) => s.remove);
  const updateMessages = useSessionStore((s) => s.updateMessages);

  const screens = Grid.useBreakpoint();
  const isNarrow = !screens.xl;
  const [railOpen, setRailOpen] = useState(false);
  const [input, setInput] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const { message } = AntdApp.useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const demoStarted = useRef(false);
  const booted = useRef(false);

  const activeSession = sessions.find((s) => s.id === activeId);
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastAssistantId = lastAssistant?.id;
  const lastContent = messages[messages.length - 1]?.content ?? '';

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const session = useSessionStore.getState().sessions.find((s) => s.id === useSessionStore.getState().activeId);
    if (session?.messages.length) loadMessages(session.messages);
  }, [loadMessages]);

  useEffect(() => {
    if (streaming || messages.length === 0) return;
    const timer = window.setTimeout(() => updateMessages(activeId, messages), 400);
    return () => window.clearTimeout(timer);
  }, [messages, streaming, activeId, updateMessages]);

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

  useEffect(() => {
    if (demoStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    const ask = params.get('ask');
    const demo = params.get('demo') === '1';
    if (!ask && !demo) return;
    demoStarted.current = true;
    window.history.replaceState({}, '', '/chat');
    void send(ask ?? 'SSE 流式渲染为什么要用 requestAnimationFrame 批量更新？');
  }, [send]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    pinnedRef.current = nearBottom;
    setAtBottom(nearBottom);
  };

  const startVoice = useCallback(() => {
    if (!speechSupported) {
      message.warning('当前浏览器不支持语音识别，推荐 Chrome 或 Edge');
      return;
    }
    if (!recognizerRef.current) {
      recognizerRef.current = new SpeechRecognizer({
        onFinal: (text) => {
          setInterim('');
          setInput((prev) => (prev ? `${prev}${text}` : text));
        },
        onInterim: setInterim,
        onError: (msg) => message.error(msg),
        onEnd: () => {
          setListening(false);
          setInterim('');
        },
      });
    }
    setListening(true);
    recognizerRef.current.start();
  }, [message]);

  const toggleVoice = () => {
    if (listening) {
      recognizerRef.current?.stop();
      setListening(false);
      setInterim('');
      return;
    }
    startVoice();
  };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('voice') !== '1') return;
    window.history.replaceState({}, '', '/chat');
    startVoice();
  }, [startVoice]);

  useEffect(() => () => recognizerRef.current?.stop(), []);

  const submit = () => {
    if (!input.trim() || streaming) return;
    void send(input);
    setInput('');
    pinnedRef.current = true;
    setAtBottom(true);
  };

  const switchTo = (id: string) => {
    if (id === activeId || streaming) return;
    updateMessages(activeId, messages);
    selectSession(id);
    const target = sessions.find((s) => s.id === id);
    loadMessages(target?.messages ?? []);
    setRailOpen(false);
  };

  const newChat = () => {
    if (streaming) return;
    updateMessages(activeId, messages);
    createSession();
    loadMessages([]);
    setRailOpen(false);
    setInput('');
  };

  const deleteChat = (id: string) => {
    const remaining = sessions.filter((s) => s.id !== id);
    const wasActive = id === activeId;
    removeSession(id);
    if (wasActive) loadMessages(remaining[0]?.messages ?? []);
  };

  const exportMarkdown = () => {
    if (messages.length === 0) return;
    const body = messages
      .map((m) => `## ${m.role === 'user' ? '我' : 'Assistant'}\n\n${m.content}`)
      .join('\n\n---\n\n');
    const markdown = `# ${activeSession?.title ?? '对话记录'}\n\n> 导出自 AI Console · ${new Date().toLocaleString('zh-CN')}\n\n${body}\n`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(activeSession?.title ?? '对话').replace(/[\\/:*?"<>|]/g, '_')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const rail = (
    <SessionRail disabled={streaming} onSwitch={switchTo} onNew={newChat} onDelete={deleteChat} />
  );

  return (
    <div className="chat-layout">
      {!isNarrow && rail}

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
            {isNarrow && (
              <Button size="small" icon={<HistoryOutlined />} onClick={() => setRailOpen(true)}>
                会话
              </Button>
            )}
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

          <Space size={8}>
            <Tooltip title="把当前对话导出为 Markdown 文件">
              <Button
                size="small"
                type="text"
                icon={<DownloadOutlined />}
                onClick={exportMarkdown}
                disabled={messages.length === 0}
              />
            </Tooltip>
            <Tooltip title="对比两种更新策略的提交次数">
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
          </Space>
        </div>

        <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    随便问点什么
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      左侧可以切换会话
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
          {interim && <div className="composer-interim">{interim}</div>}
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
            placeholder={listening ? '正在听…' : '输入问题，Enter 发送'}
            disabled={streaming}
            className="composer-input"
          />
          <Tooltip
            title={speechSupported ? (listening ? '停止录音' : '语音输入') : '当前浏览器不支持语音识别'}
          >
            <Button
              aria-label="语音输入"
              className={listening ? 'mic is-listening' : 'mic'}
              icon={<AudioOutlined />}
              onClick={toggleVoice}
              disabled={!speechSupported || streaming}
            />
          </Tooltip>
          {streaming ? (
            <Button danger icon={<StopOutlined />} onClick={stop}>
              停止
            </Button>
          ) : (
            <Button type="primary" icon={<SendOutlined />} onClick={submit} disabled={!input.trim()}>
              发送
            </Button>
          )}
          <Tooltip title="新建会话">
            <Button icon={<ClearOutlined />} onClick={newChat} disabled={streaming} />
          </Tooltip>
        </div>
      </div>

      <Drawer
        open={railOpen}
        onClose={() => setRailOpen(false)}
        placement="left"
        width={260}
        title="会话"
        styles={{ body: { padding: 0 } }}
      >
        {rail}
      </Drawer>
    </div>
  );
}
