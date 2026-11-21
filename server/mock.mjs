/**
 * 本地 mock 服务（零依赖，只用 Node 内置模块）。
 *
 * 存在的意义：让 `git clone && npm i && npm run dev` 就能看到完整效果，
 * 不需要 API Key，也不需要先把后端跑起来。
 *
 * 它还刻意做了一件"真实网络会做但教程不会做"的事：
 * 把一个 SSE 事件按字节切断，甚至切在 UTF-8 汉字中间 —— 用来验证前端
 * 用 TextDecoder({ stream: true }) + 缓冲区的做法是对的。
 */
import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  table: [
    '按首屏体积和上手成本对比三种方案：',
    '',
    '| 方案 | 首屏体积 | 上手成本 | 适用场景 |',
    '| --- | --- | --- | --- |',
    '| 纯 CSS 过渡 | 0 KB | 低 | 简单交互 |',
    '| Framer Motion | ~38 KB | 中 | 复杂编排 |',
    '| GSAP | ~70 KB | 高 | 时间轴动画 |',
    '',
    '结论：**演示型页面优先纯 CSS**，等出现编排需求再引库。',
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
    '',
    '想深入哪一层，我可以继续展开。',
  ].join('\n'),
};

function pickReply(prompt = '') {
  if (/代码|防抖|debounce|hook/i.test(prompt)) return REPLIES.code;
  if (/sse|流式|渲染|性能/i.test(prompt)) return REPLIES.sse;
  if (/表格|对比|选型/i.test(prompt)) return REPLIES.table;
  return REPLIES.default;
}

/** 在 UTF-8 连续字节中间切一刀，模拟真实网络分包 */
function splitMidCharacter(buffer) {
  for (let i = 1; i < buffer.length - 1; i += 1) {
    if ((buffer[i] & 0xc0) === 0x80) {
      return [buffer.subarray(0, i), buffer.subarray(i)];
    }
  }
  return [buffer];
}

async function handleChat(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  let prompt = '';
  try {
    const parsed = JSON.parse(body || '{}');
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    prompt = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
  } catch {
    /* 忽略非法 JSON，用默认回答 */
  }

  res.writeHead(200, {
    ...CORS,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

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
    await sleep(12 + Math.random() * 26);
  }

  const usage = { promptTokens: Math.ceil(prompt.length / 2), completionTokens: Math.ceil(text.length / 2) };
  res.write(`event: done\ndata: ${JSON.stringify({ usage })}\n\n`);
  res.end();
}

const SPECS = [
  {
    test: /员工|入职|人事/,
    spec: {
      title: '员工入职登记',
      description: '根据描述生成的表单，字段与类型由模型推断，前端校验后渲染',
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

async function handleGenerate(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  let prompt = '';
  try {
    prompt = JSON.parse(body || '{}').prompt ?? '';
  } catch {
    /* ignore */
  }

  await sleep(500 + Math.random() * 400);
  const matched = SPECS.find((item) => item.test.test(prompt));
  const spec = matched?.spec ?? {
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
  };

  res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(spec));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  try {
    if (url.pathname === '/api/health') {
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', mode: 'mock' }));
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
    res.writeHead(404, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  } catch (error) {
    console.error('[mock] error:', error);
    if (!res.headersSent) res.writeHead(500, CORS);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`[mock] SSE server ready → http://127.0.0.1:${PORT}`);
});
