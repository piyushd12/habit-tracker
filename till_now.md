# Habit Tracker — Implementation Status (Handoff)

Last updated: 2026-08-09  
Reference architecture: [`habit_tracker_architecture.md`](./habit_tracker_architecture.md)

This document captures what Antigravity built before hitting the model limit, plus fixes applied during Cursor handoff. Use it to resume work without re-reading the entire codebase.

---

## Quick Start

### Prerequisites
- Node.js 18+
- Docker (for PostgreSQL + Redis)

### 1. Infrastructure
```bash
docker compose up -d
```

### 2. Backend
```bash
cd server
cp .env.example .env   # fill in secrets / VAPID keys
npm install
npx prisma migrate dev
npm run dev            # http://localhost:5000
```

Generate VAPID keys if needed:
```bash
npx web-push generate-vapid-keys
```

### 3. Frontend
```bash
cd client
cp .env.example .env   # set VITE_API_URL and VITE_VAPID_PUBLIC_KEY
npm install
npm run dev            # http://localhost:5173
```

### Build verification
Both apps compile cleanly:
```bash
cd server && npm run build
cd client && npm run build
```

---

## What Is Implemented

### Infrastructure & config
| Item | Status | Notes |
|------|--------|-------|
| `docker-compose.yml` | Done | PostgreSQL 15 + Redis 7 |
| Prisma schema + initial migration | Done | Users, Habits, HabitLogs, ReminderSettings, PushSubscriptions |
| Prisma 7 config | Done | `prisma.config.ts` + `@prisma/adapter-pg` driver adapter |
| Root `.gitignore` | Done | Excludes `node_modules`, `dist`, `.env` |
| `.env.example` files | Done | `server/.env.example`, `client/.env.example` |

### Backend (`server/`)
| Feature | Status | Key files |
|---------|--------|-----------|
| Express app bootstrap | Done | `src/app.ts` |
| JWT auth (register/login/logout/refresh/me) | Done | `src/routes/auth.ts` |
| Hybrid token model | Done | 15m access token in memory; 7d refresh in httpOnly cookie |
| bcrypt password hashing (12 rounds) | Done | `src/routes/auth.ts` |
| Protected routes middleware | Done | `src/middleware/auth.ts` |
| Zod validation on all endpoints | Done | `src/middleware/validators.ts`, `validate.ts` |
| Consistent error responses | Done | `src/utils/errors.ts` |
| Habit CRUD | Done | `src/routes/habits.ts` |
| Idempotent daily logging | Done | `src/routes/logs.ts` — unique `(habitId, date)` |
| Streak engine (DAILY + CUSTOM schedules) | Done | `src/services/streaks.ts` |
| Cached streak fields on Habit | Done | Updated on log write/delete and schedule change |
| On-demand streak endpoint | Done | `GET /api/habits/:id/streak` |
| Reminder settings CRUD | Done | `src/routes/reminders.ts` |
| Web Push subscription storage | Done | `POST /api/reminders/subscribe` |
| Timezone-bucketed reminder scheduler | Done | `src/services/scheduler.ts` (BullMQ + web-push) |
| Timezone update endpoint | Done | `PUT /api/auth/timezone` |

### Frontend (`client/`)
| Feature | Status | Key files |
|---------|--------|-----------|
| Vite + React 19 + TypeScript | Done | scaffolded via create-vite |
| TanStack Query for server state | Done | `src/main.tsx`, Dashboard mutations |
| Axios client + auto token refresh | Done | `src/services/api.ts` |
| Auth context (signup/login/logout/session hydrate) | Done | `src/context/AuthContext.tsx` |
| Login / Register pages | Done | `src/pages/Login.tsx`, `Register.tsx` |
| Protected + guest route guards | Done | `src/App.tsx` |
| Dashboard | Done | `src/pages/Dashboard.tsx` |
| — Stats cards (habits, streaks, today completion %) | Done | |
| — 7-day check-off grid (today/yesterday) | Done | Optimistic updates |
| — 12-week contribution grid | Done | GitHub-style heatmap |
| — Create / edit / delete habit modals | Done | Supports DAILY + CUSTOM weekday schedules |
| Settings page | Done | `src/pages/Settings.tsx` |
| — Timezone selector | Done | |
| — Reminder time + enable toggle | Done | |
| — Web Push subscription flow | Done | Registers `/sw.js` service worker |
| Service worker for push | Done | `public/sw.js` |
| Dark glassmorphic UI | Done | `src/index.css` |
| Loading + error states | Done | Auth guards, Dashboard fetch error UI |

