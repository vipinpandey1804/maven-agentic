// Portable DDL (works on SQLite and PostgreSQL).
// ids: uuid as TEXT, timestamps: ISO-8601 TEXT, booleans: INTEGER 0/1.
module.exports = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    employee_id TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    employee_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    dob TEXT NOT NULL,
    designation TEXT,
    department TEXT,
    date_of_joining TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    original_name TEXT,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    uploaded_by TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS salary_batches (
    id TEXT PRIMARY KEY,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    source_file_id TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    uploaded_by TEXT,
    approved_by TEXT,
    approved_at TEXT,
    reject_reason TEXT,
    total_net_pay NUMERIC DEFAULT 0,
    employee_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS salary_records (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    basic NUMERIC DEFAULT 0,
    hra NUMERIC DEFAULT 0,
    allowances NUMERIC DEFAULT 0,
    deductions NUMERIC DEFAULT 0,
    lop_days NUMERIC DEFAULT 0,
    net_pay NUMERIC DEFAULT 0,
    pdf_file_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(batch_id, employee_id)
  )`,
  `CREATE TABLE IF NOT EXISTS send_logs (
    id TEXT PRIMARY KEY,
    salary_record_id TEXT NOT NULL,
    to_email TEXT,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    enabled INTEGER DEFAULT 1,
    cron_expression TEXT,
    config_json TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_encrypted TEXT NOT NULL,
    updated_by TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    placeholders_json TEXT,
    updated_by TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL
  )`,
  // review workflow: HR can flag wrong records before approval (duplicate-column errors are ignored by the runner)
  `ALTER TABLE salary_records ADD COLUMN flagged INTEGER DEFAULT 0`,
  `ALTER TABLE salary_records ADD COLUMN flag_reason TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_records_batch ON salary_records(batch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_records_employee ON salary_records(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sendlogs_record ON send_logs(salary_record_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)`,
];
