# PRD — Multi-Agent Automation Platform (v1: Salary Slip Agent)

| | |
|---|---|
| **Author** | Vipin |
| **Date** | 2026-06-10 |
| **Status** | Draft |
| **Stack** | Node.js, Express, PostgreSQL |

---

## 1. Overview

A Node.js/Express platform that runs autonomous "agents" on schedules. The first agent emails **password-protected salary slip PDFs** to every employee on the **1st of each month**, using salary data uploaded by HR as Excel/CSV.

The platform is built as a **pluggable agent engine**, not a one-off script. Future agents (RAG-based company Q&A, leave tracking, reports) plug into the same core: scheduler, settings, LLM providers, notification channels, and admin panel.

## 2. Goals

- G1: Automatically send each employee their salary slip on the 1st of every month, with zero manual emailing.
- G2: Human-in-the-loop safety — an admin approves each month's batch before anything is sent.
- G3: Admin panel to manage SMTP settings, LLM provider (OpenAI, Claude, etc.), employees, and salary history.
- G4: Architecture where new agents can be added without modifying the core engine.

### Non-Goals (v1)

- Computing salaries (payroll math is done outside; we only distribute slips).
- Employee-facing login/portal (Phase 3).
- Channels other than email (Slack/WhatsApp later).

## 3. Users

| Role | Access | Description |
|---|---|---|
| **Admin / HR** | Full (v1) | Uploads salary data, approves batches, configures SMTP/LLM, tracks salary history, queries the RAG assistant. |
| **Employee** | Receives email only (v1) | Phase 3: logs in to ask the RAG system about leaves, company policies, own salary history. |

## 4. Phased Roadmap

| Phase | Scope |
|---|---|
| **1 (v1)** | Salary Slip Email Agent + admin panel + CSV employee import + approval workflow |
| **2** | RAG Agent for admin: natural-language Q&A over employees, salaries, send logs |
| **3** | Employee access: RAG over company info, leave tracking, own payslip history; more agents and channels |

## 5. Functional Requirements — Phase 1

### 5.1 Employee Import (CSV)

- FR-1: Admin uploads a CSV of employee details. Required columns: `employee_id, full_name, email, dob, designation, department, date_of_joining, status(active/inactive)`.
- FR-2: Validate every row — email format, DOB parseable, no duplicate `employee_id`/`email`. Show a row-level error report; import nothing if validation fails (all-or-nothing), or allow "import valid rows only" toggle.
- FR-3: Re-upload performs an upsert keyed on `employee_id`.

### 5.2 Monthly Salary Upload (Excel/CSV)

- FR-4: Admin uploads the month's salary sheet (.xlsx or .csv) and tags it with month/year. Expected columns: `employee_id, basic, hra, allowances, deductions, lop_days, net_pay` (final list TBD — see Open Questions).
- FR-5: System validates: every `employee_id` exists and is active, numeric fields are numeric, `net_pay` ≈ earnings − deductions (warn on mismatch).
- FR-6: Parsed rows are stored in `salary_records` (one row per employee per month) — this builds salary history for tracking and the future RAG agent.
- FR-7: Re-uploading for the same month replaces the previous draft (only while batch is not yet approved/sent).

### 5.3 Slip Generation

- FR-8: For each salary record, generate a PDF salary slip: company header, employee details, month, earnings/deductions table, net pay (in figures and words).
- FR-9: Each PDF is **encrypted with password = employee DOB in `DDMMYYYY`** format.
- FR-10: Admin can preview any generated slip before approval (admin preview view requires no password).

### 5.4 Approval Workflow

- FR-11: After upload + generation, the batch is in `PENDING_APPROVAL` with a summary screen: employee count, total payout, mismatch warnings, missing employees.
- FR-12: Admin clicks **Approve** → batch becomes `APPROVED`, eligible for dispatch. **Reject** → batch discarded with reason.
- FR-13: If the 1st arrives and no approved batch exists for the month, the agent does **not** send; it emails the admin a reminder instead (daily until resolved).

### 5.5 Scheduling & Dispatch

