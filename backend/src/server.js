const config = require('./config');
const { createApp } = require('./app');
const { migrate } = require('./db/migrate');
const { seed } = require('./db/seed');
const engine = require('./agents/engine');

engine.register(require('./agents/salarySlipAgent'));

async function main() {
  await migrate();
  await seed({ quiet: true });
  if (config.schedulerEnabled) await engine.start();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port} (db: ${config.dbClient})`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
