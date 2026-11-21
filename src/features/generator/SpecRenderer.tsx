import { useMemo } from 'react';
import {
  App,
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Switch,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UIField, UISpec } from './schema';

const FALLBACK_OPTIONS = ['选项 A', '选项 B'];

function Control({ field }: { field: UIField }) {
  switch (field.type) {
    case 'textarea':
      return <Input.TextArea rows={3} placeholder={field.placeholder} maxLength={500} showCount />;
    case 'number':
      return <InputNumber style={{ width: '100%' }} placeholder={field.placeholder} min={0} />;
    case 'select':
      return (
        <Select
          placeholder={field.placeholder ?? '请选择'}
          options={(field.options?.length ? field.options : FALLBACK_OPTIONS).map((value) => ({
            value,
            label: value,
          }))}
          allowClear
        />
      );
    case 'date':
      return <DatePicker style={{ width: '100%' }} placeholder={field.placeholder ?? '请选择日期'} />;
    case 'switch':
      return <Switch />;
    default:
      return <Input placeholder={field.placeholder} maxLength={60} />;
  }
}

function fakeRow(fields: UIField[], index: number): Record<string, unknown> {
  const row: Record<string, unknown> = { key: index };
  for (const field of fields) {
    switch (field.type) {
      case 'select':
        row[field.name] = (field.options ?? FALLBACK_OPTIONS)[index % (field.options?.length ?? 2)];
        break;
      case 'number':
        row[field.name] = 1280 + index * 731;
        break;
      case 'date':
        row[field.name] = `2026-0${(index % 9) + 1}-1${index % 9}`;
        break;
      case 'switch':
        row[field.name] = index % 2 === 0;
        break;
      default:
        row[field.name] =
          /no|编号|单号/i.test(field.name) || /号/.test(field.label)
            ? `SO2026${String(1001 + index)}`
            : `${field.label}${index + 1}`;
    }
  }
  return row;
}

export function SpecRenderer({ spec }: { spec: UISpec }) {
  const { message } = App.useApp();

  const columns = useMemo<ColumnsType<Record<string, unknown>>>(() => {
    const cols: ColumnsType<Record<string, unknown>> = spec.fields.map((field) => ({
      title: field.label,
      dataIndex: field.name,
      key: field.name,
      ellipsis: true,
      render: (value: unknown) => {
        if (typeof value === 'boolean') return value ? '是' : '否';
        return String(value ?? '—');
      },
    }));
    return cols;
  }, [spec.fields]);

  const dataSource = useMemo(
    () => Array.from({ length: 8 }, (_, index) => fakeRow(spec.fields, index)),
    [spec.fields],
  );

  return (
    <div className="spec-renderer">
      <div className="spec-head">
        <Typography.Title level={4} style={{ margin: 0 }}>
          {spec.title}
        </Typography.Title>
        {spec.description && (
          <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
            {spec.description}
          </Typography.Paragraph>
        )}
      </div>

      {spec.layout === 'table' ? (
        <Table
          size="middle"
          rowKey="key"
          columns={columns}
          dataSource={dataSource}
          pagination={{ pageSize: 5, size: 'small' }}
          scroll={{ x: 'max-content' }}
        />
      ) : (
        <Form
          layout="vertical"
          onFinish={(values) => {
            message.success(`提交成功：${JSON.stringify(values).slice(0, 80)}…`);
          }}
        >
          <Row gutter={[16, 0]}>
            {spec.fields.map((field) => (
              <Col xs={24} sm={field.span && field.span <= 12 ? 12 : 24} key={field.name}>
                <Form.Item
                  name={field.name}
                  label={field.label}
                  valuePropName={field.type === 'switch' ? 'checked' : 'value'}
                  rules={
                    field.required
                      ? [{ required: true, message: `请填写${field.label}` }]
                      : undefined
                  }
                >
                  <Control field={field} />
                </Form.Item>
              </Col>
            ))}
          </Row>
          <Button type="primary" htmlType="submit">
            {spec.submitText ?? '提交'}
          </Button>
        </Form>
      )}
    </div>
  );
}
