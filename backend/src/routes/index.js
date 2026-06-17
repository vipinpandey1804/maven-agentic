const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { init } = require('../db');
const { asyncHandler, HttpError, now, uuid } = require('../utils/helpers');
const { sign, requireAuth } = require('../middleware/auth');
const employees = require('../services/employeeService');
const salary = require('../services/salaryService');
const settings = require('../services/settingsService');
const audit = require('../services/auditService');
const mailer = require('../services/mailerService');
const ai = require('../services/aiService');
const llm = require('../services/llmService');
const rag = require('../services/ragService');
const chat = require('../services/chatService');
const engine = require('../agents/engine');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = express.Router();

router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new HttpError(400, 'email and password are required');
  const db = await init();
  const user = await db.get('SELECT * FROM users WHERE email = ?', [String(email).toLowerCase()]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new HttpError(401, 'Invalid credentials');
  await audit.log(user.id, 'LOGIN', 'users', user.id);
  res.json({ token: sign(user), user: { id: user.id, email: user.email, role: user.role } });
}));
router.get('/auth/me', requireAuth, asyncHandler(async (req, res) => res.json({ user: { id: req.user.sub, email: req.user.email, role: req.user.role } })));

router.use(requireAuth);

router.get('/employees', asyncHandler(async (req, res) => res.json(await employees.list({ q: req.query.q, status: req.query.status }))));
router.post('/employees/import', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'CSV file is required (field name "file")');
  const result = await employees.importCsv(req.file.buffer, req.user.sub, { partial: req.query.partial === 'true' });
  rag.reindexBackground(req.user.sub);
  res.json(result);
}));
router.get('/employees/:id/history', asyncHandler(async (req, res) => res.json(await salary.employeeHistory(req.params.id))));
router.put('/employees/:id', asyncHandler(async (req, res) => { const r = await employees.update(req.params.id, req.body || {}, req.user.sub); rag.reindexBackground(req.user.sub); res.json(r); }));
router.post('/employees/:id/send-email', asyncHandler(async (req, res) => res.json(await employees.sendTemplatedEmail(req.params.id, req.body?.template, req.user.sub))));

router.get('/salary/batches', asyncHandler(async (_req, res) => res.json(await salary.listBatches())));
router.get('/salary/batches/:id', asyncHandler(async (req, res) => res.json(await salary.getBatch(req.params.id))));
router.post('/salary/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Excel/CSV file is required (field name "file")');
  const result = await salary.uploadBatch({ buffer: req.file.buffer, originalName: req.file.originalname, month: req.body.month || req.query.month, year: req.body.year || req.query.year, actorId: req.user.sub });
  rag.reindexBackground(req.user.sub);
  res.status(201).json(result);
}));
router.put('/salary/records/:id/flag', asyncHandler(async (req, res) => res.json(await salary.flagRecord(req.params.id, req.body || {}, req.user.sub))));
router.post('/salary/batches/:id/approve', asyncHandler(async (req, res) => { const r = await salary.approve(req.params.id, req.user.sub); rag.reindexBackground(req.user.sub); res.json(r); }));
router.post('/salary/batches/:id/reject', asyncHandler(async (req, res) => res.json(await salary.reject(req.params.id, req.body?.reason, req.user.sub))));
router.post('/salary/batches/:id/send', asyncHandler(async (req, res) => { const r = await salary.sendBatch(req.params.id, req.user.sub); rag.reindexBackground(req.user.sub); res.json(r); }));

const SETTING_KEYS = ['smtp', 'llm', 'schedule', 'company'];
router.get('/settings/:key', asyncHandler(async (req, res) => { if (!SETTING_KEYS.includes(req.params.key)) throw new HttpError(404, 'Unknown setting'); res.json(settings.mask(req.params.key, await settings.get(req.params.key))); }));
router.put('/settings/:key', asyncHandler(async (req, res) => {
  if (!SETTING_KEYS.includes(req.params.key)) throw new HttpError(404, 'Unknown setting');
  const merged = await settings.set(req.params.key, req.body || {}, req.user.sub);
  await audit.log(req.user.sub, 'SETTINGS_UPDATED', 'settings', req.params.key);
  if (req.params.key === 'schedule') await engine.start();
  res.json(settings.mask(req.params.key, merged));
}));
router.post('/settings/smtp/test', asyncHandler(async (_req, res) => res.json(await mailer.verify())));

router.get('/templates', asyncHandler(async (_req, res) => { const db = await init(); res.json(await db.all('SELECT * FROM email_templates ORDER BY name')); }));
router.put('/templates/:name', asyncHandler(async (req, res) => {
  const db = await init();
  const { subject, body_html, placeholders, description } = req.body || {};
  if (!subject || !body_html) throw new HttpError(400, 'subject and body_html are required');
  const name = String(req.params.name).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!name) throw new HttpError(400, 'Invalid template name');
  const existing = await db.get('SELECT id, placeholders_json FROM email_templates WHERE name = ?', [name]);
  const prev = existing && existing.placeholders_json ? JSON.parse(existing.placeholders_json) : {};
  const meta = JSON.stringify({
    description: description !== undefined ? description : (prev.description || ''),
    placeholders: placeholders !== undefined ? placeholders : (prev.placeholders || []),
  });
  if (existing) await db.run('UPDATE email_templates SET subject = ?, body_html = ?, placeholders_json = ?, updated_by = ?, updated_at = ? WHERE id = ?', [subject, body_html, meta, req.user.sub, now(), existing.id]);
  else await db.run('INSERT INTO email_templates (id, name, subject, body_html, placeholders_json, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuid(), name, subject, body_html, meta, req.user.sub, now()]);
  await audit.log(req.user.sub, 'TEMPLATE_UPDATED', 'email_templates', name);
  res.json(await db.get('SELECT * FROM email_templates WHERE name = ?', [name]));
}));
router.delete('/templates/:name', asyncHandler(async (req, res) => {
  if (req.params.name === 'salary-slip') throw new HttpError(400, 'The salary-slip template is required by the salary agent and cannot be deleted.');
  const db = await init();
  await db.run('DELETE FROM email_templates WHERE name = ?', [req.params.name]);
  await audit.log(req.user.sub, 'TEMPLATE_DELETED', 'email_templates', req.params.name);
  res.json({ ok: true });
}));

