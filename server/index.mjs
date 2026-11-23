/**
 * 本地 API 服务（零依赖）。
 *
 * 能力：
 * 1. 模型注册表：多供应商、多模型，按有没有 Key 决定下拉里显示哪些；
 * 2. 有 Key 转发真实接口，没有则内置 mock（仍然真 SSE 推流）；
 * 3. 生成式 UI：让模型产出 UI Schema，前端负责校验与渲染；
 * 4. 调用日志：按访客隔离 —— 同一个页面被内网穿透给别人用，他们只看到自己的记录。
 *
 * API Key 只存在于服务端进程，永远不会进浏览器。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAppApi } from './app-api.mjs';
import { clearLogs, insertLog, listLogs, sessionUser } from './db.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 8787);

const PROVIDERS = {
  deepseek: {
    base: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    key: process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY || '',
    name: 'DeepSeek',
  },
  siliconflow: {
    base: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    key: process.env.SILICONFLOW_API_KEY || '',
    name: '硅基流动',
  },
  zhipu: {
    base: process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
    key: process.env.ZHIPU_API_KEY || '',
    name: '智谱',
  },
  dashscope: {
    base: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    key: process.env.DASHSCOPE_API_KEY || '',
    name: '阿里百炼',
  },
  ark: {
    base: process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    key: process.env.ARK_API_KEY || '',
    name: '火山方舟',
  },
};

const MODELS = [
  { id: 'deepseek-chat', label: 'DeepSeek V3', provider: 'deepseek', free: false, note: '通用对话，便宜' },
  { id: 'deepseek-reasoner', label: 'DeepSeek R1', provider: 'deepseek', free: false, note: '推理型，慢' },
  { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5 7B', provider: 'siliconflow', free: true, note: '硅基流动免费额度' },
  { id: 'THUDM/glm-4-9b-chat', label: 'GLM-4 9B', provider: 'siliconflow', free: true, note: '硅基流动免费额度' },
  { id: 'glm-4-flash', label: 'GLM-4 Flash', provider: 'zhipu', free: true, note: '智谱免费额度' },
  { id: 'qwen-turbo', label: 'Qwen Turbo', provider: 'dashscope', free: true, note: '百炼免费额度' },
  { id: 'qwen-plus', label: 'Qwen Plus', provider: 'dashscope', free: true, note: '百炼免费额度，效果更好' },
  { id: 'qwen-max', label: 'Qwen Max', provider: 'dashscope', free: false, note: '百炼旗舰，较贵' },
  { id: 'qwen-long', label: 'Qwen Long', provider: 'dashscope', free: true, note: '长文本，百炼免费额度' },
  { id: 'doubao-1-5-pro-32k-250115', label: '豆包 Pro 32K', provider: 'ark', free: true, note: '火山方舟免费额度' },
];

const MOCK_MODEL = { id: 'mock', label: '内置模拟', provider: 'mock', free: true, note: '无需 Key' };

function availableModels() {
  const list = MODELS.filter((m) => PROVIDERS[m.provider]?.key);
  return list.length ? list : [MOCK_MODEL];
}

function resolveModel(modelId) {
  const list = availableModels();
  return list.find((m) => m.id === modelId) ?? list[0] ?? MOCK_MODEL;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Visitor-Id',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// 访客隔离：日志按 X-Visitor-Id 分组，互不可见
// ---------------------------------------------------------------------------
const MAX_LOGS_PER_VISITOR = 100;
/** 分享出去的笔记：只读、凭链接访问。内存存储，重启清空。 */
const shares = new Map();
// 日志改为落到 SQLite，按用户存；这里只保留最近一次写入的兜底缓存
const logsFallback = new Map();

/** 访客 id 由前端 localStorage 生成；伪造别人的 id 理论上能看到别人的日志，所以这不是鉴权 */
function getVisitor(req) {
  const raw = String(req.headers['x-visitor-id'] ?? '').trim();
  if (/^[a-zA-Z0-9_-]{8,64}$/.test(raw)) return raw;
  return 'anonymous';
}

