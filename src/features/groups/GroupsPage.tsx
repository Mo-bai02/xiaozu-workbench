import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { CopyOutlined, PlusOutlined, TeamOutlined, ThunderboltFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { AuroraBackground } from '@/components/AuroraBackground';
import { api } from '@/lib/http';
import { cstDayKey, formatCst } from '@/lib/time';
import { useAuthStore } from '@/store/auth';
import { useGroupStore, type GroupSummary } from '@/store/group';

interface AlertTask {
  id: string;
  title: string;
  dueAt: number | null;
  priority: 'low' | 'mid' | 'high';
  important: boolean;
  groupId: string;
  groupName: string;
  assignee: string | null;
  overdue: boolean;
  dueToday: boolean;
  read: boolean;
}

const ROLE_LABEL: Record<string, { text: string; color: string }> = {
  owner: { text: '创建者', color: 'gold' },
  admin: { text: '管理员', color: 'blue' },
  member: { text: '成员', color: 'default' },
};

export function groupLight(group: GroupSummary): { color: string; label: string } {
  if (group.overdue > 0) return { color: '#e5484d', label: `${group.overdue} 个逾期` };
  if (group.dueToday > 0) return { color: '#d4a72c', label: `今天到期 ${group.dueToday}` };
  if (group.openTasks > 0) return { color: '#2f9e63', label: '进行中' };
  return { color: '#c4ccd8', label: '暂无任务' };
}

export function GroupsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const groups = useGroupStore((s) => s.groups);
  const loading = useGroupStore((s) => s.loading);
  const loaded = useGroupStore((s) => s.loaded);
  const fetchGroups = useGroupStore((s) => s.fetchGroups);
  const createGroup = useGroupStore((s) => s.createGroup);
  const join = useGroupStore((s) => s.join);
  const setActive = useGroupStore((s) => s.setActive);

  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState<{ items: AlertTask[]; unread: number }>({ items: [], unread: 0 });
  const [alertOpen, setAlertOpen] = useState(false);
  const [form] = Form.useForm<{ name: string }>();
  const [joinForm] = Form.useForm<{ code: string }>();

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    let alive = true;
    void api<{ items: AlertTask[]; unread: number }>('/alerts')
      .then((data) => {
        if (!alive) return;
        setAlerts(data);
        const key = `ai-console:alerts-seen:${cstDayKey()}`;
        const seen = sessionStorage.getItem(key);
        if (!seen && data.items.length > 0) {
          setAlertOpen(true);
          sessionStorage.setItem(key, '1');
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const dueTasks = alerts.items.filter((item) => item.dueAt !== null);
  const starredTasks = alerts.items.filter((item) => item.important);
  const alertCount = alerts.items.length;

  const enter = (group: GroupSummary) => {
    setActive(group.id);
    navigate('/overview');
  };

  const submitCreate = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const group = await createGroup(values.name.trim());
      setCreating(false);
      form.resetFields();
      message.success(`已创建「${group.name}」`);
      navigate('/overview');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const submitJoin = async () => {
    const values = await joinForm.validateFields();
    setBusy(true);
    try {
      await join(values.code.trim());
      setJoining(false);
      joinForm.resetFields();
      message.success('已加入');
      navigate('/overview');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加入失败');
    } finally {
      setBusy(false);
    }
  };

  const alertList = useMemo(
    () => (
      <div className="alert-modal">
        <div className="alert-section">
          <div className="alert-section-title">
            <span className="alert-dot" style={{ background: '#e5484d' }} />
            今天到期与逾期
            <Tag bordered={false}>{dueTasks.length}</Tag>
          </div>
          {dueTasks.length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              没有今天到期的任务
            </Typography.Text>
          ) : (
            <ul className="alert-list">
              {dueTasks.map((task) => (
                <li key={task.id} onClick={() => void goTo(task)}>
                  <span className={task.overdue ? 'alert-flag is-overdue' : 'alert-flag'}>
                    {task.overdue ? '逾期' : '今天'}
                  </span>
                  <span className="alert-title">
                    {!task.read && <i className="alert-unread" />}
                    {task.title}
                  </span>
                  <span className="alert-meta">
                    {task.groupName}
                    {task.assignee ? ` · ${task.assignee}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="alert-section">
          <div className="alert-section-title">
            <span className="alert-dot" style={{ background: '#d4a72c' }} />
            我标记的重点
            <Tag bordered={false}>{starredTasks.length}</Tag>
          </div>
          {starredTasks.length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              还没有标记重点任务
            </Typography.Text>
          ) : (
            <ul className="alert-list">
              {starredTasks.map((task) => (
                <li key={task.id} onClick={() => void goTo(task)}>
                  <ThunderboltFilled className="alert-star" />
                  <span className="alert-title">{task.title}</span>
                  <span className="alert-meta">
                    {task.groupName}
                    {task.dueAt ? ` · ${formatCst(task.dueAt)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    ),
    [dueTasks, starredTasks],
  );

  const goTo = async (task: AlertTask) => {
    void api('/alerts/read', { method: 'POST', body: { ids: [task.id] } });
    setActive(task.groupId);
    setAlertOpen(false);
    navigate('/board');
  };

  const dismissAlerts = async () => {
    setAlertOpen(false);
    if (alerts.unread === 0) return;
    await api('/alerts/read', { method: 'POST', body: { all: true } });
    setAlerts((prev) => ({ items: prev.items.map((item) => ({ ...item, read: true })), unread: 0 }));
  };

  return (
    <div className="auth-page groups-page">
      <AuroraBackground />

      <div className="groups-head">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 2 }}>
            选择小组
          </Typography.Title>
          <Typography.Text type="secondary">
            {user ? `${user.displayName}，` : ''}每个小组数据独立
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            创建小组
          </Button>
          <Button type="primary" onClick={() => setJoining(true)}>
            用邀请码加入
          </Button>
        </Space>
      </div>

      {alertCount > 0 && (
        <button type="button" className="alert-banner" onClick={() => setAlertOpen(true)}>
          <span className="alert-banner-icon">
            <ThunderboltFilled />
          </span>
          <span className="alert-banner-text">
            你有 <b>{alertCount}</b> 条提醒：到期 {dueTasks.length} 条，重点 {starredTasks.length} 条
          </span>
          <span className="alert-banner-more">查看</span>
        </button>
      )}

      {loading && !loaded ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin />
        </div>
      ) : groups.length === 0 ? (
        <Card className="panel">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有加入任何小组">
            <Space>
              <Button type="primary" onClick={() => setCreating(true)}>
                创建一个
              </Button>
              <Button onClick={() => setJoining(true)}>用邀请码加入</Button>
            </Space>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[12, 12]}>
          {groups.map((group) => {
            const role = ROLE_LABEL[group.role] ?? { text: '成员', color: 'default' };
            const light = groupLight(group);
            return (
              <Col xs={24} sm={12} lg={8} key={group.id}>
                <Card hoverable className="group-card" onClick={() => enter(group)}>
                  <div className="group-card-head">
                    <span className="group-avatar">
                      <TeamOutlined />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="group-name">{group.name}</div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {group.memberCount} 人 · 完成 {group.doneCount}/{group.openTasks + group.doneCount}
                      </Typography.Text>
                    </div>
                    <Tag color={role.color}>{role.text}</Tag>
                  </div>

                  <div className="group-light-row">
                    <span className="group-light" style={{ background: light.color }} />
                    <span className="group-light-label" style={{ color: light.color }}>
                      {light.label}
                    </span>
                    <span className="group-counts">
                      待办 {group.openTasks - group.dueToday}
                      <i />
                      今日 {group.dueToday}
                      <i />
                      逾期 {group.overdue}
                      {group.starred > 0 && (
                        <>
                          <i />
                          <ThunderboltFilled style={{ color: '#d4a72c' }} /> {group.starred}
                        </>
                      )}
                    </span>
                  </div>

                  {group.role === 'owner' && (
                    <div
                      className="group-code"
                      onClick={(event) => {
                        event.stopPropagation();
                        void navigator.clipboard.writeText(group.inviteCode);
                        message.success('邀请码已复制');
                      }}
                    >
                      邀请码 {group.inviteCode} <CopyOutlined />
                    </div>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Modal
        open={alertOpen}
        title="今天的提醒"
        onCancel={() => setAlertOpen(false)}
        footer={
          <Button type="primary" onClick={() => void dismissAlerts()}>
            知道了
          </Button>
        }
        width={560}
      >
        {alertList}
      </Modal>

      <Modal
        open={creating}
        title="创建小组"
        okText="创建"
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => setCreating(false)}
        onOk={() => void submitCreate()}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="小组名称" rules={[{ required: true, message: '给小组起个名字' }]}>
            <Input placeholder="例如：毕设小组 / 摄影社" maxLength={30} showCount />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          新小组是空的，任务从零开始加。
        </Typography.Text>
      </Modal>

      <Modal
        open={joining}
        title="用邀请码加入"
        okText="加入"
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => setJoining(false)}
        onOk={() => void submitJoin()}
      >
        <Form form={joinForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="code" label="邀请码" rules={[{ required: true, message: '请输入邀请码' }]}>
            <Input placeholder="6 位字母数字" maxLength={12} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
