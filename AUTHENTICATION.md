# Authentication and authorisation

## Summary

| Concern | Choice |
| --- | --- |
| Password storage | bcrypt (`bcryptjs`, cost 12) - plain text is never stored, logged or returned |
| Session | JWT signed with `AUTH_SECRET`, delivered in an **HttpOnly** cookie |
| Token lifetime | `AUTH_TOKEN_TTL`, default 8 hours (one newsroom shift) |
| CSRF | Double-submit token: readable `tv_csrf` cookie + `X-CSRF-Token` header |
| Roles | `ADMIN`, `EDITOR` - enforced by middleware on the server |
| Rate limiting | 10 sign-in attempts / 15 minutes per IP (configurable) |
| Registration | **None.** Accounts exist only because an ADMIN created them. |

`AUTH_SECRET` never leaves the server. Nothing security-relevant is stored in `localStorage`.

---

## Sign-in flow

```
POST /api/auth/login  { email, password }
  │
  ├─ zod validation (shape, email format, length)
  ├─ rate limiter (per IP, successful logins are not counted)
  ├─ users lookup by lower(email)  ── the only query that selects password_hash
  ├─ bcrypt.compare (a missing hash still burns time, so timing does not leak)
  ├─ is_active check
  ├─ sign JWT  { sub, role, email, name, jti, iss, aud, exp }
  ├─ Set-Cookie: tv_session=...  HttpOnly; SameSite=Lax; Path=/; [Secure]
  ├─ Set-Cookie: tv_csrf=...     readable by the SPA
  ├─ users.last_login_at = now()
  └─ audit LOGIN
```

Failure responses are deliberately identical for "no such account" and "wrong password"
(`401 Invalid email or password`), so the endpoint cannot be used to enumerate staff addresses. A
deactivated account gets a distinct `403` **after** the password verified, which tells a legitimate
user why they cannot get in without helping an attacker.

## Every authenticated request

```
cookie tv_session (or Authorization: Bearer for server-to-server tooling)
  → verify signature, issuer, audience, expiry
  → reject if the token id (jti) has been revoked
  → re-load the user from the database
  → reject if is_active = false        ← deactivation takes effect immediately
  → req.user
```

Re-loading the user on every request is a deliberate cost. It means deactivating someone in the
Users page locks them out at once instead of at token expiry.

## Sign-out

```
POST /api/auth/logout
  → revoke the token id (jti) in the in-process revocation list
  → clear tv_session and tv_csrf
  → audit LOGOUT
```

**Known limitation.** The revocation list lives in the API process. On the single-instance office
deployment this is complete. Behind several API instances a revoked token would still be accepted by
the other instances until it expires. To fix it without changing any calling code, replace the `Map`
in `backend/src/services/tokenService.js` with Redis:

```js
async function revoke(token) {
  const decoded = jwt.decode(token);
  if (!decoded || !decoded.jti) return;
  const ttl = Math.max(decoded.exp - Math.floor(Date.now() / 1000), 1);
  await redis.set(`revoked:${decoded.jti}`, '1', 'EX', ttl);
}
```

`verify()` then checks the same key. The interface (`sign`, `verify`, `revoke`) does not change.

## Cookies

| Cookie | HttpOnly | Purpose |
| --- | :---: | --- |
| `tv_session` | **yes** | The JWT. JavaScript in the browser can never read it, so XSS cannot steal the session. |
| `tv_csrf` | no | Random token the SPA echoes back in a header. Must be readable - that is the point. |

Attributes: `SameSite=Lax` (configurable), `Path=/`, `Secure` when `AUTH_COOKIE_SECURE=true`.

**Set `AUTH_COOKIE_SECURE=true` in production.** In development the Vite dev server proxies `/api`,
so the app is single-origin and `SameSite=Lax` behaves exactly as it will behind nginx. If you ever
serve the UI and API from genuinely different sites you need `SameSite=None; Secure` and a matching
`FRONTEND_URL`.

## CSRF protection

Because the session travels automatically with every request, a cross-site form post would otherwise
be authenticated. The double-submit defence:

1. The API sets a random `tv_csrf` cookie (readable).
2. The SPA copies it into `X-CSRF-Token` on every `POST`/`PATCH`/`PUT`/`DELETE`.
3. The server compares cookie and header with a timing-safe comparison.

