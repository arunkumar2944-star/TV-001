# Architecture

## 1. The shape of the system

```
   ┌──────────────┐    HTTPS, cookie session    ┌───────────────────┐
   │  React SPA   │ ──────────────────────────► │   Express API     │
   │ (Vite build) │ ◄────────────────────────── │  (Node.js, pg)    │
   └──────────────┘        JSON envelopes        └────────┬──────────┘
                                                          │ parameterised SQL
                                                          ▼
                                              ┌───────────────────────┐
                                              │ Supabase PostgreSQL   │
                                              │  SOURCE OF TRUTH      │
                                              └───────────────────────┘
                                                          ▲
                          webhook (secret + HMAC)         │ results
   ┌──────────────┐  ◄───────────────────────── ┌─────────┴──────────┐
   │ Social media │                             │        n8n         │
   │  platforms   │  ◄───── publishing ──────── │ AUTOMATION LAYER   │
   └──────────────┘                             └────────────────────┘
```

Three rules follow from that picture and everything else is a consequence of them:

1. **The database is the source of truth.** Every status the newsroom sees comes from PostgreSQL.
2. **n8n is the automation layer.** It owns all platform integrations. The web application contains
   no social media API code and never pretends a platform succeeded.
3. **The frontend never talks to a social network or to the database.** It only calls the API.

Because the dashboard reads the database and not n8n, publishing history stays fully visible when the
automation layer is unavailable.

## 2. Backend layers

```
routes/        HTTP surface: path, method, middleware chain. No logic.
  ↓
middleware/    authenticate → authorize → validate (zod) → rate limit → upload
  ↓
controllers/   translate HTTP ⇄ services. No SQL, no business rules.
  ↓
services/      the business rules. Transactions live here.
  ↓
database/      pg Pool, query(), queryOne(), queryAll(), withTransaction()
```

A controller never writes SQL; a service never touches `req`/`res`. That separation is what makes
the approval and publishing rules testable without HTTP or a database.

### Services

| Service | Responsibility |
| --- | --- |
| `authService` | Login/logout, generic failure messages, audit entries |
| `tokenService` | Sign/verify/revoke JWT session tokens |
| `passwordService` | bcrypt hashing, comparison, password policy |
| `userService` | User records; the only place `password_hash` is ever selected |
| `newsService` | Post CRUD, detail assembly, status transitions |
| `platformService` | `social_platforms` master data and `news_platform_targets` |
| `mediaService` | Upload validation, checksums, metadata, storage handoff |
| `storage/` | Driver interface: `localDriver`, `s3Driver` (S3/MinIO) |
| `approvalService` | Submit, approve, reject - **creator ≠ approver** enforced here |
| `publishService` | Publish jobs, platform statuses, retries, callback handling |
| `publishStateMachine` | Pure functions deriving news/job status from platform statuses |
| `n8nService` | Outbound webhook, HMAC signing, inbound verification |
| `dashboardService` | Aggregations for the dashboard |
| `auditService` | Writes and reads `news_execution_audit` |

`publishStateMachine` is deliberately free of I/O so the rules in specification sections 11, 19, 20
and 39 can be unit tested directly.

## 3. Request lifecycle

```
helmet → cors → requestContext (request id + access log)
       → express.json (captures rawBody for /api/n8n HMAC)
       → cookieParser
       → apiLimiter
       → ensureCsrfCookie
       → csrfProtection        (skipped for /api/n8n/*)
       → route: authenticate → authorize → validate → controller
       → notFoundHandler
       → errorHandler          (single JSON envelope, no stack traces)
```

Every response is one of:

```json
{ "success": true,  "data": ... , "pagination": { "page": 1, "pageSize": 20, "total": 42 } }
{ "success": false, "message": "Unable to approve this post", "code": "...", "details": [ ... ] }
```

## 4. The workflow state machine

`news.status`:

```
      ┌──────────────── ARCHIVED ◄───────────────┐
      │                                          │
   DRAFT ──► PENDING_APPROVAL ──► APPROVED ──► PUBLISHING ──► PUBLISHED
      ▲              │                              │
      │              ▼                              ├──► PARTIALLY_PUBLISHED ──┐
      └────────── REJECTED                          └──► FAILED ───────────────┤
                     │                                                          │
                     └──────────── edit, resubmit ◄────── retry ◄───────────────┘
```

Transitions are declared once in `config/constants.js` (`NEWS_STATUS_TRANSITIONS`) and enforced by
`newsService.setStatus`, which locks the row (`SELECT ... FOR UPDATE`) before changing anything.

### Deriving the post status from platforms

`publishStateMachine.deriveNewsStatus` looks at the **latest status per targeted platform** (newest
job wins, via `DISTINCT ON (platform_id) ... ORDER BY platform_id, publish_job_id DESC`):

| Platform outcomes | news.status | job status |
| --- | --- | --- |
| anything still PENDING / READY / PUBLISHING | `PUBLISHING` | `IN_PROGRESS` |
| some PUBLISHED **and** some FAILED | `PARTIALLY_PUBLISHED` | `PARTIAL` |
| all PUBLISHED | `PUBLISHED` | `COMPLETED` |
| all FAILED | `FAILED` | `FAILED` |

Partial success is never reported as fully published.

## 5. Approval: creator ≠ approver

The rule is enforced inside the transaction in `approvalService.approve`, after the post row is
locked:

```js
if (Number(news.created_by) === Number(actor.id)) {
  await auditService.record({ stage: 'APPROVE_POST', status: 'FAILED', ... }, client);
  throw ApiError.forbidden('You cannot approve a post you created. ...');
}
```

