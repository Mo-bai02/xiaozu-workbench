import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AutoComplete,
  Button,
  Card,
  Col,
  Empty,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import {
  BellOutlined,
  CoffeeOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { Bars } from '@/components/charts';
import { useWorkspaceStore } from '@/features/workspace/store';
import { focusTrend, minutesOnCstDay, useFocusStore } from './store';

type Mode = 'focus' | 'break';

const PRESETS = [15, 25, 45, 60];

function beep(times = 2): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    for (let i = 0; i < times; i += 1) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.value = i === 0 ? 880 : 660;
      const start = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      oscillator.start(start);
      oscillator.stop(start + 0.34);
    }
  } catch {
  }
}

function createTicker(onTick: () => void): () => void {
  try {
    const source = `let t=null;onmessage=function(e){if(e.data==='start'){if(t)clearInterval(t);t=setInterval(function(){postMessage('tick')},500)}else if(e.data==='stop'){clearInterval(t);t=null}}`;
    const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    worker.onmessage = () => onTick();
    worker.postMessage('start');
    return () => {
      worker.postMessage('stop');
      worker.terminate();
    };
  } catch {
    const timer = window.setInterval(onTick, 500);
    return () => window.clearInterval(timer);
  }
}

export function FocusPage() {
  const { sessions, load: loadSessions, add, focusMinutes, breakMinutes, setDurations } = useFocusStore();
  const tasks = useWorkspaceStore((s) => s.tasks);

  const [mode, setMode] = useState<Mode>('focus');
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(focusMinutes * 60);
  const [focusTarget, setFocusTarget] = useState('');
  const [ringing, setRinging] = useState(false);
  const [notifyState, setNotifyState] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  const deadlineRef = useRef<number | null>(null);
  const stopTickerRef = useRef<(() => void) | null>(null);
  const originalTitle = useRef(document.title);

  const total = (mode === 'focus' ? focusMinutes : breakMinutes) * 60;

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const notify = useCallback(
    (title: string, body: string) => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        new Notification(title, { body, tag: 'ai-console-focus' });
      } catch {
      }
    },
    [],
  );

  const targetTask = tasks.find((task) => task.title === focusTarget.trim()) ?? null;

  const finish = useCallback(() => {
    setRunning(false);
    setRinging(true);
    deadlineRef.current = null;
    setRemaining(0);
    beep(mode === 'focus' ? 2 : 1);

    if (mode === 'focus') {
      add(focusMinutes, targetTask?.id ?? null, targetTask ? undefined : focusTarget.trim() || undefined);
      notify('专注结束', `已完成 ${focusMinutes} 分钟`);
    } else {
      notify('休息结束', '休息时间到。');
    }
  }, [add, focusMinutes, focusTarget, mode, notify, targetTask]);

  const syncRemaining = useCallback(() => {
    if (deadlineRef.current === null) return;
    const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
    setRemaining(left);
    if (left <= 0) finish();
  }, [finish]);

  useEffect(() => {
    if (!running) {
      stopTickerRef.current?.();
      stopTickerRef.current = null;
      return;
    }
    deadlineRef.current = Date.now() + remaining * 1000;
    stopTickerRef.current = createTicker(syncRemaining);
    return () => {
      stopTickerRef.current?.();
      stopTickerRef.current = null;
    };
  }, [running]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && running) syncRemaining();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [running, syncRemaining]);

  useEffect(() => {
    if (running) {
      const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
      const ss = String(remaining % 60).padStart(2, '0');
      document.title = `${mm}:${ss} · ${mode === 'focus' ? '专注中' : '休息中'}`;
    } else {
      document.title = originalTitle.current;
    }
    return () => {
      document.title = originalTitle.current;
    };
  }, [running, remaining, mode]);

  const start = () => {
    if (notifyState === 'default') {
      void Notification.requestPermission().then((permission) => setNotifyState(permission));
    }
    setRinging(false);
    setRemaining(total);
    setRunning(true);
  };

  const pause = () => {
    setRunning(false);
    deadlineRef.current = null;
  };

  const reset = () => {
    setRunning(false);
    setRinging(false);
    deadlineRef.current = null;
    setRemaining(total);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setRunning(false);
    setRinging(false);
    deadlineRef.current = null;
    setRemaining((next === 'focus' ? focusMinutes : breakMinutes) * 60);
  };

  const changeFocusMinutes = (minutes: number) => {
    const value = Math.min(180, Math.max(1, Math.round(minutes)));
    setDurations(value, breakMinutes);
    if (!running && mode === 'focus') setRemaining(value * 60);
  };

  const today = minutesOnCstDay(sessions);
  const trend = useMemo(() => focusTrend(sessions), [sessions]);
  const weekTotal = trend.reduce((sum, item) => sum + item.value, 0);
  const openTasks = tasks.filter((task) => task.status !== 'done');
  const progress = total > 0 ? 1 - remaining / total : 0;

  return (
    <div className="page">
      <div className="page-head">
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          专注计时
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          只统计你自己的时间，到点弹窗提醒。
        </Typography.Paragraph>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small" className="panel focus-card">
            <Space size={6} style={{ marginBottom: 14 }} wrap>
              <Tag.CheckableTag checked={mode === 'focus'} onChange={() => switchMode('focus')}>
                <PlayCircleOutlined /> 专注
              </Tag.CheckableTag>
              <Tag.CheckableTag checked={mode === 'break'} onChange={() => switchMode('break')}>
                <CoffeeOutlined /> 休息
              </Tag.CheckableTag>
              <span className="focus-duration">
                专注
                <InputNumber
                  size="small"
                  min={1}
                  max={180}
                  value={focusMinutes}
                  onChange={(value) => changeFocusMinutes(Number(value) || 25)}
                  style={{ width: 62 }}
                  disabled={running}
                />
                分钟 · 休息
                <InputNumber
                  size="small"
                  min={1}
                  max={60}
                  value={breakMinutes}
                  onChange={(value) => setDurations(focusMinutes, Math.min(60, Math.max(1, Number(value) || 5)))}
                  style={{ width: 54 }}
                  disabled={running}
                />
                分钟
              </span>
            </Space>

            <div className="focus-ring">
              <svg viewBox="0 0 120 120" className="focus-ring-svg">
                <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="7" />
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke={mode === 'focus' ? 'var(--accent)' : '#0f9d58'}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 54}`}
                  strokeDashoffset={`${2 * Math.PI * 54 * (1 - progress)}`}
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dashoffset 0.3s linear' }}
                />
              </svg>
              <div className="focus-time">
                {String(Math.floor(remaining / 60)).padStart(2, '0')}:
                {String(remaining % 60).padStart(2, '0')}
                <span>{mode === 'focus' ? '专注中' : '休息中'}</span>
              </div>
            </div>

            <div className="focus-controls">
              {running ? (
                <Button size="large" icon={<PauseCircleOutlined />} onClick={pause}>
                  暂停
                </Button>
              ) : (
                <Button size="large" type="primary" icon={<PlayCircleOutlined />} onClick={start}>
                  开始
                </Button>
              )}
              <Button size="large" icon={<RedoOutlined />} onClick={reset}>
                重置
              </Button>
            </div>

            <Space size={6} wrap style={{ marginTop: 12 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                预设
              </Typography.Text>
              <Segmented
                size="small"
                value={PRESETS.includes(focusMinutes) ? focusMinutes : 'custom'}
                onChange={(value) => {
                  if (value === 'custom') return;
                  changeFocusMinutes(Number(value));
                }}
                options={[
                  ...PRESETS.map((minutes) => ({ label: `${minutes} 分`, value: minutes })),
                  ...(PRESETS.includes(focusMinutes) ? [] : [{ label: `${focusMinutes} 分`, value: 'custom' }]),
                ]}
              />
            </Space>

            <div className="focus-task">
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                正在做
              </Typography.Text>
              <AutoComplete
                allowClear
                value={focusTarget}
                onChange={(value) => setFocusTarget(value)}
                placeholder="选看板任务，或直接写"
                style={{ width: 280, maxWidth: '100%' }}
                options={openTasks.map((task) => ({ value: task.title }))}
                filterOption={(input, option) =>
                  String(option?.value ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </div>

            <div className="focus-notify">
              <BellOutlined />
              {notifyState === 'granted' && <span>桌面通知已开启</span>}
              {notifyState === 'default' && (
                <Button size="small" type="link" onClick={() => void Notification.requestPermission().then(setNotifyState)}>
                  开启桌面通知
                </Button>
              )}
              {notifyState === 'denied' && <span>通知已被拒绝，可在浏览器设置里开启</span>}
              {notifyState === 'unsupported' && <span>此浏览器不支持通知</span>}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card size="small" className="panel" title="专注统计">
            <Row gutter={12}>
              <Col span={12}>
                <Statistic title="今日" value={today} suffix="分钟" />
              </Col>
              <Col span={12}>
                <Statistic title="近 7 天" value={weekTotal} suffix="分钟" />
              </Col>
            </Row>
            <div style={{ marginTop: 16 }}>
              <Bars data={trend} height={130} color="#0f9d58" />
            </div>
          </Card>

          <Card size="small" className="panel" title="最近记录" style={{ marginTop: 12 }}>
            {sessions.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有记录" />
            ) : (
              <ul className="focus-log">
                {sessions.slice(0, 6).map((session) => {
                  const task = tasks.find((item) => item.id === session.taskId);
                  return (
                    <li key={session.id}>
                      <span className="focus-log-time">
                        {new Date(session.endedAt).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="focus-log-task">
                        {task?.title ?? session.taskLabel ?? '未关联任务'}
                      </span>
                      <Tag color="green">{session.minutes} 分钟</Tag>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        open={ringing}
        title={mode === 'focus' ? '专注结束' : '休息结束'}
        okText={mode === 'focus' ? '开始休息' : '再来一轮'}
        cancelText="先不用"
        onOk={() => {
          setRinging(false);
          if (mode === 'focus') switchMode('break');
          else switchMode('focus');
          setRunning(false);
        }}
        onCancel={() => {
          setRinging(false);
          setRemaining(total);
        }}
      >
        <p style={{ margin: '8px 0' }}>
          {mode === 'focus' ? `专注 ${focusMinutes} 分钟，结束。` : '休息结束。'}
        </p>
      </Modal>
    </div>
  );
}
