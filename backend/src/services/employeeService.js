const { parse } = require('csv-parse/sync');
const { init } = require('../db');
const { uuid, now, HttpError } = require('../utils/helpers');
const audit = require('./auditService');
const userService = require('./userService');
const ai = require('./aiService');
const mailer = require('./mailerService');
const settings = require('./settingsService');

const REQUIRED = ['employee_id', 'full_name', 'email', 'dob'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function templateVars(db, emp) {
  const company = (await settings.get('company')) || {};
  const d = new Date();
  let years = '';
  if (emp.date_of_joining) {
    const doj = new Date(emp.date_of_joining);
    if (!Number.isNaN(doj.getTime())) {
      let y = d.getFullYear() - doj.getFullYear();
      if (d.getMonth() < doj.getMonth() || (d.getMonth() === doj.getMonth() && d.getDate() < doj.getDate())) y -= 1;
      years = String(Math.max(0, y));
    }
  }
  const last = await db.get('SELECT net_pay FROM salary_records WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1', [emp.id]);
  return {
    name: emp.full_name, company: company.name || '', designation: emp.designation || '',
    department: emp.department || '', date_of_joining: emp.date_of_joining || '', years,
    month: MONTHS[d.getMonth()], year: d.getFullYear(),
    net_pay: last ? Number(last.net_pay).toLocaleString('en-IN') : '',
  };
}

async function sendTemplatedEmail(employeeId, templateName, actorId) {
  const db = await init();
  const emp = await db.get('SELECT * FROM employees WHERE id = ?', [employeeId]);
  if (!emp) throw new HttpError(404, 'Employee not found');
  if (!templateName) throw new HttpError(400, 'template is required');
  const tpl = await db.get('SELECT * FROM email_templates WHERE name = ?', [templateName]);
  if (!tpl) throw new HttpError(404, 'Template not found');
  const vars = await templateVars(db, emp);
  const subject = mailer.renderTemplate(tpl.subject, vars);
  const html = mailer.renderTemplate(tpl.body_html, vars);
  const res = await mailer.send({ to: emp.email, subject, html });
  await audit.log(actorId, 'EMAIL_SENT', 'employees', employeeId, { template: templateName, to: emp.email, dev: res.dev });
  return { ok: true, to: emp.email, subject, dev: res.dev };
}

function validateRow(row, idx) {
  const errors = [];
  for (const f of REQUIRED) if (!row[f] || !String(row[f]).trim()) errors.push(`row ${idx + 2}: missing ${f}`);
  if (row.email && !EMAIL_RE.test(String(row.email).trim())) errors.push(`row ${idx + 2}: invalid email "${row.email}"`);
  if (row.dob && Number.isNaN(new Date(row.dob).getTime())) errors.push(`row ${idx + 2}: invalid dob "${row.dob}" (use YYYY-MM-DD)`);
  return errors;
}

async function importCsv(buffer, actorId, { partial = false } = {}) {
  let raw;
  try {
    raw = parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    throw new HttpError(400, `CSV parse error: ${e.message}`);
  }
  if (!raw.length) throw new HttpError(400, 'CSV has no data rows');

  const headers = Object.keys(raw[0]);
  const { map, autoMapped } = await ai.resolveColumns(headers, 'employee');
  const rows = raw.map((r) => ai.applyMap(r, map));

  const allErrors = [];
  const seen = new Set();
  rows.forEach((r, i) => {
    allErrors.push(...validateRow(r, i));
    const key = String(r.employee_id || '').trim();
    if (key && seen.has(key)) allErrors.push(`row ${i + 2}: duplicate employee_id "${key}" in file`);
    seen.add(key);
  });
  if (allErrors.length && !partial) throw new HttpError(422, 'Validation failed - nothing imported', allErrors);

  const db = await init();
  let inserted = 0, updated = 0, skipped = 0, accountsCreated = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (validateRow(r, i).length) { skipped++; continue; }
    const dob = new Date(r.dob).toISOString().slice(0, 10);
    const existing = await db.get('SELECT id FROM employees WHERE employee_id = ?', [String(r.employee_id).trim()]);
    const status = ['active', 'inactive'].includes(String(r.status || '').toLowerCase()) ? String(r.status).toLowerCase() : 'active';
    if (existing) {
      const cleanEmailU = String(r.email).trim().toLowerCase();
      await db.run(
        `UPDATE employees SET full_name=?, email=?, dob=?, designation=?, department=?, date_of_joining=?, status=?, updated_at=? WHERE id=?`,
        [r.full_name, cleanEmailU, dob, r.designation || null, r.department || null, r.date_of_joining || null, status, now(), existing.id]
      );
      updated++;
      // make sure already-imported employees also get a login (no-op if one exists)
      try {
        if (await userService.createForEmployee({ id: existing.id, email: cleanEmailU }, actorId)) accountsCreated++;
      } catch (e) { /* never break import */ }
    } else {
      const newId = uuid();
      const cleanEmail = String(r.email).trim().toLowerCase();
      await db.run(
        `INSERT INTO employees (id, employee_id, full_name, email, dob, designation, department, date_of_joining, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, String(r.employee_id).trim(), r.full_name, cleanEmail, dob, r.designation || null, r.department || null, r.date_of_joining || null, status, now(), now()]
      );
      inserted++;
      // auto-provision an employee login (password = email, must change on first login)
      try {
        if (await userService.createForEmployee({ id: newId, email: cleanEmail }, actorId)) accountsCreated++;
      } catch (e) { /* never let account creation break the import */ }
    }
  }
  await audit.log(actorId, 'EMPLOYEES_IMPORTED', 'employees', null, { inserted, updated, skipped, errors: allErrors.length, autoMapped });
  return { inserted, updated, skipped, accountsCreated, errors: allErrors, autoMapped };
}

async function list({ q, status } = {}) {
  const db = await init();
  let sql = 'SELECT * FROM employees';
  const where = [], params = [];
  if (q) { where.push('(full_name LIKE ? OR email LIKE ? OR employee_id LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY full_name ASC';
  return db.all(sql, params);
}

async function update(id, data, actorId) {
  const db = await init();
  const emp = await db.get('SELECT * FROM employees WHERE id = ?', [id]);
  if (!emp) throw new HttpError(404, 'Employee not found');

  const errors = [];
  if (data.email !== undefined && !EMAIL_RE.test(String(data.email).trim())) errors.push(`invalid email "${data.email}"`);
  if (data.dob !== undefined && Number.isNaN(new Date(data.dob).getTime())) errors.push(`invalid dob "${data.dob}" (use YYYY-MM-DD)`);
  if (data.full_name !== undefined && !String(data.full_name).trim()) errors.push('full_name cannot be empty');
  if (data.status !== undefined && !['active', 'inactive'].includes(data.status)) errors.push('status must be active or inactive');
  if (errors.length) throw new HttpError(422, 'Validation failed', errors);

  if (data.email !== undefined) {
    const dup = await db.get('SELECT id FROM employees WHERE email = ? AND id != ?', [String(data.email).trim().toLowerCase(), id]);
    if (dup) throw new HttpError(409, 'Another employee already uses this email');
  }

  const next = {
    full_name: data.full_name !== undefined ? String(data.full_name).trim() : emp.full_name,
    email: data.email !== undefined ? String(data.email).trim().toLowerCase() : emp.email,
    dob: data.dob !== undefined ? new Date(data.dob).toISOString().slice(0, 10) : emp.dob,
    designation: data.designation !== undefined ? (data.designation || null) : emp.designation,
    department: data.department !== undefined ? (data.department || null) : emp.department,
    date_of_joining: data.date_of_joining !== undefined ? (data.date_of_joining || null) : emp.date_of_joining,
    status: data.status !== undefined ? data.status : emp.status,
  };
  await db.run(
    `UPDATE employees SET full_name=?, email=?, dob=?, designation=?, department=?, date_of_joining=?, status=?, updated_at=? WHERE id=?`,
    [next.full_name, next.email, next.dob, next.designation, next.department, next.date_of_joining, next.status, now(), id]
  );
  await audit.log(actorId, 'EMPLOYEE_UPDATED', 'employees', id, { employee_id: emp.employee_id });
  return db.get('SELECT * FROM employees WHERE id = ?', [id]);
}

// Full 360 view of one employee for HR/Admin: profile + account + salary history + leaves + tickets.
async function overview(employeeId) {
  const db = await init();
  const e = await db.get('SELECT * FROM employees WHERE id = ?', [employeeId]);
  if (!e) throw new HttpError(404, 'Employee not found');
  const account = await db.get('SELECT id, email, role, must_change_password, created_at FROM users WHERE employee_id = ?', [employeeId]);
  const slips = await db.all(
    `SELECT r.*, b.month, b.year, b.status AS batch_status FROM salary_records r
     JOIN salary_batches b ON b.id = r.batch_id
     WHERE r.employee_id = ? AND b.status IN ('APPROVED','SENT')
     ORDER BY b.year DESC, b.month DESC`, [employeeId]
  );
  const leaves = await db.all('SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY from_date DESC', [employeeId]);
  const tickets = await db.all('SELECT * FROM tickets WHERE employee_id = ? ORDER BY updated_at DESC', [employeeId]);
  const year = new Date().getFullYear();
  return {
    employee: e,
    account: account || null,
    slips: slips.map((s) => ({ ...s, month_name: MONTHS[s.month - 1] })),
    leaves,
    tickets,
    summary: {
      slipCount: slips.length,
      ytdNet: slips.filter((s) => s.year === year).reduce((a, s) => a + Number(s.net_pay || 0), 0),
      leaveCount: leaves.length,
      leaveApprovedDays: leaves.filter((l) => l.status === 'APPROVED').reduce((a, l) => a + Number(l.days || 0), 0),
      pendingLeaves: leaves.filter((l) => l.status === 'PENDING').length,
      openTickets: tickets.filter((t) => ['OPEN', 'IN_PROGRESS'].includes(t.status)).length,
    },
  };
}

module.exports = { importCsv, list, update, sendTemplatedEmail, overview };
