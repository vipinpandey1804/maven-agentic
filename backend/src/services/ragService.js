// RAG built on LangChain.js + pgvector (PostgreSQL only).
const { OpenAIEmbeddings, ChatOpenAI } = require('@langchain/openai');
const { ChatAnthropic } = require('@langchain/anthropic');
const { PGVectorStore } = require('@langchain/community/vectorstores/pgvector');
const { Document } = require('@langchain/core/documents');
const { SystemMessage, HumanMessage } = require('@langchain/core/messages');
const { Pool } = require('pg');
const config = require('../config');
const { init } = require('../db');
const { uuid, now, HttpError } = require('../utils/helpers');
const settings = require('./settingsService');
const audit = require('./auditService');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TABLE = 'rag_embeddings';

const MAVEN_PROFILE = `Maven Technosoft Pvt. Ltd. is a global IT, Data and AI services company headquartered in Noida, India (World Trade Tower, Sector 16), serving clients across North America, Europe, the Middle East, APAC and India. Tagline: "Inspired by Excellence". Contact: info@maventechno.com, +91 7827 1212 99. Website: maventechno.com.
Services Maven offers: Web & Mobile Development; Application Development & Maintenance (ADM) with 24x7 support; Cloud & DevOps; Big Data & Analytics; AI & Machine Learning; UI/UX & CMS.
AI solutions: Generative AI & LLM apps; RAG & knowledge search; Predictive & Prescriptive ML; Computer Vision; Intelligent Automation; Responsible & Secure AI.
Industries served: Airlines & Travel; Eyecare & Vision Health; Transportation & Logistics; Hospitality & OTAs; Banking, Financial Services & Insurance (BFSI).
Engagement models: fixed-scope, time & materials, dedicated offshore teams, managed services, AI proofs-of-value. 50+ years combined domain experience across TTHL and BFSI.`;

function requirePg() { if (config.dbClient !== 'pg') throw new HttpError(400, 'RAG requires PostgreSQL. Set DATABASE_URL (with pgvector) to enable the knowledge base.'); }

async function getOpenAiKey() {
  const llm = await settings.get('llm');
  if (!llm.openaiApiKey) { const e = new Error('OpenAI API key required for embeddings - add it in Settings > LLM.'); e.code = 'EMBEDDINGS_NOT_CONFIGURED'; throw e; }
  return llm.openaiApiKey;
}
async function getEmbeddings() { return new OpenAIEmbeddings({ apiKey: await getOpenAiKey(), model: 'text-embedding-3-small' }); }
async function getStore() {
  requirePg();
  const embeddings = await getEmbeddings();
  return PGVectorStore.initialize(embeddings, {
    postgresConnectionOptions: { connectionString: config.databaseUrl },
    tableName: TABLE,
    columns: { idColumnName: 'id', vectorColumnName: 'embedding', contentColumnName: 'content', metadataColumnName: 'metadata' },
    distanceStrategy: 'cosine',
  });
}
async function getChatModel() {
  const llm = await settings.get('llm');
  if ((llm.provider || 'anthropic') === 'openai') { if (!llm.openaiApiKey) return null; return new ChatOpenAI({ apiKey: llm.openaiApiKey, model: llm.openaiModel || 'gpt-4o', temperature: 0.2 }); }
  if (!llm.apiKey) return null;
  return new ChatAnthropic({ apiKey: llm.apiKey, model: llm.model || 'claude-sonnet-4-6', temperature: 0.2 });
}

