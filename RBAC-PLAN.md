# RBAC & Multi-Role Plan — Maven PaySlip Platform

Turning the single-admin app into a 4-role organisation platform.

## Roles

| Role | Who | Core ability |
|---|---|---|
| `admin` | Owner / IT | Full access incl. Settings (SMTP/LLM/keys), user management. |
| `ca` | Accountant | **Only** uploads salary sheets. On upload → email all HR + Admin to review. No approve. |
| `hr` | HR / Administration | Review/approve/reject salary batches, send slips, manage employees, review & approve leaves. |
| `employee` | Staff | Self-service: own payslips/history, own leaves (apply + status), own profile, scoped Ask Maven. |

## Permission matrix

| Capability | admin | ca | hr | employee |
|---|---|---|---|---|
| Settings (SMTP/LLM/schedule/company/templates/knowledge) | ✅ | — | — | — |
| User management (CRUD users + roles) | ✅ | — | — | — |
| Upload salary sheet | ✅ | ✅ | — | — |
| Review / approve / reject batch | ✅ | — | ✅ | — |
| Flag records, send slips | ✅ | — | ✅ | — |
| Employees: import/edit | ✅ | — | ✅ | — |
| Employees: view list | ✅ | ✅ | ✅ | — |
| Send templated emails (birthday etc.) | ✅ | — | ✅ | — |
| Leaves: approve/reject (all) | ✅ | — | ✅ | — |
| Leaves: apply + view own | ✅ | ✅ | ✅ | ✅ |
| Ask Maven over ALL company data | ✅ | ✅(payroll) | ✅ | — |
| Ask Maven over OWN data only | — | — | — | ✅ |
| My dashboard (own slips/leaves/profile) | ✅ | ✅ | ✅ | ✅ |

## Data model changes

- **users**: `role` enum widened to `admin | ca | hr | employee`; existing `employee_id` FK links an employee-role login to its `employees` row.
- **leave_requests** (new): `id, employee_id, type (casual|sick|earned|unpaid), from_date, to_date, days, reason, status (PENDING|APPROVED|REJECTED), reviewed_by, review_note, created_at, updated_at`.
- **leave_balances** (optional, Phase 3): per employee per type allocation + used.
- Audit log already records actor — keep using it for every privileged action.

## Backend

1. **Auth/role middleware**: `requireRole(...roles)` on every route. JWT already carries `role`; add `employee_id` to the token for employee logins.
2. **User management service + routes** (admin only): `GET/POST/PUT/DELETE /users`, assign role, link to employee, reset password.
3. **Row-level scoping**: for `employee` role, salary/leaves/profile endpoints filter by `req.user.employee_id`. A helper `scopeToSelf(req, employeeId)` rejects cross-user access.
4. **CA → HR/Admin email**: after `salary/upload`, look up all `hr` + `admin` users' emails and send a "batch ready for review" notification (uses mailer + a `batch-review` template).
5. **Leaves service + routes**: apply (employee), list (scoped), approve/reject (hr/admin).
6. **Scoped Ask Maven**: when role is `employee`, RAG retrieval + stats are filtered to that employee only (no other people's salaries).

## Frontend

1. **Auth context** stores `{ id, email, role, employeeId }`. Route guards by role.
2. **Role-aware sidebar**:
   - admin: Dashboard, Employees, Salary Batches, Settings (incl. Users, Agents)
   - ca: Upload Salary (minimal), My dashboard
   - hr: Dashboard, Employees, Salary Batches, Leaves, My dashboard
   - employee: My Dashboard (slips, leaves, profile), Ask Maven (scoped)
3. **User management UI** (admin): list users, add user (email, password, role, link employee), edit role, delete.
4. **Employee portal**: own payslip list/download, leave apply form + status, profile view.
5. **Leaves screens**: employee apply + list; HR review queue (approve/reject).
6. Ask Maven widget shown for admin/hr/ca (full) and employee (scoped) — hidden for none.

## Phasing (build order)

- **Phase 1 — Foundation**: roles + user management (admin UI + API) + `requireRole` on all routes + role-aware nav/guards + CA-upload→HR/Admin email. Existing features simply gated.
- **Phase 2 — Employee self-service**: employee login portal (own slips/history/profile) + row-level scoping + scoped Ask Maven.
- **Phase 3 — Leaves**: leave_requests schema, apply/approve flow, HR review queue, employee leave view; wire leaves into Ask Maven.

## Decisions locked
- Build all phases.
- Users are created by **admin** via the user-management UI (email + password + role + optional employee link).
- **CA uploads only**; approval stays with HR/Admin.
- Employee scope: own payslips/history, own leaves, own profile, company-info via scoped Ask Maven.

## Notes / risks
- Seeded `admin@company.com` stays the bootstrap admin. First real users created from there.
- Employee logins must be linked to an `employees` row (so scoping works). Admin links them when creating the user.
- Keep audit logging on all role-restricted actions.
- pgvector RAG stays pg-only; scoped employee RAG adds a metadata filter (`source_id`/`employee_id`).