A cross-origin attacker can cause the cookie to be sent but cannot read it, so cannot set the header.

Exempt, on purpose:

- safe methods (`GET`, `HEAD`, `OPTIONS`)
- requests authenticated with an `Authorization: Bearer` header - no ambient cookie, no CSRF
- `/api/n8n/*` - authenticated by the shared secret / HMAC signature, not by a cookie

## Roles

```js
const adminOnly = authorize(ROLES.ADMIN);                 // user management only
const staffOnly = authorize(ROLES.ADMIN, ROLES.EDITOR);   // the whole newsroom workflow
```

| Area | Guard |
| --- | --- |
| `/api/users/*`, `/api/internal/users` | `adminOnly` |
| `/api/news/*`, `/api/media/*`, `/api/approvals`, `/api/publish/*`, `/api/dashboard/*`, `/api/platforms` | `staffOnly` |
| `/api/n8n/*` | `n8nAuth` (shared secret / HMAC) |
| `/api/health`, `/api/auth/login`, `/api/auth/csrf` | public |

ADMIN and EDITOR are equal everywhere except user management. There are no separate "admin versions"
of Dashboard, Posts, Approval or Publish.

### Hidden routes are not security

`/internal/user-create` is kept out of the sidebar for tidiness. What actually protects it is the
`adminOnly` middleware on `POST /api/internal/users`. An EDITOR who types the URL gets redirected by
`AdminRoute`, and an EDITOR who calls the API directly gets `403`.

### The one ownership rule: creator ≠ approver

```js
if (Number(news.created_by) === Number(actor.id)) {
  await auditService.record({ stage: 'APPROVE_POST', status: 'FAILED', ... }, client);
  throw ApiError.forbidden('You cannot approve a post you created. ...');
}
```

Checked inside the transaction, after the row is locked, on both approve and reject. The UI hides
the buttons and `GET /api/approvals` returns `can_approve: false` for own posts, but neither is what
enforces the rule.

## Password policy

Applied to account creation, admin resets and self-service changes:

- at least 10 characters (maximum 128 - bcrypt only considers the first 72 bytes)
- at least one lower case letter, one upper case letter and one digit
- no leading or trailing whitespace

Changing your own password requires the current one and immediately revokes the session, forcing a
fresh sign-in.

## Creating accounts

1. **Bootstrap** - `npm --prefix backend run seed:users` creates 1 ADMIN + 3 EDITORs. Passwords come
   from environment variables, or a strong random one is generated and printed **once**. Nothing is
   hard-coded, and existing accounts are never overwritten.
2. **Day to day** - the ADMIN uses `/internal/user-create`.
3. **Emergency** - `npm --prefix backend run hash:password` reads a password from **stdin** (so it
   never lands in shell history) and prints a bcrypt hash to paste into `users.password_hash`.

## What is never returned

`password_hash` is selected by exactly one function (`userService.findByEmailWithSecret`, the login
path). Every other query names its columns explicitly, and `userService.toPublic()` strips the field
before any user object reaches a response. This is asserted in the tests.

## Rate limiting

| Endpoint | Default budget | Variable |
| --- | --- | --- |
| `POST /api/auth/login` | 10 per 15 min per IP, successes not counted | `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MS` |
| `/api/*` | 600 per minute per IP | `API_RATE_LIMIT_MAX`, `API_RATE_LIMIT_WINDOW_MS` |
| Media uploads | 60 per minute | - |

Behind nginx the API trusts exactly one proxy hop (`trust proxy = 1`), so `req.ip` is the real client
and cannot be spoofed by an extra `X-Forwarded-For` entry.

## Testing

`backend/tests/unit/security.test.js` and `httpStack.test.js` cover: bcrypt hashing and comparison,
the password policy, token round-trip, tampered tokens, revocation on logout, `adminOnly` vs
`staffOnly`, anonymous rejection on every protected route, CSRF acceptance and rejection, the n8n
secret and HMAC boundary, and that no hash ever appears in a response.

`tests/integration/api.test.js` repeats these against real PostgreSQL, including an inactive account
being refused and logout genuinely invalidating the session.
