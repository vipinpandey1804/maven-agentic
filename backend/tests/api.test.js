// Integration tests: full salary-slip flow against a throwaway SQLite DB.
process.env.SQLITE_PATH = `/tmp/test-${Date.now()}.db`;
process.env.STORAGE_DIR = `/tmp/test-storage-${Date.now()}`;
process.env.SCHEDULER_ENABLED = 'false';
process.env.JWT_SECRET = 'test-secret';

const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const request = require('supertest');
const XLSX = require('xlsx');

const { createApp } = require('../src/app');
const { seed } = require('../src/db/seed');
const engine = require('../src/agents/engine');
engine.register(require('../src/agents/salarySlipAgent'));

let app, token;

const CSV = `employee_id,full_name,email,dob,designation,department,date_of_joining,status
EMP001,Asha Verma,asha@example.com,1996-04-18,Engineer,Engineering,2022-01-10,active
EMP002,Rohan Gupta,rohan@example.com,1992-11-02,Designer,Design,2021-06-01,active
EMP003,Neha Singh,neha@example.com,1990-07-25,Manager,Engineering,2019-03-15,inactive
`;

function salaryXlsx(month, year) {
  const rows = [
    { employee_id: 'EMP001', basic: 50000, hra: 20000, allowances: 5000, deductions: 5000, lop_days: 0, net_pay: 70000 },
    { employee_id: 'EMP002', basic: 40000, hra: 16000, allowances: 4000, deductions: 4000, lop_days: 1, net_pay: 56000 },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Salary');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

before(async () => {
  await seed({ quiet: true });
  app = createApp();
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@company.com', password: 'Admin@123' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  token = res.body.token;
});

const auth = (r) => r.set('Authorization', `Bearer ${token}`);

// RAG is PostgreSQL-only (LangChain + pgvector); skip those tests on the sqlite suite.
const PG = process.env.DB_CLIENT === 'pg' || !!process.env.DATABASE_URL;

test('health endpoint works', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('rejects requests without token', async () => {
  const res = await request(app).get('/api/employees');
  assert.equal(res.status, 401);
});

test('rejects bad login', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@company.com', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('imports employees from CSV (upsert)', async () => {
  const res = await auth(request(app).post('/api/employees/import')).attach('file', Buffer.from(CSV), 'employees.csv');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.inserted, 3);

  // re-import = update, not duplicate
  const res2 = await auth(request(app).post('/api/employees/import')).attach('file', Buffer.from(CSV), 'employees.csv');
  assert.equal(res2.body.inserted, 0);
  assert.equal(res2.body.updated, 3);

  const list = await auth(request(app).get('/api/employees'));
  assert.equal(list.body.length, 3);
});

test('rejects invalid employee CSV entirely', async () => {
  const bad = 'employee_id,full_name,email,dob\nEMP010,Bad Person,not-an-email,1990-01-01\n';
  const res = await auth(request(app).post('/api/employees/import')).attach('file', Buffer.from(bad), 'bad.csv');
  assert.equal(res.status, 422);
  assert.ok(res.body.details.some((d) => d.includes('invalid email')));
});

let batchId;

test('uploads salary sheet -> PENDING_APPROVAL with warnings', async () => {
  const res = await auth(request(app).post('/api/salary/upload'))
    .field('month', '6').field('year', '2026')
    .attach('file', salaryXlsx(6, 2026), 'salary-june.xlsx');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.employeeCount, 2); // EMP003 inactive -> excluded
  assert.equal(res.body.totalNetPay, 126000);
  batchId = res.body.batchId;

  const batch = await auth(request(app).get(`/api/salary/batches/${batchId}`));
  assert.equal(batch.body.status, 'PENDING_APPROVAL');
  assert.equal(batch.body.records.length, 2);
});

