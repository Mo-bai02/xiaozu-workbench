import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ClearOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { clearLogs, fetchLogs, type LogEntry } from '@/lib/api';
import { formatMs, formatNumber } from '@/lib/utils';

type Status = LogEntry['status'];

const STATUS_TEXT: Record<Status, { text: string; badge: 'success' | 'error' }> = {
  success: { text: '成功', badge: 'success' },
  failed: { text: '失败', badge: 'error' },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function LogsPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [model, setModel] = useState<string | undefined>(undefined);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [active, setActive] = useState<LogEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await fetchLogs());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const modelOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const log of logs) seen.set(log.model, log.modelLabel || log.model);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [logs]);

  const rows = useMemo(() => {
    const lower = keyword.trim().toLowerCase();
    return logs.filter((log) => {
      if (model && log.model !== model) return false;
      if (onlyFailed && log.status !== 'failed') return false;
      if (!lower) return true;
      return (
        log.id.toLowerCase().includes(lower) ||
        log.question.toLowerCase().includes(lower) ||
        log.model.toLowerCase().includes(lower)
      );
    });
  }, [logs, keyword, model, onlyFailed]);

  const stats = useMemo(() => {
    const success = rows.filter((log) => log.status === 'success').length;
    const tokens = rows.reduce((sum, log) => sum + log.promptTokens + log.completionTokens, 0);
    const avg = rows.length ? rows.reduce((sum, log) => sum + log.latency, 0) / rows.length : 0;
    return {
      calls: rows.length,
      rate: rows.length ? Math.round((success / rows.length) * 1000) / 10 : 0,
      tokens,
      avg,
    };
  }, [rows]);

  const columns: ColumnsType<LogEntry> = [
    { title: '时间', dataIndex: 'time', width: 140, render: (value: number) => formatTime(value) },
    {
      title: '请求 ID',
      dataIndex: 'id',
      width: 150,
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: '模型',
      dataIndex: 'modelLabel',
      width: 140,
      render: (value: string, row) => (
        <span>
          {value}
          {row.model !== value && row.model !== 'mock' ? (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {' '}
              {row.model}
            </Typography.Text>
          ) : null}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'kind',
      width: 96,
      filters: [
        { text: '对话', value: 'chat' },
        { text: '生成 UI', value: 'ui' },
      ],
      onFilter: (value, row) => row.kind === value,
      render: (value: LogEntry['kind']) => (
        <Tag color={value === 'chat' ? 'blue' : 'purple'}>{value === 'chat' ? '对话' : '生成 UI'}</Tag>
      ),
    },
    {
      title: 'Tokens',
      dataIndex: 'completionTokens',
      width: 130,
      align: 'right',
      sorter: (a, b) => a.completionTokens - b.completionTokens,
      render: (_: number, row) =>
        `${formatNumber(row.promptTokens)} → ${formatNumber(row.completionTokens)}`,
    },
    {
      title: '延迟',
      dataIndex: 'latency',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.latency - b.latency,
      render: (value: number) => formatMs(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      filters: Object.entries(STATUS_TEXT).map(([value, item]) => ({ text: item.text, value })),
      onFilter: (value, row) => row.status === value,
      render: (value: Status) => <Badge status={STATUS_TEXT[value].badge} text={STATUS_TEXT[value].text} />,
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          调用日志
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          只显示你自己的调用记录。
        </Typography.Paragraph>
      </div>

      {error && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="加载失败" description={error} />}

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="调用次数" value={stats.calls} suffix="次" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="成功率" value={stats.rate} precision={1} suffix="%" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="平均延迟" value={Math.round(stats.avg)} suffix="ms" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Token 消耗" value={formatNumber(stats.tokens)} />
          </Card>
        </Col>
      </Row>

      <Card className="panel" style={{ marginTop: 16 }}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="搜索请求 ID / 内容"
              style={{ width: 240 }}
              onSearch={setKeyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select
              allowClear
              placeholder="全部模型"
              style={{ width: 170 }}
              value={model}
              onChange={setModel}
              options={modelOptions}
            />
            <Tag.CheckableTag checked={onlyFailed} onChange={setOnlyFailed}>
              只看失败
            </Tag.CheckableTag>
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              刷新
            </Button>
            <Popconfirm
              title="清空你的调用记录？"
              description="只影响你自己，不影响其他访客"
              okText="清空"
              cancelText="取消"
              onConfirm={async () => {
                await clearLogs();
                await load();
              }}
            >
              <Button danger icon={<ClearOutlined />} disabled={logs.length === 0}>
                清空
              </Button>
            </Popconfirm>
          </Space>
        </div>

        {loading && logs.length === 0 ? (
          <div className="center-box">
            <Spin />
          </div>
        ) : rows.length === 0 ? (
          <Empty
            description={logs.length === 0 ? '还没有调用记录' : '没有符合条件的记录'}
            style={{ padding: '40px 0' }}
          >
            <Button type="primary" onClick={() => navigate('/chat')}>
              去对话页问一句
            </Button>
          </Empty>
        ) : (
          <Table<LogEntry>
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={rows}
            scroll={{ x: 900 }}
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
            onRow={(row) => ({
              onClick: () => setActive(row),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </Card>

      <Drawer
        open={Boolean(active)}
        width={520}
        onClose={() => setActive(null)}
        title="请求详情"
        styles={{ body: { paddingTop: 12 } }}
      >
        {active && (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="请求 ID">{active.id}</Descriptions.Item>
              <Descriptions.Item label="时间">{formatTime(active.time)}</Descriptions.Item>
              <Descriptions.Item label="模型">{active.modelLabel || active.model}</Descriptions.Item>
              <Descriptions.Item label="类型">{active.kind === 'chat' ? '对话' : '生成 UI'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge status={STATUS_TEXT[active.status].badge} text={STATUS_TEXT[active.status].text} />
              </Descriptions.Item>
              <Descriptions.Item label="Token">
                {formatNumber(active.promptTokens)} → {formatNumber(active.completionTokens)}
              </Descriptions.Item>
              <Descriptions.Item label="延迟">{formatMs(active.latency)}</Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5} style={{ marginTop: 20 }}>
              提问
            </Typography.Title>
            <pre className="code-block">{active.question || '—'}</pre>

            {active.answer && (
              <>
                <Typography.Title level={5}>回答（截断）</Typography.Title>
                <pre className="code-block">{active.answer}</pre>
              </>
            )}

            {active.error && (
              <>
                <Typography.Title level={5}>错误信息</Typography.Title>
                <pre className="code-block error">{active.error}</pre>
              </>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
