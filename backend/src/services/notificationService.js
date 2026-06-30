const { init } = require('../db');
const { uuid, now } = require('../utils/helpers');
const mailer = require('./mailerService');

// Insert in-app notifications for a set of user ids; optionally also email them.
async function toUsers(userIds, { type, title, body = '', link = null, email = null } = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return { count: 0 };
  const db = await init();
  for (const uid of ids) {
    await db.run('INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [uuid(), uid, type, title, body || null, link || null, now()]);
  }
  if (email) {
    // send mail in the background so callers never block
    (async () => {
      try {
        const rows = await db.all(`SELECT email FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
        const to = rows.map((r) => r.email).filter(Boolean);
        if (to.length) await mailer.send({ to: to.join(','), subject: email.subject || title, html: email.html || `<p>${body || title}</p>` });
      } catch (e) { console.error('[notif-email]', e.message); }
    })();
  }
  return { count: ids.length };
}

async function toRoles(roles, opts) {
  const db = await init();
  const rows = await db.all(`SELECT id FROM users WHERE role IN (${roles.map(() => '?').join(',')})`, roles);
  return toUsers(rows.map((r) => r.id), opts);
}

async function toEmployee(employeeId, opts) {
  if (!employeeId) return { count: 0 };
  const db = await init();
  const rows = await db.all('SELECT id FROM users WHERE employee_id = ?', [employeeId]);
  return toUsers(rows.map((r) => r.id), opts);
}

const toUser = (userId, opts) => toUsers([userId], opts);

// Fire-and-forget helpers (never throw into the caller)
const safe = (p) => { p.catch((e) => console.error('[notify]', e.message)); };
const bgRoles = (roles, opts) => safe(toRoles(roles, opts));
const bgEmployee = (employeeId, opts) => safe(toEmployee(employeeId, opts));
const bgUser = (userId, opts) => safe(toUser(userId, opts));

async function list(userId, { limit = 30 } = {}) {
  const db = await init();
  return db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY read ASC, created_at DESC LIMIT ?', [userId, limit]);
}
async function unreadCount(userId) {
  const db = await init();
  const r = await db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', [userId]);
  return Number(r?.n || 0);
}
async function markRead(userId, id) {
  const db = await init();
  await db.run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
  return { ok: true };
}
async function markAllRead(userId) {
  const db = await init();
  await db.run('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', [userId]);
  return { ok: true };
}

module.exports = { toUsers, toRoles, toEmployee, toUser, bgRoles, bgEmployee, bgUser, list, unreadCount, markRead, markAllRead };
