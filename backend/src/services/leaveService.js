const { init } = require('../db');
const { uuid, now, HttpError } = require('../utils/helpers');
const audit = require('./auditService');

const TYPES = ['casual', 'sick', 'earned', 'unpaid'];

function dayCount(from, to) {
  const a = new Date(from), b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

// employee applies for leave (scoped to their own employeeId)
async function apply(employeeId, { type, from_date, to_date, reason }, actorId) {
  if (!employeeId) throw new HttpError(400, 'This account is not linked to an employee record.');
  if (!TYPES.includes(type)) throw new HttpError(400, `Leave type must be one of: ${TYPES.join(', ')}`);
  if (!from_date || !to_date) throw new HttpError(400, 'from_date and to_date are required');
  const days = dayCount(from_date, to_date);
  if (days < 1) throw new HttpError(400, 'Invalid date range');
  const db = await init();
  const id = uuid();
  await db.run(
    `INSERT INTO leave_requests (id, employee_id, type, from_date, to_date, days, reason, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [id, employeeId, type, from_date, to_date, days, reason || null, now(), now()]
  );
  await audit.log(actorId, 'LEAVE_APPLIED', 'leave_requests', id, { type, from_date, to_date, days });
  return db.get('SELECT * FROM leave_requests WHERE id = ?', [id]);
}

// employee: own leaves only
async function mine(employeeId) {
  if (!employeeId) throw new HttpError(400, 'This account is not linked to an employee record.');
  const db = await init();
  return db.all('SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC', [employeeId]);
}

// hr/admin: all leaves (with employee name), optional status filter
async function list({ status } = {}) {
  const db = await init();
  // single-quoted literals + CASE work on both SQLite and Postgres (the adapter
  // rewrites ? to $n for pg). Pending first, then newest.
  let sql = `SELECT l.*, e.full_name, e.employee_id AS emp_code, e.department
             FROM leave_requests l JOIN employees e ON e.id = l.employee_id`;
  const params = [];
  if (status) { sql += ' WHERE l.status = ?'; params.push(status); }
  sql += ` ORDER BY CASE WHEN l.status = 'PENDING' THEN 0 ELSE 1 END, l.created_at DESC`;
  return db.all(sql, params);
}

async function review(id, { status, note }, actorId) {
  if (!['APPROVED', 'REJECTED'].includes(status)) throw new HttpError(400, 'status must be APPROVED or REJECTED');
  const db = await init();
  const lr = await db.get('SELECT * FROM leave_requests WHERE id = ?', [id]);
  if (!lr) throw new HttpError(404, 'Leave request not found');
  if (lr.status !== 'PENDING') throw new HttpError(409, `This request is already ${lr.status}`);
  await db.run('UPDATE leave_requests SET status = ?, reviewed_by = ?, review_note = ?, updated_at = ? WHERE id = ?',
    [status, actorId, note || null, now(), id]);
  await audit.log(actorId, status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', 'leave_requests', id, { note });
  return db.get('SELECT * FROM leave_requests WHERE id = ?', [id]);
}

async function pendingCount() {
  const db = await init();
  const r = await db.get(`SELECT COUNT(*) AS n FROM leave_requests WHERE status = 'PENDING'`);
  return Number(r?.n || 0);
}

module.exports = { apply, mine, list, review, pendingCount, TYPES };
