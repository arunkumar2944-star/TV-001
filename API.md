# API reference

Base path: `/api`
Content type: `application/json` (uploads use `multipart/form-data`)

## Conventions

**Success**

```json
{ "success": true, "data": { } }
```

**List (paginated)**

```json
{ "success": true, "data": [ ], "pagination": { "page": 1, "pageSize": 20, "total": 137 } }
```

**Failure** - never contains a stack trace, SQL error or secret.

```json
{ "success": false, "message": "Unable to approve this post", "code": "VALIDATION_FAILED",
  "details": [{ "field": "headline", "message": "Headline must be at least 5 characters" }] }
```

| Status | Meaning |
| --- | --- |
| 400 | Validation failed / bad input |
| 401 | Not signed in, session expired or revoked |
| 403 | Signed in but not allowed (role, self-approval, CSRF) |
| 404 | Not found |
| 409 | Conflicts with current state (wrong status, duplicate job) |
| 429 | Rate limited |
| 5xx | Server or upstream failure |

**Authentication.** All `/api` routes except `/api/health`, `/api/auth/login`, `/api/auth/csrf` and
`/api/n8n/*` require the session cookie.

**CSRF.** Every cookie-authenticated `POST`/`PATCH`/`PUT`/`DELETE` must send `X-CSRF-Token` matching
the readable `tv_csrf` cookie. `/api/n8n/*` is exempt (it uses the shared secret instead).

**Roles.** `ADMIN` and `EDITOR` have identical access to the whole newsroom workflow. Only user
management is ADMIN-only; those routes are marked **ADMIN**.

---

## Health

### `GET /api/health`
Public. Used by Docker, the reverse proxy and monitoring.

```json
{ "success": true, "status": "ok",
  "checks": { "database": "up", "storage": "local", "n8nWebhookConfigured": true },
  "uptimeSeconds": 4210, "timestamp": "2026-08-26T09:00:00.000Z" }
```

Returns **503** with `"status": "degraded"` when the database is unreachable.

---

## Authentication

### `GET /api/auth/csrf`
Issues the `tv_csrf` cookie. Call it once on app boot, before any mutating request.

```json
{ "success": true, "data": { "csrfToken": "94e78e..." } }
```

### `POST /api/auth/login`
Rate limited (`LOGIN_RATE_LIMIT_MAX` per window, default 10 / 15 min).

```json
{ "email": "editor1@trichyvision.local", "password": "..." }
```

Sets an **HttpOnly** `tv_session` cookie and returns the user (never `password_hash`):

```json
{ "success": true, "data": {
  "user": { "id": 2, "full_name": "Editor One", "email": "editor1@trichyvision.local",
            "role": "EDITOR", "is_active": true, "last_login_at": null },
  "csrfToken": "..." } }
```

- `401` - invalid email **or** password (identical message either way, so accounts cannot be enumerated)
- `403` - account deactivated

### `POST /api/auth/logout`
Clears the session cookie and revokes the token id.

### `GET /api/auth/me`

```json
{ "success": true, "data": {
  "user": { },
  "csrfToken": "...",
  "permissions": { "canManageUsers": false, "canApprove": true, "canPublish": true,
                   "canRetry": true, "canViewAudit": true } } }
```

### `POST /api/auth/change-password`

```json
{ "currentPassword": "...", "newPassword": "..." }
```

Revokes the current session on success - the user must sign in again.

---

## Users — ADMIN only

Mounted at both `/api/users` and `/api/internal/users`; the same ADMIN guard applies to both.

### `GET /api/users`
Query: `page`, `pageSize`, `role` (`ADMIN`|`EDITOR`), `isActive` (`true`|`false`), `search`.

### `GET /api/users/:id`

### `POST /api/internal/users`
The internal user-creation page posts here.

```json
{ "fullName": "Kavitha Raman", "email": "kavitha@trichyvision.local",
  "username": "kavitha", "password": "StrongPass#2026", "role": "EDITOR" }
```

`201` with the created user. Password policy: ≥ 10 characters with upper case, lower case and a
digit. `409` if the email already exists.

### `PATCH /api/users/:id`
`{ "fullName": "...", "username": "...", "role": "ADMIN" }` - at least one field. You cannot change
your own role, and the last active administrator cannot be demoted.

### `PATCH /api/users/:id/status`
`{ "isActive": false }`. You cannot deactivate yourself, and the last active administrator cannot be
deactivated.

### `POST /api/users/:id/reset-password`
`{ "newPassword": "..." }`

---

## Dashboard

### `GET /api/dashboard/summary`

