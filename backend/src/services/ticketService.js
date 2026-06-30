const { init } = require('../db');
const { uuid, now, HttpError } = require('../utils/helpers');
const audit = require('./auditService');
const mailer = require('./mailerService');
const users = require('./userService');
const rag = require('./ragService');
const notify = require('./notificationService');

const CATEGORIES = ['email', 'phone', 'address', 'other'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const CAT_LABEL = { email: 'Email change', phone: 'Phone change', address: 'Address change', other: 'Other personal detail' };

async function employeeName(db, employeeId) {
  const e = await db.get('SELECT full_name, email FROM employees WHERE id = ?', [employeeId]);
  return e || { full_name: 'Employee', email: null };
}

// employee raises a change request -> notifies HR/Admin by email
async function create(employeeId, { category, subject, message }, actor) {
  if (!employeeId) throw new HttpError(400, 'This account is not linked to an employee record.');
  if (!CATEGORIES.includes(category)) throw new HttpError(400, `Category must be one of: ${CATEGORIES.join(', ')}`);
  if (!subject || !String(subject).trim()) throw new HttpError(400, 'A short subject is required');
  if (!message || !String(message).trim()) throw new HttpError(400, 'Please describe the change you need');
  const db = await init();
  const id = uuid();
  const ts = now();
  await db.run(
    `INSERT INTO tickets (id, employee_id, category, subject, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
    [id, employeeId, category, String(subject).trim(), actor.sub, ts, ts]
  );
  const emp = await employeeName(db, employeeId);
  await db.run(
    `INSERT INTO ticket_comments (id, ticket_id, author_id, author_role, author_name, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), id, actor.sub, actor.role || 'employee', emp.full_name, String(message).trim(), ts]
  );
  await audit.log(actor.sub, 'TICKET_CREATED', 'tickets', id, { category, subject });

  notify.bgRoles(['hr', 'admin'], { type: 'ticket', title: 'New change request',
    body: `${emp.full_name} raised: ${String(subject).trim()}`, link: '/requests' });

  // AI reply + HR email run in the BACKGROUND so the request returns immediately
  aiReply(db, id, category, String(subject).trim()).catch((e) => console.error('[ticket-ai]', e.message));
  (async () => {
    try {
      const to = await users.reviewerEmails();
      if (to.length) {
        await mailer.send({
          to: to.join(','),
          subject: `New change request: ${CAT_LABEL[category] || category} — ${emp.full_name}`,
          html: `<p><b>${emp.full_name}</b> (${emp.email || 'no email'}) has raised a personal-detail change request.</p>
                 <p><b>Type:</b> ${CAT_LABEL[category] || category}<br/><b>Subject:</b> ${String(subject).trim()}</p>
                 <p><b>Details:</b><br/>${String(message).trim().replace(/\n/g, '<br/>')}</p>
                 <p>Open the admin panel → Requests to respond and resolve it.</p>`,
        });
      }
    } catch (e) { console.error('[notify] ticket-created email failed:', e.message); }
  })();

  return get(id, { role: actor.role, employeeId });
}

async function mine(employeeId) {
  if (!employeeId) throw new HttpError(400, 'This account is not linked to an employee record.');
  const db = await init();
  return db.all(
    `SELECT t.*, (SELECT COUNT(*) FROM ticket_comments c WHERE c.ticket_id = t.id) AS comment_count
     FROM tickets t WHERE t.employee_id = ?
     ORDER BY CASE WHEN t.status IN ('OPEN','IN_PROGRESS') THEN 0 ELSE 1 END, t.updated_at DESC`,
    [employeeId]
  );
}

// HR/Admin: all tickets, optional status filter
async function list({ status } = {}) {
  const db = await init();
  let sql = `SELECT t.*, e.full_name, e.employee_id AS emp_code, e.department,
                    (SELECT COUNT(*) FROM ticket_comments c WHERE c.ticket_id = t.id) AS comment_count
             FROM tickets t JOIN employees e ON e.id = t.employee_id`;
  const params = [];
  if (status) { sql += ' WHERE t.status = ?'; params.push(status); }
  sql += ` ORDER BY CASE WHEN t.status IN ('OPEN','IN_PROGRESS') THEN 0 ELSE 1 END, t.updated_at DESC`;
  return db.all(sql, params);
}

// ticket + comment thread. scope.role employee => must own it.
async function get(id, scope = {}) {
  const db = await init();
  const t = await db.get(
    `SELECT t.*, e.full_name, e.employee_id AS emp_code, e.email AS emp_email, e.department
     FROM tickets t JOIN employees e ON e.id = t.employee_id WHERE t.id = ?`, [id]);
  if (!t) throw new HttpError(404, 'Request not found');
  if (scope.role === 'employee' && t.employee_id !== scope.employeeId) throw new HttpError(403, 'Not your request');
  const comments = await db.all('SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC', [id]);
  return { ...t, comments };
}