test('rejects salary sheet with unknown employee', async () => {
  const ws = XLSX.utils.json_to_sheet([{ employee_id: 'GHOST', basic: 1, hra: 1, allowances: 0, deductions: 0, lop_days: 0, net_pay: 2 }]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S');
  const res = await auth(request(app).post('/api/salary/upload'))
    .field('month', '7').field('year', '2026')
    .attach('file', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 's.xlsx');
  assert.equal(res.status, 422);
  assert.ok(res.body.details.some((d) => d.includes('GHOST')));
});

test('cannot send before approval', async () => {
  const res = await auth(request(app).post(`/api/salary/batches/${batchId}/send`));
  assert.equal(res.status, 409);
});

test('approve -> send dispatches all slips (dev jsonTransport)', async () => {
  const ap = await auth(request(app).post(`/api/salary/batches/${batchId}/approve`));
  assert.equal(ap.status, 200);
  assert.equal(ap.body.status, 'APPROVED');

  const send = await auth(request(app).post(`/api/salary/batches/${batchId}/send`));
  assert.equal(send.status, 200, JSON.stringify(send.body));
  assert.equal(send.body.sent, 2);
  assert.equal(send.body.failed, 0);
  assert.equal(send.body.batchStatus, 'SENT');

  // idempotent: re-send skips already-sent
  const send2 = await auth(request(app).post(`/api/salary/batches/${batchId}/send`));
  assert.equal(send2.body.skipped, 2);
  assert.equal(send2.body.sent, 0);
});

test('PDFs were generated and are encrypted', async () => {
  const dir = `${process.env.STORAGE_DIR}/slips/2026-06`;
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 2);
  const content = fs.readFileSync(`${dir}/${files[0]}`);
  assert.ok(content.subarray(0, 5).toString().startsWith('%PDF'));
  assert.ok(content.includes('/Encrypt'), 'PDF should be encrypted');
});

test('send logs recorded as SENT', async () => {
  const res = await auth(request(app).get('/api/logs/sends'));
  assert.equal(res.status, 200);
  const june = res.body.filter((l) => l.month === 6);
  assert.equal(june.length, 2);
  assert.ok(june.every((l) => l.status === 'SENT'));
});

test('cannot re-upload an already SENT month', async () => {
  const res = await auth(request(app).post('/api/salary/upload'))
    .field('month', '6').field('year', '2026')
    .attach('file', salaryXlsx(6, 2026), 'dup.xlsx');
  assert.equal(res.status, 409);
});

test('settings: secrets are masked and survive round-trip', async () => {
  const put = await auth(request(app).put('/api/settings/smtp')).send({ user: 'hr@gmail.com', pass: 'app-password-123', transport: 'smtp' });
  assert.equal(put.status, 200);
  assert.equal(put.body.pass, '••••••••');

  const get = await auth(request(app).get('/api/settings/smtp'));
  assert.equal(get.body.user, 'hr@gmail.com');
  assert.equal(get.body.pass, '••••••••');

  // sending masked value back must not overwrite the real secret
  await auth(request(app).put('/api/settings/smtp')).send({ user: 'hr2@gmail.com', pass: '••••••••' });
  const settings = require('../src/services/settingsService');
  const raw = await settings.get('smtp');
  assert.equal(raw.pass, 'app-password-123');
  assert.equal(raw.user, 'hr2@gmail.com');
  // restore dev transport for remaining tests
  await auth(request(app).put('/api/settings/smtp')).send({ transport: 'json' });
});

test('agent engine: salary-slip-agent reports when nothing to send', async () => {
  const res = await auth(request(app).post('/api/agents/salary-slip-agent/run'));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  // current real month has no batch -> dispatched:false, or already sent if month matches test data
  assert.equal(typeof res.body.dispatched, 'boolean');
});

test('agents are listed and configurable', async () => {
  const list = await auth(request(app).get('/api/agents'));
  assert.ok(list.body.some((a) => a.name === 'salary-slip-agent'));
  const upd = await auth(request(app).put('/api/agents/salary-slip-agent')).send({ cron_expression: '0 10 1 * *' });
  assert.equal(upd.body.cron_expression, '0 10 1 * *');
});

test('dashboard aggregates stats', async () => {
  const res = await auth(request(app).get('/api/dashboard'));
  assert.equal(res.status, 200);
  assert.equal(res.body.employees.total, 3);
  assert.equal(res.body.employees.active, 2);
  assert.equal(res.body.sends.sent, 2);
  assert.ok(res.body.recentBatches.length >= 1);
  assert.ok(res.body.recentActivity.length > 0);
});

test('smart CSV import maps messy headers', async () => {
  const messy = 'Emp ID,Employee Name,E-mail,Date of Birth,Job Title\nEMP100,Test User,test.user@example.com,1995-05-05,Analyst\n';
  const res = await auth(request(app).post('/api/employees/import')).attach('file', Buffer.from(messy), 'messy.csv');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.inserted, 1);
  // headers should have been auto-mapped to schema fields
  const tos = res.body.autoMapped.map((m) => m.to);
  assert.ok(tos.includes('employee_id') && tos.includes('full_name') && tos.includes('dob'));
  const list = await auth(request(app).get('/api/employees?q=Test User'));
  assert.equal(list.body[0].email, 'test.user@example.com');
});

