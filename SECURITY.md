# Security

An internal newsroom tool for a small, trusted team - but it holds unpublished news, staff accounts
and credentials-adjacent integration secrets, and it can publish to the organisation's public
channels. The controls below reflect that.

## Threat model

| Threat | Control |
| --- | --- |
| Stolen or guessed password | bcrypt (cost 12), 10-character policy, login rate limiting, identical failure messages |
| Session theft via XSS | Session JWT in an **HttpOnly** cookie - unreadable by JavaScript; strict CSP |
| Cross-site request forgery | Double-submit CSRF token on every cookie-authenticated mutation |
| SQL injection | Parameterised queries only; no string concatenation anywhere |
| Malicious upload | MIME + extension allowlist, magic-byte verification, executables/SVG blocked, size caps |
| Path traversal on media | Storage keys are generated server-side and resolved against the storage root |
| Privilege escalation | Role middleware on the server; hidden routes are convenience only |
| Self-approval | Enforced inside the approval transaction and audited when refused |
| Duplicate/forged publish results | Shared-secret or HMAC auth plus a `(job, platform)` uniqueness key |
| Information leakage in errors | Central error handler returns generic messages; details only in server logs |
| Account enumeration | Login returns the same 401 for unknown email and wrong password |
| Secret leakage | Nothing secret in the client bundle, in git, or in logs (redacting logger) |

## Authentication and sessions

Full detail in [AUTHENTICATION.md](AUTHENTICATION.md). Summary:

- bcrypt hashes; plain text is never stored, logged or returned
- JWT signed with `AUTH_SECRET` (server-side only), 8-hour default lifetime
- `tv_session` cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production
- `is_active` re-checked on **every** request, so deactivation is immediate
- Logout revokes the token id and clears both cookies

## Authorisation

```
/api/users/*, /api/internal/users   → adminOnly
everything else in the workflow     → staffOnly (ADMIN + EDITOR)
/api/n8n/*                          → shared secret / HMAC
```

ADMIN and EDITOR are equal across Dashboard, Posts, Approval, Publish, history, retry and audit. Only
user management is restricted.

**The one ownership rule** - a creator can never approve or reject their own post - is enforced
inside the database transaction after the row is locked. The refusal is written to the audit trail.
Hiding the button and returning `can_approve: false` are conveniences; neither is the control.

## CSRF

The server issues a readable `tv_csrf` cookie; the SPA echoes it in `X-CSRF-Token`; the server
compares them with `crypto.timingSafeEqual`. An attacker's page can cause the cookie to be sent but
cannot read it, so cannot forge the header.

Exempt: safe methods, `Authorization: Bearer` requests (no ambient cookie), and `/api/n8n/*`.

## CORS

Only origins listed in `FRONTEND_URL` are allowed, with `credentials: true`. Everything else is
rejected and logged. In production the UI and API share an origin behind nginx, so CORS is a
backstop rather than the primary path.

## HTTP security headers (helmet)

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'`; no external scripts; `object-src 'none'`; `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `same-origin` |
| `Strict-Transport-Security` | 180 days, `includeSubDomains` (production) |
| `Cross-Origin-Resource-Policy` | `same-site` |
| `X-Powered-By` | removed |

`frame-ancestors 'none'` blocks clickjacking; nginx adds `X-Frame-Options: DENY` as well.

## Input validation

Every request body, query string and route parameter passes a **zod** schema before a controller sees
it. The parsed, coerced value replaces the raw input, so services only ever handle clean data.

Validated: login fields, user creation (including password policy), headline, summary, content,
category, district, platform codes, media type, pagination, date filters, status filters, approval
reason, retry platform list, and every field of the n8n callback.

Failures return `400` with `code: "VALIDATION_FAILED"` and a `details[]` array naming each field.
Frontend validation exists for feedback only - it is never trusted.

## Workflow integrity

Rules the API enforces regardless of what the client sends:

1. Only `APPROVED` posts can create a publish job.
2. A rejected post can never publish - `REJECTED → PUBLISHING` is not a legal transition.
3. Rejection requires a reason of at least 5 characters.
4. A creator cannot approve or reject their own post.
5. One approval is enough; a second cannot be recorded (`409`).
6. Only one publish job per post can be live at a time (application check plus a partial unique index).
7. A retry can only include platforms that failed and allow retry; naming a successful platform is
   refused with `409`.
8. Posts cannot be edited after they leave the editable states.
9. Only `DRAFT` or `REJECTED` posts can be deleted, and only by the author or an ADMIN - published
   history is never destroyed.
10. Status changes lock the row first (`SELECT ... FOR UPDATE`), so concurrent clicks cannot interleave.

## SQL safety

```js
// every statement looks like this
db.query('SELECT ... FROM news WHERE id = $1 AND status = ANY($2::text[])', [id, statuses]);
```

No user input is ever concatenated into SQL. Sort columns come from a fixed allowlist map, never from
the query string. Multi-table writes run in `withTransaction`, which commits or rolls back as a unit.

## File upload safety

A file is accepted only when **all** of these agree:

1. the media role is one of the six known types
2. the extension is not on the blocked list (`.exe`, `.bat`, `.ps1`, `.php`, `.js`, `.html`, `.svg`, …)
3. the declared MIME type is allowed for that role
4. the extension matches the MIME type
5. the leading **magic bytes** match the declared type
6. the file is not empty and is within `MAX_UPLOAD_SIZE_MB`

Additionally:

- Files stream to a temp directory (never buffered in memory), so a large video cannot exhaust RAM.
- Storage keys are generated server-side (`news/<id>/<type>/<timestamp>-<random><ext>`); the client
  never chooses a path.