async function addComment(id, { message }, actor) {
  if (!message || !String(message).trim()) throw new HttpError(400, 'Message is required');
  const db = await init();
  const t = await db.get('SELECT * FROM tickets WHERE id = ?', [id]);
  if (!t) throw new HttpError(404, 'Request not found');
  const isEmployee = actor.role === 'employee';
  if (isEmployee && t.employee_id !== actor.employeeId) throw new HttpError(403, 'Not your request');
  if (t.status === 'CLOSED') throw new HttpError(409, 'This request is closed');

  let name = actor.email;
  if (isEmployee) { const e = await employeeName(db, t.employee_id); name = e.full_name; }
  const ts = now();
  await db.run(
    `INSERT INTO ticket_comments (id, ticket_id, author_id, author_role, author_name, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), id, actor.sub, actor.role, name, String(message).trim(), ts]
  );
  // an HR reply on an OPEN ticket moves it to IN_PROGRESS
  let nextStatus = t.status;
  if (!isEmployee && t.status === 'OPEN') nextStatus = 'IN_PROGRESS';
  await db.run('UPDATE tickets SET status = ?, reviewed_by = ?, updated_at = ? WHERE id = ?',
    [nextStatus, isEmployee ? t.reviewed_by : actor.sub, ts, id]);
  await audit.log(actor.sub, 'TICKET_COMMENTED', 'tickets', id, {});

  // AI replies to employee messages (HR replies stay human) — background
  if (isEmployee) aiReply(db, id, t.category, t.subject).catch((e) => console.error('[ticket-ai]', e.message));

  // in-app notify the other party
  if (isEmployee) notify.bgRoles(['hr', 'admin'], { type: 'ticket', title: 'Reply on a change request', body: `${name} replied on "${t.subject}"`, link: '/requests' });
  else notify.bgEmployee(t.employee_id, { type: 'ticket', title: 'Update on your request', body: `HR replied on "${t.subject}"`, link: '/profile' });

  // notify the other party — background
  (async () => {
    try {
      const emp = await employeeName(db, t.employee_id);
      if (isEmployee) {
        const to = await users.reviewerEmails();
        if (to.length) await mailer.send({ to: to.join(','), subject: `Reply on change request — ${emp.full_name}`,
          html: `<p><b>${emp.full_name}</b> replied on their change request "${t.subject}".</p><p>${String(message).trim().replace(/\n/g, '<br/>')}</p>` });
      } else if (emp.email) {
        await mailer.send({ to: emp.email, subject: `Update on your change request: ${t.subject}`,
          html: `<p>HR replied on your change request "<b>${t.subject}</b>".</p><p>${String(message).trim().replace(/\n/g, '<br/>')}</p><p>Log in to view and reply.</p>` });
      }
    } catch (e) { console.error('[notify] ticket-comment email failed:', e.message); }
  })();

  return get(id, { role: actor.role, employeeId: actor.employeeId });
}

// HR/Admin changes status; closing notifies the employee
async function updateStatus(id, { status, note }, actor) {
  if (!STATUSES.includes(status)) throw new HttpError(400, `Status must be one of: ${STATUSES.join(', ')}`);
  const db = await init();
  const t = await db.get('SELECT * FROM tickets WHERE id = ?', [id]);
  if (!t) throw new HttpError(404, 'Request not found');
  const ts = now();
  const closedAt = status === 'CLOSED' ? ts : (status === 'OPEN' || status === 'IN_PROGRESS' ? null : t.closed_at);
  await db.run('UPDATE tickets SET status = ?, reviewed_by = ?, updated_at = ?, closed_at = ? WHERE id = ?',
    [status, actor.sub, ts, closedAt, id]);
  if (note && String(note).trim()) {
    await db.run(`INSERT INTO ticket_comments (id, ticket_id, author_id, author_role, author_name, message, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), id, actor.sub, actor.role, actor.email, String(note).trim(), ts]);
  }
  await audit.log(actor.sub, 'TICKET_STATUS', 'tickets', id, { status });

  if (status === 'CLOSED') {
    notify.bgEmployee(t.employee_id, { type: 'ticket', title: 'Request resolved', body: `Your request "${t.subject}" was resolved and closed.`, link: '/profile' });
    (async () => {
      try {
        const emp = await employeeName(db, t.employee_id);
        if (emp.email) await mailer.send({ to: emp.email, subject: `Your change request is resolved: ${t.subject}`,
          html: `<p>Your change request "<b>${t.subject}</b>" has been marked resolved and closed by HR.</p>${note ? `<p>Note: ${String(note).trim()}</p>` : ''}` });
      } catch (e) { console.error('[notify] ticket-closed email failed:', e.message); }
    })();
  }
  return get(id, { role: actor.role, employeeId: actor.employeeId });
}

async function openCount() {
  const db = await init();
  const r = await db.get(`SELECT COUNT(*) AS n FROM tickets WHERE status IN ('OPEN','IN_PROGRESS')`);
  return Number(r?.n || 0);
}

// Generate + store an AI assistant reply on a ticket (conversation only; never approval).
async function aiReply(db, ticketId, category, subject) {
  try {
    const comments = await db.all('SELECT author_role, message FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC', [ticketId]);
    const text = await rag.aiTicketReply({ category, subject, comments });
    if (text && text.trim()) {
      await db.run(`INSERT INTO ticket_comments (id, ticket_id, author_id, author_role, author_name, message, created_at)
                    VALUES (?, ?, ?, 'assistant', 'Maven (AI)', ?, ?)`,
        [uuid(), ticketId, null, text.trim(), now()]);
    }
  } catch (e) { console.error('[ticket-ai] reply insert failed:', e.message); }
}

module.exports = { create, mine, list, get, addComment, updateStatus, openCount, CATEGORIES, STATUSES };
