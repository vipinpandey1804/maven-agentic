// Employee self-service: a user only ever sees their OWN linked employee record.
const { init } = require('../db');
const { HttpError } = require('../utils/helpers');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function requireLink(employeeId) {
  if (!employeeId) throw new HttpError(400, 'This account is not linked to an employee record. Ask your admin to link it.');
}

async function profile(employeeId) {
  requireLink(employeeId);
  const db = await init();
  const e = await db.get('SELECT id, employee_id, full_name, email, dob, designation, department, date_of_joining, status FROM employees WHERE id = ?', [employeeId]);
  if (!e) throw new HttpError(404, 'Employee record not found');
  return e;
}

// Only payslips that were actually issued (APPROVED or SENT batches).
async function payslips(employeeId) {
  requireLink(employeeId);
  const db = await init();
  const rows = await db.all(
    `SELECT r.id, b.month, b.year, b.status AS batch_status,
            r.basic, r.hra, r.allowances, r.deductions, r.lop_days, r.net_pay,
            (SELECT status FROM send_logs WHERE salary_record_id = r.id ORDER BY created_at DESC LIMIT 1) AS send_status
     FROM salary_records r JOIN salary_batches b ON b.id = r.batch_id
     WHERE r.employee_id = ? AND b.status IN ('APPROVED','SENT')
     ORDER BY b.year DESC, b.month DESC`, [employeeId]
  );
  return rows.map((r) => ({ ...r, month_name: MONTHS[r.month - 1] }));
}

async function dashboard(employeeId) {
  requireLink(employeeId);
  const slips = await payslips(employeeId);
  const me = await profile(employeeId);
  const latest = slips[0] || null;
  return {
    profile: me,
    latest,
    slipCount: slips.length,
    ytdNet: slips.filter((s) => s.year === new Date().getFullYear()).reduce((sum, s) => sum + Number(s.net_pay || 0), 0),
  };
}

module.exports = { profile, payslips, dashboard };
