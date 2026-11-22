import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Donut } from '@/components/charts';
import { useAuthStore } from '@/store/auth';
import { useWorkspaceStore } from '@/features/workspace/store';
import { useExpenseStore } from './store';
import { categoryTotals, memberSummary, settle, yuan, type Expense } from './settle';

const CATEGORIES = ['餐饮', '交通', '采购', '场地', '其他'];
const ALL = 'ALL';

interface FormValues {
  amount: number;
  category: string;
  note: string;
  payerId: string;
  sharedBy: string[];
  date: dayjs.Dayjs;
}

export function ExpensesPage() {
  const { expenses, load: loadExpenses, add, remove } = useExpenseStore();
  const me = useAuthStore((s) => s.user);
  const members = useWorkspaceStore((s) => s.members);
  const [month, setMonth] = useState(() => dayjs());
  const [category, setCategory] = useState<string>(ALL);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const nameOf = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member.displayName])),
    [members],
  );

  // 账目由服务端按北京时间的自然月返回，这里只负责切换月份时重新拉
  useEffect(() => {
    void loadExpenses(month.format('YYYY-MM'));
  }, [loadExpenses, month]);

  const inMonth = expenses;

  const rows = useMemo(
    () => (category === ALL ? inMonth : inMonth.filter((expense) => expense.category === category)),
    [inMonth, category],
  );

  const total = inMonth.reduce((sum, expense) => sum + expense.amount, 0);
  const mine = useMemo(() => memberSummary(inMonth, me?.id ?? ''), [inMonth, me?.id]);
  const transfers = useMemo(
    () => settle(inMonth, members.map((member) => member.id)),
    [inMonth, members],
  );
  const slices = useMemo(() => categoryTotals(inMonth), [inMonth]);

  const openModal = () => {
    form.setFieldsValue({
      amount: 0,
      category: '餐饮',
      note: '',
      payerId: 'm1',
      sharedBy: members.map((member) => member.id),
      date: dayjs(),
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    add({
      amount: Math.round(values.amount * 100),
      category: values.category,
      note: values.note ?? '',
      payerId: values.payerId,
      sharedBy: values.sharedBy,
      date: values.date.valueOf(),
    });
    setOpen(false);
  };

  const columns: ColumnsType<Expense> = [
    {
      title: '日期',
      dataIndex: 'date',
      width: 86,
      render: (value: number) => dayjs(value).format('MM-DD'),
      sorter: (a, b) => a.date - b.date,
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 78,
      filters: CATEGORIES.map((item) => ({ text: item, value: item })),
      onFilter: (value, record) => record.category === value,
      render: (value: string) => <Tag>{value}</Tag>,
    },
    { title: '说明', dataIndex: 'note', ellipsis: true },
    {
      title: '垫付',
      dataIndex: 'payerId',
      width: 100,
      render: (value: string) => (
        <Space size={6}>
          <Avatar size={20} style={{ background: 'var(--accent)', fontSize: 10 }}>
            {nameOf[value]?.slice(0, 1) ?? '?'}
          </Avatar>
          {nameOf[value] ?? '未知'}
        </Space>
      ),
    },
    {
      title: '分摊',
      dataIndex: 'sharedBy',
      width: 62,
      render: (value: string[]) => `${value.length} 人`,
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 88,
      align: 'right',
      sorter: (a, b) => a.amount - b.amount,
      render: (value: number) => <b>{yuan(value)}</b>,
    },
    {
      title: '',
      width: 50,
      render: (_: unknown, record) => (
        <Popconfirm title="删除这笔？" okText="删除" cancelText="取消" onConfirm={() => remove(record.id)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-head row-between">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            经费账本
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            记完自动算出谁该转给谁。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <DatePicker picker="month" value={month} onChange={(value) => value && setMonth(value)} allowClear={false} />
          <Select
            value={category}
            onChange={setCategory}
            style={{ width: 110 }}
            options={[{ value: ALL, label: '全部分类' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>
            记一笔
          </Button>
        </Space>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={12} md={8}>
          <Card size="small">
            <Statistic title={`${month.format('M')} 月支出`} value={total / 100} precision={2} prefix="¥" />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card size="small">
            <Statistic title="我垫付" value={mine.paid / 100} precision={2} prefix="¥" />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic
              title="我应分摊"
              value={mine.owed / 100}
              precision={2}
              prefix="¥"
              suffix={<Typography.Text type="secondary" style={{ fontSize: 12 }}>（结算差额见右）</Typography.Text>}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={14}>
          <Card size="small" className="panel" title="账目明细" extra={<Tag>{rows.length} 笔</Tag>}>
            {rows.length === 0 ? (
              <Empty description="这个月还没有账目" style={{ padding: '30px 0' }}>
                <Button type="primary" onClick={openModal}>
                  记第一笔
                </Button>
              </Empty>
            ) : (
              <Table<Expense>
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={rows}
                pagination={{ pageSize: 6, showSizeChanger: false }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            size="small"
            className="panel"
            title="AA 结算建议"
            extra={<SwapOutlined />}
          >
            {transfers.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无需转账" />
            ) : (
              <ul className="settle-list">
                {transfers.map((transfer, index) => (
                  <li key={`${transfer.from}-${transfer.to}-${index}`}>
                    <span className="settle-from">{nameOf[transfer.from] ?? '?'}</span>
                    <span className="settle-arrow">→</span>
                    <span className="settle-to">{nameOf[transfer.to] ?? '?'}</span>
                    <b>{yuan(transfer.amount)}</b>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card size="small" className="panel" title="分类占比" style={{ marginTop: 12 }}>
            {slices.length ? (
              <Donut data={slices} centerLabel="本月" centerValue={`¥${(total / 100).toFixed(0)}`} />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        open={open}
        title="记一笔"
        okText="保存"
        cancelText="取消"
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="amount" label="金额（元）" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} prefix="¥" />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Select options={CATEGORIES.map((item) => ({ value: item, label: item }))} />
          </Form.Item>
          <Form.Item name="note" label="说明">
            <Input maxLength={40} placeholder="例如：打印答辩海报" />
          </Form.Item>
          <Form.Item name="payerId" label="谁垫的钱" rules={[{ required: true }]}>
            <Select
              options={members.map((member) => ({ value: member.id, label: member.displayName }))}
            />
          </Form.Item>
          <Form.Item name="sharedBy" label="谁一起分摊" rules={[{ required: true, message: '至少选一个人' }]}>
            <Select
              mode="multiple"
              allowClear
              options={members.map((member) => ({ value: member.id, label: member.displayName }))}
            />
          </Form.Item>
          <Form.Item name="date" label="日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
