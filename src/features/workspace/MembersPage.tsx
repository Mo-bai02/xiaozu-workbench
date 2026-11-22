import { useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { useWorkspaceStore } from './store';
import type { Member } from './types';

interface FormValues {
  name: string;
  role: string;
  email: string;
  status: Member['status'];
}

export function MembersPage() {
  const { members, tasks, addMember, updateMember, removeMembers } = useWorkspaceStore();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'all' | Member['status']>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const [form] = Form.useForm<FormValues>();

  const loadOf = useMemo(() => {
    const map: Record<string, number> = {};
    for (const task of tasks) {
      if (task.assigneeId && task.status !== 'done') map[task.assigneeId] = (map[task.assigneeId] ?? 0) + 1;
    }
    return map;
  }, [tasks]);

  const rows = useMemo(() => {
    const lower = keyword.trim().toLowerCase();
    return members.filter((member) => {
      if (status !== 'all' && member.status !== status) return false;
      if (!lower) return true;
      return (
        member.name.toLowerCase().includes(lower) ||
        member.role.toLowerCase().includes(lower) ||
        member.email.toLowerCase().includes(lower)
      );
    });
  }, [members, keyword, status]);

  const openNew = () => {
    setEditing('new');
    form.setFieldsValue({ name: '', role: '', email: '', status: 'active' });
  };

  const openEdit = (member: Member) => {
    setEditing(member);
    form.setFieldsValue(member);
  };

  const submit = async () => {
    const values = await form.validateFields();
    if (editing === 'new') addMember(values);
    else if (editing) updateMember(editing.id, values);
    setEditing(null);
  };

  const columns: ColumnsType<Member> = [
    {
      title: '成员',
      dataIndex: 'name',
      render: (name: string, member) => (
        <Space>
          <Avatar size={28} style={{ background: 'var(--accent)', fontSize: 12 }}>
            {name.slice(0, 1)}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600 }}>{name}</div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {member.email}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    { title: '角色', dataIndex: 'role', width: 130 },
    {
      title: '在办任务',
      width: 110,
      align: 'right',
      sorter: (a, b) => (loadOf[a.id] ?? 0) - (loadOf[b.id] ?? 0),
      render: (_: unknown, member) => {
        const count = loadOf[member.id] ?? 0;
        return count > 3 ? <Tag color="red">{count} 项</Tag> : <Tag>{count} 项</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      filters: [
        { text: '在线', value: 'active' },
        { text: '离开', value: 'away' },
      ],
      onFilter: (value, member) => member.status === value,
      render: (value: Member['status']) => (
        <Badge status={value === 'active' ? 'success' : 'default'} text={value === 'active' ? '在线' : '离开'} />
      ),
    },
    {
      title: '加入时间',
      dataIndex: 'joinedAt',
      width: 130,
      sorter: (a, b) => a.joinedAt - b.joinedAt,
      render: (value: number) => new Date(value).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作',
      width: 130,
      render: (_: unknown, member) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => openEdit(member)}>
            编辑
          </Button>
          <Popconfirm
            title="移除该成员？"
            description="TA 名下未完成的任务会变成「未指派」"
            okText="移除"
            cancelText="取消"
            onConfirm={() => removeMembers([member.id])}
          >
            <Button size="small" type="link" danger>
              移除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          成员管理
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          移除成员后，TA 的任务会变成未指派。
        </Typography.Paragraph>
      </div>

      <Card className="panel">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="搜索姓名 / 角色 / 邮箱"
              style={{ width: 240 }}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select
              value={status}
              onChange={setStatus}
              style={{ width: 120 }}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'active', label: '在线' },
                { value: 'away', label: '离开' },
              ]}
            />
            {selected.length > 0 && (
              <Popconfirm
                title={`移除选中的 ${selected.length} 人？`}
                okText="移除"
                cancelText="取消"
                onConfirm={() => {
                  removeMembers(selected);
                  setSelected([]);
                }}
              >
                <Button danger icon={<DeleteOutlined />}>
                  批量移除（{selected.length}）
                </Button>
              </Popconfirm>
            )}
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
            新增成员
          </Button>
        </div>

        <Table<Member>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={rows}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys as string[]),
          }}
          pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 人` }}
          scroll={{ x: 820 }}
        />
      </Card>

      <Modal
        open={editing !== null}
        title={editing === 'new' ? '新增成员' : '编辑成员'}
        okText="保存"
        cancelText="取消"
        onCancel={() => setEditing(null)}
        onOk={() => void submit()}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input maxLength={20} prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请输入角色' }]}>
            <Input maxLength={20} placeholder="如：前端开发" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不对' },
            ]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: 'active', label: '在线' },
                { value: 'away', label: '离开' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
