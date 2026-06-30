// Pluggable agent engine: agents implement { name, defaultCron, run(ctx) }.
// Schedules come from the `agents` table; adding a new agent = register() + a DB row.
const cron = require('node-cron');
const { init } = require('../db');
const { uuid, now } = require('../utils/helpers');
const settingsService = require('../services/settingsService');
const audit = require('../services/auditService');

const registry = new Map();
const jobs = new Map();

function register(agent) {
  if (!agent.name || typeof agent.run !== 'function') throw new Error('Agent needs { name, run }');
  registry.set(agent.name, agent);
}

function listRegistered() { return [...registry.keys()]; }

async function buildContext() {
  const db = await init();
  return {
    db,
    settings: settingsService,
    audit,
    mailer: require('../services/mailerService'),
    pdf: require('../services/pdfService'),
    salary: require('../services/salaryService'),
    log: (...a) => console.log('[agent]', ...a),
  };
}

async function ensureRows() {
  const db = await init();
  for (const agent of registry.values()) {
    const row = await db.get('SELECT id FROM agents WHERE name = ?', [agent.name]);
    if (!row) {
      await db.run('INSERT INTO agents (id, name, enabled, cron_expression, config_json, created_at) VALUES (?, ?, 1, ?, ?, ?)',
        [uuid(), agent.name, agent.defaultCron || null, JSON.stringify(agent.defaultConfig || {}), now()]);
    }
  }
}

async function runAgent(name, trigger = 'cron') {
  const agent = registry.get(name);
  if (!agent) throw new Error(`Agent "${name}" not registered`);
  await ensureRows();
  const ctx = await buildContext();
  const db = ctx.db;
  const row = await db.get('SELECT * FROM agents WHERE name = ?', [name]);
  const config = row && row.config_json ? JSON.parse(row.config_json) : {};
  await audit.log(null, 'AGENT_RUN_STARTED', 'agents', row ? row.id : null, { name, trigger });
  try {
    const result = await agent.run({ ...ctx, config });
    await audit.log(null, 'AGENT_RUN_FINISHED', 'agents', row ? row.id : null, { name, trigger, result });
    return result;
  } catch (e) {
    await audit.log(null, 'AGENT_RUN_FAILED', 'agents', row ? row.id : null, { name, trigger, error: e.message });
    throw e;
  }
}

async function start() {
  await ensureRows();
  if (!require('../config').schedulerEnabled) return; // e.g. tests
  const db = await init();
  const rows = await db.all('SELECT * FROM agents');
  for (const row of rows) {
    if (!registry.has(row.name)) continue;
    if (jobs.has(row.name)) { jobs.get(row.name).stop(); jobs.delete(row.name); }
    if (!row.enabled || !row.cron_expression) continue;
    const job = cron.schedule(row.cron_expression, () => {
      runAgent(row.name, 'cron').catch((e) => console.error(`[agent:${row.name}]`, e.message));
    }, { timezone: 'Asia/Kolkata' });
    jobs.set(row.name, job);
    console.log(`[engine] scheduled "${row.name}" @ ${row.cron_expression} (Asia/Kolkata)`);
  }
}

function stop() { for (const job of jobs.values()) job.stop(); jobs.clear(); }

module.exports = { register, listRegistered, runAgent, start, stop };