function recordLog(visitorId, entry, req) {
  // 登录用户写库；拿不到用户时退回内存（比如未登录的匿名调用）
  const user = req ? sessionUser(tokenOfRequest(req)) : null;
  if (user) {
    try {
      insertLog(user.id, entry);
      return;
    } catch (error) {
      console.error('[log] 写库失败，退回内存:', error.message);
    }
  }
  const list = logsFallback.get(visitorId) ?? [];
  list.unshift(entry);
  if (list.length > MAX_LOGS_PER_VISITOR) list.length = MAX_LOGS_PER_VISITOR;
  logsFallback.set(visitorId, list);
}

function tokenOfRequest(req) {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

// 简单的滑动窗口限流：内网穿透后是公网，防止别人拿你的 Key 刷
const RATE_WINDOW = 60_000;
const RATE_MAX = 30;
const buckets = new Map();

function allowRequest(visitorId) {
  const now = Date.now();
  const bucket = buckets.get(visitorId);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(visitorId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (bucket.count >= RATE_MAX) return false;
  bucket.count += 1;
  return true;
}

// ---------------------------------------------------------------------------
const REPLIES = {
  code: [
    '防抖的要点是**等用户停下来再执行**。一个带泛型的实现：',
    '',
    '```ts',
    'export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {',
    '  let timer: ReturnType<typeof setTimeout> | null = null;',
    '  return (...args: Parameters<T>) => {',
    '    if (timer) clearTimeout(timer);',
    '    timer = setTimeout(() => fn(...args), wait);',
    '  };',
    '}',
    '```',
    '',
    '三个常见的坑：',
    '',
    '1. 组件卸载时忘记 `clearTimeout`，导致内存泄漏；',
    '2. 依赖项写成内联函数，每次渲染重新创建，防抖实际失效；',
    '3. 需要「首次立即执行」时没有实现 `leading`。',
  ].join('\n'),
  sse: [
    '流式渲染的性能问题，本质是**提交频率**问题。',
    '',
    '### 为什么会卡',
    '每个 token 都 `setState`，一次 800 字的回答就是 800 次 React 提交，',
    '移动端浏览器的主线程会被占满，滚动和输入都会掉帧。',
    '',
    '### 怎么解',
    '用 `requestAnimationFrame` 把同一帧内的增量合并：',
    '',
    '```ts',
    'buffer += delta;',
    'if (rafId === null) rafId = requestAnimationFrame(flush);',
    '```',
    '',
    '| 策略 | 渲染次数 | 体感 |',
    '| --- | --- | --- |',
    '| 逐 token | ≈ token 数 | 掉帧、输入延迟 |',
    '| rAF 批量 | ≈ 帧数 | 顺滑 |',
  ].join('\n'),
  default: [
    '可以分三层来看：',
    '',
    '### 1. 协议层',
    'SSE 是纯文本协议，事件之间用空行分隔。TCP 分包会把一个事件切成两半，',
    '所以前端必须自己维护缓冲区，**只在遇到空行时才认为事件结束**。',
    '',
    '### 2. 渲染层',
    '流式 Markdown 要处理"半成品"：未闭合的代码围栏会让后面所有内容被吞进代码块。',
    '解析前先补全结构，画面才稳定。',
    '',
    '### 3. 体验层',
    '- 首字延迟决定"快不快"；',
    '- 打字节奏决定"顺不顺"；',
    '- 失败重试决定"靠不靠谱"。',
  ].join('\n'),
};

function pickReply(prompt = '') {
  if (/代码|防抖|debounce|hook/i.test(prompt)) return REPLIES.code;
  if (/sse|流式|渲染|性能/i.test(prompt)) return REPLIES.sse;
  return REPLIES.default;
}

function splitMidCharacter(buffer) {
  for (let i = 1; i < buffer.length - 1; i += 1) {
    if ((buffer[i] & 0xc0) === 0x80) return [buffer.subarray(0, i), buffer.subarray(i)];
  }
  return [buffer];
}

function sseHeaders() {
  return {
    ...CORS,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

function writeEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    return JSON.parse(body || '{}');
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
async function mockChat(req, res, prompt, record) {
  res.writeHead(200, sseHeaders());
  const text = pickReply(prompt);
  record.answer = text;
  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  await sleep(260);
  let index = 0;
  while (index < text.length) {
    if (closed) return;
    const size = 2 + Math.floor(Math.random() * 6);
    const piece = text.slice(index, index + size);
    index += piece.length;
    const frame = Buffer.from(`event: delta\ndata: ${JSON.stringify({ text: piece })}\n\n`, 'utf8');
    for (const part of splitMidCharacter(frame)) {
      if (closed) return;
      res.write(part);
    }
    await sleep(index % 6 === 0 ? 60 : 2 + Math.random() * 3);
  }

  record.promptTokens = Math.ceil(prompt.length / 2);
  record.completionTokens = Math.ceil(text.length / 2);
  writeEvent(res, 'done', {
    usage: { promptTokens: record.promptTokens, completionTokens: record.completionTokens },
  });
  res.end();
}

async function liveChat(req, res, messages, model, record) {
  const provider = PROVIDERS[model.provider];
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  const timeout = setTimeout(() => controller.abort(), 120_000);

  const payload = {
    model: model.id,
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 1500,
  };
  const call = (withUsage) =>
    fetch(`${provider.base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(withUsage ? { ...payload, stream_options: { include_usage: true } } : payload),
      signal: controller.signal,
    });

  let upstream;
  try {
    // 带 include_usage 才能拿到 token 数；个别供应商不认这个字段会回 400，那就退回普通请求
    upstream = await call(true);
    if (upstream.status === 400) upstream = await call(false);
  } catch (error) {
    clearTimeout(timeout);
    record.status = 'failed';
    record.error = `${provider.name} 连接失败：${error.message}`;
    res.writeHead(504, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: record.error }));
    return;
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout);
    const detail = await upstream.text().catch(() => '');
    record.status = 'failed';
    // 上游的错误 JSON 不要原样丢给用户，先翻成人话；详细信息只留在服务端日志里
    console.error(`[upstream] ${provider.name} ${upstream.status}:`, detail.slice(0, 500));
    record.error = friendlyUpstreamError(provider.name, upstream.status);
    res.writeHead(upstream.status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: record.error }));
    return;
  }

  res.writeHead(200, sseHeaders());
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;
  let answer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;

        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const text = json.choices?.[0]?.delta?.content;
          if (text) {
            answer += text;
            writeEvent(res, 'delta', { text });
          }
          if (json.usage) usage = json.usage;
        } catch {
          /* 忽略无法解析的行 */
        }
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      record.status = 'failed';
      record.error = `流式中断：${error.message}`;
      writeEvent(res, 'error', record.error);
    }
  } finally {
    clearTimeout(timeout);
    record.answer = answer;
    record.promptTokens = usage?.prompt_tokens ?? 0;
    record.completionTokens = usage?.completion_tokens ?? 0;
    writeEvent(res, 'done', {
      usage: {
        promptTokens: record.promptTokens,
        completionTokens: record.completionTokens,
      },
    });
    res.end();
  }
}

async function handleChat(req, res) {
  const visitor = getVisitor(req);
  if (!allowRequest(visitor)) {
    res.writeHead(429, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '请求太频繁，请稍后再试（每分钟 30 次）' }));
    return;
  }

  const startedAt = Date.now();
  const body = await readJson(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const question = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
  const model = resolveModel(body.model);

  const record = {
    status: 'success',
    error: '',
    answer: '',
    promptTokens: 0,
    completionTokens: 0,
  };

  try {
    if (model.provider === 'mock') await mockChat(req, res, question, record);
    else await liveChat(req, res, messages, model, record);
  } catch (error) {
    record.status = 'failed';
    record.error = error.message;
    throw error;
  } finally {
    recordLog(visitor, {
      id: `req_${startedAt.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      time: startedAt,
      kind: 'chat',
      model: model.id,
      modelLabel: model.label,
      visitor,
      status: record.status,
      error: record.error,
      latency: Date.now() - startedAt,
      promptTokens: record.promptTokens,
      completionTokens: record.completionTokens,
      question: question.slice(0, 80),
      answer: record.answer.slice(0, 120),
    }, req);
  }
}

// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `你是 UI Schema 生成器。根据用户描述输出 JSON，不要输出任何解释。

JSON 结构：
{
  "title": "标题（<=20字）",
  "description": "一句话说明",
  "layout": "form" | "table",
  "submitText": "按钮文案（可选）",
  "fields": [
    { "name": "英文小驼峰", "label": "中文标签", "type": "input|textarea|number|select|date|switch",
      "required": true|false, "placeholder": "可选", "options": ["选项"], "span": 12|24 }
  ]
}

规则：
- 最多 10 个字段；
- 需要多个选项时用 select 并给 options；
- 表单类用 span 12 做两列，长文本用 24；
- 列表/查询类用 layout=table。`;

const MOCK_SPECS = [
  {
    test: /员工|入职|人事/,
    spec: {
      title: '员工入职登记',
      description: '根据描述生成的表单，字段与类型由模型推断',
      layout: 'form',
      submitText: '提交入职信息',
      fields: [
        { name: 'name', label: '姓名', type: 'input', required: true, placeholder: '请输入姓名', span: 12 },
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
        { name: 'note', label: '备注', type: 'textarea', span: 24 },
      ],
    },
  },
  {
    test: /订单|列表|查询|筛选/,
    spec: {
      title: '订单查询结果',
      description: '模型识别为列表意图，产出表格结构',
      layout: 'table',
      fields: [
        { name: 'orderNo', label: '订单号', type: 'input' },
        { name: 'customer', label: '客户', type: 'input' },
        { name: 'status', label: '状态', type: 'select', options: ['待付款', '已付款', '已发货', '已完成'] },
        { name: 'amount', label: '金额（元）', type: 'number' },
        { name: 'createdAt', label: '下单时间', type: 'date' },
      ],
    },
  },
];

async function liveSpec(prompt, model) {
  const provider = PROVIDERS[model.provider];
  const response = await fetch(`${provider.base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.id,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) throw new Error(`${provider.name} 返回 ${response.status}`);
  const data = await response.json();
  const spec = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
  return { spec, usage: data.usage };
}


// ---------------------------------------------------------------------------
// 固定表单模板：报销 / 请假 / 采购这类常见单据，字段必须是稳定的，
// 交给模型自由发挥只会每次都长得不一样，还会缺必填项。
// ---------------------------------------------------------------------------
const FORM_TEMPLATES = [
  {
    id: 'expense',
    keywords: ['报销', '费用', '发票', '差旅'],
    match: (text) => /报销|费用|发票|差旅/.test(text),
    schema: {
      layout: 'form',
      title: '费用报销申请单',
      description: '填写报销事由、金额与凭证信息',
      submitText: '提交申请',
      fields: [
        { name: 'applicant', label: '申请人', type: 'input', required: true, placeholder: '请输入姓名', span: 12 },
        { name: 'department', label: '所属部门', type: 'select', required: true, options: ['研发部', '产品设计部', '市场部', '职能中心'], span: 12 },
        { name: 'category', label: '费用类型', type: 'select', required: true, options: ['差旅费', '交通费', '餐饮费', '办公用品', '其他'], span: 12 },
        { name: 'amount', label: '报销金额（元）', type: 'number', required: true, placeholder: '请输入金额', span: 12 },
        { name: 'spentAt', label: '费用发生日期', type: 'date', required: true, span: 12 },
        { name: 'invoiceCount', label: '发票张数', type: 'number', required: false, placeholder: '选填', span: 12 },
        { name: 'hasInvoice', label: '是否已附发票', type: 'switch', required: false, span: 12 },
        { name: 'urgent', label: '是否加急', type: 'switch', required: false, span: 12 },
        { name: 'reason', label: '报销事由', type: 'textarea', required: true, placeholder: '说明费用用途与明细', maxLength: 500, span: 24 },
      ],
    },
  },
  {
    id: 'leave',
    keywords: ['请假', '休假', '调休'],
    match: (text) => /请假|休假|调休/.test(text),
    schema: {
      layout: 'form',
      title: '请假申请单',
      description: '填写请假类型、时间与事由',
      submitText: '提交申请',
      fields: [
        { name: 'applicant', label: '申请人', type: 'input', required: true, placeholder: '请输入姓名', span: 12 },
        { name: 'department', label: '所属部门', type: 'select', required: true, options: ['研发部', '产品设计部', '市场部', '职能中心'], span: 12 },
        { name: 'type', label: '请假类型', type: 'select', required: true, options: ['事假', '病假', '年假', '调休'], span: 12 },
        { name: 'days', label: '请假天数', type: 'number', required: true, placeholder: '请输入天数', span: 12 },
        { name: 'startAt', label: '开始日期', type: 'date', required: true, span: 12 },
        { name: 'endAt', label: '结束日期', type: 'date', required: true, span: 12 },
        { name: 'handover', label: '工作交接人', type: 'input', required: false, placeholder: '选填', span: 12 },
        { name: 'reason', label: '请假事由', type: 'textarea', required: true, placeholder: '简要说明原因', maxLength: 300, span: 24 },
      ],
    },
  },
  {
    id: 'purchase',
    keywords: ['采购', '申购', '买'],
    match: (text) => /采购|申购|购买/.test(text),
    schema: {
      layout: 'form',
      title: '采购申请单',
      description: '填写采购物品、数量与预算',
      submitText: '提交申请',
      fields: [
        { name: 'applicant', label: '申请人', type: 'input', required: true, placeholder: '请输入姓名', span: 12 },
        { name: 'department', label: '所属部门', type: 'select', required: true, options: ['研发部', '产品设计部', '市场部', '职能中心'], span: 12 },
        { name: 'item', label: '物品名称', type: 'input', required: true, placeholder: '如：显示器', span: 12 },
        { name: 'quantity', label: '数量', type: 'number', required: true, placeholder: '请输入数量', span: 12 },
        { name: 'budget', label: '预算（元）', type: 'number', required: true, placeholder: '请输入预算', span: 12 },
        { name: 'neededAt', label: '期望到货日期', type: 'date', required: false, span: 12 },
        { name: 'reason', label: '采购理由', type: 'textarea', required: true, placeholder: '说明用途', maxLength: 300, span: 24 },
      ],
    },
  },
];

/** 命中模板就直接返回，不调模型 —— 结果稳定、字段必填项齐全 */
function matchTemplate(prompt) {
  return FORM_TEMPLATES.find((template) => template.match(prompt)) ?? null;
}

async function handleGenerate(req, res) {
  const body = await readJson(req);
  const prompt = String(body.prompt ?? '');

  const template = matchTemplate(prompt);
  if (template) {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        schema: template.schema,
        mock: false,
        template: template.id,
        model: 'template',
      }),
    );
    return;
  }

  const visitor = getVisitor(req);
  if (!allowRequest(visitor)) {
    res.writeHead(429, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '请求太频繁，请稍后再试（每分钟 30 次）' }));
    return;
  }

  const startedAt = Date.now();
  const model = resolveModel(body.model);
  const record = { status: 'success', error: '', promptTokens: 0, completionTokens: 0 };

  try {
    if (model.provider !== 'mock') {
      try {
        const { spec, usage } = await liveSpec(prompt, model);
        record.promptTokens = usage?.prompt_tokens ?? 0;
        record.completionTokens = usage?.completion_tokens ?? 0;
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(spec));
        return;
      } catch (error) {
        record.status = 'failed';
        record.error = error.message;
        res.writeHead(502, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: error.message }));
        return;
      }
    }

    await sleep(500 + Math.random() * 400);
    const matched = MOCK_SPECS.find((item) => item.test.test(prompt));
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify(
        matched?.spec ?? {
          title: '通用信息登记',
          description: '未识别到具体业务关键词，返回通用表单',
          layout: 'form',
          submitText: '提交',
          fields: [
            { name: 'title', label: '标题', type: 'input', required: true, span: 24 },
            { name: 'owner', label: '负责人', type: 'input', span: 12 },
            { name: 'deadline', label: '截止日期', type: 'date', span: 12 },
            { name: 'detail', label: '详细说明', type: 'textarea', span: 24 },
          ],
        },
      ),
    );
  } finally {
    recordLog(visitor, {
      id: `ui_${startedAt.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      time: startedAt,
      kind: 'ui',
      model: model.id,
      modelLabel: model.label,
      visitor,
      status: record.status,
      error: record.error,
      latency: Date.now() - startedAt,
      promptTokens: record.promptTokens,
      completionTokens: record.completionTokens,
      question: prompt.slice(0, 80),
      answer: '已生成 UI Schema',
    }, req);
  }
}

// ---------------------------------------------------------------------------
const DIST_DIR = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/** 返回 true 表示已经处理完（含 404），调用方直接 return */
async function serveStatic(res, url) {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) return false;
  if (url.pathname.startsWith('/api/')) return false;

  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath);
  if (!filePath.startsWith(DIST_DIR)) return false;

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const isHashed = filePath.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': isHashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  try {
    // 业务接口（登录 / 小组 / 任务 / 账目 / 专注 / 提醒）
    if (await handleAppApi(req, res, url)) return;

    if (url.pathname === '/api/health') {
      const models = availableModels();
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          status: 'ok',
          mode: models[0]?.provider === 'mock' ? 'mock' : 'live',
          model: models[0]?.id ?? 'mock',
          models: models.length,
        }),
      );
      return;
    }

    if (url.pathname === '/api/models') {
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          models: availableModels().map((m) => ({
            id: m.id,
            label: m.label,
            free: m.free,
            note: m.note,
            provider: PROVIDERS[m.provider]?.name ?? '内置',
          })),
        }),
      );
      return;
    }

    if (url.pathname === '/api/logs' && req.method === 'GET') {
      const visitor = getVisitor(req);
      const user = sessionUser(tokenOfRequest(req));
      const list = user ? listLogs(user.id) : (logsFallback.get(visitor) ?? []);
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ visitor, logs: list }));
      return;
    }

    if (url.pathname === '/api/logs' && req.method === 'DELETE') {
      const visitor = getVisitor(req);
      const user = sessionUser(tokenOfRequest(req));
      if (user) clearLogs(user.id);
      logsFallback.set(visitor, []);
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === '/api/shares' && req.method === 'POST') {
      const body = await readJson(req);
      const content = String(body.content ?? '').slice(0, 20000);
      if (!content.trim()) {
        res.writeHead(400, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '内容不能为空' }));
        return;
      }
      const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
      shares.set(id, {
        id,
        title: String(body.title ?? '').slice(0, 80) || '未命名笔记',
        content,
        createdAt: Date.now(),
        views: 0,
      });
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ id }));
      return;
    }

    if (url.pathname.startsWith('/api/shares/') && req.method === 'GET') {
      const id = url.pathname.slice('/api/shares/'.length);
      const share = shares.get(id);
      if (!share) {
        res.writeHead(404, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '分享不存在或已撤销' }));
        return;
      }
      share.views += 1;
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(share));
      return;
    }

    if (url.pathname.startsWith('/api/shares/') && req.method === 'DELETE') {
      const id = url.pathname.slice('/api/shares/'.length);
      shares.delete(id);
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === '/api/chat/stream' && req.method === 'POST') {
      await handleChat(req, res);
      return;
    }

    if (url.pathname === '/api/generate/ui' && req.method === 'POST') {
      await handleGenerate(req, res);
      return;
    }

    // 生产环境（Docker）：dist 存在时，同一个进程顺带把前端发出去，SPA 回退到 index.html
    if (req.method === 'GET' && (await serveStatic(res, url))) return;

    res.writeHead(404, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not found' }));
  } catch (error) {
    console.error('[server] error:', error);
    if (!res.headersSent) res.writeHead(500, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  const models = availableModels();
  console.log(`[server] http://127.0.0.1:${PORT}  可用模型：${models.map((m) => m.id).join(', ')}`);
  if (models[0]?.provider === 'mock') {
    console.log('[server] 未检测到任何 API Key，走内置 mock；在 .env 里配置后重启即为真实回答');
  }
});
