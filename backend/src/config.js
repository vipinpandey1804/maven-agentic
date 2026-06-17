require('dotenv').config();
const path = require('path');

const root = path.join(__dirname, '..');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
  // 32-byte key for AES-256-GCM encryption of settings at rest
  secretKey: (process.env.SECRET_KEY || 'dev-secret-key-32-bytes-change!!').padEnd(32, '0').slice(0, 32),
  // 'sqlite' (dev/test, zero setup) or 'pg' (production).
  // Auto-selects pg when a DATABASE_URL is provided, unless DB_CLIENT overrides it.
  dbClient: process.env.DB_CLIENT || (process.env.DATABASE_URL ? 'pg' : 'sqlite'),
  databaseUrl: process.env.DATABASE_URL || '',
  sqlitePath: process.env.SQLITE_PATH || path.join(root, 'data', 'app.db'),
  storageDir: process.env.STORAGE_DIR || path.join(root, 'storage'),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@company.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin@123',
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false',
};
