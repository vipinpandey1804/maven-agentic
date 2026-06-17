// AI features with deterministic fallbacks so everything works offline (and tests pass).
// LLM is used to ENHANCE (phrasing, edge-case mapping), never as the only path.
const llm = require('./llmService');

/* ============================================================
 * 1. Smart CSV column mapping
 * ========================================================== */
const norm = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const SCHEMAS = {
  employee: {
    employee_id: ['employeeid', 'empid', 'employeecode', 'empcode', 'code', 'id', 'employeeno', 'employeenumber', 'staffid'],
    full_name: ['fullname', 'name', 'employeename', 'empname', 'staffname'],
    email: ['email', 'emailid', 'mail', 'emailaddress', 'officeemail', 'workemail'],
    dob: ['dob', 'dateofbirth', 'birthdate', 'birthday'],
    designation: ['designation', 'role', 'title', 'jobtitle', 'position'],
    department: ['department', 'dept', 'team', 'division'],
    date_of_joining: ['dateofjoining', 'doj', 'joiningdate', 'joindate', 'hiredate', 'dateofjoin'],
    status: ['status', 'active', 'employmentstatus', 'state'],
  },
  salary: {
    employee_id: ['employeeid', 'empid', 'employeecode', 'empcode', 'code', 'id', 'employeeno', 'staffid'],
    basic: ['basic', 'basicpay', 'basicsalary', 'basicwage'],
    hra: ['hra', 'houserent', 'houserentallowance'],
    allowances: ['allowances', 'allowance', 'otherallowances', 'specialallowance', 'otherallowance'],
    deductions: ['deductions', 'deduction', 'totaldeductions', 'totaldeduction'],
    lop_days: ['lopdays', 'lop', 'lossofpay', 'lwp', 'lopday', 'unpaiddays'],
    net_pay: ['netpay', 'net', 'netsalary', 'takehome', 'netamount', 'inhand', 'netpayable'],
  },
};

function heuristicMap(rawHeaders, schemaName) {
  const fields = SCHEMAS[schemaName];
  const map = {};            // rawHeader -> target field
  const used = new Set();
  for (const raw of rawHeaders) {
    const n = norm(raw);
    for (const [field, syns] of Object.entries(fields)) {
      if (used.has(field)) continue;
      if (n === norm(field) || syns.includes(n)) { map[raw] = field; used.add(field); break; }
    }
  }
  const unmapped = rawHeaders.filter((h) => !map[h]);
  const missing = Object.keys(fields).filter((f) => !used.has(f));
  return { map, unmapped, missing };
}

/**
 * Resolve raw CSV/Excel headers to the canonical schema.
 * Heuristic synonyms first; LLM only for leftover unmapped headers when a field is still missing.
 */
async function resolveColumns(rawHeaders, schemaName) {
  const { map, unmapped, missing } = heuristicMap(rawHeaders, schemaName);
  let usedLlm = false;

  if (unmapped.length && missing.length && (await llm.isConfigured())) {
    try {
      const out = await llm.complete({
        system: 'You map messy spreadsheet column headers to a fixed schema. Return JSON {"mapping": {"<rawHeader>": "<schemaField>"}} using only the allowed fields, omit headers that do not match.',
        user: `Allowed fields: ${missing.join(', ')}\nUnmapped headers: ${JSON.stringify(unmapped)}`,
        json: true, maxTokens: 400,
      });
      const parsed = llm.parseJson(out);
      const m = parsed.mapping || parsed;
      for (const [raw, field] of Object.entries(m)) {
        if (missing.includes(field) && unmapped.includes(raw) && !Object.values(map).includes(field)) {
          map[raw] = field; usedLlm = true;
        }
      }
    } catch { /* fall back silently to heuristic result */ }
  }

  const autoMapped = Object.entries(map)
    .filter(([raw, field]) => norm(raw) !== norm(field))
    .map(([from, to]) => ({ from, to }));
  return { map, autoMapped, usedLlm };
}

/** Apply a rawHeader->field map to a parsed row object. */
function applyMap(row, map) {
  const out = {};
  for (const [raw, val] of Object.entries(row)) {
    const field = map[raw] || norm(raw); // unknown columns kept under normalized name
    out[field] = val;
  }
  return out;
}

/* ============================================================
 * 2. Salary anomaly detection (heuristic core + optional LLM summary)
 * ========================================================== */
const ANOMALY_THRESHOLD = 0.3; // 30% swing vs previous month