---

## Fixes Applied During Cursor Handoff

1. **Client TypeScript build errors** — type-only imports (`verbatimModuleSyntax`), removed unused imports/vars, added Dashboard error state UI.
2. **Server `start` script** — corrected to `node dist/app.js` (was `dist/src/app.js`).
3. **`GET /api/habits` now includes logs** — Dashboard grids depend on `habit.logs`; list endpoint previously omitted them.
4. **Added `.gitignore`, `.env.example` files** — secrets in local `.env` are not committed.

---

## Known Gaps / Remaining Work

### Functional
- [ ] **Recharts not wired up** — dependency installed but no progress charts rendered yet (architecture calls for "simple charts" on dashboard).
- [ ] **End-to-end push testing** — scheduler + worker exist; needs manual verification with browser permission + matching reminder time.
- [ ] **Refresh token revocation** — architecture describes DB-backed refresh sessions; current impl uses stateless JWT refresh cookies (no revocation table, no rotation).
- [ ] **`PUT /api/auth/timezone` lacks Zod validation** — accepts raw body without schema middleware.
- [ ] **Habit list payload size** — including all logs on `GET /habits` works for MVP but may need pagination or date-range filtering as histories grow.

### Structure / polish
- [ ] Architecture folder layout not fully followed — logic lives in `pages/` rather than split `components/`, `hooks/`, `layouts/`.
- [ ] No `README.md` with setup instructions (use this file + architecture doc for now).
- [ ] No tests (`server/tests/` empty / missing).
- [ ] No `prisma/seed.ts`.
- [ ] `server/src/test_db.ts` is a dev scratch script — safe to delete or move to a scripts folder.
- [ ] `client/index.html` title still says "client" — should be "Aura" or "Habit Tracker".
- [ ] `server/dist/` may exist locally from builds — gitignored, not committed.

### Deviations from architecture doc
| Architecture | Current implementation |
|--------------|------------------------|
| DB-backed refresh token sessions | Stateless JWT refresh in httpOnly cookie |
| Controllers layer | Route handlers inline in `routes/` |
| CSS Modules | Global CSS variables in `index.css` |
| Scheduler every 30 min | Runs every 60 seconds (`startScheduler(60 * 1000)`) |

---

## API Surface (implemented)

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
PUT    /api/auth/timezone

GET    /api/habits
POST   /api/habits
GET    /api/habits/:id
PUT    /api/habits/:id
DELETE /api/habits/:id

POST   /api/habits/:id/logs
DELETE /api/habits/:id/logs/:date
GET    /api/habits/:id/streak

GET    /api/reminders/settings
PUT    /api/reminders/settings
POST   /api/reminders/subscribe
```

All success responses use `{ status: 'success', data: ... }`. Errors use `{ status: 'error', message: ... }` via global error handler.

---

## Suggested Next Steps (dependency order)

1. **Smoke-test full flow locally** — register → create habit → toggle today → verify streak → set reminder time → enable push.
2. **Add Recharts completion chart** — e.g. 7-day bar chart of completions on Dashboard.
3. **Add timezone validation** on `PUT /api/auth/timezone` (reuse Luxon IANA check).
4. **README** — consolidate quick-start from this file.
5. **Optional: refresh token table** — if session revocation is required for production.
6. **Tests** — streak calculation unit tests (`services/streaks.ts`) and auth integration tests.

---

## File Map (actual, not aspirational)

```
prompt_comp_test/
├── docker-compose.yml
├── habit_tracker_architecture.md
├── till_now.md
├── client/
│   ├── public/sw.js
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.css
│   │   ├── context/AuthContext.tsx
│   │   ├── pages/{Login,Register,Dashboard,Settings}.tsx
│   │   ├── services/api.ts
│   │   └── types/index.ts
│   └── .env.example
└── server/
    ├── prisma/{schema.prisma,migrations/}
    ├── prisma.config.ts
    ├── src/
    │   ├── app.ts
    │   ├── config/{db,redis}.ts
    │   ├── middleware/{auth,validate,validators}.ts
    │   ├── routes/{auth,habits,logs,reminders}.ts
    │   ├── services/{streaks,scheduler}.ts
    │   ├── types/index.ts
    │   ├── utils/errors.ts
    │   └── test_db.ts          # dev scratch — remove when done
    └── .env.example
```

---

## Git

Initial commit created with full monorepo scaffold (client + server + infra). Local `.env` files are excluded; copy from `.env.example` after clone.
