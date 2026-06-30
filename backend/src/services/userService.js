const bcrypt = require('bcryptjs');
const { init } = require('../db');
const { uuid, now, HttpError } = require('../utils/helpers');
const { ROLES } = require('../middleware/auth');
const audit = require('./auditService');
const notify = require('./notificationService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const safe = (u) => ({
  id: u.id, email: u.email, role: u.role,
  employee_id: u.employee_id, employee_name: u.employee_name,
  must_change_password: !!u.must_change_password, created_at: u.created_at,
});

async function list() {
  const db = await init();
  return db.all(
    `SELECT u.id, u.email, u.role, u.employee_id, u.must_change_password, u.created_at, e.full_name AS employee_name
     FROM users u LEFT JOIN employees e ON e.id = u.employee_id
     ORDER BY u.created_at ASC`
  );
}

// Admin creates a user. Password is OPTIONAL: if omitted, it defaults to the
// user's own email address. Every account created here must change the password
// on first login (must_change_password = 1).
async function create({ email, password, role, employeeId }, actorId) {
  const db = await init();
  email = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Valid email is required');
  if (!ROLES.includes(role)) throw new HttpError(400, `Role must be one of: ${ROLES.join(', ')}`);
  // default the initial password to the email address
  const initialPassword = (password && String(password).length) ? String(password) : email;
  if (initialPassword.length < 6) throw new HttpError(400, 'Password (or email) must be at least 6 characters');
  const exists = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (exists) throw new HttpError(409, 'A user with this email already exists');
  if (role === 'employee' && !employeeId) throw new HttpError(400, 'An employee-role user must be linked to an employee');
  if (employeeId) {
    const emp = await db.get('SELECT id FROM employees WHERE id = ?', [employeeId]);
    if (!emp) throw new HttpError(400, 'Linked employee not found');
  }
  const id = uuid();
  await db.run(
    'INSERT INTO users (id, email, password_hash, role, employee_id, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [id, email, bcrypt.hashSync(initialPassword, 10), role, employeeId || null, now()]
  );
  await audit.log(actorId, 'USER_CREATED', 'users', id, { email, role, passwordDefaultedToEmail: initialPassword === email });
  notify.bgUser(id, { type: 'account', title: 'Welcome to PaySlip Agent',
    body: `An account was created for you (${email}). ${initialPassword === email ? 'Your temporary password is your email — please change it after first login.' : ''}`,
    link: '/profile', email: { subject: 'Your PaySlip Agent account is ready' } });
  return safe(await db.get('SELECT u.*, e.full_name AS employee_name FROM users u LEFT JOIN employees e ON e.id = u.employee_id WHERE u.id = ?', [id]));
}

// Used by CSV import: silently provision an employee login (password = email,
// must change on first login). Returns true if a new account was created.
async function createForEmployee(employee, actorId) {
  const db = await init();
  const email = String(employee.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return false;
  const exists = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (exists) return false;
  const id = uuid();
  await db.run(
    'INSERT INTO users (id, email, password_hash, role, employee_id, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [id, email, bcrypt.hashSync(email, 10), 'employee', employee.id, now()]
  );
  await audit.log(actorId, 'USER_CREATED', 'users', id, { email, role: 'employee', via: 'csv_import' });
  return true;
}

async function update(id, { role, employeeId, password }, actorId) {
  const db = await init();
  const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw new HttpError(404, 'User not found');
  if (role !== undefined && !ROLES.includes(role)) throw new HttpError(400, `Role must be one of: ${ROLES.join(', ')}`);

  // never leave the system without an admin
  if (role !== undefined && user.role === 'admin' && role !== 'admin') {
    const admins = await db.get(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`);
    if (Number(admins.n) <= 1) throw new HttpError(400, 'Cannot change the role of the last admin');
  }
  const nextRole = role !== undefined ? role : user.role;
  let nextEmp = employeeId !== undefined ? (employeeId || null) : user.employee_id;
  if (nextRole === 'employee' && !nextEmp) throw new HttpError(400, 'An employee-role user must be linked to an employee');
  if (nextEmp) {
    const emp = await db.get('SELECT id FROM employees WHERE id = ?', [nextEmp]);
    if (!emp) throw new HttpError(400, 'Linked employee not found');
  }
  await db.run('UPDATE users SET role = ?, employee_id = ? WHERE id = ?', [nextRole, nextEmp, id]);
  if (password) {
    if (String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    // admin reset -> force a change on next login again
    await db.run('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [bcrypt.hashSync(password, 10), id]);
  }
  await audit.log(actorId, 'USER_UPDATED', 'users', id, { role: nextRole, passwordReset: !!password });
  return safe(await db.get('SELECT u.*, e.full_name AS employee_name FROM users u LEFT JOIN employees e ON e.id = u.employee_id WHERE u.id = ?', [id]));
}

// Any authenticated user changes their own password. Clears the must-change flag.
async function changePassword(userId, currentPassword, newPassword) {
  const db = await init();
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) throw new HttpError(404, 'User not found');
  if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw new HttpError(401, 'Current password is incorrect');
  }
  if (!newPassword || String(newPassword).length < 6) throw new HttpError(400, 'New password must be at least 6 characters');
  if (await bcrypt.compare(newPassword, user.password_hash)) {
    throw new HttpError(400, 'New password must be different from the current one');
  }
  await db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [bcrypt.hashSync(newPassword, 10), userId]);
  await audit.log(userId, 'PASSWORD_CHANGED', 'users', userId);
  notify.bgUser(userId, { type: 'security', title: 'Password changed',
    body: 'Your account password was changed. If this was not you, contact your admin immediately.',
    link: '/profile', email: { subject: 'Your password was changed' } });
  return { ok: true };
}

async function remove(id, actorId) {
  const db = await init();
  const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw new HttpError(404, 'User not found');
  if (id === actorId) throw new HttpError(400, 'You cannot delete your own account');
  if (user.role === 'admin') {
    const admins = await db.get(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`);
    if (Number(admins.n) <= 1) throw new HttpError(400, 'Cannot delete the last admin');
  }
  await db.run('DELETE FROM users WHERE id = ?', [id]);
  await audit.log(actorId, 'USER_DELETED', 'users', id, { email: user.email });
  return { ok: true };
}

// One-time backfill: create employee logins for every employee that has an email
// but no user account yet (password = email, must change on first login).
async function backfillEmployeeAccounts(actorId) {
  const db = await init();
  const employees = await db.all('SELECT id, email FROM employees');
  let created = 0, skipped = 0;
  for (const emp of employees) {
    try {
      if (await createForEmployee(emp, actorId)) created++; else skipped++;
    } catch (e) { skipped++; }
  }
  await audit.log(actorId, 'EMPLOYEE_ACCOUNTS_BACKFILLED', 'users', null, { created, skipped });
  return { created, skipped };
}

// emails of everyone who should review a salary batch (HR + Admin)
async function reviewerEmails() {
  const db = await init();
  const rows = await db.all(`SELECT email FROM users WHERE role IN ('hr', 'admin')`);
  return rows.map((r) => r.email);
}

module.exports = { list, create, createForEmployee, backfillEmployeeAccounts, update, changePassword, remove, reviewerEmails };
