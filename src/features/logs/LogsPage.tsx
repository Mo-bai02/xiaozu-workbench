import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import { formatMs, formatNumber } from '@/lib/utils';

type Status = 'success' | 'failed' | 'running';
type Kind = 'chat' | 'ui';

interface LogRow {
  key: string;
  time: string;
  requestId: string;
  model: string;
  kind: Kind;
  promptTokens: number;
  completionTokens: number;
  latency: number;
  status: Status;
  error?: string;
  preview: string;
}

const MODELS = ['deepseek-chat', 'qwen-plus', 'glm-4-flash'];
const STATUS_TEXT: Record<Status, { text: string; badge: 'success' | 'error' | 'processing' }> = {
  success: { text: '成功', badge: 'success' },
  failed: { text: '失败', badge: 'error' },
  running: { text: '进行中', badge: 'processing' },
};

/** 固定的伪随机，保证每次刷新数据一致，便于对比截图 */
function seeded(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function buildRows(count = 26): LogRow[] {
  return Array.from({ length: count }, (_, index) => {
    const status: Status =
      seeded(index, 1) > 0.92 ? 'failed' : seeded(index, 2) > 0.88 ? 'running' : 'success';
    const kind: Kind = seeded(index, 3) > 0.65 ? 'ui' : 'chat';
    const day = 21 - (index % 3);
    const hour = 9 + (index % 10);
    const minute = Math.floor(seeded(index, 4) * 60);
    const model = MODELS[index % MODELS.length] ?? 'deepseek-chat';
    return {
      key: `req_${1000 + index}`,
      time: `2026-11-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      requestId: `req_${(1000 + index).toString(36)}${index}`,
      model,
      kind,
      promptTokens: 120 + Math.floor(seeded(index, 5) * 900),
      completionTokens: status === 'failed' ? 0 : 80 + Math.floor(seeded(index, 6) * 1200),
      latency: 420 + Math.floor(seeded(index, 7) * 4200),
      status,
      error: status === 'failed' ? 'upstream timeout after 30s' : undefined,
      preview:
        kind === 'ui'
          ? '生成「员工入职登记」表单，8 个字段，schema 校验通过'
          : '解释 SSE 分包处理与 rAF 批量渲染的取舍',
    } satisfies LogRow;
  });
}

const COLUMNS: ColumnsType<LogRow> = [
  { title: '时间', dataIndex: 'time', width: 150, sorter: (a, b) => a.time.localeCompare(b.time) },
  {
    title: '请求 ID',
    dataIndex: 'requestId',
    width: 130,
    render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
  },
  { title: '模型', dataIndex: 'model', width: 140 },
  {
    title: '类型',
    dataIndex: 'kind',
    width: 100,
    filters: [
      { text: '对话', value: 'chat' },
      { text: '生成 UI', value: 'ui' },
    ],
    onFilter: (value, row) => row.kind === value,
    render: (value: Kind) => <Tag color={value === 'chat' ? 'blue' : 'purple'}>{value === 'chat' ? '对话' : '生成 UI'}</Tag>,
  },
  {
    title: 'Tokens',
    dataIndex: 'completionTokens',
    width: 120,
    align: 'right',
    sorter: (a, b) => a.completionTokens - b.completionTokens,
    render: (value: number, row) => `${formatNumber(row.promptTokens)} → ${formatNumber(value)}`,
  },
  {
    title: '延迟',
    dataIndex: 'latency',
    width: 110,
    align: 'right',
    sorter: (a, b) => a.latency - b.latency,
    render: (value: number) => formatMs(value),
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 100,
    filters: Object.entries(STATUS_TEXT).map(([value, item]) => ({ text: item.text, value })),
    onFilter: (value, row) => row.status === value,
    render: (value: Status) => <Badge status={STATUS_TEXT[value].badge} text={STATUS_TEXT[value].text} />,
  },
];

export function LogsPage() {
  const allRows = useMemo(() => buildRows(), []);
  const [keyword, setKeyword] = useState('');
  const [model, setModel] = useState<string | undefined>(undefined);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [active, setActive] = useState<LogRow | null>(null);
  const [refreshAt, setRefreshAt] = useState(() => Date.now());

  const rows = useMemo(() => {
    const lower = keyword.trim().toLowerCase();
    return allRows.filter((row) => {
      if (model && row.model !== model) return false;
      if (onlyFailed && row.status !== 'failed') return false;
      if (!lower) return true;
      return (
        row.requestId.toLowerCase().includes(lower) ||
        row.preview.toLowerCase().includes(lower) ||
        row.model.toLowerCase().includes(lower)
      );
    });
  }, [allRows, keyword, model, onlyFailed]);

  const stats = useMemo(() => {
    const success = rows.filter((row) => row.status === 'success').length;
    const totalTokens = rows.reduce((sum, row) => sum + row.promptTokens + row.completionTokens, 0);
    const avgLatency = rows.length ? rows.reduce((sum, row) => sum + row.latency, 0) / rows.length : 0;
    return {
      calls: rows.length,
      rate: rows.length ? Math.round((success / rows.length) * 1000) / 10 : 0,
      tokens: totalTokens,
      avgLatency,
    };
  }, [rows]);

  return (
    <div className="page">
      <div className="page-head">
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          调用日志
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          一个后台列表页该有的东西：筛选、排序、分页、状态标签、详情抽屉。
        </Typography.Paragraph>
      </div>

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
            <Statistic title="平均延迟" value={Math.round(stats.avgLatency)} suffix="ms" />
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
              placeholder="搜索请求 ID / 模型 / 内容"
              style={{ width: 260 }}
              onSearch={setKeyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select
              allowClear
              placeholder="全部模型"
              style={{ width: 170 }}
              value={model}
              onChange={setModel}
              options={MODELS.map((item) => ({ value: item, label: item }))}
            />
            <DatePicker.RangePicker style={{ width: 240 }} disabled placeholder={['开始日期', '结束日期']} />
            <Tag.CheckableTag checked={onlyFailed} onChange={setOnlyFailed}>
              只看失败
            </Tag.CheckableTag>
          </Space>
          <Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(refreshAt).toLocaleTimeString('zh-CN')} 更新
            </Typography.Text>
            <Button icon={<ReloadOutlined />} onClick={() => setRefreshAt(Date.now())}>
              刷新
            </Button>
          </Space>
        </div>

        <Table<LogRow>
          rowKey="key"
          size="middle"
          columns={COLUMNS}
          dataSource={rows}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
          onRow={(row) => ({
            onClick: () => setActive(row),
            style: { cursor: 'pointer' },
          })}
        />
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
              <Descriptions.Item label="请求 ID">{active.requestId}</Descriptions.Item>
              <Descriptions.Item label="时间">{active.time}</Descriptions.Item>
              <Descriptions.Item label="模型">{active.model}</Descriptions.Item>
              <Descriptions.Item label="类型">{active.kind === 'chat' ? '对话' : '生成 UI'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge status={STATUS_TEXT[active.status].badge} text={STATUS_TEXT[active.status].text} />
              </Descriptions.Item>
              <Descriptions.Item label="Token">
                {formatNumber(active.promptTokens)} → {formatNumber(active.completionTokens)}
              </Descriptions.Item>
              <Descriptions.Item label="延迟">{formatMs(active.latency)}</Descriptions.Item>
              <Descriptions.Item label="成本估算">
                ¥{(((active.promptTokens + active.completionTokens) / 1000) * 0.002).toFixed(4)}
              </Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5} style={{ marginTop: 20 }}>
              内容摘要
            </Typography.Title>
            <pre className="code-block">{active.preview}</pre>

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
