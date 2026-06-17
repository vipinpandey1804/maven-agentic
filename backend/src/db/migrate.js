const { init } = require('./index');
const migrations = require('./migrations');

async function migrate() {
  const db = await init();
  for (const sql of migrations) {
    try {
      await db.exec(sql);
    } catch (e) {
      // tolerate re-running ALTERs on already-migrated DBs
      if (/duplicate column|already exists/i.test(e.message)) continue;
      throw e;
    }
  }
  await migrateRag(db);
  await migrateChat(db);
  return db;
}

// Chat history: per-user conversation threads + messages (portable for pg & sqlite).
async function migrateChat(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS chat_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources_json TEXT,
    created_at TEXT NOT NULL
  )`);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_chat_conv_user ON chat_conversations(user_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id)');
}

// RAG tables are client-aware: pgvector column on Postgres, JSON text on SQLite.
// RAG is PostgreSQL-only (LangChain + pgvector). PGVectorStore manages its own
// embeddings table; we only need a durable table for admin-added custom documents.
async function migrateRag(db) {
  if (db.client !== 'pg') return; // RAG disabled on sqlite dev
  try { await db.exec('CREATE EXTENSION IF NOT EXISTS vector'); }
  catch (e) { console.warn('[rag] could not enable pgvector extension:', e.message); }
  await db.exec(`CREATE TABLE IF NOT EXISTS rag_custom_docs (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  // One-time cleanup: an older custom RAG version created rag_embeddings with a
  // "document_id" column (no "metadata"). LangChain's PGVectorStore needs its own
  // schema, so drop the legacy table once and let PGVectorStore recreate it.
  const legacy = await db.get(
    `SELECT 1 AS x FROM information_schema.columns WHERE table_name = 'rag_embeddings' AND column_name = 'document_id'`
  );
  if (legacy) {
    console.warn('[rag] dropping legacy rag_embeddings table (old schema) so pgvector store can recreate it');
    await db.exec('DROP TABLE IF EXISTS rag_embeddings');
  }
  await db.exec('DROP TABLE IF EXISTS rag_documents'); // unused leftover from old version
}

if (require.main === module) {
  migrate().then(() => { console.log('Migrations applied.'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { migrate };
