# Trichy Vision - Internal News Publishing Management System

A private, internal web application for the Trichy Vision newsroom: staff write news posts about
Tiruchirappalli district and the surrounding Tamil Nadu region, attach media, choose social media
destinations, get the post approved by a colleague, and publish it through n8n to Facebook,
Instagram, WhatsApp, YouTube, Telegram, X and Threads.

**The application database is the source of truth. n8n is the automation layer. Social networks are
external publishing destinations.**

---

## Table of contents

1. [What it does](#what-it-does)
2. [Technology](#technology)
3. [Project structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Installation](#installation)
6. [Environment variables](#environment-variables)
7. [Database connection](#database-connection)
8. [Creating the first users](#creating-the-first-users)
9. [Running locally](#running-locally)
10. [Production build](#production-build)
11. [Docker](#docker)
12. [Tests](#tests)
13. [Roles and permissions](#roles-and-permissions)
14. [Workflow](#workflow)
15. [Further documentation](#further-documentation)
16. [Known limitations](#known-limitations)

---

## What it does

```
LOGIN -> DASHBOARD -> POST -> PENDING APPROVAL -> APPROVAL -> APPROVED
      -> PUBLISH -> publish_jobs -> n8n -> social media -> n8n result
      -> PostgreSQL -> DASHBOARD
```

- **Dashboard** - today's posts, every status count, per-platform success/failure/pending numbers,
  open failures and recent jobs. All of it read from PostgreSQL, so history stays visible even when
  n8n is down.
- **Posts** - create and edit news posts (headline, summary, content, source, category, district,
  state, country), upload main image / news poster / advertisement poster / extra images / video /
  audio, and pick the destination platforms.
- **Approval** - submitted posts wait for a decision. **Nobody can approve their own post.** One
  approval from any other PLATFORM_ADMIN or client role is enough. Rejection requires a reason.
- **Publish** - approved posts create a `publish_jobs` row plus one `social_publish_status` row per
  selected platform, then the API triggers the n8n webhook. Results come back to a secured callback.
- **Retry** - each platform has an independent status. A retry re-sends only the failed platforms;
  platforms that already published are never published twice.
- **Audit** - every login, edit, approval, publish, callback and retry is recorded in
  `news_execution_audit`.

## Technology

| Layer | Choice |
| --- | --- |
| Frontend | React 19, JavaScript (JSX), Vite, React Router |
| Backend | Node.js, Express 5, JavaScript, REST |
| Database | Existing Supabase PostgreSQL, accessed with `pg` and parameterised SQL |
| Auth | bcrypt password hashes, JWT in an HttpOnly cookie, CSRF double-submit token |
| Automation | n8n (hosted separately) |
| Deployment | Docker / Docker Compose, nginx |

No TypeScript. No Prisma, no Sequelize, no ORM. No MySQL syntax. No second database.

## Project structure

```
trichy-vision/
├── backend/
│   ├── src/
│   │   ├── config/          env.js, constants.js, publishRequirements.js
│   │   ├── controllers/     auth, user, news, media, approval, publish, n8n, dashboard
│   │   ├── routes/          one router per area, mounted under /api
│   │   ├── services/        business rules (approval, publishing, storage, n8n, audit ...)
│   │   │   └── storage/     local disk + S3/MinIO drivers behind one interface
│   │   ├── middleware/      authenticate, authorize, csrf, upload, rate limit, errors
│   │   ├── database/        pg Pool + query/transaction helpers
│   │   ├── validators/      zod schemas for every request
│   │   ├── utils/           logger, ApiError, file type checks, image dimensions
│   │   ├── app.js
│   │   └── server.js
│   ├── sql/schema-reference.sql
│   ├── scripts/             verify-schema, seed-platforms, seed-users, hash-password
│   ├── tests/               unit (no database) + integration (real PostgreSQL)
│   ├── storage/uploads/     local media (git-ignored, volume-mounted in Docker)
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/      Button, Badge, Modal, MediaManager, PlatformSelector ...
│   │   ├── pages/           Login, Dashboard, Posts, PostEditor, Approval, Publish ...
│   │   ├── layouts/         AppLayout (sidebar + topbar)
│   │   ├── routes/          ProtectedRoute, AdminRoute
│   │   ├── services/        apiClient.js, endpoints.js
│   │   ├── context/         AuthContext, ToastContext
│   │   ├── hooks/           useAsync, usePolling, useDebouncedValue, useDocumentTitle
│   │   ├── utils/           format.js, constants.js
│   │   ├── styles/global.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── vite.config.js
│   └── package.json
│
├── docker-compose.yml
├── README.md  ARCHITECTURE.md  API.md  DATABASE.md
├── AUTHENTICATION.md  N8N-INTEGRATION.md  DEPLOYMENT.md  SECURITY.md
└── .gitignore
```

## Prerequisites

- **Node.js 20.19+** (22 LTS recommended) and npm 10+
- Access to the existing **Supabase PostgreSQL** database (connection URI)
- Optional: **Docker** 24+ with the Compose plugin
- Optional: a reachable **n8n** instance for real publishing

## Installation

```bash
git clone <your-internal-repo-url> trichy-vision
cd trichy-vision
npm run install:all
```

`npm run install:all` installs both `backend/` and `frontend/`. To do it by hand:

```bash
npm --prefix backend install
npm --prefix frontend install
```

Then create the backend environment file:

```bash
cp backend/.env.example backend/.env
```

Generate a strong `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The frontend needs no `.env` for local development (it proxies `/api` to `http://localhost:4000`).
Copy `frontend/.env.example` to `frontend/.env` only if you need to change the port or proxy target.

## Environment variables

Required (see `backend/.env.example` for the full annotated list):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL connection URI. **Never commit it.** |
| `PORT` | API port (default `4000`) |
| `AUTH_SECRET` | Signs session tokens. Long random value, server-side only. |
| `FRONTEND_URL` | Allowed CORS origin(s), comma separated |
| `N8N_WEBHOOK_URL` | The n8n webhook the API POSTs publish jobs to |
| `N8N_WEBHOOK_SECRET` | Shared secret authenticating traffic in both directions |

Frequently used optional variables: `DATABASE_SSL`, `DATABASE_POOL_MAX`, `AUTH_COOKIE_SECURE`,
`AUTH_TOKEN_TTL`, `LOGIN_RATE_LIMIT_MAX`, `STORAGE_DRIVER` (`local` | `s3`), `STORAGE_LOCAL_DIR`,
`MAX_UPLOAD_SIZE_MB`, `PUBLIC_API_URL`, `LOG_LEVEL`.

The API refuses to start in production if `DATABASE_URL` or `AUTH_SECRET` is missing, and warns
loudly in development.

## Database connection

The Supabase database **already exists** and is never created, dropped, reset or migrated by this
application. Check that it matches what the API expects - this is read-only and changes nothing:

```bash
npm run verify:schema
```

It reports every table, column and index the API relies on. If something is missing, review
`backend/sql/schema-reference.sql`: it is additive and idempotent (`CREATE ... IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`) with no `DROP`, `TRUNCATE` or `DELETE` anywhere. Apply it deliberately,
never automatically. Full details in [DATABASE.md](DATABASE.md).

Seed the seven publishing destinations (safe to re-run; it only inserts what is missing):

```bash
npm run seed:platforms
```

## Creating the first users

There is **no public registration**. The initial 1 ADMIN + 3 EDITOR accounts are created by a script
that never hard-codes a password:

```bash
npm --prefix backend run seed:users
```

Each account's password comes from an environment variable, or - if you do not supply one - a strong
random password is generated and printed **once**:

```bash
SEED_ADMIN_EMAIL=admin@trichyvision.local \
SEED_ADMIN_PASSWORD='ChooseSomethingStrong#2026' \
npm --prefix backend run seed:users
```

Existing accounts are never overwritten. After that, the ADMIN creates everyone else from
`/internal/user-create` inside the app. For an emergency manual reset:

```bash
npm --prefix backend run hash:password   # reads the password from stdin, prints a bcrypt hash
```

## Running locally

Two terminals:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

- API: <http://localhost:4000> (health check at `/api/health`)
- UI: <http://localhost:5173>

The Vite dev server proxies `/api` to the backend, so the browser sees a single origin and the
session cookie behaves exactly as it will in production.

## Production build

```bash
npm --prefix frontend run build     # -> frontend/dist (static files)
NODE_ENV=production npm --prefix backend start
```

Serve `frontend/dist` from nginx (or any static host) and proxy `/api` to the Express process. A
working nginx configuration ships in `frontend/nginx.conf`.

## Docker

```bash
cp backend/.env.example backend/.env   # fill in DATABASE_URL, AUTH_SECRET, N8N_*
docker compose up -d --build
docker compose logs -f backend
```

- `frontend` - nginx serving the built SPA on `${UI_PORT:-8080}`, proxying `/api` to the API
- `backend` - the Express API with a named volume for media originals

There is deliberately **no postgres service**: Supabase is the database. n8n is documented separately
because it is hosted and managed by the automation colleague.

## Tests

```bash
npm --prefix backend test              # everything
npm --prefix backend run test:unit     # no database required
npm --prefix backend run test:integration
```

- **Unit + HTTP-stack tests** run anywhere. They cover the publishing state machine, upload
  validation, password hashing, tokens, role guards, CSRF, the approval rules (including
  "creator cannot approve their own post"), retry selection, callback idempotency, and the whole
  Express stack (routing, CORS, security headers, the n8n secret boundary, error envelopes).
- **Integration tests** exercise the real API against real PostgreSQL and are **skipped** unless
  `TEST_DATABASE_URL` is set:

  ```bash
  TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trichy_vision_test \
    npm --prefix backend run test:integration
  ```

  Point this at a **disposable** database, never at production Supabase. The suite creates its own
  users and posts and removes them afterwards.

Linting:

```bash
npm run lint          # backend + frontend
```

## Roles and permissions

There are exactly two roles: **ADMIN** and **EDITOR**.

| Capability | ADMIN | EDITOR |
| --- | :---: | :---: |
| Login, dashboard | ✓ | ✓ |
| Create / edit posts, upload media, select platforms | ✓ | ✓ |
| Submit for approval | ✓ | ✓ |
| Approve / reject **another user's** post | ✓ | ✓ |
| Approve **own** post | ✗ | ✗ |
| Publish approved posts | ✓ | ✓ |
| Publishing history, platform status, retry | ✓ | ✓ |
| Audit log | ✓ | ✓ |
| **Create users, activate/deactivate, manage users** | ✓ | ✗ |

User management is the only difference. It is enforced by `adminOnly` middleware on every
`/api/users` and `/api/internal/users` route - hiding the menu item is convenience, not security.

## Workflow

`news.status` moves through:

```
DRAFT -> PENDING_APPROVAL -> APPROVED -> PUBLISHING -> PUBLISHED
                          -> REJECTED -> (edit) -> PENDING_APPROVAL
                                       PUBLISHING -> PARTIALLY_PUBLISHED   (some platforms failed)
                                       PUBLISHING -> FAILED                (all platforms failed)
any -> ARCHIVED
```

Illegal transitions are refused by the API, not just hidden in the UI.

## Further documentation

| Document | Contents |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, layers, data flow, state machine |
| [API.md](API.md) | Every endpoint, payload and response |
| [DATABASE.md](DATABASE.md) | Tables, columns, indexes, assumptions, required changes |
| [AUTHENTICATION.md](AUTHENTICATION.md) | Sessions, cookies, CSRF, roles, password policy |
| [N8N-INTEGRATION.md](N8N-INTEGRATION.md) | The contract for the n8n workflows |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Office server deployment, HTTPS, backups, monitoring |
| [SECURITY.md](SECURITY.md) | Threat model and every control in place |
| [FACEBOOK-CONNECTION-GUIDE.md](FACEBOOK-CONNECTION-GUIDE.md) | Facebook OAuth, Page selection, secure token storage, disconnect and reconnect flow |

## Known limitations

1. **Session revocation is per-process.** Logout clears the cookie and revokes the token id in
   memory. On a single API instance (the intended office deployment) that is complete; behind
   multiple instances, back the revocation list with Redis - see AUTHENTICATION.md.
2. **No WebSockets yet.** The dashboard and in-flight publish jobs refresh by polling, as specified.
   The backend is shaped so a push channel can be added without changing the pages.
3. **Media duration is a client hint.** Image dimensions are read server-side from the file header;
   video/audio duration is reported by the browser. Add `ffprobe` if you need it verified server-side.
4. **No image transcoding or thumbnails.** Originals are stored as uploaded, which is what the
   newsroom asked for. Platform-specific resizing belongs in n8n.
5. **Per-platform captions are stored but not authored yet.** `news_platform_targets.platform_content`
   (JSONB) and `PUT /api/news/:id/platform-content` exist so per-platform text can be added later;
   the first version publishes the original content everywhere.
6. **Facebook connection is implemented in the application backend.** OAuth, encrypted Page-token
   storage, verification, disconnect and reconnect are owned by Express/PostgreSQL. Publishing automation
   can consume the verified connection through the backend; the remaining platform connectors are staged.
7. **S3/MinIO storage needs an optional dependency.** `STORAGE_DRIVER=s3` requires
   `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`; without them startup fails with a clear
   message rather than silently pretending uploads worked.
