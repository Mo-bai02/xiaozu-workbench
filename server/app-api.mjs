/**
 * 业务接口：登录、小组、成员权限、任务、账目、专注、提醒。
 *
 * 设计取舍：
 * - 用 Bearer token 而不是 Cookie：同源部署下更简单，也避免 CSRF 那套；
 *   代价是 token 存在 localStorage，XSS 能偷走 —— 所以渲染层必须继续用 DOMPurify。
 * - 所有 group 数据都要先过 membership()，权限判断集中在 requireMember / requireManager。
 */
import { issueCaptcha, verifyCaptcha } from './captcha.mjs';
import {
  addFocus,
  cstDayRange,
  cstMonthRangeByKey,
  createExpense,
  createGroup,
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  createSession,
  createTask,
  createUser,
  deleteExpense,
  deleteTask,
  destroySession,
  getUserByName,
  isManager,
  joinGroupByCode,
  listExpenses,
  listFocus,
  listGroups,
  listMembers,
  listTasks,
  membership,
  markAlertsRead,
  myAlerts,
  publicUser,
  reminders,
  removeMember,
  sessionUser,
  setMemberRole,
  updateTask,
  verifyUser,
} from './db.mjs';

const json = (res, status, data) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
};

const bad = (res, message, status = 400) => json(res, status, { error: message });

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function tokenOf(req) {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

/** 返回 { user } 或 { error } */
function requireUser(req) {
  const user = sessionUser(tokenOf(req));
  if (!user) return { error: '请先登录', status: 401 };
  return { user };
}

/** 返回 { user, role, groupId } 或 { error } */
function requireMember(req, groupId) {
  const auth = requireUser(req);
  if (auth.error) return auth;
  const row = membership(groupId, auth.user.id);
  if (!row) return { error: '你不在这个小组里', status: 403 };
  return { user: auth.user, role: row.role, groupId };
}

function requireManager(req, groupId) {
  const ctx = requireMember(req, groupId);
  if (ctx.error) return ctx;
  if (!isManager(ctx.role)) return { error: '只有小组创建者或管理员可以操作', status: 403 };
  return ctx;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** 本模块负责的路径前缀；其它 /api 路由（health、模型、日志、分享、对话）交给 index.mjs */
const OWN_PREFIXES = ['/api/auth', '/api/notes', '/api/alerts', '/api/groups', '/api/tasks', '/api/expenses', '/api/focus', '/api/reminders'];

export async function handleAppApi(req, res, url) {
  const path = url.pathname;
  if (!OWN_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'))) return false;

  try {
    // ------------------------------------------------------------------ 认证
    if (path === '/api/auth/captcha' && req.method === 'GET') {
      return json(res, 200, issueCaptcha()), true;
    }

    if (path === '/api/auth/register' && req.method === 'POST') {
      // 公网部署时把 ALLOW_REGISTER 设成 0：账号建好后就不再接受新注册
      if (process.env.ALLOW_REGISTER === '0') {
        return bad(res, '本站已关闭注册，请联系管理员开通账号', 403), true;
      }
      const body = await readBody(req);
      const username = String(body.username ?? '').trim();
      const password = String(body.password ?? '');
      const displayName = String(body.displayName ?? '').trim() || username;

      // 先验验证码：一次性，错了就作废，得刷新再试
      if (!verifyCaptcha(body.captchaId, body.captchaText)) {
        return bad(res, '验证码不对，换一个试试'), true;
      }
      if (!USERNAME_RE.test(username)) return bad(res, '用户名需 3-20 位字母、数字或下划线'), true;
      if (password.length < 6) return bad(res, '密码至少 6 位'), true;
      if (getUserByName(username)) return bad(res, '这个用户名已被注册'), true;

      const user = createUser({ username, password, displayName });
      const token = createSession(user.id);
      return json(res, 200, { token, user: publicUser(user) }), true;
    }

    if (path === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const user = verifyUser(String(body.username ?? '').trim(), String(body.password ?? ''));
      if (!user) return bad(res, '用户名或密码不对', 401), true;
      const token = createSession(user.id);
      return json(res, 200, { token, user: publicUser(user) }), true;
    }

    if (path === '/api/auth/logout' && req.method === 'POST') {
      destroySession(tokenOf(req));
      return json(res, 200, { ok: true }), true;
    }

    if (path === '/api/auth/me' && req.method === 'GET') {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      return json(res, 200, { user: publicUser(auth.user) }), true;
    }

    // ------------------------------------------------------------------ 小组
    if (path === '/api/groups' && req.method === 'GET') {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      return json(res, 200, { groups: listGroups(auth.user.id) }), true;
    }

    if (path === '/api/groups' && req.method === 'POST') {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      const body = await readBody(req);
      const name = String(body.name ?? '').trim().slice(0, 30);
      if (!name) return bad(res, '小组名不能为空'), true;
      const group = createGroup(auth.user.id, name);
      return json(res, 200, { group }), true;
    }

    if (path === '/api/groups/join' && req.method === 'POST') {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      const body = await readBody(req);
      const result = joinGroupByCode(auth.user.id, String(body.code ?? '').trim());
      if (result.error) return bad(res, result.error), true;
      return json(res, 200, { group: result.group }), true;
    }

    const membersMatch = /^\/api\/groups\/([\w-]+)\/members$/.exec(path);
    if (membersMatch && req.method === 'GET') {
      const ctx = requireMember(req, membersMatch[1]);
      if (ctx.error) return bad(res, ctx.error, ctx.status), true;
      return json(res, 200, { members: listMembers(ctx.groupId), myRole: ctx.role }), true;
    }

    const memberMatch = /^\/api\/groups\/([\w-]+)\/members\/([\w-]+)$/.exec(path);
    if (memberMatch) {
      const [, groupId, userId] = memberMatch;

      if (req.method === 'PATCH') {
        const ctx = requireManager(req, groupId);
        if (ctx.error) return bad(res, ctx.error, ctx.status), true;
        if (ctx.role !== 'owner') return bad(res, '只有创建者可以任命管理员', 403), true;
        if (userId === ctx.user.id) return bad(res, '不能修改自己的角色'), true;

        const body = await readBody(req);
        const role = body.role;
        if (!['admin', 'member'].includes(role)) return bad(res, '角色不合法'), true;
        setMemberRole(groupId, userId, role);
        return json(res, 200, { ok: true }), true;
      }

      if (req.method === 'DELETE') {
        const ctx = requireManager(req, groupId);
        if (ctx.error) return bad(res, ctx.error, ctx.status), true;
        if (userId === ctx.user.id) return bad(res, '不能移除自己'), true;

        const target = membership(groupId, userId);
        if (!target) return bad(res, '该成员不存在', 404), true;
        if (target.role === 'owner') return bad(res, '不能移除小组创建者', 403), true;
        if (target.role === 'admin' && ctx.role !== 'owner') return bad(res, '只有创建者可以移除管理员', 403), true;

        removeMember(groupId, userId);
        return json(res, 200, { ok: true }), true;
      }
    }

    // ------------------------------------------------------------------ 任务
    const tasksMatch = /^\/api\/groups\/([\w-]+)\/tasks$/.exec(path);
    if (tasksMatch && req.method === 'GET') {
      const ctx = requireMember(req, tasksMatch[1]);
      if (ctx.error) return bad(res, ctx.error, ctx.status), true;
      return json(res, 200, { tasks: listTasks(ctx.groupId) }), true;
    }

    if (tasksMatch && req.method === 'POST') {
      const ctx = requireMember(req, tasksMatch[1]);
      if (ctx.error) return bad(res, ctx.error, ctx.status), true;
      const body = await readBody(req);
      return json(res, 200, { task: createTask(ctx.groupId, ctx.user.id, body) }), true;
    }

    const taskMatch = /^\/api\/tasks\/([\w-]+)$/.exec(path);
    if (taskMatch) {
      const taskId = taskMatch[1];
      if (req.method === 'PATCH') {
        const body = await readBody(req);
        const groupId = String(body.groupId ?? '');
        const ctx = requireMember(req, groupId);
        if (ctx.error) return bad(res, ctx.error, ctx.status), true;
        const task = updateTask(taskId, groupId, body.patch ?? body);
        if (!task) return bad(res, '任务不存在', 404), true;
        return json(res, 200, { task }), true;
      }
      if (req.method === 'DELETE') {
        const groupId = url.searchParams.get('groupId') ?? '';
        const ctx = requireMember(req, groupId);
        if (ctx.error) return bad(res, ctx.error, ctx.status), true;
        const ok = deleteTask(taskId, groupId);
        if (!ok) return bad(res, '任务不存在', 404), true;
        return json(res, 200, { ok: true }), true;
      }
    }

    // ------------------------------------------------------------------ 账目
    const expensesMatch = /^\/api\/groups\/([\w-]+)\/expenses$/.exec(path);
    if (expensesMatch && req.method === 'GET') {
      const ctx = requireMember(req, expensesMatch[1]);
      if (ctx.error) return bad(res, ctx.error, ctx.status), true;
      const { start, end } = cstMonthRangeByKey(url.searchParams.get('month'));
      return json(res, 200, { expenses: listExpenses(ctx.groupId, start, end), start, end }), true;
    }

    if (expensesMatch && req.method === 'POST') {
      const ctx = requireMember(req, expensesMatch[1]);
      if (ctx.error) return bad(res, ctx.error, ctx.status), true;
      const body = await readBody(req);
      if (!body.payerId) return bad(res, '请选择垫付人'), true;
      return json(res, 200, { expense: createExpense(ctx.groupId, ctx.user.id, body) }), true;
    }

    const expenseMatch = /^\/api\/expenses\/([\w-]+)$/.exec(path);
    if (expenseMatch && req.method === 'DELETE') {
      const groupId = url.searchParams.get('groupId') ?? '';
      const ctx = requireMember(req, groupId);
      if (ctx.error) return bad(res, ctx.error, ctx.status), true;
      const ok = deleteExpense(expenseMatch[1], groupId, ctx.user.id, isManager(ctx.role));
      if (!ok) return bad(res, '只能删除自己记的账，或联系管理员', 403), true;
      return json(res, 200, { ok: true }), true;
    }

    // ------------------------------------------------------------------ 专注
    if (path === '/api/focus' && req.method === 'GET') {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      const day = cstDayRange();
      return json(res, 200, { sessions: listFocus(auth.user.id, day.start - 6 * 86_400_000, day.end) }), true;
    }

    if (path === '/api/focus' && req.method === 'POST') {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      const body = await readBody(req);
      addFocus(auth.user.id, body.groupId ?? null, body);
      return json(res, 200, { ok: true }), true;
    }

    // ------------------------------------------------------------------ 笔记
    if (path === '/api/notes' && req.method === 'GET') {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      return json(res, 200, { notes: listNotes(auth.user.id) }), true;
    }

    if (path === '/api/notes' && req.method === 'POST') {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      return json(res, 200, { note: createNote(auth.user.id) }), true;
    }

    const noteMatch = /^\/api\/notes\/([\w-]+)$/.exec(path);
    if (noteMatch) {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      if (req.method === 'PATCH') {
        const body = await readBody(req);
        const note = updateNote(noteMatch[1], auth.user.id, body.patch ?? body);
        if (!note) return bad(res, '笔记不存在', 404), true;
        return json(res, 200, { note }), true;
      }
      if (req.method === 'DELETE') {
        const ok = deleteNote(noteMatch[1], auth.user.id);
        if (!ok) return bad(res, '笔记不存在', 404), true;
        return json(res, 200, { ok: true }), true;
      }
    }

    // ------------------------------------------------------------------ 提醒
    if (path === '/api/alerts' && req.method === 'GET') {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      return json(res, 200, myAlerts(auth.user.id)), true;
    }

    if (path === '/api/alerts/read' && req.method === 'POST') {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      const body = await readBody(req);
      const count = markAlertsRead(auth.user.id, body.all ? 'all' : body.ids);
      return json(res, 200, { ok: true, count }), true;
    }

    if (path === '/api/reminders' && req.method === 'GET') {
      const auth = requireUser(req);
      if (auth.error) return bad(res, auth.error, auth.status), true;
      return json(res, 200, { reminders: reminders(auth.user.id) }), true;
    }

    return bad(res, '接口不存在', 404), true;
  } catch (error) {
    console.error('[api]', error);
    return bad(res, '服务器出错了', 500), true;
  }
}
