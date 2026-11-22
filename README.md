# AI Console

**一个能真跑起来的 AI 前端工作台**：流式对话、生成式 UI、调用日志。
React 18 + TypeScript + Vite 5 + antd 5，配一个零依赖的 Node 服务，**填入自己的 API Key 就是真的在对话**。

<p align="center">
  <img src="docs/images/chat.png" alt="流式对话 + 灵动岛" width="880" />
</p>

<p align="center">
  <img src="docs/images/generator.png" alt="生成式 UI" width="440" />
  <img src="docs/images/mobile.png" alt="移动端" width="220" />
</p>

---

## 快速开始

```bash
git clone <your-repo> && cd ai-console
npm install

cp .env.example .env      # Windows: copy .env.example .env
# 打开 .env，把 LLM_API_KEY 换成你自己的（不填也能跑，服务端会走内置 mock）

npm run dev
```

打开 <http://localhost:5173>。

| 命令 | 作用 |
|---|---|
| `npm run dev` | 同时启动 API 服务(8787) + 前端(5173) |
| `npm run api` | 只启动 API 服务 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览构建产物（已配置 /api 代理） |
| `npm test` | 单元测试（Vitest） |

**API Key 只存在于 Node 进程**（`server/index.mjs` 读 `.env`），永远不会被打包进浏览器。

支持任何 OpenAI 兼容接口：DeepSeek、通义千问、智谱、硅基流动、vLLM、Ollama。

### 切换模型

右上角下拉框切换模型，选择会记在 localStorage。服务端维护一份**模型目录**（server/index.mjs 的 MODELS），每个模型绑定到对应供应商：

| 模型 | 供应商 | 是否免费 |
|---|---|---|
| DeepSeek V3 / R1 | DeepSeek | 付费（很便宜） |
| Qwen2.5 7B / GLM-4 9B | 硅基流动 | 免费额度 |
| GLM-4 Flash | 智谱 | 免费 |
| Qwen Plus | 通义千问 | 付费 |

**只显示配置了 Key 的模型** —— 没配 Key 的选项不会出现，避免选了必然失败的模型。