router.get('/agents', asyncHandler(async (_req, res) => { const db = await init(); res.json(await db.all('SELECT * FROM agents ORDER BY name')); }));
router.put('/agents/:name', asyncHandler(async (req, res) => {
  const db = await init();
  const row = await db.get('SELECT * FROM agents WHERE name = ?', [req.params.name]);
  if (!row) throw new HttpError(404, 'Agent not found');
  const enabled = req.body.enabled === undefined ? row.enabled : (req.body.enabled ? 1 : 0);
  const cronExp = req.body.cron_expression === undefined ? row.cron_expression : req.body.cron_expression;
  await db.run('UPDATE agents SET enabled = ?, cron_expression = ? WHERE id = ?', [enabled, cronExp, row.id]);
  await audit.log(req.user.sub, 'AGENT_UPDATED', 'agents', row.id, { enabled, cronExp });
  await engine.start();
  res.json(await db.get('SELECT * FROM agents WHERE name = ?', [req.params.name]));
}));
router.post('/agents/:name/run', asyncHandler(async (req, res) => res.json(await engine.runAgent(req.params.name, 'manual'))));

router.get('/ai/status', asyncHandler(async (_req, res) => { const cfg = await llm.getConfig(); res.json({ configured: !!cfg.apiKey, provider: cfg.provider, model: cfg.model }); }));
router.post('/ai/compose-template', asyncHandler(async (req, res) => res.json(await ai.composeTemplate({ instruction: req.body?.instruction, tone: req.body?.tone }))));
router.post('/ai/assistant', asyncHandler(async (req, res) => { if (!req.body?.question) throw new HttpError(400, 'question is required'); const db = await init(); res.json(await ai.assistant(db, req.body.question)); }));

router.get('/rag/status', asyncHandler(async (_req, res) => res.json({ ...(await rag.status()), ...rag.indexingState() })));
router.post('/rag/reindex', asyncHandler(async (req, res) => res.json(await rag.reindex(req.user.sub))));
router.post('/rag/ask', asyncHandler(async (req, res) => { if (!req.body?.question) throw new HttpError(400, 'question is required'); res.json(await rag.answer(req.body.question, { history: Array.isArray(req.body.history) ? req.body.history : [] })); }));
router.post('/rag/documents', asyncHandler(async (req, res) => res.json(await rag.addDocument({ title: req.body?.title, content: req.body?.content }, req.user.sub))));
router.post('/rag/documents/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'file is required (PDF or Word)');
  res.json(await rag.addDocumentFromFile(req.file.buffer, req.file.originalname, req.body?.title, req.user.sub));
}));

router.get('/chat/conversations', asyncHandler(async (req, res) => res.json(await chat.listConversations(req.user.sub))));
router.get('/chat/conversations/:id', asyncHandler(async (req, res) => res.json(await chat.getConversation(req.user.sub, req.params.id))));
router.delete('/chat/conversations/:id', asyncHandler(async (req, res) => res.json(await chat.deleteConversation(req.user.sub, req.params.id))));
router.post('/chat/ask', asyncHandler(async (req, res) => { if (!req.body?.question) throw new HttpError(400, 'question is required'); res.json(await chat.ask(req.user.sub, req.body.conversationId || null, req.body.question)); }));

router.get('/logs/audit', asyncHandler(async (req, res) => res.json(await audit.list({ limit: Number(req.query.limit) || 50 }))));
router.get('/logs/sends', asyncHandler(async (req, res) => {
  const db = await init();
  res.json(await db.all(`SELECT s.*, e.full_name, e.employee_id AS emp_code, b.month, b.year FROM send_logs s JOIN salary_records r ON r.id = s.salary_record_id JOIN employees e ON e.id = r.employee_id JOIN salary_batches b ON b.id = r.batch_id ORDER BY s.created_at DESC LIMIT ?`, [Number(req.query.limit) || 100]));
}));
router.get('/dashboard', asyncHandler(async (_req, res) => {
  const db = await init();
  const [emp, batches, sends] = await Promise.all([
    db.get(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active FROM employees`),
    db.all('SELECT * FROM salary_batches ORDER BY year DESC, month DESC LIMIT 6'),
    db.get(`SELECT SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN status = 'QUEUED' THEN 1 ELSE 0 END) AS queued FROM send_logs`),
  ]);
  const payout = await db.all(`SELECT month, year, total_net_pay, employee_count, status FROM salary_batches WHERE status IN ('APPROVED', 'SENT') ORDER BY year ASC, month ASC`);
  const recentAudit = await audit.list({ limit: 8 });
  res.json({ employees: { total: Number(emp?.total || 0), active: Number(emp?.active || 0) }, sends: { sent: Number(sends?.sent || 0), failed: Number(sends?.failed || 0), queued: Number(sends?.queued || 0) }, recentBatches: batches, payoutSeries: payout.slice(-12), recentActivity: recentAudit });
}));

module.exports = router;
