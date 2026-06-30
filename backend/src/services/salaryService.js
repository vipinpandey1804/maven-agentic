const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const config = require('../config');
const { init } = require('../db');
const { uuid, now, HttpError } = require('../utils/helpers');
const audit = require('./auditService');
const pdfService = require('./pdfService');
const mailer = require('./mailerService');
const notify = require('./notificationService');
const settings = require('./settingsService');
const ai = require('./aiService');

const NUM_FIELDS = ['basic', 'hra', 'allowances', 'deductions', 'lop_days', 'net_pay'];

function readSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

async function uploadBatch({ buffer, originalName, month, year, actorId }) {
  month = parseInt(month, 10); year = parseInt(year, 10);
  if (!month || month < 1 || month > 12 || !year) throw new HttpError(400, 'Valid month (1-12) and year are required');

  const raw = readSheet(buffer);
  if (!raw.length) throw new HttpError(400, 'Sheet has no data rows');

  // Smart column mapping for messy headers (e.g. "Basic Pay", "Net Salary")
  const headers = Object.keys(raw[0]);
  const { map, autoMapped } = await ai.resolveColumns(headers, 'salary');
  const rows = raw.map((r) => ai.applyMap(r, map));

  const db = await init();
  const existing = await db.get('SELECT * FROM salary_batches WHERE month = ? AND year = ?', [month, year]);
  if (existing && ['APPROVED', 'SENT'].includes(existing.status)) {
    throw new HttpError(409, `A batch for ${month}/${year} is already ${existing.status}`);
  }
  if (existing) {
    await db.run('DELETE FROM salary_records WHERE batch_id = ?', [existing.id]);
    await db.run('DELETE FROM salary_batches WHERE id = ?', [existing.id]);
  }

  const errors = [], warnings = [];
  const employees = await db.all('SELECT * FROM employees');
  const byEmpId = new Map(employees.map((e) => [String(e.employee_id), e]));

  const records = [];
  let total = 0;
  rows.forEach((r, i) => {
    const empId = String(r.employee_id || '').trim();
    if (!empId) { errors.push(`row ${i + 2}: missing employee_id`); return; }
    const emp = byEmpId.get(empId);
    if (!emp) { errors.push(`row ${i + 2}: employee_id "${empId}" not found - import employees first`); return; }
    if (emp.status !== 'active') { warnings.push(`row ${i + 2}: employee "${empId}" is inactive - skipped`); return; }
    const rec = { employee: emp };
    for (const f of NUM_FIELDS) {
      const v = Number(String(r[f] === '' ? 0 : r[f]).replace(/,/g, ''));
      if (Number.isNaN(v)) { errors.push(`row ${i + 2}: "${f}" is not a number (${r[f]})`); return; }
      rec[f] = v;
    }
    const computed = rec.basic + rec.hra + rec.allowances - rec.deductions;
    if (Math.abs(computed - rec.net_pay) > 1) {
      warnings.push(`row ${i + 2}: net_pay ${rec.net_pay} differs from computed ${computed.toFixed(2)} for "${empId}"`);
    }
    total += rec.net_pay;
    records.push(rec);
  });
  if (errors.length) throw new HttpError(422, 'Salary sheet validation failed - nothing saved', errors);

  // active employees missing from the sheet
  const inSheet = new Set(records.map((r) => String(r.employee.employee_id)));
  for (const e of employees) {
    if (e.status === 'active' && !inSheet.has(String(e.employee_id))) {
      warnings.push(`active employee "${e.employee_id}" (${e.full_name}) is missing from the sheet`);
    }
  }

  // AI anomaly detection: compare net pay vs the most recent approved/sent batch
  const prevBatch = await db.get(
    `SELECT id FROM salary_batches WHERE status IN ('APPROVED','SENT')
     AND (year < ? OR (year = ? AND month < ?)) ORDER BY year DESC, month DESC LIMIT 1`,
    [year, year, month]
  );
  let anomalies = [];
  if (prevBatch) {
    const prevRows = await db.all(
      `SELECT e.employee_id AS code, r.net_pay FROM salary_records r JOIN employees e ON e.id = r.employee_id WHERE r.batch_id = ?`,
      [prevBatch.id]
    );
    const prevByEmp = new Map(prevRows.map((p) => [String(p.code), Number(p.net_pay)]));
    anomalies = ai.detectAnomalies(
      records.map((r) => ({ code: r.employee.employee_id, full_name: r.employee.full_name, net_pay: r.net_pay })),
      prevByEmp
    );
    for (const a of anomalies) warnings.push(`anomaly: ${a.message}`);
  }

  // persist source file
  fs.mkdirSync(path.join(config.storageDir, 'uploads'), { recursive: true });
  const storagePath = path.join(config.storageDir, 'uploads', `${year}-${month}-${Date.now()}-${originalName}`);
  fs.writeFileSync(storagePath, buffer);
  const fileId = uuid();
  await db.run(
    'INSERT INTO files (id, kind, original_name, storage_path, mime_type, size_bytes, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [fileId, 'salary_excel', originalName, storagePath, null, buffer.length, actorId, now()]
  );

  const batchId = uuid();
  await db.run(
    `INSERT INTO salary_batches (id, month, year, source_file_id, status, uploaded_by, total_net_pay, employee_count, created_at)
     VALUES (?, ?, ?, ?, 'PENDING_APPROVAL', ?, ?, ?, ?)`,
    [batchId, month, year, fileId, actorId, total, records.length, now()]
  );
  for (const rec of records) {
    await db.run(
      `INSERT INTO salary_records (id, batch_id, employee_id, basic, hra, allowances, deductions, lop_days, net_pay, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), batchId, rec.employee.id, rec.basic, rec.hra, rec.allowances, rec.deductions, rec.lop_days, rec.net_pay, now()]
    );
  }
  await audit.log(actorId, 'BATCH_UPLOADED', 'salary_batches', batchId, { month, year, employees: records.length, total, anomalies: anomalies.length });
  return { batchId, month, year, employeeCount: records.length, totalNetPay: total, warnings, anomalies, autoMapped };
}

async function getBatch(id) {
  const db = await init();
  const batch = await db.get('SELECT * FROM salary_batches WHERE id = ?', [id]);
  if (!batch) throw new HttpError(404, 'Batch not found');
  const records = await db.all(
    `SELECT r.*, e.employee_id AS emp_code, e.full_name, e.email,
       (SELECT status FROM send_logs WHERE salary_record_id = r.id ORDER BY created_at DESC LIMIT 1) AS send_status
     FROM salary_records r JOIN employees e ON e.id = r.employee_id
     WHERE r.batch_id = ? ORDER BY e.full_name`, [id]
  );
  return { ...batch, records };
}

async function listBatches() {
  const db = await init();
  return db.all('SELECT * FROM salary_batches ORDER BY year DESC, month DESC');
}

async function flagRecord(recordId, { flagged, reason }, actorId) {
  const db = await init();
  const rec = await db.get('SELECT r.*, b.status AS batch_status FROM salary_records r JOIN salary_batches b ON b.id = r.batch_id WHERE r.id = ?', [recordId]);
  if (!rec) throw new HttpError(404, 'Salary record not found');
  if (rec.batch_status !== 'PENDING_APPROVAL') throw new HttpError(409, `Batch is ${rec.batch_status} - records can only be flagged before approval`);
  await db.run('UPDATE salary_records SET flagged = ?, flag_reason = ? WHERE id = ?',
    [flagged ? 1 : 0, flagged ? (reason || null) : null, recordId]);
  await audit.log(actorId, flagged ? 'RECORD_FLAGGED' : 'RECORD_UNFLAGGED', 'salary_records', recordId, { reason });
  if (flagged) {
    const b = await db.get('SELECT id, uploaded_by, month, year FROM salary_batches WHERE id = ?', [rec.batch_id]);
    if (b && b.uploaded_by) notify.bgUser(b.uploaded_by, { type: 'salary', title: 'Salary record flagged',
      body: `A record in your ${b.month}/${b.year} batch was flagged as incorrect.${reason ? ' Reason: ' + reason : ''}`, link: '/batches/' + b.id, email: { subject: 'Salary record flagged for review' } });
  }
  return db.get('SELECT * FROM salary_records WHERE id = ?', [recordId]);
}

async function approve(id, actorId) {
  const db = await init();
  const batch = await db.get('SELECT * FROM salary_batches WHERE id = ?', [id]);
  if (!batch) throw new HttpError(404, 'Batch not found');
  if (batch.status !== 'PENDING_APPROVAL') throw new HttpError(409, `Batch is ${batch.status}, cannot approve`);
  const flaggedCount = await db.get('SELECT COUNT(*) AS n FROM salary_records WHERE batch_id = ? AND flagged = 1', [id]);
  if (Number(flaggedCount?.n || 0) > 0) {
    throw new HttpError(409, `${flaggedCount.n} record(s) are flagged as incorrect - export the flagged list and reject the batch, or clear the flags first`);
  }
  await db.run('UPDATE salary_batches SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?', ['APPROVED', actorId, now(), id]);
  await audit.log(actorId, 'BATCH_APPROVED', 'salary_batches', id, { month: batch.month, year: batch.year });
  if (batch.uploaded_by) notify.bgUser(batch.uploaded_by, { type: 'salary', title: 'Salary batch approved',
    body: `Your ${batch.month}/${batch.year} salary batch was approved.`, link: '/batches/' + id, email: { subject: 'Salary batch approved' } });
  return getBatch(id);
}

async function reject(id, reason, actorId) {
  const db = await init();
  const batch = await db.get('SELECT * FROM salary_batches WHERE id = ?', [id]);
  if (!batch) throw new HttpError(404, 'Batch not found');
  if (batch.status !== 'PENDING_APPROVAL') throw new HttpError(409, `Batch is ${batch.status}, cannot reject`);
  await db.run('UPDATE salary_batches SET status = ?, reject_reason = ? WHERE id = ?', ['REJECTED', reason || null, id]);
  await audit.log(actorId, 'BATCH_REJECTED', 'salary_batches', id, { reason });
  if (batch.uploaded_by) notify.bgUser(batch.uploaded_by, { type: 'salary', title: 'Salary batch rejected',
    body: `Your ${batch.month}/${batch.year} salary batch was rejected.${reason ? ' Reason: ' + reason : ''}`, link: '/batches/' + id, email: { subject: 'Salary batch rejected' } });
  return getBatch(id);
}

const MAX_ATTEMPTS = 3;

async function sendBatch(id, actorId, { trigger = 'manual' } = {}) {
  const db = await init();
  const batch = await getBatch(id);
  if (!['APPROVED', 'SENT'].includes(batch.status)) throw new HttpError(409, `Batch must be APPROVED to send (is ${batch.status})`);

  const company = await settings.get('company');
  const tpl = await db.get('SELECT * FROM email_templates WHERE name = ?', ['salary-slip']);
  const monthName = pdfService.MONTHS[batch.month - 1];

  let sent = 0, failed = 0, skipped = 0;

  // process one employee's slip (PDF + email + logs)
  async function processRecord(rec) {
    const last = await db.get('SELECT * FROM send_logs WHERE salary_record_id = ? ORDER BY created_at DESC LIMIT 1', [rec.id]);
    if (last && last.status === 'SENT') { skipped++; return; } // idempotent: never double-send

    const emp = { id: rec.employee_id, employee_id: rec.emp_code, full_name: rec.full_name, email: rec.email };
    const empFull = await db.get('SELECT * FROM employees WHERE id = ?', [rec.employee_id]);
    const logId = last && last.status !== 'SENT' ? last.id : uuid();
    if (!last) {
      await db.run('INSERT INTO send_logs (id, salary_record_id, to_email, status, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)',
        [logId, rec.id, emp.email, 'QUEUED', now()]);
    }
    try {
      const pdfPath = await pdfService.generateSlip({ employee: empFull, record: rec, month: batch.month, year: batch.year, company });
      const pdfFileId = uuid();
      await db.run('INSERT INTO files (id, kind, original_name, storage_path, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [pdfFileId, 'slip_pdf', path.basename(pdfPath), pdfPath, fs.statSync(pdfPath).size, now()]);
      await db.run('UPDATE salary_records SET pdf_file_id = ? WHERE id = ?', [pdfFileId, rec.id]);

      const vars = { name: emp.full_name, month: monthName, year: batch.year, company: company.name, net_pay: Number(rec.net_pay).toLocaleString('en-IN') };
      await mailer.send({
        to: emp.email,
        subject: mailer.renderTemplate(tpl ? tpl.subject : 'Salary Slip - {month} {year}', vars),
        html: mailer.renderTemplate(tpl ? tpl.body_html : '<p>Dear {name}, your salary slip for {month} {year} is attached.</p>', vars),
        attachments: [{ filename: `SalarySlip-${monthName}-${batch.year}.pdf`, content: fs.readFileSync(pdfPath), contentType: 'application/pdf' }],
      });
      await db.run('UPDATE send_logs SET status = ?, attempts = attempts + 1, sent_at = ?, last_error = NULL WHERE id = ?', ['SENT', now(), logId]);
      notify.bgEmployee(rec.employee_id, { type: 'payslip', title: 'Payslip available',
        body: `Your salary slip for ${monthName} ${batch.year} has been sent to your email.`, link: '/me' });
      sent++;
    } catch (e) {
      const attempts = (last ? last.attempts : 0) + 1;
      await db.run('UPDATE send_logs SET status = ?, attempts = ?, last_error = ? WHERE id = ?',
        [attempts >= MAX_ATTEMPTS ? 'FAILED' : 'QUEUED', attempts, String(e.message).slice(0, 500), logId]);
      failed++;
    }
  }

  // run with a concurrency pool so 13 slips don't go strictly one-by-one
  const CONCURRENCY = 5;
  const queue = [...batch.records];
  async function worker() { while (queue.length) { await processRecord(queue.shift()); } }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.records.length) }, () => worker()));

  if (failed === 0) await db.run('UPDATE salary_batches SET status = ? WHERE id = ?', ['SENT', id]);
  await audit.log(actorId, 'BATCH_DISPATCHED', 'salary_batches', id, { trigger, sent, failed, skipped });
  return { sent, failed, skipped, batchStatus: failed === 0 ? 'SENT' : batch.status };
}

async function employeeHistory(employeeId) {
  const db = await init();
  // only batches that were actually approved/dispatched count as salary history;
  // REJECTED and PENDING_APPROVAL batches are excluded
  return db.all(
    `SELECT r.*, b.month, b.year, b.status AS batch_status FROM salary_records r
     JOIN salary_batches b ON b.id = r.batch_id
     WHERE r.employee_id = ? AND b.status IN ('APPROVED', 'SENT')
     ORDER BY b.year DESC, b.month DESC`, [employeeId]
  );
}

// Generate a salary-slip PDF on demand for in-app download.
// In-app downloads are NOT password-protected (the user is already authenticated). Only EMAILED slips are protected.
// forEmployeeId, when given, restricts to that employee's own record.
async function slipPdf(recordId, { forEmployeeId, encrypted = true } = {}) {
  const db = await init();
  const rec = await db.get(
    `SELECT r.id, r.employee_id, r.basic, r.hra, r.allowances, r.deductions, r.lop_days, r.net_pay,
            b.month, b.year, b.status AS batch_status
     FROM salary_records r JOIN salary_batches b ON b.id = r.batch_id WHERE r.id = ?`, [recordId]
  );
  if (!rec) throw new HttpError(404, 'Salary record not found');
  if (forEmployeeId && rec.employee_id !== forEmployeeId) throw new HttpError(403, 'Not your payslip');
  if (!['APPROVED', 'SENT'].includes(rec.batch_status)) throw new HttpError(409, 'Slip is not available until the batch is approved');
  const emp = await db.get('SELECT * FROM employees WHERE id = ?', [rec.employee_id]);
  const company = await settings.get('company');
  const filePath = await pdfService.generateSlip({ employee: emp, record: rec, month: rec.month, year: rec.year, company, encrypted });
  return { path: filePath, filename: `SalarySlip-${pdfService.MONTHS[rec.month - 1]}-${rec.year}-${emp.employee_id}.pdf` };
}

module.exports = { uploadBatch, getBatch, listBatches, approve, reject, sendBatch, employeeHistory, flagRecord, slipPdf };
