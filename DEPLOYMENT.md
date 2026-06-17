# Deployment Guide — Railway (backend) + Vercel (frontend) + Neon (Postgres)

Stack: **backend on Railway** (always-on, so the salary cron + background jobs run), **frontend on Vercel**, **Postgres + pgvector on Neon** (free tier with pgvector).

Cost: Neon free + Vercel free + Railway (one-time $5 trial credit, then ~$5/mo Hobby). Railway is used because the free spin-down platforms (Render free) would put the cron scheduler to sleep.

---

## 1. Database — Neon (Postgres + pgvector)

1. Create a project at https://neon.tech (free).
2. In the SQL editor run once:  `CREATE EXTENSION IF NOT EXISTS vector;`
   (The app also tries this automatically on boot.)
3. Copy the **connection string** (looks like `postgres://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require`). This is your `DATABASE_URL`.

> Railway also offers its own Postgres, but Neon ships pgvector ready-to-use, so it's the simpler choice.

---

## 2. Backend — Railway

1. Push this repo to GitHub.
2. Railway → **New Project → Deploy from GitHub repo** → pick the repo.
3. Settings → **Root Directory** = `backend`.
4. Railway auto-detects Node (Nixpacks) and runs `npm start`. `railway.json` already sets the start command + `/api/health` healthcheck.
5. **Variables** (Settings → Variables) — add:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string |
   | `DB_CLIENT` | `pg` |
   | `JWT_SECRET` | a long random string |
   | `SECRET_KEY` | a 32-character random string (for encrypting SMTP/LLM creds) |
   | `ADMIN_EMAIL` | your admin login email |
   | `ADMIN_PASSWORD` | your admin login password |
   | `NODE_ENV` | `production` |

   (Do NOT set `PORT` — Railway injects it; the app reads `process.env.PORT`.)
6. Deploy. Railway gives a public URL like `https://your-app.up.railway.app`.
   Test: open `https://your-app.up.railway.app/api/health` → should return `{"ok":true,...}`.

On first boot the app auto-migrates all tables (employees, salary, chat, rag_custom_docs) and enables pgvector. Add OpenAI + SMTP keys later from the in-app Settings page (they're stored encrypted in the DB).

---

## 3. Frontend — Vercel

1. Vercel → **New Project** → same GitHub repo.
2. **Root Directory** = `frontend`.
3. Framework preset: **Vite** (build `npm run build`, output `dist`). `vercel.json` already handles SPA routing.
4. **Environment Variable**:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | your Railway backend URL, e.g. `https://your-app.up.railway.app` |

5. Deploy. Vercel gives a URL like `https://your-app.vercel.app`.

The frontend calls `${VITE_API_URL}/api/...`. In local dev `VITE_API_URL` is unset, so it falls back to `/api` via the Vite proxy.

---

## 4. After deploy — first run

1. Open the Vercel URL, log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. **Settings → LLM** — paste your **OpenAI API key** (required for RAG embeddings) and optionally a Claude key. Save.
3. **Settings → SMTP** — add Gmail (App Password) or your SMTP, and Test connection. (Until set, emails run in dev mode and are only logged.)
4. **Settings → Knowledge → Reindex** so the assistant can read your data.
5. Import employees, upload a salary sheet, and you're live.

---

## Notes & gotchas

- **CORS**: the backend currently allows all origins. To lock it to your Vercel domain, set a `FRONTEND_URL` env var and restrict `cors()` in `backend/src/app.js`.
- **Cron / salary agent**: needs an always-on host — that's why Railway, not a sleep-on-idle free tier. The agent fires on the 1st at 09:00 IST (configurable in Settings → Schedule).
- **PDF storage**: salary slip PDFs are written to the backend's local disk (`storage/`). On Railway this disk is **ephemeral** — files are lost on redeploy/restart. Fine for emailing slips (PDF is generated, attached, sent in one go). If you need to *retain* generated PDFs long-term, add a Railway **Volume** (mount at `storage/`) or switch to S3/Cloud storage later.
- **Node version**: pinned to `>=22` (`.nvmrc` + `engines`) because the app uses Node's built-in features.
- **Secrets**: never commit real keys. Set them only as platform env vars.
