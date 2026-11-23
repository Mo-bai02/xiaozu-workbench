/**
 * 数据层：Node 24 内置的 node:sqlite，一个文件就是一个库，不需要装任何依赖。
 *
 * 时间统一存 epoch 毫秒（整数）。所有"今天/本月"的判断都按北京时间算，
 * 因为中国不实行夏令时，UTC+8 是固定偏移，可以直接用「时间戳 + 8 小时」再取 UTC 字段。
 * 如果以后要支持多时区，就得改成存时区字段 + 按 IANA 规则换算，那是另一件事了。
 */
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL CHECK (status IN ('todo', 'doing', 'done')),
  priority     TEXT NOT NULL CHECK (priority IN ('low', 'mid', 'high')),
  assignee_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  tags         TEXT NOT NULL DEFAULT '[]',
  created_by   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  due_at       INTEGER,
  completed_at INTEGER,
  important    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  category   TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  payer_id   TEXT NOT NULL REFERENCES users(id),
  shared_by  TEXT NOT NULL,
  spent_at   INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id  TEXT REFERENCES groups(id) ON DELETE SET NULL,
  task_id   TEXT,
  minutes   INTEGER NOT NULL,
  ended_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',
  tags       TEXT NOT NULL DEFAULT '[]',
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id, spent_at);
CREATE INDEX IF NOT EXISTS idx_focus_user_day ON focus_sessions(user_id, ended_at);
`);

// 看板不再区分「进行中」，历史数据并到待办
db.exec("UPDATE tasks SET status = 'todo' WHERE status = 'doing'");

// 专注记录支持自定义任务名（不选看板任务时自己填）
try {
  db.exec('ALTER TABLE focus_sessions ADD COLUMN task_label TEXT');
} catch {
  /* 已经有了 */
}

// 提醒的已读状态：按「用户 + 任务」记，同一任务在不同人眼里各自已读
db.exec(`
CREATE TABLE IF NOT EXISTS alert_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, task_id)
);
`);

// 老库没有 important 列，启动时补一次（SQLite 不支持 IF NOT EXISTS 加列）
try {
  db.exec('ALTER TABLE tasks ADD COLUMN important INTEGER NOT NULL DEFAULT 0');
} catch {
  /* 已经有了 */
}

// ---------------------------------------------------------------------------
// 时间：北京时间（UTC+8，无夏令时）
// ---------------------------------------------------------------------------
const CST_OFFSET = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export const now = () => Date.now();
export const uid = (prefix) => `${prefix}_${randomBytes(8).toString('hex')}`;

/** 某时间戳对应的北京时间日期串 YYYY-MM-DD */
export function cstDayKey(ts = Date.now()) {
  return new Date(ts + CST_OFFSET).toISOString().slice(0, 10);
}

/** 北京时间「今天」的起止时间戳 */
export function cstDayRange(ts = Date.now()) {
  const shifted = new Date(ts + CST_OFFSET);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - CST_OFFSET;
  return { start, end: start + DAY };
}

/** 北京时间「本月」的起止时间戳 */
export function cstMonthRange(ts = Date.now()) {
  const shifted = new Date(ts + CST_OFFSET);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - CST_OFFSET;
  const next = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1) - CST_OFFSET;
  return { start, end: next };
}

/** 把 YYYY-MM 解析成北京时间的月份区间；非法输入返回本月 */
export function cstMonthRangeByKey(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey ?? '');
  if (!match) return cstMonthRange();
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const start = Date.UTC(year, month, 1) - CST_OFFSET;
  const end = Date.UTC(year, month + 1, 1) - CST_OFFSET;
  return { start, end };
}

// ---------------------------------------------------------------------------
// 用户与密码
// ---------------------------------------------------------------------------
function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

export function createUser({ username, password, displayName }) {
  const salt = randomBytes(16).toString('hex');
  const id = uid('u');
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_salt, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, username.toLowerCase(), displayName || username, salt, hashPassword(password, salt), now());
  return getUserById(id);
}

export function verifyUser(username, password) {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase());
  if (!row) return null;
  const expected = Buffer.from(row.password_hash, 'hex');
  const actual = Buffer.from(hashPassword(password, row.password_salt), 'hex');
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;
  return row;
}

export const getUserById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) ?? null;
export const getUserByName = (name) =>
  db.prepare('SELECT * FROM users WHERE username = ?').get(String(name).toLowerCase()) ?? null;

export function publicUser(row) {
  if (!row) return null;
  return { id: row.id, username: row.username, displayName: row.display_name };
}

// ---------------------------------------------------------------------------
// 会话
// ---------------------------------------------------------------------------
const SESSION_TTL = 30 * DAY;

export function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  const ts = now();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    ts,
    ts + SESSION_TTL,
  );
  return token;
}

export function sessionUser(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row) return null;
  if (row.expires_at < now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return getUserById(row.user_id);
}

export function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// ---------------------------------------------------------------------------
// 小组与权限
// ---------------------------------------------------------------------------
function inviteCode() {
  return randomBytes(3).toString('hex').toUpperCase();
}

export function createGroup(userId, name) {
  const id = uid('g');
  let code = inviteCode();
  while (db.prepare('SELECT 1 FROM groups WHERE invite_code = ?').get(code)) code = inviteCode();

  const ts = now();
  db.prepare('INSERT INTO groups (id, name, invite_code, owner_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name,
    code,
    userId,
    ts,
  );
  db.prepare('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
    id,
    userId,
    'owner',
    ts,
  );
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
}

export function membership(groupId, userId) {
  return (
    db
      .prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
      .get(groupId, userId) ?? null
  );
}

export const isManager = (role) => role === 'owner' || role === 'admin';

export function listGroups(userId) {
  const { start, end } = cstDayRange();
  return db
    .prepare(
      `SELECT g.id, g.name, g.invite_code AS inviteCode, g.owner_id AS ownerId,
              m.role,
              (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS memberCount,
              (SELECT COUNT(*) FROM tasks t WHERE t.group_id = g.id AND t.status != 'done') AS openTasks,
              (SELECT COUNT(*) FROM tasks t WHERE t.group_id = g.id AND t.status != 'done'
                 AND t.due_at IS NOT NULL AND t.due_at < ?) AS overdue,
              (SELECT COUNT(*) FROM tasks t WHERE t.group_id = g.id AND t.status != 'done'
                 AND t.due_at >= ? AND t.due_at < ?) AS dueToday,
              (SELECT COUNT(*) FROM tasks t WHERE t.group_id = g.id AND t.status = 'done') AS doneCount,
              (SELECT COUNT(*) FROM tasks t WHERE t.group_id = g.id AND t.important = 1 AND t.status != 'done') AS starred
       FROM groups g
       JOIN group_members m ON m.group_id = g.id AND m.user_id = ?
       ORDER BY g.created_at ASC`,
    )
    .all(start, start, end, userId);
}

export function joinGroupByCode(userId, code) {
  const group = db.prepare('SELECT * FROM groups WHERE invite_code = ?').get(String(code).toUpperCase());
  if (!group) return { error: '邀请码不存在' };
  if (membership(group.id, userId)) return { error: '你已经在小组里了' };
  db.prepare('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
    group.id,
    userId,
    'member',
    now(),
  );
  return { group };
}

export function listMembers(groupId) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.display_name AS displayName, m.role, m.joined_at AS joinedAt,
              (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.group_id = ? AND t.status != 'done') AS openTasks
       FROM group_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.joined_at ASC`,
    )
    .all(groupId, groupId);
}

