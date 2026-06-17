// DB adapter: same API over node:sqlite (dev/test) and pg (production).
// SQL is written portable; '?' placeholders are rewritten to $n for pg.
const fs = require('fs');
const path = require('path');
const config = require('../config');

let impl = null;

function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + ++i);
}

async function init() {
  if (impl) return impl;
  if (config.dbClient === 'pg') {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: config.databaseUrl });
    impl = {
      client: 'pg',
      async all(sql, p = []) { const { rows } = await pool.query(toPg(sql), p); return rows; },
      async get(sql, p = []) { const rows = await impl.all(sql, p); return rows[0]; },
      async run(sql, p = []) { await pool.query(toPg(sql), p); },
      async exec(sql) { await pool.query(sql); },
      async close() { await pool.end(); impl = null; },
    };
  } else {
    const { DatabaseSync } = require('node:sqlite');
    fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
    const db = new DatabaseSync(config.sqlitePath);
    db.exec('PRAGMA journal_mode = WAL;');
    impl = {
      client: 'sqlite',
      async all(sql, p = []) { return db.prepare(sql).all(...p); },
      async get(sql, p = []) { return db.prepare(sql).get(...p); },
      async run(sql, p = []) { db.prepare(sql).run(...p); },
      async exec(sql) { db.exec(sql); },
      async close() { db.close(); impl = null; },
    };
  }
  return impl;
}

module.exports = { init };