async function buildAutoDocs(db) {
  const docs = [];
  const company = (await settings.get('company')) || {};
  docs.push(new Document({ pageContent: `Company (this app's employer): ${company.name || 'N/A'}. Address: ${company.address || 'N/A'}. This payroll system emails password-protected salary slips on the 1st of each month.`, metadata: { source_type: 'company', source_id: 'company', title: 'Company info' } }));
  docs.push(new Document({ pageContent: MAVEN_PROFILE, metadata: { source_type: 'company_profile', source_id: 'maven', title: 'About Maven Technosoft - services & offerings' } }));
  for (const e of await db.all('SELECT * FROM employees')) {
    docs.push(new Document({ pageContent: `Employee ${e.full_name}, ID ${e.employee_id}, email ${e.email}, designation ${e.designation || 'N/A'}, department ${e.department || 'N/A'}, date of joining ${e.date_of_joining || 'N/A'}, status ${e.status}.`, metadata: { source_type: 'employee', source_id: e.id, title: `Employee ${e.full_name} (${e.employee_id})` } }));
  }
  const records = await db.all(`SELECT r.*, e.full_name, e.employee_id AS code, b.month, b.year, b.status AS batch_status FROM salary_records r JOIN employees e ON e.id = r.employee_id JOIN salary_batches b ON b.id = r.batch_id`);
  for (const r of records) {
    docs.push(new Document({ pageContent: `Salary for ${r.full_name} (${r.code}) in ${MONTHS[r.month - 1]} ${r.year}: basic ${r.basic}, HRA ${r.hra}, allowances ${r.allowances}, deductions ${r.deductions}, LOP days ${r.lop_days}, net pay ${r.net_pay}. Batch status ${r.batch_status}.`, metadata: { source_type: 'salary', source_id: r.employee_id, title: `Salary ${r.code} ${MONTHS[r.month - 1]} ${r.year}` } }));
  }
  for (const b of await db.all('SELECT * FROM salary_batches')) {
    docs.push(new Document({ pageContent: `Salary batch for ${MONTHS[b.month - 1]} ${b.year}: status ${b.status}, ${b.employee_count} employees, total payout ${b.total_net_pay}.`, metadata: { source_type: 'batch', source_id: b.id, title: `Batch ${MONTHS[b.month - 1]} ${b.year}` } }));
  }
  for (const c of await db.all('SELECT * FROM rag_custom_docs')) {
    docs.push(new Document({ pageContent: c.content, metadata: { source_type: 'custom', source_id: c.id, title: c.title || 'Custom document' } }));
  }
  return docs;
}

async function reindex(actorId) {
  requirePg();
  const store = await getStore();
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    await pool.query(`DELETE FROM ${TABLE}`);
    const db = await init();
    const docs = await buildAutoDocs(db);
    if (docs.length) await store.addDocuments(docs);
    await audit.log(actorId, 'RAG_REINDEXED', 'rag', null, { documents: docs.length });
    return { documents: docs.length, chunks: docs.length, model: 'text-embedding-3-small', store: 'pgvector' };
  } finally { await pool.end().catch(() => {}); await store.end().catch(() => {}); }
}

let indexing = false, queued = false;
async function reindexBackground(actorId) {
  if (config.dbClient !== 'pg') return { skipped: 'not-pg' };
  if (indexing) { queued = true; return { queued: true }; }
  indexing = true;
  (async () => { try { do { queued = false; await reindex(actorId); } while (queued); } catch (e) { console.error('[rag] background reindex failed:', e.message); } finally { indexing = false; } })();
  return { started: true };
}
function indexingState() { return { indexing, queued }; }

async function addDocument({ title, content }, actorId) {
  requirePg();
  if (!content || !String(content).trim()) throw new HttpError(400, 'content is required');
  const db = await init();
  const id = uuid();
  await db.run('INSERT INTO rag_custom_docs (id, title, content, created_at) VALUES (?, ?, ?, ?)', [id, title || 'Untitled', content, now()]);
  const store = await getStore();
  try { await store.addDocuments([new Document({ pageContent: content, metadata: { source_type: 'custom', source_id: id, title: title || 'Untitled' } })]); } finally { await store.end().catch(() => {}); }
  await audit.log(actorId, 'RAG_DOC_ADDED', 'rag_custom_docs', id, { title });
  return { ok: true };
}

async function extractText(buffer, filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') { const pdf = require('pdf-parse'); const data = await pdf(buffer); return data.text || ''; }
  if (ext === 'docx' || ext === 'doc') { const mammoth = require('mammoth'); const r = await mammoth.extractRawText({ buffer }); return r.value || ''; }
  throw new HttpError(400, 'Unsupported file type. Please upload a PDF or Word (.docx) file.');
}
async function addDocumentFromFile(buffer, filename, title, actorId) {
  requirePg();
  const text = (await extractText(buffer, filename)).trim();
  if (!text) throw new HttpError(400, 'Could not extract any text from that file. If it is a scanned image PDF, OCR is not supported yet.');
  return addDocument({ title: title || filename, content: text }, actorId);
}