- The local driver resolves every key against the storage root and refuses anything that escapes it.
- Original filenames are sanitised and used for display only.
- A sha256 checksum is stored for integrity checking.
- Files are served through `GET /api/media/:id/file` with the session enforced and
  `X-Content-Type-Options: nosniff` - there is no public media URL.
- If the database write fails after the file lands in storage, the object is removed; orphans are
  logged if cleanup itself fails.

SVG is rejected outright because it can carry scripts.

## The n8n boundary

- `/api/n8n/*` requires `X-N8N-Secret` **or** an HMAC-SHA256 signature over the raw request body,
  compared in constant time. Rejections are logged with the source IP.
- An unauthenticated caller can never change a publishing status.
- The outbound trigger carries no content, no media and no credentials - only ids, platform codes and
  two URLs.
- Callbacks are idempotent on `(publish_job_id, platform_id)`; a replayed success changes nothing and
  a late failure cannot overwrite a success.
- Restrict `/api/n8n/` to the n8n host at the reverse proxy (see DEPLOYMENT.md).

## Rate limiting

| Endpoint | Budget |
| --- | --- |
| `POST /api/auth/login` | 10 / 15 min per IP (successes not counted) |
| `/api/*` | 600 / min per IP |
| Media uploads | 60 / min |

`trust proxy = 1` means exactly one proxy hop is trusted, so an attacker cannot spoof their IP with a
forged `X-Forwarded-For`.

## Error handling and information disclosure

Clients always receive:

```json
{ "success": false, "message": "Something went wrong. Please try again." }
```

Never a stack trace, a PostgreSQL error, a SQLSTATE, a file path or a secret. Known SQLSTATEs are
translated into plain language (`23505` → "That record already exists"). Full detail - method, URL,
status, user id, request id, stack - goes to the server log. In development only, a `debug` field
carries the raw message for 5xx responses.

Every response includes `X-Request-Id`, which the UI shows on error screens so a user can quote it to
whoever reads the logs.

## Logging

`backend/src/utils/logger.js` emits one JSON line per event and redacts any key matching
`password|secret|token|authorization|cookie|signature|apikey|api_key` before writing. Bodies are
never logged wholesale.

## Audit trail

Recorded in `news_execution_audit`: `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `CREATE_USER`, `DISABLE_USER`,
`ENABLE_USER`, `UPDATE_USER`, `CREATE_POST`, `UPDATE_POST`, `DELETE_POST`, `UPLOAD_MEDIA`,
`DELETE_MEDIA`, `SUBMIT_APPROVAL`, `APPROVE_POST` (including refused self-approvals),
`REJECT_POST`, `PUBLISH_TRIGGER`, `PUBLISH_DISPATCH`, `PUBLISH_DISPATCH_FAILED`, `PUBLISH_SUCCESS`,
`PUBLISH_FAILED`, `PUBLISH_RETRY`, `PUBLISH_CALLBACK`, `PUBLISH_CALLBACK_DUPLICATE`, `JOB_COMPLETED`.

Each row carries the actor, timestamp, post, job, platform, attempt count, n8n execution id and a
message. Available to both roles at `/audit`. An audit write never breaks the operation it describes,
and a failure to write is itself logged.

## Secrets

- Everything sensitive comes from environment variables. Nothing is hard-coded.
- `.gitignore` excludes `.env`, `*.pem`, `*.key` and `secrets/`; only `.env.example` is committed.
- `AUTH_SECRET` and `N8N_WEBHOOK_SECRET` exist **only** on the server. The browser bundle contains
  neither, and no API response returns them.
- Only `VITE_`-prefixed variables reach the frontend build, and none of them is a secret.
- The API refuses to start in production with a missing or placeholder `AUTH_SECRET`.

## Dependencies

The runtime dependency list is deliberately short: `express`, `pg`, `bcryptjs`, `jsonwebtoken`,
`cookie-parser`, `cors`, `helmet`, `express-rate-limit`, `multer`, `zod`, `dotenv`. The AWS SDK is
optional and loaded lazily only when `STORAGE_DRIVER=s3`.

```bash
npm --prefix backend audit
npm --prefix frontend audit
```

Run these before each release and keep patch versions current.

## What is deliberately not here

- **No public registration.** No sign-up page, no invite link, no self-service password reset.
- **No social media API code.** Tokens for Facebook, Instagram, WhatsApp, YouTube, Telegram, X and
  Threads live in n8n. This application never holds them, which keeps the blast radius small.
- **No direct database access from the browser.** The Supabase anon key is not used and not present.
- **No fake success.** If a platform is not configured, publishing fails honestly and is recorded as
  a failure rather than reported as published.

## Incident response

1. **Suspected account compromise** - deactivate the user in `/users` (effective on their next
   request), reset the password, review `/audit` filtered by that user.
2. **Leaked `AUTH_SECRET`** - generate a new one and restart. Every existing session becomes invalid
   immediately.
3. **Leaked `N8N_WEBHOOK_SECRET`** - rotate it on both sides at the same time; publishing pauses until
   they match again. Review the audit log for `PUBLISH_CALLBACK` entries you cannot account for.
4. **Unexpected published post** - open the post, read its audit trail (who created, who approved,
   who published, which n8n execution), and delete it on the platform through n8n or manually.
5. **Suspicious upload** - the file is on the media volume under `news/<id>/...`. Remove the media
   from the post in the UI; that deletes the stored object and records `DELETE_MEDIA`.

## Reporting

Report anything suspicious to the Trichy Vision system administrator. Do not open a public issue -
this is a private internal system.
