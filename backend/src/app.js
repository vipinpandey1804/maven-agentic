const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { HttpError } = require('./utils/helpers');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
  app.use('/api', routes);

  app.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message || 'Internal error', details: err.details });
  });
  return app;
}

module.exports = { createApp };
