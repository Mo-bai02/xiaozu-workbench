/**
 * 演示数据脚本：node server/seed-demo.mjs
 *
 * 做什么：
 * 1. 把已有的第一个小组改名为「测试组1」（保留原有任务）
 * 2. 新建「测试组2」，塞一套**完全不同**的任务和成员
 * 3. 所有演示账号密码统一成 111111
 *
 * 可以重复执行：已经存在的成员/任务不会重复插入。
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { cstDayRange, db, createGroup, getUserByName, now, uid } from './db.mjs';

const PASSWORD = '111111';

function hash(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

function ensureUser(username, displayName) {
  const existing = getUserByName(username);
  if (existing) {
    const salt = randomBytes(16).toString('hex');
    db.prepare('UPDATE users SET display_name = ?, password_salt = ?, password_hash = ? WHERE id = ?').run(
      displayName,
      salt,
      hash(PASSWORD, salt),
      existing.id,
    );
    return existing.id;
  }
  const salt = randomBytes(16).toString('hex');
  const id = uid('u');
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_salt, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, username, displayName, salt, hash(PASSWORD, salt), now());
  return id;
}

function ensureGroup(name, ownerId) {
  const existing = db.prepare('SELECT * FROM groups WHERE name = ?').get(name);
  if (existing) {
    db.prepare('UPDATE groups SET owner_id = ? WHERE id = ?').run(ownerId, existing.id);
    ensureMember(existing.id, ownerId, 'owner');
    return existing.id;
  }
  const group = createGroup(ownerId, name);
  return group.id;
}

function ensureMember(groupId, userId, role) {
  const row = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (row) {
    if (row.role !== role) {
      db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(role, groupId, userId);
    }
    return;
  }
  db.prepare('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
    groupId,
    userId,
    role,
    now(),
  );
}

function addTask(groupId, creatorId, task) {
  const exists = db.prepare('SELECT 1 FROM tasks WHERE group_id = ? AND title = ?').get(groupId, task.title);
  if (exists) return;
  db.prepare(
    `INSERT INTO tasks (id, group_id, title, description, status, priority, assignee_id, tags, created_by, created_at, due_at, completed_at, important)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uid('t'),
    groupId,
    task.title,
    task.description ?? '',
    task.status ?? 'todo',
    task.priority ?? 'mid',
    task.assigneeId ?? null,
    JSON.stringify(task.tags ?? []),
    creatorId,
    now(),
    task.dueAt ?? null,
    task.status === 'done' ? now() : null,
    task.important ? 1 : 0,
  );
}

function addExpense(groupId, creatorId, expense) {
  const exists = db
    .prepare('SELECT 1 FROM expenses WHERE group_id = ? AND note = ?')
    .get(groupId, expense.note);
  if (exists) return;
  db.prepare(
    `INSERT INTO expenses (id, group_id, amount, category, note, payer_id, shared_by, spent_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uid('e'),
    groupId,
    expense.amount,
    expense.category,
    expense.note,
    expense.payerId,
    JSON.stringify(expense.sharedBy),
    expense.spentAt,
    creatorId,
    now(),
  );
}

// ---------------------------------------------------------------------------
const today = cstDayRange(now());
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const dueToday = today.start + 18 * HOUR; // 今天 18:00（北京时间）
const dueTodayLate = today.start + 21 * HOUR;
const overdue = today.start - 2 * DAY + 10 * HOUR;
const tomorrow = today.start + DAY + 15 * HOUR;
const nextWeek = today.start + 5 * DAY + 12 * HOUR;

// 真正的主人：优先 mobai，否则取第一个非演示账号
const DEMO_NAMES = ['ownerId', 'surui', 'zhouye', 'linxiao', 'demo_user'];
const ownerRow =
  db.prepare("SELECT * FROM users WHERE username = 'mobai'").get() ??
  db
    .prepare('SELECT * FROM users ORDER BY created_at ASC')
    .all()
    .find((u) => !DEMO_NAMES.includes(u.username));
if (!ownerRow) {
  console.error('数据库里还没有真实账号，先在页面上注册一个再跑这个脚本');
  process.exit(1);
}
const ownerId = ownerRow.id;
console.log('演示数据将挂到账号:', ownerRow.username);

const surui = ensureUser('surui', '苏芮');
const zhouye = ensureUser('zhouye', '周野');
const linxiao = ensureUser('linxiao', '林晓');

// 组 1：把原来的组直接改名，任务原样保留
const legacy = db.prepare("SELECT id FROM groups WHERE name = '毕设小组'").get();
if (legacy) {
  db.prepare("UPDATE groups SET name = '测试组1' WHERE id = ?").run(legacy.id);
  console.log('已把「毕设小组」改名为「测试组1」');
}
const group1 = ensureGroup('测试组1', ownerId);
ensureMember(group1, surui, 'member');
ensureMember(group1, zhouye, 'member');

addTask(group1, ownerId, {
  title: '本周答辩材料定稿',
  description: '按导师意见改第三版，改完发给全组',
  status: 'doing',
  priority: 'high',
  assigneeId: ownerId,
  dueAt: dueToday,
  important: true,
  tags: ['答辩'],
});
addTask(group1, ownerId, {
  title: '补一版接口文档',
  description: '把新增的登录和小组接口补进去',
  status: 'todo',
  priority: 'mid',
  assigneeId: zhouye,
  dueAt: overdue,
  tags: ['文档'],
});

// 组 2：全新的数据，跟组 1 不重样
const group2 = ensureGroup('测试组2', ownerId);
ensureMember(group2, surui, 'admin');
ensureMember(group2, zhouye, 'member');
ensureMember(group2, linxiao, 'member');

addTask(group2, ownerId, {
  title: '周四晚社团招新摆摊',
  description: '桌椅、海报、报名二维码，7 点前布置完',
  status: 'doing',
  priority: 'high',
  assigneeId: surui,
  dueAt: dueTodayLate,
  important: true,
  tags: ['招新'],
});
addTask(group2, ownerId, {
  title: '招新海报终稿',
  description: '主视觉定稿，导出 300dpi',
  status: 'done',
  priority: 'mid',
  assigneeId: linxiao,
  dueAt: overdue,
  tags: ['设计'],
});
addTask(group2, ownerId, {
  title: '整理老成员联系方式',
  description: '核对微信群名单',
  status: 'todo',
  priority: 'low',
  assigneeId: zhouye,
  dueAt: tomorrow,
  tags: ['运营'],
});
addTask(group2, ownerId, {
  title: '申请活动室 302',
  description: '周四下午要用两小时',
  status: 'todo',
  priority: 'high',
  assigneeId: ownerId,
  dueAt: overdue,
  tags: ['场地'],
});
addTask(group2, ownerId, {
  title: '统计报名人数并排班',
  description: '按时间段分三组',
  status: 'todo',
  priority: 'mid',
  assigneeId: linxiao,
  dueAt: nextWeek,
  tags: ['排班'],
});
addTask(group2, ownerId, {
  title: '活动结束后做复盘',
  description: '有什么没做好的，写三条',
  status: 'doing',
  priority: 'low',
  assigneeId: surui,
  dueAt: nextWeek,
  tags: ['复盘'],
});

addExpense(group2, ownerId, {
  amount: 6800,
  category: '采购',
  note: '招新小礼品 200 份',
  payerId: ownerId,
  sharedBy: [ownerId, surui, zhouye, linxiao],
  spentAt: today.start - DAY + 14 * HOUR,
});
addExpense(group2, ownerId, {
  amount: 2400,
  category: '场地',
  note: '活动室清洁费',
  payerId: linxiao,
  sharedBy: [ownerId, surui, linxiao],
  spentAt: today.start - DAY + 16 * HOUR,
});

const groups = db.prepare('SELECT name FROM groups ORDER BY created_at').all();
console.log('演示数据已就绪：');
for (const group of groups) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE group_id = (SELECT id FROM groups WHERE name = ?)').get(group.name);
  console.log(`  ${group.name} · ${count.n} 个任务`);
}
console.log(`账号密码统一为 ${PASSWORD}：ownerId / surui / zhouye / linxiao`);
