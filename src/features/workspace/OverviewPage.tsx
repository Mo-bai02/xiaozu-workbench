import { useMemo } from 'react';
import { Avatar, Button, Card, Col, Row, Space, Tag, Typography } from 'antd';
import {
  ArrowUpOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  FieldTimeOutlined,
  RobotOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Bars, Donut } from '@/components/charts';
import { completionTrend, useWorkspaceStore } from './store';
import { useNotesStore } from '@/features/notes/store';
import { useExpenseStore } from '@/features/expenses/store';
import { minutesOnDay, useFocusStore } from '@/features/focus/store';
import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_LABEL } from './types';

const DAY = 86_400_000;

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / DAY)} 天前`;
}

export function OverviewPage() {
  const navigate = useNavigate();
  const { tasks, members, activities } = useWorkspaceStore();
  const notes = useNotesStore((s) => s.notes);
  const expenses = useExpenseStore((s) => s.expenses);
  const focusSessions = useFocusStore((s) => s.sessions);

  const stats = useMemo(() => {
    const done = tasks.filter((task) => task.status === 'done').length;
    const doing = tasks.filter((task) => task.status === 'doing').length;
    const overdue = tasks.filter(
      (task) => task.status !== 'done' && task.dueAt !== null && task.dueAt < Date.now(),
    ).length;
    return {
      total: tasks.length,
      done,
      doing,
      overdue,
      rate: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    };
  }, [tasks]);

  const trend = useMemo(() => completionTrend(tasks, 7), [tasks]);
  const todayFocus = useMemo(() => minutesOnDay(focusSessions, new Date()), [focusSessions]);
  const monthSpend = useMemo(() => {
    const now = new Date();
    return expenses
      .filter((expense) => {
        const d = new Date(expense.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, expense) => sum + expense.amount, 0);
  }, [expenses]);

  const statusSlices = useMemo(
    () => [
      { label: STATUS_LABEL.done, value: stats.done, color: '#0f9d58' },
      { label: STATUS_LABEL.doing, value: stats.doing, color: '#3b6ef6' },
      { label: STATUS_LABEL.todo, value: stats.total - stats.done - stats.doing, color: '#d4a72c' },
    ],
    [stats],
  );

  const workload = useMemo(
    () =>
      members
        .map((member) => ({
          member,
          count: tasks.filter((task) => task.assigneeId === member.id && task.status !== 'done').length,
        }))
        .sort((a, b) => b.count - a.count),
    [members, tasks],
  );

  const maxLoad = Math.max(1, ...workload.map((item) => item.count));

  const askAi = () => {
    const doing = tasks.filter((task) => task.status === 'doing').map((task) => task.title);
    const done = tasks.filter((task) => task.status === 'done').map((task) => task.title);
    const prompt = [
      '你是项目助理，请根据下面的任务数据写一份本周进展周报，包含：整体进度、风险点、下周计划。',
      '',
      `进行中：${doing.join('、') || '无'}`,
      `已完成：${done.slice(0, 6).join('、') || '无'}`,
      `逾期：${stats.overdue} 个`,
      `完成率：${stats.rate}%`,
    ].join('\n');
    navigate(`/chat?ask=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="page">
      <div className="page-head row-between">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            项目概览
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            「工作台」示例项目 · 数据存在浏览器本地，可直接编辑
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<RobotOutlined />} onClick={askAi}>
          让 AI 写周报
        </Button>
      </div>

      <Row gutter={[12, 12]}>
        {[
          { title: '任务总数', value: stats.total, suffix: '个', icon: <ClockCircleOutlined />, tone: '' },
          { title: '完成率', value: stats.rate, suffix: '%', icon: <ArrowUpOutlined />, tone: 'green' },
          { title: '已逾期', value: stats.overdue, suffix: '个', icon: <WarningOutlined />, tone: 'red' },
          { title: '今日专注', value: todayFocus, suffix: '分钟', icon: <FieldTimeOutlined />, tone: 'blue' },
          { title: '本月支出', value: (monthSpend / 100).toFixed(2), suffix: '元', icon: <WalletOutlined />, tone: '' },
          { title: '笔记', value: notes.length, suffix: '篇', icon: <FileTextOutlined />, tone: '' },
        ].map((item) => (
          <Col xs={12} sm={8} lg={4} key={item.title}>
            <Card size="small" className="stat-card" data-tone={item.tone}>
              <div className="stat-head">
                <span className="stat-title">{item.title}</span>
                <span className="stat-icon">{item.icon}</span>
              </div>
              <div className="stat-value">
                {item.value}
                <em>{item.suffix}</em>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={14}>
          <Card size="small" className="panel" title="近 7 天完成情况" extra={<Tag>个 / 天</Tag>}>
            <Bars data={trend} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" className="panel" title="任务状态分布">
            <Donut data={statusSlices} centerLabel="任务" />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={14}>
          <Card size="small" className="panel" title="成员负载" extra={<Tag>{members.length} 人</Tag>}>
            <ul className="workload">
              {workload.map(({ member, count }) => (
                <li key={member.id}>
                  <Avatar size={26} style={{ background: 'var(--accent)', fontSize: 12 }}>
                    {member.name.slice(0, 1)}
                  </Avatar>
                  <div className="workload-main">
                    <div className="workload-top">
                      <span>{member.name}</span>
                      <span className="muted">{member.role}</span>
                      <b>{count} 项</b>
                    </div>
                    <div className="workload-bar">
                      <span style={{ width: `${(count / maxLoad) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            size="small"
            className="panel"
            title="最近动态"
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                共 {activities.length} 条
              </Typography.Text>
            }
          >
            <ul className="activity">
              {activities.slice(0, 6).map((activity) => (
                <li key={activity.id}>
                  <CheckCircleOutlined className="activity-icon" />
                  <div>
                    <div className="activity-line">
                      <b>{activity.actor}</b> {activity.action} <span>{activity.target}</span>
                    </div>
                    <div className="activity-time">{relativeTime(activity.time)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </Col>
      </Row>

      <Card size="small" className="panel" style={{ marginTop: 12 }} title="即将到期">
        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          {tasks
            .filter((task) => task.status !== 'done' && task.dueAt)
            .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
            .slice(0, 4)
            .map((task) => (
              <div key={task.id} className="due-row">
                <Tag color={PRIORITY_COLOR[task.priority]}>{PRIORITY_LABEL[task.priority]}</Tag>
                <span className="due-title">{task.title}</span>
                <span className="due-date">
                  {task.dueAt ? new Date(task.dueAt).toLocaleDateString('zh-CN') : '—'}
                </span>
              </div>
            ))}
        </Space>
      </Card>
    </div>
  );
}
