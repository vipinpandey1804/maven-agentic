# PaySlip Agent — Multi-Agent Automation Platform

v1: emails password-protected salary slip PDFs to every employee on the 1st of each month.
Built per `PRD-salary-slip-agent.md`. Architecture: `backend-architecture.drawio`, schema: `database-tables.drawio`.

## Structure

```
backend/    Node.js + Express API, agent engine, cron scheduler (port 4000)
frontend/   React + Vite + Tailwind (shadcn-style UI, framer-motion) (port 5173)
```

## Quick start

```bash
# 1. Backend
cd backend
npm install
npm run dev          # starts API on http://localhost:4000 (auto-migrates + seeds)

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev          # opens http://localhost:5173 (proxies /api to :4000)
```

Login: `admin@company.com` / `Admin@123` (change via `backend/.env`, see `.env.example`).

## Monthly workflow

1. **Employees → Import CSV** — columns: `employee_id, full_name, email, dob (YYYY-MM-DD), designation, department, date_of_joining, status`. DOB is mandatory: it becomes the PDF password (`DDMMYYYY`).
2. **Salary Batches → Upload salary sheet** (.xlsx/.csv) — columns: `employee_id, basic, hra, allowances, deductions, lop_days, net_pay`. Validation blocks unknown employees; warnings flag net-pay mismatches and missing actives.
3. **Review → Approve batch.**
4. On the **1st at 09:00 IST** the `salary-slip-agent` dispatches automatically — or click **Send slips now**. Re-sends skip already-sent employees (idempotent).

## Email

Out of the box the platform runs in **dev mode** (`jsonTransport`): emails are logged, not sent.
Configure Gmail in **Settings → SMTP** with a Google **App Password** (requires 2-Step Verification), then **Test connection**.

## Database

Default: zero-setup SQLite (`backend/data/app.db`, via Node's built-in driver).
Production PostgreSQL: set in `backend/.env`:

```
DB_CLIENT=pg
DATABASE_URL=postgres://user:pass@host:5432/salary_agent
```

Same SQL runs on both; migrations apply automatically at boot.

## Adding a new agent (the "flexible" part)

1. Create `backend/src/agents/myAgent.js` exporting `{ name, defaultCron, run(ctx) }` —
   `ctx` provides `db, mailer, pdf, salary, settings, audit, log`.
2. Register it in `src/server.js`: `engine.register(require('./agents/myAgent'))`.
3. It appears in the Agents page with enable/disable, cron editing, and "Run now".

## Tests

```bash
cd backend && npm test    # 17 integration tests (auth, import, batch lifecycle, PDFs, idempotency, settings encryption)
```
