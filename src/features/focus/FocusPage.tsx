import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Col, Empty, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import { PauseCircleOutlined, PlayCircleOutlined, RedoOutlined, CoffeeOutlined } from '@ant-design/icons';
import { Bars } from '@/components/charts';
import { useWorkspaceStore } from '@/features/workspace/store';
import { focusTrend, minutesOnDay, useFocusStore } from './store';

const FOCUS_MINUTES = 25;
const BREAK_MINUTES = 5;

type Mode = 'focus' | 'break';

function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.62);
  } catch {
    /* 浏览器不支持或被静音，忽略 */
  }
}

export function FocusPage() {
  const { sessions, add } = useFocusStore();
  const tasks = useWorkspaceStore((s) => s.tasks);
  const [mode, setMode] = useState<Mode>('focus');
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(FOCUS_MINUTES * 60);
  const [taskId, setTaskId] = useState<string | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const originalTitle = useRef(document.title);

  const total = mode === 'focus' ? FOCUS_MINUTES * 60 : BREAK_MINUTES * 60;

  const finish = useCallback(() => {
    setRunning(false);
    deadlineRef.current = null;
    setRemaining(0);
    beep();
    if (mode === 'focus') {
      add(FOCUS_MINUTES, taskId);
      setMode('break');
      setRemaining(BREAK_MINUTES * 60);
    } else {
      setMode('focus');
      setRemaining(FOCUS_MINUTES * 60);
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(mode === 'focus' ? '专注结束，休息 5 分钟' : '休息结束，继续加油');
    }
  }, [add, mode, taskId]);

  // 用「结束时间戳」而不是每秒减一：切到后台时 setInterval 会被节流，靠差值才不会走慢
  useEffect(() => {
    if (!running) return;
    if (deadlineRef.current === null) deadlineRef.current = Date.now() + remaining * 1000;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.round(((deadlineRef.current ?? 0) - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) finish();
    }, 250);
    return () => window.clearInterval(timer);
  }, [running, remaining, finish]);

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
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    setRunning(true);
  };

  const pause = () => {
    setRunning(false);
    deadlineRef.current = null;
  };

  const reset = () => {
    setRunning(false);
    deadlineRef.current = null;
    setRemaining(total);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setRunning(false);
    deadlineRef.current = null;
    setRemaining(next === 'focus' ? FOCUS_MINUTES * 60 : BREAK_MINUTES * 60);
  };

  const today = minutesOnDay(sessions, new Date());
  const trend = useMemo(() => focusTrend(sessions), [sessions]);
  const weekTotal = trend.reduce((sum, item) => sum + item.value, 0);
  const openTasks = tasks.filter((task) => task.status !== 'done');

  const progress = 1 - remaining / total;

  return (
    <div className="page">
      <div className="page-head">
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          专注计时
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          25 分钟专注 + 5 分钟休息。切到后台也不会走慢（用结束时间戳算差值），结束会响一声并写进统计。
        </Typography.Paragraph>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small" className="panel focus-card">
            <Space size={6} style={{ marginBottom: 18 }}>
              <Tag.CheckableTag checked={mode === 'focus'} onChange={() => switchMode('focus')}>
                <PlayCircleOutlined /> 专注 25 分钟
              </Tag.CheckableTag>
              <Tag.CheckableTag checked={mode === 'break'} onChange={() => switchMode('break')}>
                <CoffeeOutlined /> 休息 5 分钟
              </Tag.CheckableTag>
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
                {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}
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

            <div className="focus-task">
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                正在做
              </Typography.Text>
              <Select
                allowClear
                placeholder="选一个任务（可选）"
                style={{ width: 280, maxWidth: '100%' }}
                value={taskId ?? undefined}
                onChange={(value) => setTaskId(value ?? null)}
                options={openTasks.map((task) => ({ value: task.id, label: task.title }))}
              />
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
                      <span className="focus-log-task">{task?.title ?? '未关联任务'}</span>
                      <Tag color="green">{session.minutes} 分钟</Tag>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