```json
{ "success": true, "data": {
  "todayTotal": 6, "todayPublished": 2, "totalPosts": 431,
  "byStatus": { "DRAFT": 12, "PENDING_APPROVAL": 3, "REJECTED": 1, "APPROVED": 4,
                "PUBLISHING": 1, "PUBLISHED": 402, "PARTIALLY_PUBLISHED": 6,
                "FAILED": 2, "ARCHIVED": 0 },
  "cards": { "draft": 12, "pendingApproval": 3, "rejected": 1, "approved": 4,
             "publishing": 1, "published": 402, "partiallyPublished": 6,
             "failed": 2, "archived": 0 },
  "jobs": { "queued": 0, "dispatched": 1, "inProgress": 0, "completed": 380,
            "partial": 6, "failed": 2, "cancelled": 0 },
  "generatedAt": "2026-08-26T09:00:00.000Z" } }
```

### `GET /api/dashboard/publishing`
Optional `days` limits the window. Counts the **latest state per post per platform**, so a post that
failed and was later retried successfully counts once, as a success.

```json
{ "success": true, "data": {
  "platforms": [
    { "id": 1, "code": "facebook", "name": "Facebook", "success": 380, "failed": 4,
      "pending": 0, "cancelled": 0, "total": 384, "last_published_at": "..." },
    { "code": "instagram", "...": "..." }, { "code": "whatsapp" }, { "code": "youtube" },
    { "code": "telegram" }, { "code": "x" }, { "code": "threads" }
  ],
  "totals": { "success": 2100, "failed": 31, "pending": 2, "cancelled": 0, "total": 2133 } } }
```

### `GET /api/dashboard/activity`
`recentJobs`, `openFailures` (still-current platform failures) and `recentPosts`.

### `GET /api/dashboard/audit`
Query: `page`, `pageSize`, `newsId`, `publishJobId`, `stage`, `status`.
Available to **both** roles.

---

## News posts

### `GET /api/news/options`
Everything the post form needs: active platforms, categories, districts, statuses, media types and
the `Tamil Nadu` / `India` defaults.

### `GET /api/news`
Query: `page`, `pageSize`, `status` (repeatable), `category`, `district`, `createdBy`, `search`,
`dateFrom`/`dateTo` (`YYYY-MM-DD`), `sortBy`, `sortDir`, `mine=true`.

Each row includes `created_by_name`, `media_count` and `platform_codes[]`.

### `GET /api/news/:id`
Full detail: the post plus `media[]`, `platforms[]`, `platformStatuses[]` (latest per platform),
`approvals[]`, `currentApproval`, `publishJobs[]`, and the UI hints `canEdit` / `canApprove`.

### `POST /api/news`

```json
{ "headline": "Trichy corporation approves new bus terminus",
  "summary": "Optional standfirst",
  "content": "Full story...",
  "source": "Staff reporter",
  "category": "Local",
  "district": "Tiruchirappalli",
  "state": "Tamil Nadu",
  "country": "India",
  "platforms": ["facebook", "telegram"] }
```

Creates the post **and** its `news_platform_targets` rows in one transaction. Status: `DRAFT`.

### `PATCH /api/news/:id`
Any subset of the create fields. Sending `platforms` replaces the selection. Allowed while the post
is `DRAFT`, `REJECTED` or `PENDING_APPROVAL`; `409` afterwards.

### `DELETE /api/news/:id`
Only `DRAFT` or `REJECTED`, and only the author or an ADMIN. Media files are removed from storage
after the database change commits. Published history can never be deleted - archive instead.

### `POST /api/news/:id/archive`

### `GET /api/news/:id/readiness`
Dry run of the submit checks.

```json
{ "success": true, "data": { "ready": false,
  "problems": ["Select at least one social media platform"] } }
```

### `PUT /api/news/:id/platform-content`
Per-platform overrides for a future release.
`{ "platform": "youtube", "content": { "title": "...", "description": "..." } }`

---

## Media

### `GET /api/news/:id/media`

### `POST /api/news/:id/media`
`multipart/form-data`:

| Field | Notes |
| --- | --- |
| `mediaType` | `MAIN_IMAGE`, `NEWS_POSTER`, `AD_POSTER`, `IMAGE`, `VIDEO`, `AUDIO`. **Append first.** |
| `files` | One or more files (`file` also accepted) |
| `width`, `height`, `durationSeconds` | Optional client hints for video/audio |

Accepted: JPEG, PNG, WebP, GIF; MP4, MOV, WebM, MKV; MP3, M4A, AAC, WAV, OGG. Rejected: executables,
scripts, SVG, and anything whose magic bytes contradict its declared type. `MAIN_IMAGE`,
`NEWS_POSTER` and `AD_POSTER` are single-slot - a new upload replaces the previous file.

