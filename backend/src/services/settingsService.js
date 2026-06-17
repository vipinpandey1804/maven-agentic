const { init } = require('../db');
const { encrypt, decrypt, now } = require('../utils/helpers');

const DEFAULTS = {
  smtp: { transport: 'json', host: 'smtp.gmail.com', port: 465, secure: true, user: '', pass: '', fromName: 'HR Department', fromEmail: '' },
  llm: { provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: '', openaiApiKey: '', openaiModel: 'gpt-4o' },
  schedule: { cron: '0 9 1 * *', timezone: 'Asia/Kolkata' },
  company: { name: 'Your Company Pvt. Ltd.', address: '', logoText: 'YC' },
};

// Masked keys never returned in plaintext to the API
const SECRET_FIELDS = { smtp: ['pass'], llm: ['apiKey', 'openaiApiKey'] };

async function get(key) {
  const db = await init();
  const row = await db.get('SELECT value_encrypted FROM settings WHERE key = ?', [key]);
  if (!row) return DEFAULTS[key] ? { ...DEFAULTS[key] } : null;
  return { ...DEFAULTS[key], ...decrypt(row.value_encrypted) };
}

async function set(key, value, actorId) {
  const db = await init();
  const current = (await get(key)) || {};
  // keep existing secrets when client sends masked placeholder
  for (const f of SECRET_FIELDS[key] || []) {
    if (value[f] === '••••••••' || value[f] === undefined) value[f] = current[f];
  }
  const merged = { ...current, ...value };
  const enc = encrypt(merged);
  const existing = await db.get('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) await db.run('UPDATE settings SET value_encrypted = ?, updated_by = ?, updated_at = ? WHERE key = ?', [enc, actorId || null, now(), key]);
  else await db.run('INSERT INTO settings (key, value_encrypted, updated_by, updated_at) VALUES (?, ?, ?, ?)', [key, enc, actorId || null, now()]);
  return merged;
}

function mask(key, value) {
  const v = { ...value };
  for (const f of SECRET_FIELDS[key] || []) if (v[f]) v[f] = '••••••••';
  return v;
}

module.exports = { get, set, mask, DEFAULTS };