The refusal itself is audited. `reject` carries the same check. The UI hides the buttons and the
approval list marks own posts with `can_approve = false`, but a crafted request, a replayed request
or a direct API call hits the same guard. One approval from any other PLATFORM_ADMIN or client role is enough.

## 6. Publishing and idempotency

Publishing is a two-phase operation, and the order matters:

**Phase 1 - one transaction, committed before anything leaves the building:**

1. lock the post, verify it is `APPROVED`
2. refuse if a job is already `QUEUED`/`DISPATCHED`/`IN_PROGRESS` (a double click cannot create two)
3. validate content, platform targets and media requirements
4. insert `publish_jobs`
5. insert one `social_publish_status` row per selected platform (`PENDING`)
6. move the post to `PUBLISHING`
7. write a `PUBLISH_TRIGGER` audit row

**Phase 2 - after the commit:** POST the trigger to the n8n webhook.

If the dispatch fails, the durable record already exists:

| Failure | Handling |
| --- | --- |
| n8n unreachable (DNS/refused) or returns non-2xx | job `FAILED`, platforms `FAILED` with `DISPATCH_ERROR`, `retry_allowed = true`, post status recomputed |
| n8n **times out** (ambiguous - it may have received it) | job stays `DISPATCHED` with a warning. Nothing is marked failed, because a retry could otherwise publish twice. |

### Idempotency key

`UNIQUE (publish_job_id, platform_id)` on `social_publish_status` is the logical publishing
operation. When a callback arrives:

- if the row is already `PUBLISHED`, the callback is recorded as
  `PUBLISH_CALLBACK_DUPLICATE` and **nothing is updated** - no second success, no extra attempt
- a success is never downgraded by a late failure callback
- otherwise the row is updated, `attempt_count` incremented, and job + post statuses recomputed

### Retry

A retry creates a **new** `publish_jobs` row (`job_type = 'RETRY'`, `parent_job_id` set) containing
`social_publish_status` rows **only for platforms that failed and allow retry**. Successful platforms
are not part of the new job, so n8n is never asked to publish them again. Because the news-level
status uses the newest row per platform, the successes from the earlier job remain the current truth.

## 7. Media

```
browser ──multipart──► multer (disk, temp dir)
                         │  MIME + extension allowlist, blocked executables
                         ▼
                    mediaService
                         │  magic-byte check, sha256 checksum, image dimensions
                         ▼
                storage driver (local disk | S3 / MinIO)
                         │
                         ▼
                  news_media row: filename, storage_key, driver, mime, size, w/h, duration
```

PostgreSQL stores **metadata only**. Files stream to a temp directory (never buffered in memory) and
move into the storage layer; the database row and the file are kept consistent - if the insert fails
the stored object is removed, and if the delete succeeds the file is removed afterwards.

Reading goes back through the API (`GET /api/media/:id/file`) with the session enforced and HTTP
range requests supported, so video and audio can be scrubbed in the browser without ever exposing a
public URL.

## 8. n8n boundary

- **Outbound**: a deliberately small payload - `{ jobId, newsId, jobType, attempt, platforms[],
  contentUrl, callbackUrl }`. No content, no media, no secrets beyond the shared header.
- **Inbound**: `/api/n8n/*` is authenticated by the shared secret header **or** an HMAC-SHA256
  signature over the raw request body. It sits outside the cookie/CSRF stack because it is
  machine-to-machine.
- n8n pulls the full post from `GET /api/n8n/jobs/:jobId`, including per-media download URLs
  (authenticated) and signed object-storage URLs when the driver supports them.

Full contract: [N8N-INTEGRATION.md](N8N-INTEGRATION.md).

## 9. Frontend

```
main.jsx → BrowserRouter → ToastProvider → AuthProvider → App
                                                           ├── /login (public)
                                                           └── ProtectedRoute → AppLayout
                                                                 ├── /dashboard
                                                                 ├── /posts, /posts/new, /posts/:id
                                                                 ├── /approval
                                                                 ├── /publish, /publish/:jobId
                                                                 ├── /audit, /account
                                                                 └── AdminRoute → /users,
                                                                                  /internal/user-create
```

- `apiClient.js` is the only place that calls `fetch`. It attaches credentials, mirrors the readable
  `tv_csrf` cookie into `X-CSRF-Token` on mutating requests, and raises a typed `ApiError`.
- `AuthContext` never trusts localStorage: "am I signed in?" is answered by `GET /api/auth/me`,
  because the session lives in a cookie JavaScript cannot read.
- `useAsync` gives every page `{ data, error, isLoading, reload }` with automatic request abortion,
  so a slow response can never overwrite a newer one.
- `usePolling` refreshes the dashboard and in-flight jobs only while the tab is visible.

## 10. Extension points

| Want to... | Do this |
| --- | --- |
| Store media in MinIO/S3 | `STORAGE_DRIVER=s3` + the S3 variables. No application code changes. |
| Add a platform | Insert a row in `social_platforms`, add display metadata in `frontend/src/utils/constants.js`, teach n8n the code. |
| Per-platform captions | Write to `news_platform_targets.platform_content` via `PUT /api/news/:id/platform-content`; n8n already receives it. |
| Live updates instead of polling | Add a WebSocket/SSE channel that broadcasts on the same events the audit service already records. |
| Multi-instance API | Move the token revocation list to Redis (see AUTHENTICATION.md) and share the media volume or switch to S3. |
