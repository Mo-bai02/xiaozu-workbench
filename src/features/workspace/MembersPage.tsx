import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CopyOutlined, CrownOutlined, DeleteOutlined } from '@ant-design/icons';
import { formatCst } from '@/lib/time';
import { useGroupStore } from '@/store/group';
import { useWorkspaceStore, type Member } from './store';

const ROLE_META: Record<string, { text: string; color: string }> = {
  owner: { text: '创建者', color: 'gold' },
  admin: { text: '管理员', color: 'blue' },
  member: { text: '成员', color: 'default' },
};

export function MembersPage() {
  const members = useWorkspaceStore((s) => s.members);
  const removeMembers = useWorkspaceStore((s) => s.removeMembers);
  const setMemberRole = useWorkspaceStore((s) => s.setMemberRole);
  const activeGroup = useGroupStore((s) => s.active());
  const myRole = activeGroup?.role ?? 'member';
  const isOwner = myRole === 'owner';
  const canManage = myRole === 'owner' || myRole === 'admin';

  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelected([]);
  }, [activeGroup?.id]);

  const rows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (member) =>
        member.displayName.toLowerCase().includes(q) || member.username.toLowerCase().includes(q),
    );
  }, [members, keyword]);

  const copyCode = () => {
    if (!activeGroup) return;
    void navigator.clipboard.writeText(activeGroup.inviteCode);
    message.success('邀请码已复制');
  };

  const changeRole = async (member: Member, role: 'admin' | 'member') => {
    setBusy(true);
    try {
      await setMemberRole(member.id, role);
      message.success(role === 'admin' ? '已设为管理员' : '已取消管理员');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ids: string[]) => {
    setBusy(true);
    try {
      await removeMembers(ids);
      setSelected([]);
      message.success('已移除');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '移除失败');
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<Member> = [
    {
      title: '成员',
      dataIndex: 'displayName',
      render: (_: unknown, member) => (
        <Space size={8}>
          <Avatar size={28} style={{ background: member.role === 'owner' ? '#d4a72c' : 'var(--accent)' }}>
            {member.displayName.slice(0, 1)}
          </Avatar>
          <div>
            <div style={{ fontWeight: 500 }}>
              {member.displayName}
              {member.role === 'owner' && (
                <CrownOutlined style={{ marginLeft: 6, color: '#d4a72c', fontSize: 12 }} />
              )}
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
              @{member.username}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 150,
      render: (role: string, member) => {
        if (isOwner && member.role !== 'owner') {
          return (
            <Select
              size="small"
              value={role}
              disabled={busy}
              style={{ width: 108 }}
              onChange={(value) => void changeRole(member, value as 'admin' | 'member')}
              options={[
                { value: 'admin', label: '管理员' },
                { value: 'member', label: '成员' },
              ]}
            />
          );
        }
        const meta = ROLE_META[role] ?? { text: '成员', color: 'default' };
        return <Tag color={meta.color}>{meta.text}</Tag>;
      },
    },
    {
      title: '在办任务',
      dataIndex: 'openTasks',
      width: 96,
      align: 'right',
      sorter: (a, b) => a.openTasks - b.openTasks,
      render: (value: number) => <Tag color={value > 0 ? 'blue' : 'default'}>{value} 个</Tag>,
    },
    {
      title: '加入时间',
      dataIndex: 'joinedAt',
      width: 110,
      render: (value: number) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {formatCst(value)}
        </Typography.Text>
      ),
    },
  ];

  if (canManage) {
    columns.push({
      title: '操作',
      width: 80,
      render: (_: unknown, member) => {
        if (member.role === 'owner') {
          return (
            <Tooltip title="创建者不能被移除">
              <Button size="small" type="text" icon={<DeleteOutlined />} disabled />
            </Tooltip>
          );
        }
        if (member.role === 'admin' && !isOwner) {
          return (
            <Tooltip title="只有创建者可以移除管理员">
              <Button size="small" type="text" icon={<DeleteOutlined />} disabled />
            </Tooltip>
          );
        }
        return (
          <Popconfirm
            title={`移除 ${member.displayName}？`}
            description="TA 名下的任务会变成未指派"
            okText="移除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => void remove([member.id])}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        );
      },
    });
  }

  return (
    <div className="page">
      <div className="page-head row-between">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            成员管理
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {canManage
              ? isOwner ? '你可以任命管理员、移除成员。' : '你可以移除成员。'
              : '只有创建者和管理员可以改成员。'}
          </Typography.Paragraph>
        </div>
        <Space wrap>
          {canManage && activeGroup && (
            <Button icon={<CopyOutlined />} onClick={copyCode}>
              邀请码 {activeGroup.inviteCode}
            </Button>
          )}
          {!canManage && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              需要拉人进来，找管理员要邀请码
            </Typography.Text>
          )}
          {canManage && selected.length > 0 && (
            <Popconfirm
              title={`移除选中的 ${selected.length} 人？`}
              okText="移除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => void remove(selected)}
            >
              <Button danger loading={busy}>
                批量移除（{selected.length}）
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      {!canManage && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="只有创建者和管理员可以改成员"
        />
      )}

      <Card size="small" className="panel">
        <Space style={{ marginBottom: 12 }} wrap>
          <Input.Search
            allowClear
            placeholder="搜索昵称 / 用户名"
            style={{ width: 240 }}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            共 {members.length} 人
          </Typography.Text>
        </Space>

        <Table<Member>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={rows}
          pagination={false}
          rowSelection={
            canManage
              ? {
                  selectedRowKeys: selected,
                  onChange: (keys) => setSelected(keys as string[]),
                  getCheckboxProps: (member) => ({ disabled: member.role === 'owner' }),
                }
              : undefined
          }
          scroll={{ x: 720 }}
        />
      </Card>
    </div>
  );
}
