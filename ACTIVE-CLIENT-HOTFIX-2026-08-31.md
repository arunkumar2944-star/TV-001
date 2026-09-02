# Active Client 500 Hotfix — 2026-08-31

## Symptom

`POST /api/auth/active-client` returned HTTP 500 when selecting a client from the Clients page.

## Changes

1. Removed the explicit `req.session.save()` call from the active-client controller. `express-session` already persists modified session state before the response completes; the manual save was an unnecessary extra failure point.
2. Added a clear server-side guard when the Express session middleware is unavailable.
3. Kept authorization rules unchanged: PLATFORM_ADMIN may select a client; CLIENT_ADMIN is limited to its own client.
4. Added development-only API error diagnostics in `frontend/src/services/apiClient.js`. The backend already includes a safe `debug` message for unexpected 500 responses in development; the frontend now logs it to the console while production continues to hide it.

## Expected flow

1. `POST /api/auth/active-client` with `{ "clientId": 7 }` -> 200.
2. Express session contains `activeClientId = 7`.
3. `/client`, `/client/users`, and `/client/social-connections` use `/api/client/*` routes and `requireActiveClient` resolves `req.clientId` from the session.

## If a 500 remains

Look for `API server error:` in the browser console or the `Unhandled request failure` JSON line in the backend terminal. The message will identify the exact server-side failure without exposing stack traces in production.
