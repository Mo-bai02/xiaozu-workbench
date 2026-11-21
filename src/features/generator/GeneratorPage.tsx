import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Empty,
  Input,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { CodeOutlined, ExperimentOutlined } from '@ant-design/icons';
import { env } from '@/env';
import { formatMs } from '@/lib/utils';
import { SpecRenderer } from './SpecRenderer';
import { generateSpec, type UISpec } from './schema';

const EXAMPLES = [
  '做一个员工入职登记表，要有部门下拉、入职日期和是否远程办公',
  '订单列表查询页，能按状态筛选',
  '费用报销申请单',
];

export function GeneratorPage() {
  const [prompt, setPrompt] = useState(EXAMPLES[0] ?? '');
  const [loading, setLoading] = useState(false);
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const demoStarted = useRef(false);

  const run = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const result = await generateSpec(prompt);
      setSpec(result);
      setElapsed(performance.now() - startedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // ?demo=1：演示模式下自动生成一次，方便截图与录屏
  useEffect(() => {
    if (demoStarted.current) return;
    if (new URLSearchParams(window.location.search).get('demo') !== '1') return;
    demoStarted.current = true;
    void run();
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          生成式 UI
        </Typography.Title>        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          模型不生成组件代码，只生成一份受约束的 UI Schema；前端用 zod 校验通过后才渲染。
          这样模型再离谱，最坏结果也只是"渲染失败"，而不是"执行了任意代码"。
        </Typography.Paragraph>
      </div>

      <Card className="panel">
        <Space.Compact style={{ width: '100%' }}>
          <Input.TextArea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder="用一句话描述你想要的表单或列表"
          />
        </Space.Compact>

        <div className="row-between" style={{ marginTop: 12 }}>
          <Space wrap>
            {EXAMPLES.map((example) => (
              <Tag.CheckableTag key={example} checked={prompt === example} onChange={() => setPrompt(example)}>
                {example}
              </Tag.CheckableTag>
            ))}
          </Space>
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            loading={loading}
            onClick={() => void run()}
            disabled={!prompt.trim()}
          >
            生成界面
          </Button>
        </div>
      </Card>

      {error && <Alert type="error" showIcon style={{ marginTop: 16 }} message="生成失败" description={error} />}

      <Card className="panel" style={{ marginTop: 16 }}>
        {loading ? (
          <div className="center-box">
            <Spin tip="模型正在推断字段与类型…" />
          </div>
        ) : spec ? (
          <>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <Space size={8} wrap>
                <Tag color="blue">{spec.layout === 'form' ? '表单' : '表格'}</Tag>
                <Tag>{spec.fields.length} 个字段</Tag>
                <Tag color="default">耗时 {formatMs(elapsed)}</Tag>
                <Tag color={env.useMock ? 'gold' : 'green'}>{env.useMock ? 'MOCK' : 'LIVE'}</Tag>
              </Space>
              <Collapse
                ghost
                size="small"
                items={[
                  {
                    key: 'json',
                    label: (
                      <span>
                        <CodeOutlined /> 查看模型返回的 Schema
                      </span>
                    ),
                    children: (
                      <pre className="code-block">{JSON.stringify(spec, null, 2)}</pre>
                    ),
                  },
                ]}
              />
            </div>
            <SpecRenderer spec={spec} />
          </>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="输入一句描述，模型会生成一份可直接使用的表单或表格"
          />
        )}
      </Card>
    </div>
  );
}