function detectAnomalies(current, prevByEmp) {
  // current: [{employee_id(code), full_name, net_pay, ...}], prevByEmp: Map code -> net_pay
  const anomalies = [];
  for (const r of current) {
    const prev = prevByEmp.get(String(r.code));
    if (prev === undefined) {
      if (prevByEmp.size > 0) anomalies.push({ code: r.code, name: r.full_name, type: 'new', message: `${r.full_name} (${r.code}) is new this month (no previous salary record)` });
      continue;
    }
    if (prev === 0) continue;
    const delta = (r.net_pay - prev) / prev;
    if (Math.abs(delta) >= ANOMALY_THRESHOLD) {
      anomalies.push({
        code: r.code, name: r.full_name, type: delta > 0 ? 'spike' : 'drop',
        message: `${r.full_name} (${r.code}) net pay ${delta > 0 ? 'up' : 'down'} ${Math.abs(Math.round(delta * 100))}% vs last month (₹${prev.toLocaleString('en-IN')} → ₹${r.net_pay.toLocaleString('en-IN')})`,
      });
    }
  }
  return anomalies;
}

/* ============================================================
 * 3. AI email composer (template generator) - needs LLM
 * ========================================================== */
async function composeTemplate({ instruction, tone = 'professional' }) {
  if (!(await llm.isConfigured())) {
    const err = new Error('LLM not configured - add an API key in Settings > LLM to use AI compose');
    err.code = 'LLM_NOT_CONFIGURED';
    throw err;
  }
  const out = await llm.complete({
    system: `You write HR salary-slip emails. Use ONLY these placeholders verbatim where relevant: {name} {month} {year} {company} {net_pay}. The salary slip PDF is attached separately and is password-protected with the employee's date of birth in DDMMYYYY format - mention this. Tone: ${tone}. Return JSON {"subject": "...", "body_html": "<div>...</div>"} with simple inline-styled HTML.`,
    user: instruction || 'Write a standard monthly salary slip email.',
    json: true, maxTokens: 900,
  });
  const parsed = llm.parseJson(out);
  if (!parsed.subject || !parsed.body_html) throw new Error('AI did not return a valid template');
  return { subject: parsed.subject, body_html: parsed.body_html };
}

/* ============================================================
 * 4. RAG-lite assistant - gather DB context, answer via LLM
 * ========================================================== */
async function gatherContext(db) {
  const emp = await db.get(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active FROM employees`);
  const batches = await db.all(`SELECT month, year, status, total_net_pay, employee_count FROM salary_batches ORDER BY year DESC, month DESC LIMIT 12`);
  const sendStats = await db.get(`SELECT
      SUM(CASE WHEN status='SENT' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status='QUEUED' THEN 1 ELSE 0 END) AS queued FROM send_logs`);
  const failures = await db.all(
    `SELECT e.full_name, e.employee_id AS code, b.month, b.year, s.last_error
     FROM send_logs s JOIN salary_records r ON r.id=s.salary_record_id
     JOIN employees e ON e.id=r.employee_id JOIN salary_batches b ON b.id=r.batch_id
     WHERE s.status='FAILED' ORDER BY s.created_at DESC LIMIT 25`);
  const byDept = await db.all(`SELECT department, COUNT(*) AS n FROM employees WHERE status='active' GROUP BY department`);
  return { employees: emp, batches, sendStats, failures, byDept };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fallbackAnswer(ctx) {
  const lines = [];
  lines.push(`Employees: ${ctx.employees.total} total, ${ctx.employees.active} active.`);
  if (ctx.batches[0]) {
    const b = ctx.batches[0];
    lines.push(`Latest batch: ${MONTHS[b.month - 1]} ${b.year} — ${b.status}, ${b.employee_count} employees, ₹${Number(b.total_net_pay).toLocaleString('en-IN')}.`);
  }
  lines.push(`Sends: ${ctx.sendStats.sent || 0} sent, ${ctx.sendStats.failed || 0} failed, ${ctx.sendStats.queued || 0} queued.`);
  if (ctx.failures.length) {
    lines.push(`Failed slips: ${ctx.failures.map((f) => `${f.full_name} (${MONTHS[f.month - 1]} ${f.year})`).join(', ')}.`);
  }
  return lines.join('\n');
}

async function assistant(db, question) {
  const ctx = await gatherContext(db);
  if (!(await llm.isConfigured())) {
    return {
      answer: `LLM is not configured, so here is a data summary instead (add an API key in Settings > LLM for natural-language answers):\n\n${fallbackAnswer(ctx)}`,
      usedLlm: false,
    };
  }
  const answer = await llm.complete({
    system: 'You are a payroll admin assistant. Answer ONLY from the JSON data provided. Be concise. Use ₹ and Indian number formatting. If the data does not contain the answer, say so.',
    user: `Data:\n${JSON.stringify(ctx)}\n\nQuestion: ${question}`,
    maxTokens: 700,
  });
  return { answer, usedLlm: true };
}

module.exports = { resolveColumns, applyMap, detectAnomalies, composeTemplate, assistant, ANOMALY_THRESHOLD };