export function setMemberRole(groupId, userId, role) {
  db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(role, groupId, userId);
}

export function removeMember(groupId, userId) {
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
  db.prepare('UPDATE tasks SET assignee_id = NULL WHERE group_id = ? AND assignee_id = ?').run(groupId, userId);
}

// ---------------------------------------------------------------------------
// 任务
// ---------------------------------------------------------------------------
const TASK_FIELDS = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  assigneeId: 'assignee_id',
  dueAt: 'due_at',
  completedAt: 'completed_at',
  important: 'important',
};

export function listTasks(groupId) {
  return db
    .prepare(
      `SELECT id, title, description, status, priority, assignee_id AS assigneeId,
              tags, created_at AS createdAt, due_at AS dueAt, completed_at AS completedAt,
              important
       FROM tasks WHERE group_id = ? ORDER BY important DESC, created_at DESC`,
    )
    .all(groupId)
    .map((row) => ({ ...row, tags: safeJson(row.tags, []), important: Boolean(row.important) }));
}

export function createTask(groupId, userId, input) {
  const id = uid('t');
  db.prepare(
    `INSERT INTO tasks (id, group_id, title, description, status, priority, assignee_id, tags, created_by, created_at, due_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    groupId,
    String(input.title ?? '').slice(0, 80) || '未命名任务',
    String(input.description ?? '').slice(0, 500),
    ['todo', 'doing', 'done'].includes(input.status) ? input.status : 'todo',
    ['low', 'mid', 'high'].includes(input.priority) ? input.priority : 'mid',
    input.assigneeId || null,
    JSON.stringify(Array.isArray(input.tags) ? input.tags : []),
    userId,
    now(),
    input.dueAt ?? null,
    input.status === 'done' ? now() : null,
    input.important ? 1 : 0,
  );
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

export function updateTask(taskId, groupId, patch) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND group_id = ?').get(taskId, groupId);
  if (!task) return null;

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(TASK_FIELDS)) {
    if (!(key in patch)) continue;
    sets.push(`${column} = ?`);
    values.push(key === 'dueAt' ? (patch[key] ?? null) : patch[key]);
  }
  if (patch.status === 'done' && !('completedAt' in patch)) {
    sets.push('completed_at = ?');
    values.push(now());
  }
  if (patch.status && patch.status !== 'done') {
    sets.push('completed_at = ?');
    values.push(null);
  }
  if (sets.length === 0) return task;

  values.push(taskId);
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
}

export function deleteTask(taskId, groupId) {
  const result = db.prepare('DELETE FROM tasks WHERE id = ? AND group_id = ?').run(taskId, groupId);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// 账目
// ---------------------------------------------------------------------------
export function listExpenses(groupId, start, end) {
  return db
    .prepare(
      `SELECT id, amount, category, note, payer_id AS payerId, shared_by AS sharedBy,
              spent_at AS date, created_by AS createdBy
       FROM expenses WHERE group_id = ? AND spent_at >= ? AND spent_at < ?
       ORDER BY spent_at DESC, created_at DESC`,
    )
    .all(groupId, start, end)
    .map((row) => ({ ...row, sharedBy: safeJson(row.sharedBy, []) }));
}

export function createExpense(groupId, userId, input) {
  const id = uid('e');
  db.prepare(
    `INSERT INTO expenses (id, group_id, amount, category, note, payer_id, shared_by, spent_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    groupId,
    Math.max(1, Math.round(Number(input.amount) || 0)),
    String(input.category ?? '其他').slice(0, 12),
    String(input.note ?? '').slice(0, 60),
    input.payerId,
    JSON.stringify(Array.isArray(input.sharedBy) ? input.sharedBy : []),
    Number(input.date) || now(),
    userId,
    now(),
  );
  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
}

export function deleteExpense(id, groupId, userId, canManage) {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ? AND group_id = ?').get(id, groupId);
  if (!row) return false;
  if (!canManage && row.created_by !== userId) return false;
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  return true;
}

// ---------------------------------------------------------------------------
// 专注
// ---------------------------------------------------------------------------
export function listFocus(userId, start, end) {
  return db
    .prepare(
      `SELECT id, minutes, task_id AS taskId, task_label AS taskLabel,
              group_id AS groupId, ended_at AS endedAt
       FROM focus_sessions WHERE user_id = ? AND ended_at >= ? AND ended_at < ?
       ORDER BY ended_at DESC`,
    )
    .all(userId, start, end);
}

export function addFocus(userId, groupId, input) {
  const id = uid('f');
  db.prepare(
    `INSERT INTO focus_sessions (id, user_id, group_id, task_id, task_label, minutes, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    groupId ?? null,
    input.taskId ?? null,
    String(input.label ?? '').slice(0, 40) || null,
    Math.max(1, Number(input.minutes) || 25),
    now(),
  );
  return id;
}

// ---------------------------------------------------------------------------
// 提醒：我所在的小组里，今天到期的和已逾期的未完成任务
// ---------------------------------------------------------------------------
export function reminders(userId) {
  const { start, end } = cstDayRange();
  return db
    .prepare(
      `SELECT t.id, t.title, t.due_at AS dueAt, t.priority, t.status, g.id AS groupId, g.name AS groupName
       FROM tasks t
       JOIN groups g ON g.id = t.group_id
       JOIN group_members m ON m.group_id = g.id AND m.user_id = ?
       WHERE t.status != 'done' AND t.due_at IS NOT NULL AND t.due_at < ?
       ORDER BY t.due_at ASC
       LIMIT 20`,
    )
    .all(userId, end)
    .map((row) => ({
      ...row,
      overdue: row.dueAt < start,
    }));
}

/**
 * 提醒只包含两类：快到期的高优先级任务，以及被标为重点的任务。
 * 普通待办不进提醒 —— 任务一多，什么都提醒等于什么都没提醒。
 */
export function myAlerts(userId) {
  const { start, end } = cstDayRange();

  const rows = db
    .prepare(
      `SELECT t.id, t.title, t.due_at AS dueAt, t.priority, t.important,
              g.id AS groupId, g.name AS groupName,
              u.display_name AS assignee,
              (ar.task_id IS NOT NULL) AS isRead
       FROM tasks t
       JOIN groups g ON g.id = t.group_id
       JOIN group_members m ON m.group_id = g.id AND m.user_id = ?
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN alert_reads ar ON ar.task_id = t.id AND ar.user_id = ?
       WHERE t.status != 'done'
         AND (
           (t.due_at IS NOT NULL AND t.due_at < ? AND (t.priority = 'high' OR t.important = 1))
           OR t.important = 1
         )
       ORDER BY t.due_at IS NULL, t.due_at ASC
       LIMIT 30`,
    )
    .all(userId, userId, end);

  const items = rows.map((row) => ({
    id: row.id,
    title: row.title,
    dueAt: row.dueAt,
    priority: row.priority,
    important: Boolean(row.important),
    groupId: row.groupId,
    groupName: row.groupName,
    assignee: row.assignee,
    overdue: row.dueAt !== null && row.dueAt < start,
    dueToday: row.dueAt !== null && row.dueAt >= start && row.dueAt < end,
    read: Boolean(row.isRead),
  }));

  return {
    items,
    unread: items.filter((item) => !item.read).length,
  };
}

/** 标记已读：传 ids 就标这些，传 all 就全标 */
export function markAlertsRead(userId, ids) {
  const ts = now();
  const insert = db.prepare(
    'INSERT OR REPLACE INTO alert_reads (user_id, task_id, read_at) VALUES (?, ?, ?)',
  );

  if (ids === 'all') {
    // 用和提醒列表相同的口径，避免「全部已读」漏掉一部分
    const { items } = myAlerts(userId);
    for (const item of items) insert.run(userId, item.id, ts);
    return items.length;
  }

  let count = 0;
  for (const id of Array.isArray(ids) ? ids : []) {
    insert.run(userId, String(id), ts);
    count += 1;
  }
  return count;
}

function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 笔记：只属于某个人，不进小组
// ---------------------------------------------------------------------------
export function listNotes(userId) {
  return db
    .prepare(
      `SELECT id, title, content, tags, pinned, created_at AS createdAt, updated_at AS updatedAt
       FROM notes WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC`,
    )
    .all(userId)
    .map((row) => ({ ...row, pinned: Boolean(row.pinned), tags: safeJson(row.tags, []) }));
}

export function createNote(userId) {
  const id = uid('n');
  const ts = now();
  db.prepare(
    'INSERT INTO notes (id, user_id, title, content, tags, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
  ).run(id, userId, '未命名笔记', '', '[]', ts, ts);
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

export function updateNote(id, userId, patch) {
  const row = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return null;
  const sets = [];
  const values = [];
  if (typeof patch.title === 'string') {
    sets.push('title = ?');
    values.push(patch.title.slice(0, 60));
  }
  if (typeof patch.content === 'string') {
    sets.push('content = ?');
    values.push(patch.content.slice(0, 20000));
  }
  if (Array.isArray(patch.tags)) {
    sets.push('tags = ?');
    values.push(JSON.stringify(patch.tags));
  }
  if (typeof patch.pinned === 'boolean') {
    sets.push('pinned = ?');
    values.push(patch.pinned ? 1 : 0);
  }
  if (sets.length === 0) return row;
  sets.push('updated_at = ?');
  values.push(now(), id);
  db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

export function deleteNote(id, userId) {
  return db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}