- FR-14: Cron job (`node-cron`) fires on the 1st at a configurable time (default 09:00 IST). It dispatches the approved batch for that month. Admin can also trigger "Send now" manually.
- FR-15: Emails sent via **Nodemailer over Gmail/Google Workspace SMTP** (app password). SMTP host/port/user/pass are editable in admin settings — switching to SendGrid/SES later means only changing settings, since dispatch goes through a mailer abstraction.
- FR-16: Throttle sends (e.g., 1/sec) to respect Gmail limits (~500/day consumer, ~2,000/day Workspace). Alert admin if employee count approaches the limit.
- FR-17: Per-employee send status: `QUEUED → SENT → FAILED`. Failed sends auto-retry 3× with exponential backoff; persistent failures listed for manual resend.
- FR-18: Email content: subject `Salary Slip – {Month YYYY}`, body from an editable template with placeholders (`{name}`, `{month}`), note explaining the PDF password format. Optionally LLM-polished body via the Email Agent.

### 5.6 Admin Panel

- FR-19: Auth — email + password login, bcrypt, JWT/session; single admin role in v1 (role table designed for future roles).
- FR-20: Settings pages:
  - **SMTP**: host, port, user, password (encrypted at rest), from-name/address, test-connection button.
  - **LLM provider**: choose provider (OpenAI / Anthropic Claude / others), API key, model name, per-agent override. Implemented behind a common `LLMProvider` interface.
  - **Schedule**: send day/time, timezone.
  - **Templates**: email subject/body editor.
- FR-21: **Salary tracking**: per-employee salary history view (month-wise table + trend), batch history, and dispatch logs (who was sent what, when, status).
- FR-22: Audit log: every upload, approval, settings change, and send recorded with actor + timestamp.

### 5.7 Agent Engine (core flexibility requirement)

- FR-23: An **Agent** is a module implementing a standard interface:

  ```ts
  interface Agent {
    name: string;                  // "salary-slip-agent"
    schedule?: string;             // cron expression, optional
    inputs: InputSpec[];           // e.g., file upload, DB query
    run(ctx: AgentContext): Promise<AgentResult>;
  }
  ```

- FR-24: `AgentContext` provides shared services: DB access, mailer, PDF service, file storage, the configured LLM client, logger, and settings. Agents never instantiate these directly.
- FR-25: Agents are registered in an agent registry; the scheduler reads registered agents + their cron settings from DB. Adding a new agent = new module + registry entry, **no core changes**.
- FR-26: Planned agents: `salary-slip-agent` (v1), `email-agent` (LLM-composed emails, used by other agents), `rag-agent` (Phase 2 Q&A over Postgres + uploaded docs with pgvector embeddings).

## 6. Phase 2 Preview — RAG Agent (design now, build later)

- Embeds company documents and structured data (employees, salary records, leave data) into **pgvector** in the same PostgreSQL instance.
- Admin chat UI: "Whose slip failed last month?", "Total payout in May?" — answered via retrieval + the configured LLM.
- Phase 3 extends access to employees with row-level scoping (an employee can only retrieve their own salary/leave data) — schema must carry `owner_id` on sensitive records from day one.

## 7. Tech Stack

| Concern | Choice |
|---|---|
| Runtime/API | Node.js 20+, Express |
| DB | PostgreSQL (+ pgvector in Phase 2) |
| ORM | Prisma (or Knex) |
| Excel/CSV parsing | SheetJS (xlsx), csv-parse |
| PDF generation | pdf-lib or PDFKit; encryption via qpdf or @pdf-lib equivalent (must support AES password protection) |
| Email | Nodemailer (SMTP abstraction) |
| Scheduling | node-cron (in-process) — upgrade path to BullMQ + Redis if scale demands |
| LLM | Provider-agnostic client layer (OpenAI SDK, Anthropic SDK) |
| Admin UI | React (Vite) or server-rendered EJS — TBD |
| Auth | JWT + bcrypt |

## 8. Data Model (key tables)

