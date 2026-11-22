/**
 * 本地 API 服务（零依赖）。
 *
 * 三件事：
 * 1. 模型注册表：不同供应商的模型、地址、Key 都在这里；
 * 2. 有 Key 就转发真实接口，没 Key 就退回内置 mock（仍然真 SSE 推流）；
 * 3. 生成式 UI：让模型产出 UI Schema，前端负责校验和渲染。
 *
 * API Key 只存在于服务端进程，永远不会进浏览器。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** 极简 .env 解析：KEY=VALUE，# 开头为注释，已存在的环境变量优先 */
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

/**
 * 供应商：每个供应商一个 base url + 一个 Key。
 * LLM_API_KEY 作为兜底，方便只想配一个 Key 的人。
 */
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
    name: '通义千问',
  },
};

/** 模型目录：free 只是「这个模型通常有免费额度」的标记，不代表一定免费 */
const MODELS = [
  { id: 'deepseek-chat', label: 'DeepSeek V3', provider: 'deepseek', free: false, note: '通用对话，便宜' },
  { id: 'deepseek-reasoner', label: 'DeepSeek R1', provider: 'deepseek', free: false, note: '推理型，慢' },
  { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5 7B', provider: 'siliconflow', free: true, note: '硅基流动免费额度' },
  { id: 'THUDM/glm-4-9b-chat', label: 'GLM-4 9B', provider: 'siliconflow', free: true, note: '硅基流动免费额度' },
  { id: 'glm-4-flash', label: 'GLM-4 Flash', provider: 'zhipu', free: true, note: '智谱免费模型' },
  { id: 'qwen-plus', label: 'Qwen Plus', provider: 'dashscope', free: false, note: '通义付费' },
];

const MOCK_MODEL = { id: 'mock', label: '内置模拟', provider: 'mock', free: true, note: '无需 Key' };

function availableModels() {
  const list = MODELS.filter((m) => PROVIDERS[m.provider]?.key);
  return list.length ? list : [MOCK_MODEL];
}

/** 解析请求里的模型；非法或没有 Key 时退回第一个可用模型 */
function resolveModel(modelId) {
  const list = availableModels();
  const found = list.find((m) => m.id === modelId);
  if (found) return found;
  return list[0] ?? MOCK_MODEL;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// mock 回答
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
    '',
    '> 页面上那排指标就是两种策略的实测对比，可以自己切换试试。',
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

// ---------------------------------------------------------------------------
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
async function mockChat(req, res, prompt) {
  res.writeHead(200, sseHeaders());
  const text = pickReply(prompt);
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

  writeEvent(res, 'done', {
    usage: { promptTokens: Math.ceil(prompt.length / 2), completionTokens: Math.ceil(text.length / 2) },
  });
  res.end();
}

async function liveChat(req, res, messages, model) {
  const provider = PROVIDERS[model.provider];
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  const timeout = setTimeout(() => controller.abort(), 120_000);

  let upstream;
  try {
    upstream = await fetch(`${provider.base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.id,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    res.writeHead(504, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: `${provider.name} 连接失败：${error.message}` }));
    return;
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout);
    const detail = await upstream.text().catch(() => '');
    res.writeHead(upstream.status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: `${provider.name} 返回 ${upstream.status}：${detail.slice(0, 300)}` }));
    return;
  }

  res.writeHead(200, sseHeaders());
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;

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
          if (text) writeEvent(res, 'delta', { text });
          if (json.usage) usage = json.usage;
        } catch {
          /* 忽略无法解析的行 */
        }
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) writeEvent(res, 'error', `流式中断：${error.message}`);
  } finally {
    clearTimeout(timeout);
    writeEvent(res, 'done', {
      usage: usage
        ? { promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 }
        : undefined,
    });
    res.end();
  }
}

async function handleChat(req, res) {
  const body = await readJson(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const prompt = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
  const model = resolveModel(body.model);

  if (model.provider === 'mock') {
    await mockChat(req, res, prompt);
    return;
  }
  await liveChat(req, res, messages, model);
}

// ---------------------------------------------------------------------------
// 生成式 UI
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
  return JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
}

async function handleGenerate(req, res) {
  const { prompt = '', model: modelId } = await readJson(req);
  const model = resolveModel(modelId);

  if (model.provider !== 'mock') {
    try {
      const spec = await liveSpec(prompt, model);
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(spec));
      return;
    } catch (error) {
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
}

// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  try {
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
    if (url.pathname === '/api/chat/stream' && req.method === 'POST') {
      await handleChat(req, res);
      return;
    }
    if (url.pathname === '/api/generate/ui' && req.method === 'POST') {
      await handleGenerate(req, res);
      return;
    }
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
