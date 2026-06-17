// Persistent chat: per-user conversation threads with message history.
const { init } = require('../db');
const { uuid, now, HttpError } = require('../utils/helpers');
const rag = require('./ragService');

function titleFrom(text) {
  const t = String(text).trim().replace(/\s+/g, ' ');
  return t.length > 48 ? t.slice(0, 48) + '…' : t || 'New chat';
}

async function listConversations(userId) {
  const db = await init();
  return db.all(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
       (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count
     FROM chat_conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC`,
    [userId]
  );
}

async function getConversation(userId, id) {
  const db = await init();
  const conv = await db.get('SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?', [id, userId]);
  if (!conv) throw new HttpError(404, 'Conversation not found');
  const messages = await db.all('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC', [id]);
  return {
    ...conv,
    messages: messages.map((m) => ({
      role: m.role, text: m.content,
      sources: m.sources_json ? JSON.parse(m.sources_json) : undefined,
      created_at: m.created_at,
    })),
  };
}

async function deleteConversation(userId, id) {
  const db = await init();
  const conv = await db.get('SELECT id FROM chat_conversations WHERE id = ? AND user_id = ?', [id, userId]);
  if (!conv) throw new HttpError(404, 'Conversation not found');
  await db.run('DELETE FROM chat_messages WHERE conversation_id = ?', [id]);
  await db.run('DELETE FROM chat_conversations WHERE id = ?', [id]);
  return { ok: true };
}

async function addMessage(db, conversationId, role, content, sources) {
  await db.run(
    'INSERT INTO chat_messages (id, conversation_id, role, content, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid(), conversationId, role, content, sources ? JSON.stringify(sources) : null, now()]
  );
}

/** Ask within a thread: persists the turn, uses stored history for context. */
async function ask(userId, conversationId, question) {
  const db = await init();
  let conv = conversationId
    ? await db.get('SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?', [conversationId, userId])
    : null;

  if (!conv) {
    const id = uuid();
    await db.run('INSERT INTO chat_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, userId, titleFrom(question), now(), now()]);
    conv = { id, title: titleFrom(question) };
  }

  const prior = await db.all('SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC', [conv.id]);
  const history = prior.map((m) => ({ role: m.role, text: m.content }));

  const result = await rag.answer(question, { history });

  await addMessage(db, conv.id, 'user', question, null);
  await addMessage(db, conv.id, 'assistant', result.answer, result.sources);
  await db.run('UPDATE chat_conversations SET updated_at = ? WHERE id = ?', [now(), conv.id]);

  return { conversationId: conv.id, title: conv.title, answer: result.answer, sources: result.sources, usedLlm: result.usedLlm };
}

module.exports = { listConversations, getConversation, deleteConversation, ask };