```
employees(id, employee_id, full_name, email, dob, designation, department,
          date_of_joining, status, created_at, updated_at)
salary_batches(id, month, year, file_name, status[DRAFT|PENDING_APPROVAL|APPROVED|SENT|REJECTED],
               uploaded_by, approved_by, approved_at, created_at)
salary_records(id, batch_id, employee_id, basic, hra, allowances, deductions,
               lop_days, net_pay, pdf_path, created_at)
send_logs(id, salary_record_id, status[QUEUED|SENT|FAILED], attempts,
          last_error, sent_at)
agents(id, name, enabled, cron_expression, config_json)
settings(key, value_encrypted, updated_by, updated_at)   -- SMTP, LLM, schedule
users(id, email, password_hash, role, created_at)        -- admins (employees in Phase 3)
audit_logs(id, actor_id, action, entity, details_json, created_at)
```

## 9. Key API Endpoints

```
POST /api/auth/login
POST /api/employees/import            (CSV upload)
GET  /api/employees
POST /api/salary/upload               (Excel/CSV, ?month=&year=)
GET  /api/salary/batches/:id          (summary + warnings)
POST /api/salary/batches/:id/approve | /reject
POST /api/salary/batches/:id/send     (manual trigger)
GET  /api/salary/history/:employeeId
GET  /api/logs/sends?month=&year=
GET/PUT /api/settings/smtp | /llm | /schedule | /templates
GET  /api/agents  PUT /api/agents/:name   (enable/disable, cron)
```

## 10. Security & Compliance

- Salary data is highly sensitive: TLS everywhere; SMTP/LLM credentials and DOB encrypted at rest; PDFs stored encrypted; uploaded source files deleted (or encrypted) after parsing per retention setting.
- PDF password (DOB `DDMMYYYY`) is convenience-grade, not strong security — acceptable per business decision; revisit in Phase 3.
- Rate-limit auth endpoints; lockout on repeated failures.
- Audit trail (FR-22) for every sensitive action.
- LLM hygiene: salary data is sent to an external LLM **only** for explicitly LLM-powered features, never for slip generation itself.

## 11. Error Handling & Edge Cases

| Case | Behavior |
|---|---|
| Employee in salary sheet missing from employee table | Block approval; show in warnings |
| Active employee missing from salary sheet | Warn at approval (may be unpaid/exited) |
| Invalid/bounced email | Mark FAILED after retries; surface in admin panel |
| Gmail daily limit hit | Pause queue, resume next day automatically, notify admin |
| No approved batch on the 1st | No sends; daily reminder email to admin |
| Server down at cron time | On startup, check for missed runs (catch-up logic) |
| Duplicate dispatch attempt | Idempotency: a record with status SENT is never re-sent |

## 12. Success Metrics

- 100% of approved slips dispatched on the 1st (or within retry window).
- < 1% failed deliveries per month after retries.
- Admin time per month ≤ 10 minutes (upload + approve).
- New agent can be added without touching engine code (verified in Phase 2).

## 13. Open Questions (need answers before build)

1. **Excel columns** — share the actual salary Excel so the exact column mapping and slip layout can be fixed. *(File was not in the folder yet.)*
2. **Salary slip layout** — company name/logo/address for the PDF header? Any statutory fields needed (PF, ESI, PAN, UAN, TDS)?
3. **Employee count** — roughly how many employees? (Determines whether Gmail limits are a real constraint.)
4. **Timezone** — confirm IST for the schedule.
5. **Gmail account** — Workspace or consumer Gmail? An app password (2FA) will be required.
6. **DOB source** — DOB must be present and correct in the employee CSV for PDF passwords; who owns this data's accuracy?
7. **Approval fallback** — if the admin is unavailable, should a second approver exist?
8. **Leave/company data** (Phase 2/3) — where does leave tracking data live today? What documents feed the RAG (policy PDFs, handbook)?
9. **Deployment** — where will this run (VPS, Render, AWS)? Affects file storage and cron reliability.
10. **LLM budget/provider preference for v1** — keys for OpenAI and Anthropic both, or one to start?