想用免费模型：去[硅基流动](https://cloud.siliconflow.cn)或[智谱](https://open.bigmodel.cn)注册拿 Key，填进 .env 的 SILICONFLOW_API_KEY / ZHIPU_API_KEY，重启服务即可。

---

## 三个页面

### 1. 流式对话 `/chat`
SSE 逐字输出、Markdown 实时渲染、代码块复制、停止生成、**重新生成**、错误提示。
顶部有一个**灵动岛**：生成中显示耗时与进度，点开能看首字延迟 / 字符数 / 渲染次数，还能直接停止；失败时停留并给出重试。
右下角有**悬浮球**：可拖动、松手吸附到边缘，点开是「新建对话 / 回到最新 / 切换主题」。

### 2. 生成式 UI `/generator`
一句话描述 → 服务端让模型返回 **UI Schema** → 前端 zod 校验 → 渲染成 antd 表单或表格。
可以直接提交，也可以展开看模型返回的原始 JSON。

### 3. 调用日志 `/logs`
后台列表页该有的都有：统计卡片、搜索、筛选、排序、分页、状态标签、详情抽屉、成本估算。

---

## 技术亮点（以及取舍）

### 1. 自研 SSE 解析器，而不是 EventSource

`EventSource` 只能发 GET、不能带 header、不能带 request body —— 多轮对话把历史塞进 URL 很快就超长。
所以用 `fetch` + `ReadableStream` 自己解协议（`src/lib/sse.ts`，70 行）。

真正的坑在**分包**：一个事件可能被拆到两次 `read()` 里：

```
chunk1: 'event: delta\ndata: {"te'      chunk2: 'xt":"你好"}\n\n'
```

解析器必须持有缓冲区，只在遇到空行时才落地事件。`tests/sse.test.ts` 覆盖 8 种情况：拆包、粘包、多行 data、CRLF、心跳注释、流末尾无空行……

> 服务端的 mock 还会**故意把一行 UTF-8 切在汉字中间**再写出去，用来验证 `TextDecoder({ stream: true })` 用得对。

### 2. 流式 Markdown 的「半成品补全」

模型刚吐到 ```` ```ts ```` 的时候围栏还没闭合，`marked` 会把后面所有内容当成代码块，页面就在「代码块」和「正文」之间反复横跳。

做法是解析前先补全结构（`repairStreamingMarkdown`）：未闭合围栏补围栏、未闭合加粗补加粗。还要注意**代码块里的 `**` 是运算符**，不能当成加粗去补 —— 这条是单测逼出来的。

所有模型输出都过 DOMPurify，`dangerouslySetInnerHTML` 只吃消毒后的 HTML。

### 3. rAF 批量渲染 + 后台标签页兜底

每个 token 都 `setState`，一次长回答就是几百次 React 提交。改成用 `requestAnimationFrame` 合并同帧增量。

**效果与到达速率相关，这点值得说清楚**：

- token 密集到达时（一个网络包里多个 delta），一帧内合并多次更新，渲染次数约减半；
- token 稀疏到达时（每 16ms 才来一个），rAF 自然就退化成 1:1，**这是正常现象**，不是没生效。

页面上的数字是实测的，可以切换「rAF 批量 / 逐 token」自己对比。

> 后台标签页里 rAF 会被浏览器暂停，所以加了 120ms 的 `setTimeout` 兜底，否则切回来文字是"冻住"的 —— 这个 bug 只有真的挂在后台跑过才会遇到。

### 4. 生成式 UI 走 Schema，不让模型写组件

模型直接产出 React 代码 = 执行不可信代码。所以定义一份受约束的契约：

```ts
uiSpecSchema = { title, layout: 'form' | 'table', fields: [{ name, label, type, required, options }] }
```

模型只产 JSON，前端用 zod 校验，通过才渲染。模型再离谱，最坏结果是「渲染失败」而不是「XSS / 任意代码执行」。

### 5. mock 与真实模式只差一个环境变量

前端只有一条代码路径（`fetch /api/chat/stream`）；背后是真模型还是 mock，由 **服务端** 决定：

```
server/index.mjs  →  有 LLM_API_KEY ? 转发给上游 : 内置 mock（仍然真 SSE 推流）
```

这样不会出现「本地 mock 好使、线上少个分支」的问题。同时 `/api/health` 把当前模式告诉前端，右上角的 `LIVE / MOCK` 标签就是它。

### 6. 路由懒加载与产物体积

| 产物 | 原始 | gzip |
|---|---|---|
| index（shell + antd 基础） | 549 KB | 174 KB |
| react 运行时 | 160 KB | 52 KB |
| ChatPage | 96 KB | 34 KB |
| GeneratorPage（按需） | 77 KB | 26 KB |
| Table + DatePicker（按需） | 439 KB | 137 KB |
| LogsPage（按需） | 31 KB | 10 KB |
| CSS | 11 KB | 3 KB |

首屏（`/chat`）gzip ≈ **272 KB**，改懒加载前是 **≈436 KB**，降了约 38%。

---

## 交互细节

| 交互 | 实现要点 |
|---|---|
| **灵动岛** | 固定在顶部居中，`transform + opacity` 做弹性进出；生成中/完成/失败三态，完成 1.8s 后自动收起；点一下展开详情 |
| **悬浮球** | Pointer Events 统一鼠标与触摸；4px 拖动阈值区分"点击/拖拽"；松手吸附到最近边缘；位置存 localStorage，窗口缩放时夹紧回视口 |
| **消息操作** | 悬停出现「复制 / 重新生成」，触摸设备常显（`@media (hover: none)`） |
| **回到底部** | 用户上翻时出现浮层按钮，且**不再自动滚到底**（只有贴底时才跟随） |
| **移动端** | `100dvh` 而非 `100vh`、`env(safe-area-inset-bottom)` 避开底部横条、气泡宽度 `calc(100% - 44px)` 防止长英文溢出 |

---

## 脚手架能力

- **路径别名** `@/` → `src/`（vite + tsconfig 双处）
- **环境变量类型安全**：`src/env.ts` 用 zod 校验，缺配置第一屏就报错
- **开发代理 / 预览代理**：`/api` → `127.0.0.1:8787`，前端不处理 CORS
- **watch 忽略缓存目录**：避免浏览器缓存文件被锁导致 dev server `EBUSY` 崩掉
- **质量**：ESLint 9 flat config + Prettier + `tsc --noEmit`（strict，含 `noUncheckedIndexedAccess`）
- **测试**：Vitest + jsdom，25 个用例覆盖协议解析 / Markdown 补全 / Schema 校验
- **CI**：GitHub Actions（lint → typecheck → test → build）双 Node 矩阵
- **部署**：多阶段 Dockerfile + nginx（SPA fallback、gzip、静态资源长缓存）

---

## 目录结构

```
src/
├─ main.tsx / App.tsx        入口、路由、主题
├─ env.ts                    环境变量校验（zod）
├─ lib/
│  ├─ sse.ts                 SSE 协议解析（纯函数，可单测）
│  ├─ stream.ts              流式请求封装
│  ├─ markdown.ts            半成品补全 + 安全渲染
│  ├─ health.ts              服务端模式探测
│  └─ utils.ts
├─ components/
│  ├─ AppShell.tsx           布局、导航、移动端抽屉、主题
│  ├─ DynamicIsland.tsx      灵动岛
│  ├─ FloatingBall.tsx       可拖动悬浮球
│  └─ Markdown.tsx           渲染 + 代码块复制
├─ features/
│  ├─ chat/                  useChat 状态机、对话页
│  ├─ generator/             UI Schema 契约、动态渲染
│  └─ logs/                  后台列表页
└─ styles/global.css         设计变量、深色主题、断点、动效
server/index.mjs             零依赖 API 服务（真实转发 / mock / 生成式 UI）
tests/                       Vitest 用例
```

---

## 环境变量

| 变量 | 位置 | 说明 |
|---|---|---|
| `LLM_API_KEY` | `.env`（服务端） | 上游模型的 Key，**不会进浏览器** |
| `LLM_BASE_URL` | `.env` | OpenAI 兼容地址，默认 DeepSeek |
| `LLM_MODEL` | `.env` | 模型名 |
| `VITE_API_BASE` | `.env.development/.production` | 前端请求前缀，默认 `/api` |
| `VITE_PROXY_TARGET` | `.env.development` | 开发代理目标，默认 `127.0.0.1:8787` |

---

## Roadmap

- [ ] 多轮上下文裁剪（按 token 预算滑窗 + 摘要）
- [ ] 会话持久化（IndexedDB）与历史会话列表
- [ ] 虚拟列表（上千条消息时只渲染可视区）
- [ ] 断线重连（`Last-Event-ID` + 指数退避）
- [ ] Playwright E2E

## License

MIT
