import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Popconfirm, Row, Space, Statistic, Tag, Typography, message } from 'antd';
import { DeleteOutlined, DownloadOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { clearAll, downloadBackup, formatBytes, importBackup, storageUsage } from '@/lib/backup';
import { useNotesStore } from '@/features/notes/store';
import { useExpenseStore } from '@/features/expenses/store';
import { useFocusStore } from '@/features/focus/store';
import { useWorkspaceStore } from '@/features/workspace/store';
import { useAuthStore } from '@/store/auth';
import { useGroupStore } from '@/store/group';

export function SettingsPage() {
  const [usage, setUsage] = useState(() => storageUsage());
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const notes = useNotesStore((s) => s.notes);
  const loadNotes = useNotesStore((s) => s.load);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const notesCount = notes.length;
  const expensesCount = useExpenseStore((s) => s.expenses.length);
  const sessionsCount = useFocusStore((s) => s.sessions.length);
  const tasksCount = useWorkspaceStore((s) => s.tasks.length);
  const user = useAuthStore((s) => s.user);
  const groups = useGroupStore((s) => s.groups);

  const onImport = async (file: File) => {
    setImporting(true);
    try {
      const result = await importBackup(file);
      message.success(`已导入 ${result.keys} 项数据，正在刷新…`);
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          设置与数据
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          数据在服务端，登录状态在本机。
        </Typography.Paragraph>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small" className="panel" title="账号信息">
            <Space direction="vertical" size={4} style={{ fontSize: 13 }}>
              <span>
                用户名 <b>@{user?.username}</b> · 昵称 <b>{user?.displayName}</b>
              </span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                换设备登录即可看到。
              </Typography.Text>
            </Space>
          </Card>

          <Card size="small" className="panel" title="本机配置导出" style={{ marginTop: 12 }}>
            <Space wrap>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={() => {
                  downloadBackup();
                  message.success('已导出 JSON 备份');
                }}
              >
                导出全部数据
              </Button>
              <Button icon={<UploadOutlined />} loading={importing} onClick={() => fileRef.current?.click()}>
                从备份导入
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onImport(file);
                  event.target.value = '';
                }}
              />
            </Space>

            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message="只包含本机偏好"
              description="主题、模型、专注时长。任务和笔记不在这里。"
            />
          </Card>

          <Card size="small" className="panel" title="当前数据量" style={{ marginTop: 12 }}>
            <Row gutter={12}>
              <Col span={8}>
                <Statistic title="任务" value={tasksCount} suffix="个" />
              </Col>
              <Col span={8}>
                <Statistic title="笔记" value={notesCount} suffix="条" />
              </Col>
              <Col span={8}>
                <Statistic title="账目" value={expensesCount} suffix="笔" />
              </Col>
              <Col span={8} style={{ marginTop: 12 }}>
                <Statistic title="专注记录" value={sessionsCount} suffix="次" />
              </Col>
              <Col span={8} style={{ marginTop: 12 }}>
                <Statistic title="小组" value={groups.length} suffix="个" />
              </Col>
              <Col span={8} style={{ marginTop: 12 }}>
                <Statistic title="本机占用" value={formatBytes(usage.bytes)} />
              </Col>
            </Row>
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined />}
              style={{ marginTop: 8 }}
              onClick={() => setUsage(storageUsage())}
            >
              刷新统计
            </Button>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card size="small" className="panel" title="危险操作">
            <Typography.Paragraph type="secondary" style={{ fontSize: 12.5 }}>
              清掉登录状态和本机偏好。
            </Typography.Paragraph>
            <Popconfirm
              title="确定清空全部本地数据？"
              description="建议先导出一份备份"
              okText="清空并刷新"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => {
                clearAll();
                window.location.href = '/login';
              }}
            >
              <Button danger icon={<DeleteOutlined />}>
                退出并清空本机缓存
              </Button>
            </Popconfirm>
          </Card>

          <Card size="small" className="panel" title="关于" style={{ marginTop: 12 }}>
            <Space direction="vertical" size={6} style={{ fontSize: 12.5 }}>
              <span>
                <Tag color="blue">v1.1</Tag> 10 个模块 · React 18 + TS + Vite + antd
              </span>
              <Typography.Text type="secondary">
                分享链接在服务重启后失效。
              </Typography.Text>
              <Typography.Text type="secondary">
                模型 Key 只在服务端。
              </Typography.Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