Only while the post is `DRAFT`, `REJECTED` or `PENDING_APPROVAL`.

### `PATCH /api/news/:id/media/order`
`{ "order": [12, 9, 14] }`

### `GET /api/media/:id/file`
Streams the file to an authenticated user. Supports `Range` (206) so video/audio can be scrubbed.
`?download=1` forces an attachment.

### `DELETE /api/media/:id`

---

## Approval

### `GET /api/approvals`
Posts with status `PENDING_APPROVAL`. Query: `page`, `pageSize`, `search`,
`includeOwn` (`true` default | `false`).

Every row carries **`can_approve`** - `false` for posts the caller created.

### `POST /api/news/:id/submit-approval`
Validates headline, content, category, at least one platform, and platform media requirements; saves
an approval record; moves the post to `PENDING_APPROVAL`. **n8n is not involved at this stage.**

`400` with `code: "SUBMISSION_INCOMPLETE"` and a `details[]` list when something is missing.

### `POST /api/news/:id/approve`
Optional `{ "note": "..." }`.

- **`403` if the caller created the post** - enforced in the transaction and audited, regardless of
  what the client sends.
- `409` if the post is not `PENDING_APPROVAL`.

On success: approval row gets `reviewed_by` + `reviewed_at`, post becomes `APPROVED` with
`approved_by` / `approved_at`. One approval is enough.

### `POST /api/news/:id/reject`

```json
{ "reason": "Poster needs correction." }
```

Reason is mandatory (≥ 5 characters) and stored on the approval row. Post becomes `REJECTED`; the
author edits and resubmits. A rejected post can never be published.

### `GET /api/news/:id/approvals`
Full approval history for the post.

---

## Publishing

### `GET /api/publish`
- `?view=ready` (default) - **APPROVED** posts only, with `approved_by_name` and `platform_codes[]`
- `?view=history` - every publish job, newest first, each with its `platforms[]` outcomes.
  Filters: `status`, `newsId`.

### `GET /api/publish/integration`
`{ "n8nConfigured": true, "callbackSecretConfigured": true }` - drives the dashboard warning banner.

### `GET /api/publish/news/:id`
The publish view of one post (same shape as `GET /api/news/:id`).

### `GET /api/publish/:jobId`
Job detail: the job, `platforms[]` (per-platform status, external id, URL, error, attempts,
`retry_allowed`) and `audit[]` for that job.

### `POST /api/news/:id/publish`
Creates the job and the platform rows, then triggers n8n.

```json
{ "success": true, "message": "Publishing started",
  "data": { "job": { "id": 1001, "status": "DISPATCHED", "platforms": [ ] },
            "dispatch": { "dispatched": true, "ambiguous": false, "message": "Publishing started" } } }
```

- `409` if the post is not `APPROVED`, or a job is already running for it
- `400` if there are no platforms, no content, or a platform's media requirement is unmet
- `201` with `dispatched: false` when the job was stored but n8n could not be reached - the record
  exists and can be retried

### `POST /api/publish/:jobId/retry`
`{ "platforms": ["youtube"] }` - omit to retry **all** failed platforms of that job.

Creates a **new** `RETRY` job containing only failed, retryable platforms.

- `409` if you name a platform that already published (`"Already published successfully, retry refused: facebook"`)
- `409` if there is nothing to retry
- `409` if a job for that post is already running

---

## n8n endpoints

Authenticated with the shared secret, **not** a user session. Send either:

- `X-N8N-Secret: <N8N_WEBHOOK_SECRET>`, or
- `X-TrichyVision-Signature: <hex HMAC-SHA256 of the raw body, keyed with the secret>`

### `GET /api/n8n/health`
Credential check for the automation colleague.

### `GET /api/n8n/jobs/:jobId`
The full content package: job, news, the platforms **this job is responsible for**, and media with
`downloadUrl` (authenticated) plus `signedUrl` when the storage driver can sign one.

### `POST /api/n8n/publish-result`
One result, or a batch under `results[]`. See [N8N-INTEGRATION.md](N8N-INTEGRATION.md) for payloads.

### `POST /api/n8n/job-progress`
Optional "started publishing" ping:
`{ "jobId": 1001, "platform": "youtube", "executionId": "...", "workflowName": "..." }`

---

## Platforms

### `GET /api/platforms`
Active platforms (`?all=true` includes disabled ones): `id`, `code`, `name`, `is_active`,
`sort_order`.
