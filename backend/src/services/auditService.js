const { init } = require('../db');
const { uuid, now } = require('../utils/helpers');

async function log(actorId, action, entity, entityId, details) {
  const db = await init();
  await db.run(
    'INSERT INTO audit_logs (id, actor_id, action, entity, entity_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uuid(), actorId || null, action, entity || null, entityId || null, details ? JSON.stringify(details) : null, now()]
  );
}

async function list({ limit = 50 } = {}) {
  const db = await init();
  return db.all(
    `SELECT a.*, u.email AS actor_email FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC LIMIT ?`, [limit]
  );
}

module.exports = { log, list };