test('anomaly detection flags big net-pay swings vs previous month', async () => {
  // July batch: EMP001 jumps from 70000 (June, SENT) to 140000 (+100%)
  const ws = XLSX.utils.json_to_sheet([
    { employee_id: 'EMP001', basic: 100000, hra: 30000, allowances: 10000, deductions: 0, lop_days: 0, net_pay: 140000 },
    { employee_id: 'EMP002', basic: 40000, hra: 16000, allowances: 4000, deductions: 4000, lop_days: 0, net_pay: 56000 },
  ]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S');
  const res = await auth(request(app).post('/api/salary/upload'))
    .field('month', '7').field('year', '2026')
    .attach('file', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'july.xlsx');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.anomalies.length >= 1);
  assert.ok(res.body.anomalies.some((a) => a.code === 'EMP001' && a.type === 'spike'));
});

test('AI compose-template requires configured LLM (graceful 4xx offline)', async () => {
  const res = await auth(request(app).post('/api/ai/compose-template')).send({ instruction: 'friendly Diwali bonus note' });
  // no API key in tests -> service throws LLM_NOT_CONFIGURED (500-level, but with clear message)
  assert.ok(res.status >= 400);
  assert.match(res.body.error, /not configured/i);
});

test('AI assistant returns a data summary when LLM not configured', async () => {
  const res = await auth(request(app).post('/api/ai/assistant')).send({ question: 'whose slip failed last month?' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.usedLlm, false);
  assert.match(res.body.answer, /Employees:/);
});

test('AI status reports unconfigured', async () => {
  const res = await auth(request(app).get('/api/ai/status'));
  assert.equal(res.status, 200);
  assert.equal(res.body.configured, false);
  assert.ok(res.body.provider);
});

test('employee salary history', async () => {
  const emp = (await auth(request(app).get('/api/employees'))).body.find((e) => e.employee_id === 'EMP001');
  const res = await auth(request(app).get(`/api/employees/${emp.id}/history`));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(Number(res.body[0].net_pay), 70000);
});

test('RAG: reindex builds documents and embeddings', { skip: !PG }, async () => {
  const res = await auth(request(app).post('/api/rag/reindex'));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.documents >= 1);
});

test('RAG: status reports pgvector store', { skip: !PG }, async () => {
  const res = await auth(request(app).get('/api/rag/status'));
  assert.equal(res.status, 200);
  assert.equal(res.body.store, 'pgvector');
});

test('RAG: custom doc is retrievable by semantic search', { skip: !PG }, async () => {
  await auth(request(app).post('/api/rag/documents'))
    .send({ title: 'Leave Policy', content: 'Employees get 24 paid leaves per year. Sick leave is 12 days.' });
  await auth(request(app).post('/api/rag/reindex'));
  const res = await auth(request(app).post('/api/rag/ask')).send({ question: 'how many paid leaves per year?' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.sources.length > 0);
});

test('RAG: status is disabled on sqlite (pg-only)', { skip: PG }, async () => {
  const res = await auth(request(app).get('/api/rag/status'));
  assert.equal(res.status, 200);
  assert.equal(res.body.store, 'disabled');
});

test('Chat: greeting gets a friendly reply, off-topic is steered back', async () => {
  const hi = await auth(request(app).post('/api/rag/ask')).send({ question: 'hi' });
  assert.match(hi.body.answer, /Maven/);
  assert.doesNotMatch(hi.body.answer, /do not have/i);
  const off = await auth(request(app).post('/api/rag/ask')).send({ question: 'what is the capital of France' });
  assert.match(off.body.answer, /company|off track|rephrase/i);
});

test('Chat: ask creates a conversation and persists messages', async () => {
  const r1 = await auth(request(app).post('/api/chat/ask')).send({ question: 'how many active employees?' });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.ok(r1.body.conversationId);
  const convId = r1.body.conversationId;
  const r2 = await auth(request(app).post('/api/chat/ask')).send({ question: 'and how many total?', conversationId: convId });
  assert.equal(r2.body.conversationId, convId);
  const get = await auth(request(app).get(`/api/chat/conversations/${convId}`));
  assert.equal(get.status, 200);
  assert.equal(get.body.messages.length, 4);
  assert.equal(get.body.messages[0].role, 'user');
});

test('Chat: list shows conversations and delete removes them', async () => {
  const list = await auth(request(app).get('/api/chat/conversations'));
  assert.ok(list.body.length >= 1);
  const id = list.body[0].id;
  const del = await auth(request(app).delete(`/api/chat/conversations/${id}`));
  assert.equal(del.body.ok, true);
  const after = await auth(request(app).get(`/api/chat/conversations/${id}`));
  assert.equal(after.status, 404);
});
