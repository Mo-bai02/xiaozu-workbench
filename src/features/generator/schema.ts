import { z } from 'zod';

import { apiFetch } from '@/lib/api';

/**
 * 生成式 UI 的「契约」。
 *
 * 大模型不能直接产出 React 组件（不可信、不可控、没法审计），
 * 只能产出这份 JSON Schema —— 前端校验通过后才渲染。
 * 这样即使模型胡说，最坏结果是"渲染失败"，而不是"执行了任意代码"。
 */
export const fieldTypeSchema = z.enum(['input', 'textarea', 'number', 'select', 'date', 'switch']);

export const uiFieldSchema = z.object({
  name: z.string().min(1).max(40),
  label: z.string().min(1).max(40),
  type: fieldTypeSchema,
  required: z.boolean().optional(),
  placeholder: z.string().max(80).optional(),
  options: z.array(z.string().max(40)).max(20).optional(),
  span: z.number().int().min(1).max(24).optional(),
});

export const uiSpecSchema = z.object({
  title: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  layout: z.enum(['form', 'table']),
  fields: z.array(uiFieldSchema).min(1).max(12),
  submitText: z.string().max(20).optional(),
});

export type UIField = z.infer<typeof uiFieldSchema>;
export type UISpec = z.infer<typeof uiSpecSchema>;

export interface ValidationResult {
  ok: boolean;
  spec?: UISpec;
  error?: string;
}

export function validateSpec(input: unknown): ValidationResult {
  const parsed = uiSpecSchema.safeParse(input);
  if (parsed.success) return { ok: true, spec: parsed.data };
  const error = parsed.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'root'} → ${issue.message}`)
    .join('；');
  return { ok: false, error };
}

const RULES: Array<{ test: RegExp; spec: UISpec }> = [
  {
    test: /员工|入职|人事|花名册/,
    spec: {
      title: '员工入职登记',
      description: '根据自然语言描述自动生成的表单，字段类型由模型推断',
      layout: 'form',
      submitText: '提交入职信息',
      fields: [
        { name: 'name', label: '姓名', type: 'input', required: true, placeholder: '请输入真实姓名', span: 12 },
        { name: 'employeeNo', label: '工号', type: 'input', required: true, span: 12 },
        {
          name: 'department',
          label: '所属部门',
          type: 'select',
          required: true,
          options: ['研发中心', '产品设计部', '市场部', '职能中心'],
          span: 12,
        },
        { name: 'position', label: '岗位', type: 'input', span: 12 },
        { name: 'joinDate', label: '入职日期', type: 'date', required: true, span: 12 },
        { name: 'salary', label: '月薪（元）', type: 'number', span: 12 },
        { name: 'remote', label: '是否远程办公', type: 'switch', span: 12 },
        { name: 'note', label: '备注', type: 'textarea', span: 24, placeholder: '特殊约定、设备需求等' },
      ],
    },
  },
  {
    test: /订单|列表|查询|筛选|报表/,
    spec: {
      title: '订单查询结果',
      description: '模型识别出这是「列表查询」意图，于是产出表格结构',
      layout: 'table',
      fields: [
        { name: 'orderNo', label: '订单号', type: 'input' },
        { name: 'customer', label: '客户', type: 'input' },
        {
          name: 'status',
          label: '状态',
          type: 'select',
          options: ['待付款', '已付款', '已发货', '已完成', '已取消'],
        },
        { name: 'amount', label: '金额（元）', type: 'number' },
        { name: 'createdAt', label: '下单时间', type: 'date' },
      ],
    },
  },
  {
    test: /报销|审批|申请|费用/,
    spec: {
      title: '费用报销申请',
      description: '根据描述生成的多字段表单，含必填校验',
      layout: 'form',
      submitText: '提交审批',
      fields: [
        { name: 'applicant', label: '申请人', type: 'input', required: true, span: 12 },
        { name: 'amount', label: '报销金额（元）', type: 'number', required: true, span: 12 },
        {
          name: 'category',
          label: '费用类型',
          type: 'select',
          required: true,
          options: ['差旅费', '办公用品', '业务招待', '培训费'],
          span: 12,
        },
        { name: 'occurredAt', label: '发生日期', type: 'date', required: true, span: 12 },
        { name: 'reason', label: '事由', type: 'textarea', required: true, span: 24 },
      ],
    },
  },
];

const FALLBACK: UISpec = {
  title: '通用信息登记',
  description: '未识别到具体业务关键词，给出一个通用表单',
  layout: 'form',
  submitText: '提交',
  fields: [
    { name: 'title', label: '标题', type: 'input', required: true, span: 24 },
    { name: 'owner', label: '负责人', type: 'input', span: 12 },
    { name: 'deadline', label: '截止日期', type: 'date', span: 12 },
    { name: 'detail', label: '详细说明', type: 'textarea', span: 24 },
  ],
};

export function mockSpec(prompt: string): UISpec {
  return RULES.find((rule) => rule.test.test(prompt))?.spec ?? FALLBACK;
}

/** 请求服务端生成 Schema：真模型或 mock 由服务端决定，前端只负责校验。 */
export async function generateSpec(prompt: string, signal?: AbortSignal, model?: string): Promise<UISpec> {
  const response = await apiFetch('/generate/ui', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model }),
    signal,
  });
  if (!response.ok) throw new Error(`生成失败：${response.status}`);

  // 服务端外层包了 { schema, mock, model }，这里兼容两种形状
  const raw = (await response.json()) as unknown;
  const payload = raw as { schema?: unknown } | null;
  const result = validateSpec(payload?.schema ?? raw);
  if (!result.ok || !result.spec) throw new Error(`模型返回的 Schema 不合法：${result.error}`);
  return result.spec;
}
