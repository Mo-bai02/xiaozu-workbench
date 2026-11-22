import { useEffect, useState } from 'react';
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
import { CopyOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { useGroupStore, type GroupSummary } from '@/store/group';

const ROLE_LABEL: Record<string, { text: string; color: string }> = {
  owner: { text: '创建者', color: 'gold' },
  admin: { text: '管理员', color: 'blue' },
  member: { text: '成员', color: 'default' },
};

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
  const [form] = Form.useForm<{ name: string }>();
  const [joinForm] = Form.useForm<{ code: string }>();

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

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

  return (
    <div className="auth-page groups-page">
      <div className="groups-head">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 2 }}>
            选择小组
          </Typography.Title>
          <Typography.Text type="secondary">
            {user ? `${user.displayName}，` : ''}数据按小组隔离，可以同时加入多个。
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

      {loading && !loaded ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin />
        </div>
      ) : groups.length === 0 ? (
        <Card className="panel">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有加入任何小组"
          >
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
            return (
              <Col xs={24} sm={12} lg={8} key={group.id}>
                <Card
                  hoverable
                  className="group-card"
                  onClick={() => enter(group)}
                >
                  <div className="group-card-head">
                    <span className="group-avatar">
                      <TeamOutlined />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="group-name">{group.name}</div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {group.memberCount} 人 · {group.openTasks} 个进行中
                      </Typography.Text>
                    </div>
                    <Tag color={role.color}>{role.text}</Tag>
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
          创建后你是创建者，可以任命管理员。
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