async function status() {
  if (config.dbClient !== 'pg') return { documents: 0, chunks: 0, store: 'disabled', note: 'RAG requires PostgreSQL (set DATABASE_URL)', embedding: { model: 'text-embedding-3-small' }, indexing, queued };
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    let chunks = 0; try { chunks = Number((await pool.query(`SELECT COUNT(*) AS n FROM ${TABLE}`)).rows[0].n); } catch { chunks = 0; }
    const custom = Number((await pool.query('SELECT COUNT(*) AS n FROM rag_custom_docs')).rows[0].n);
    return { documents: chunks, chunks, customDocs: custom, store: 'pgvector', embedding: { model: 'text-embedding-3-small', backend: 'openai' }, indexing, queued };
  } finally { await pool.end().catch(() => {}); }
}

async function search(query, k = 6) {
  const store = await getStore();
  try {
    const results = await store.similaritySearchWithScore(query, k);
    return results.map(([doc, score]) => ({ title: doc.metadata?.title || 'Untitled', source_type: doc.metadata?.source_type, content: doc.pageContent, score }));
  } finally { await store.end().catch(() => {}); }
}

async function gatherStats() {
  try {
    const db = await init();
    const emp = await db.get(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status='inactive' THEN 1 ELSE 0 END) AS inactive FROM employees`);
    const depts = await db.all(`SELECT department, COUNT(*) AS n FROM employees WHERE status='active' GROUP BY department ORDER BY n DESC`);
    const batches = await db.all(`SELECT month, year, status, total_net_pay, employee_count FROM salary_batches ORDER BY year DESC, month DESC LIMIT 6`);
    const sends = await db.get(`SELECT SUM(CASE WHEN status='SENT' THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN status='QUEUED' THEN 1 ELSE 0 END) AS queued FROM send_logs`);
    const disbursed = await db.get(`SELECT COALESCE(SUM(total_net_pay), 0) AS amt FROM salary_batches WHERE status='SENT'`);
    const fails = await db.all(`SELECT e.full_name, e.employee_id AS code, b.month, b.year FROM send_logs s JOIN salary_records r ON r.id=s.salary_record_id JOIN employees e ON e.id=r.employee_id JOIN salary_batches b ON b.id=r.batch_id WHERE s.status='FAILED' ORDER BY s.created_at DESC LIMIT 30`);
    const pendingLeaves = await db.get(`SELECT COUNT(*) AS n FROM leave_requests WHERE status='PENDING'`);
    const lines = [];
    lines.push(`Employees: total ${Number(emp?.total || 0)}, active ${Number(emp?.active || 0)}, inactive ${Number(emp?.inactive || 0)}.`);
    if (depts.length) lines.push(`Active employees by department: ${depts.map((d) => `${d.department || 'Unassigned'} ${Number(d.n)}`).join(', ')}.`);
    lines.push(`IMPORTANT payout rule: payout counts ONLY when a batch is actually SENT. For DRAFT/PENDING_APPROVAL/APPROVED/REJECTED batches payout is 0 / not yet paid.`);
    if (batches.length) lines.push(`Recent salary batches: ${batches.map((b) => `${MONTHS[b.month - 1]} ${b.year} (status ${b.status}, ${b.employee_count} emp, ${b.status === 'SENT' ? `paid ${b.total_net_pay}` : `planned ${b.total_net_pay} NOT paid - payout 0`})`).join('; ')}.`);
    lines.push(`Total payout disbursed so far (SENT only): ${Number(disbursed?.amt || 0)}.`);
    lines.push(`Slip sends: ${Number(sends?.sent || 0)} sent, ${Number(sends?.failed || 0)} failed, ${Number(sends?.queued || 0)} queued.`);
    lines.push(`Pending leave requests: ${Number(pendingLeaves?.n || 0)}.`);
    if (fails.length) lines.push(`Failed slips: ${fails.map((f) => `${f.full_name} (${f.code}, ${MONTHS[f.month - 1]} ${f.year})`).join('; ')}.`);
    return lines.join('\n');
  } catch (e) { console.error('[rag] gatherStats failed:', e.message); return ''; }
}

async function entityContext(text) {
  try {
    const db = await init();
    const t = String(text).toLowerCase();
    const employees = await db.all('SELECT id, employee_id, full_name, email, designation, department, status FROM employees');
    const matched = employees.filter((e) => t.includes(String(e.full_name).toLowerCase()) || t.includes(String(e.employee_id).toLowerCase())).slice(0, 3);
    if (!matched.length) return '';
    const blocks = [];
    for (const e of matched) {
      const recs = await db.all(`SELECT b.month, b.year, b.status, r.basic, r.hra, r.allowances, r.deductions, r.lop_days, r.net_pay FROM salary_records r JOIN salary_batches b ON b.id = r.batch_id WHERE r.employee_id = ? ORDER BY b.year DESC, b.month DESC`, [e.id]);
      const hist = recs.length ? recs.map((r) => `${MONTHS[r.month - 1]} ${r.year} (batch ${r.status}): basic ${r.basic}, HRA ${r.hra}, allowances ${r.allowances}, deductions ${r.deductions}, LOP ${r.lop_days}, net pay ${r.net_pay}`).join('; ') : 'no salary records yet';
      blocks.push(`Employee ${e.full_name} (${e.employee_id}) - ${e.designation || 'N/A'}, ${e.department || 'N/A'}, ${e.status}, email ${e.email}. Salary slip history (${recs.length} record(s)): ${hist}.`);
    }
    return blocks.join('\n');
  } catch (e) { console.error('[rag] entityContext failed:', e.message); return ''; }
}

async function personalContext(employeeId) {
  try {
    const db = await init();
    const e = await db.get('SELECT * FROM employees WHERE id = ?', [employeeId]);
    if (!e) return '';
    const recs = await db.all(`SELECT b.month, b.year, b.status, r.basic, r.hra, r.allowances, r.deductions, r.lop_days, r.net_pay FROM salary_records r JOIN salary_batches b ON b.id = r.batch_id WHERE r.employee_id = ? ORDER BY b.year DESC, b.month DESC`, [employeeId]);
    const hist = recs.length ? recs.map((r) => `${MONTHS[r.month - 1]} ${r.year} (${r.status}): basic ${r.basic}, HRA ${r.hra}, allowances ${r.allowances}, deductions ${r.deductions}, LOP ${r.lop_days}, net pay ${r.net_pay}`).join('; ') : 'no salary records yet';
    const leaves = await db.all('SELECT type, from_date, to_date, days, status FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 20', [employeeId]);
    const leaveStr = leaves.length ? leaves.map((l) => `${l.type} ${l.from_date} to ${l.to_date} (${l.days}d) - ${l.status}`).join('; ') : 'no leave requests';
    return `Your profile: ${e.full_name} (${e.employee_id}), email ${e.email}, designation ${e.designation || 'N/A'}, department ${e.department || 'N/A'}, joined ${e.date_of_joining || 'N/A'}, status ${e.status}.\nYour salary slip history (${recs.length}): ${hist}.\nYour leave requests: ${leaveStr}.`;
  } catch (e) { console.error('[rag] personalContext failed:', e.message); return ''; }
}

async function employeeRoster(limit = 200) {
  try {
    const db = await init();
    const emps = await db.all('SELECT employee_id, full_name, email, designation, department, date_of_joining, status FROM employees ORDER BY full_name ASC');
    if (!emps.length || emps.length > limit) return '';
    return emps.map((e) => `${e.full_name} | ID ${e.employee_id} | ${e.email} | ${e.designation || 'N/A'} | ${e.department || 'N/A'} | joined ${e.date_of_joining || 'N/A'} | ${e.status}`).join('\n');
  } catch (e) { console.error('[rag] employeeRoster failed:', e.message); return ''; }
}

// Non-sensitive colleague directory for employees: names, designations, departments
// ONLY. Never includes salary, email, DOB or other personal/contact details.
async function colleagueDirectory(limit = 500) {
  try {
    const db = await init();
    const emps = await db.all("SELECT full_name, designation, department FROM employees WHERE status = 'active' ORDER BY department, full_name ASC");
    if (!emps.length || emps.length > limit) return '';
    return emps.map((e) => `${e.full_name} - ${e.designation || 'N/A'} (${e.department || 'Unassigned'})`).join('\n');
  } catch (e) { console.error('[rag] colleagueDirectory failed:', e.message); return ''; }
}

const GREETING_RE = /^(hi+|hey+|hello|yo|hola|namaste|hii|good (morning|afternoon|evening)|sup|wassup)\b/i;
const THANKS_RE = /\b(thanks|thank you|thx|shukriya|dhanyavad|great|nice|cool|ok|okay)\b/i;
const SMALLTALK = { who: /\b(who are you|what are you|your name|kaun ho|tum kya ho)\b/i, help: /\b(what can you do|help|how do you work|kya kar sakte)\b/i };
function greetingReply() { return "Hi! I'm Maven, your assistant. What would you like to know?"; }

async function answer(question, { k = 8, history = [], scope = null } = {}) {
  const q = String(question).trim();
  if (GREETING_RE.test(q) && q.length <= 20) return { answer: greetingReply(), sources: [], usedLlm: false };
  if (SMALLTALK.who.test(q)) return { answer: greetingReply(), sources: [], usedLlm: false };
  if (SMALLTALK.help.test(q)) return { answer: scope?.role === 'employee' ? "I'm Maven. Ask me about your salary slips, your leaves, your profile, or company policies." : "I'm Maven. Ask me about employees, salaries, payslip batches, payouts, leaves, or company policies.", sources: [], usedLlm: false };
  if (THANKS_RE.test(q) && q.length <= 25) return { answer: "You're welcome! Anything else?", sources: [], usedLlm: false };

  if (config.dbClient !== 'pg') return { answer: "The knowledge base needs PostgreSQL (with pgvector). Please set DATABASE_URL and reindex in Settings then Knowledge.", sources: [], usedLlm: false };

  const recentUser = history.filter((m) => m.role === 'user').slice(-2).map((m) => m.text).join(' ');
  const searchQuery = recentUser ? `${recentUser} ${q}` : q;
  const convo = history.slice(-6).map((m) => `${m.role === 'user' ? 'User' : 'Maven'}: ${m.text}`).join('\n');

  if (scope && scope.role === 'employee' && scope.employeeId) {
    let hits = [];
    try { hits = await search(searchQuery, 20); } catch (e) {
      if (e.code === 'EMBEDDINGS_NOT_CONFIGURED') return { answer: 'The assistant is not configured yet. Please contact your admin.', sources: [], usedLlm: false };
      throw e;
    }
    const allowed = hits.filter((h) => ['company', 'company_profile', 'custom'].includes(h.source_type)).slice(0, 6);
    const personal = await personalContext(scope.employeeId);
    const directory = await colleagueDirectory();
    const context = `[your data] (authoritative - the asking user's own record):\n${personal}\n\n`
      + (directory ? `[colleague directory] (names, designations, departments of active colleagues - NON-sensitive, safe to share):\n${directory}\n\n` : '')
      + (allowed.length ? `[company info & policies]:\n${allowed.map((h) => `${h.title}\n${h.content}`).join('\n\n')}` : '');
    const sources = allowed.map((h) => ({ title: h.title, type: h.source_type, score: Number(Number(h.score).toFixed(3)) }));
    const model = await getChatModel();
    if (!model) return { answer: personal || 'No data available.', sources, usedLlm: false };
    const sys = [
      "You are Maven, a friendly assistant for an EMPLOYEE of this company.",
      "You may discuss THIS employee's own salary, payslips, leaves and profile (the [your data] block), general company info/policies, AND the colleague directory.",
      "If the user asks who their colleagues are, who works in a team/department, or for a list of people, USE the [colleague directory] block to answer with names, designations and departments. Headcounts of colleagues or departments are fine.",
      "NEVER reveal any OTHER employee's salary, payslips, payout amounts, email, phone, date of birth, or other personal/contact details - only their name, designation and department. Never give company-wide salary totals or payout figures. For the asking user's OWN salary/payslips, answering is fine.",
      'When listing multiple people or any structured records (e.g. colleagues), format them as a GitHub-flavored Markdown table with clear column headers (for colleagues use: Name | Designation | Department). Use the rupee symbol and Indian number formatting. No bracketed citations. Be warm and concise.',
    ].join(' ');
    const res = await model.invoke([new SystemMessage(sys), new HumanMessage(`${convo ? `Conversation so far:\n${convo}\n\n` : ''}Context:\n${context}\n\nUser: ${q}`)]);
    const out = typeof res.content === 'string' ? res.content : (Array.isArray(res.content) ? res.content.map((c) => c.text || '').join('') : String(res.content));
    return { answer: out, sources, usedLlm: true };
  }

  let hits = [];
  try { hits = await search(searchQuery, Math.max(k, 8)); } catch (e) {
    if (e.code === 'EMBEDDINGS_NOT_CONFIGURED') return { answer: 'Add an OpenAI API key in Settings then LLM so I can search the knowledge base.', sources: [], usedLlm: false };
    throw e;
  }
  const stats = await gatherStats();
  const entity = await entityContext(searchQuery);
  const roster = await employeeRoster();
  if (!hits.length && !stats && !entity && !roster) return { answer: "My knowledge base looks empty. Click Reindex in Settings then Knowledge so I can read your company data first.", sources: [], usedLlm: false };

  const context = `[summary] Company data (authoritative, use this for counts and totals):\n${stats}\n\n`
    + (roster ? `[all employees] (authoritative full roster; format: Name | ID | email | designation | department | joined | status):\n${roster}\n\n` : '')
    + (entity ? `[employee details] (authoritative full records for named employees):\n${entity}\n\n` : '')
    + hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.content}`).join('\n\n');
  const sources = hits.map((h) => ({ title: h.title, type: h.source_type, score: Number(Number(h.score).toFixed(3)) }));

  const model = await getChatModel();
  if (!model) return { answer: `Summary:\n${stats}${entity ? `\n\n${entity}` : ''}`, sources, usedLlm: false };

  const sys = [
    "You are Maven, a friendly, conversational assistant for this company's admin panel.",
    'Behave like a normal chat assistant: greet back, be warm and concise.',
    'For counts and totals use the [summary] block. To LIST employees or give per-employee details, use the [all employees] roster - never say a field is "Not available" if it is present, and never invent placeholder rows like "One employee in X".',
    'For a specific person, use the [employee details] block when present; otherwise use the context snippets. When listing employees or any structured/tabular data (rosters, salary breakdowns, batches), format the answer as a GitHub-flavored Markdown table with clear column headers. Use the rupee symbol and Indian number formatting.',
    'Do NOT include citation markers like [1] or [summary] in your reply - answer naturally in plain language.',
    'If the latest message is a short follow-up like "yes" or "details", interpret it from the conversation so far.',
    'If the context does not contain the answer but the question is clearly about the company, simply say you do not have that information. Do NOT tell the user to add it or check Settings.',
    "If the question is OFF-TOPIC (not about this company/people/payroll/policies), gently say you're going off track and ask to keep it company-related.",
  ].join(' ');
  const res = await model.invoke([new SystemMessage(sys), new HumanMessage(`${convo ? `Conversation so far:\n${convo}\n\n` : ''}Context:\n${context}\n\nUser: ${q}`)]);
  const out = typeof res.content === 'string' ? res.content : (Array.isArray(res.content) ? res.content.map((c) => c.text || '').join('') : String(res.content));
  return { answer: out, sources, usedLlm: true };
}

// AI assistant reply for a personal-detail change-request ticket. The AI only
// converses/clarifies — it never approves or applies changes (HR does that).
async function aiTicketReply({ category, subject, comments = [] }) {
  const CAT = { email: 'email address', phone: 'phone number', address: 'address', other: 'personal detail' };
  const what = CAT[category] || 'personal detail';
  let model = null;
  try { model = await getChatModel(); } catch (e) { model = null; }
  if (!model) {
    return `Thanks for raising this request to update your ${what}. I've logged it and notified HR. To help them process it quickly, please share the exact new value${category === 'address' ? ' (full new address)' : ''} and, if relevant, the date it should take effect. HR will review and approve the change.`;
  }
  const convo = comments.map((c) => `${c.author_role === 'employee' ? 'Employee' : (c.author_role === 'assistant' ? 'Maven' : 'HR')}: ${c.message}`).join('\n');
  const sys = [
    "You are Maven, a warm HR assistant handling an employee's personal-detail CHANGE REQUEST (a support ticket).",
    "Acknowledge the request, confirm exactly what they want changed, and ask for any missing specifics (the exact new value, and an effective date or supporting proof if relevant).",
    "CRITICAL: You do NOT approve or apply changes. A human (HR) reviews and processes every change. Never say the change is done or approved - say HR will review and process it.",
    "Be concise (2-4 sentences), friendly, and do not use bracketed citations.",
  ].join(' ');
  const user = `Request type: ${category}\nSubject: ${subject}\n\nConversation so far:\n${convo}\n\nWrite Maven\'s next reply to the employee.`;
  try {
    const res = await model.invoke([new SystemMessage(sys), new HumanMessage(user)]);
    return typeof res.content === 'string' ? res.content : (Array.isArray(res.content) ? res.content.map((c) => c.text || '').join('') : String(res.content));
  } catch (e) {
    console.error('[ticket-ai] reply failed:', e.message);
    return `Thanks for raising this request to update your ${what}. HR has been notified and will review and process it. Please add any specific details that would help.`;
  }
}

module.exports = { reindex, reindexBackground, indexingState, addDocument, addDocumentFromFile, status, search, answer, aiTicketReply };
