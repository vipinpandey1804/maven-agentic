const { init } = require('./index');
const migrations = require('./migrations');

async function migrate() {
  const db = await init();
  for (const sql of migrations) {
    try {
      await db.exec(sql);
    } catch (e) {
      if (/duplicate column|already exists/i.test(e.message)) continue;
      throw e;
    }
  }
  await migrateRag(db);
  await migrateChat(db);
  await migrateLeaves(db);
  await migrateTickets(db);
  return db;
}

async function migrateRag(db) {
  if (db.client !== 'pg') return;
  try { await db.exec('CREATE EXTENSION IF NOT EXISTS vector'); } catch (e) { console.warn('[rag] pgvector:', e.message); }
  await db.exec(`CREATE TABLE IF NOT EXISTS rag_custom_docs ( id TEXT PRIMARY KEY, title TEXT, content TEXT NOT NULL, created_at TEXT NOT NULL )`);
  const legacy = await db.get(`SELECT 1 AS x FROM information_schema.columns WHERE table_name = 'rag_embeddings' AND column_name = 'document_id'`);
  if (legacy) { console.warn('[rag] dropping legacy rag_embeddings table'); await db.exec('DROP TABLE IF EXISTS rag_embeddings'); }
  await db.exec('DROP TABLE IF EXISTS rag_documents');
}

async function migrateChat(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS chat_conversations ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS chat_messages ( id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, sources_json TEXT, created_at TEXT NOT NULL )`);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_chat_conv_user ON chat_conversations(user_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id)');
}

async function migrateLeaves(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    days NUMERIC DEFAULT 0,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    reviewed_by TEXT,
    review_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_requests(employee_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status)');
}

async function migrateTickets(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_by TEXT,
    reviewed_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS ticket_comments (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    author_id TEXT,
    author_role TEXT,
    author_name TEXT,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_ticket_emp ON tickets(employee_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_ticket_status ON tickets(status)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_ticket_comments ON ticket_comments(ticket_id)');
}

if (require.main === module) {
  migrate().then(() => { console.log('Migrations applied.'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { migrate };
