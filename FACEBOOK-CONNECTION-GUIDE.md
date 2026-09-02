# Facebook Page connection - corrected flow

This document describes the Facebook connection implementation included in this corrected project version.

## Scope of this version

Facebook Page connection is implemented end-to-end. Instagram, WhatsApp, YouTube, Telegram, X and Threads remain visible in the UI as **Coming soon** so they cannot accidentally call incomplete backend code.

The supported Facebook lifecycle is:

```text
Social Connections page
    -> Connect Facebook
    -> Meta OAuth
    -> callback to backend
    -> return to the SAME Social Connections page
    -> choose a Facebook Page in an in-page modal
    -> backend verifies the Page token
    -> encrypted token is upserted in PostgreSQL
    -> CONNECTED

CONNECTED
    -> Disconnect
    -> DB status becomes DISCONNECTED
    -> same Social Connections page shows Reconnect Facebook
    -> OAuth again
    -> same (client_id, FACEBOOK) row is UPDATED, not duplicated
    -> CONNECTED
```

## 1. Runtime versions

Use Node.js **20.19+**. Node 22 LTS is also appropriate for this project. The frontend package is Vite 8 and therefore should be installed from the lock file on the machine where it will run.

`META_GRAPH_VERSION=v26.0` is the version configured by this project. Keep the Graph version in environment configuration instead of hard-coding it in controllers or React.

## 2. Install dependencies cleanly

Do not copy `node_modules` between Windows, Linux or Docker. Native Vite/Rolldown packages are operating-system specific.

From the project root:

```bash
npm --prefix backend ci
npm --prefix frontend ci
```

If `npm ci` reports a lock-file/native optional-dependency problem on your existing working copy, remove that package's `node_modules` and reinstall on the same OS:

```bash
# Windows PowerShell
Remove-Item -Recurse -Force .\frontend\node_modules
npm --prefix frontend install
```

## 3. Backend environment

Copy `backend/.env.example` to `backend/.env`. Keep your existing real secrets; do not copy secrets into React.

Required Facebook values:

```env
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=<long random value>
META_APP_ID=<meta app id>
META_APP_SECRET=<meta app secret>
META_GRAPH_VERSION=v26.0
META_CALLBACK_URL=http://localhost:4000/api/facebook/oauth/callback
TOKEN_ENCRYPTION_KEY=<exactly 64 hexadecimal characters>
```

Generate the two server-side secrets separately:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The second command is suitable for `TOKEN_ENCRYPTION_KEY`. **Do not change that encryption key after Page tokens have been stored**, or the existing encrypted tokens cannot be decrypted.

## 4. Meta application configuration

In the Meta developer application:

1. Configure Facebook Login for the app.
2. Add this exact development callback to **Valid OAuth Redirect URIs**:
   `http://localhost:4000/api/facebook/oauth/callback`
3. Ensure the app can request the permissions used by the backend:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
4. During development, the Facebook user must have access to the app according to the Meta app's current mode/roles. Production access may require Meta review/advanced access for the requested permissions.

The callback URI in Meta and `META_CALLBACK_URL` must be byte-for-byte compatible. Do not use a React route as the OAuth callback; Meta returns to Express first.

## 5. Database migration

Run the additive migration once against the PostgreSQL database:

```text
backend/sql/2026-08-30-facebook-connections.sql
```

The critical rule is one current row per client/platform:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_platform_connections_client_platform
ON social_platform_connections (client_id, platform);
```

That unique key is why reconnecting Facebook updates the original logical connection instead of creating duplicates.

Before adding the unique index to an old database, check for existing duplicates:

```sql
SELECT client_id, platform, COUNT(*)
FROM social_platform_connections
GROUP BY client_id, platform
HAVING COUNT(*) > 1;
```

Resolve any existing duplicate rows deliberately before running the unique-index statement.

## 6. Start the application

Use two terminals:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

Development URLs:

- React: `http://localhost:5173`
- Express: `http://localhost:4000`
- Health: `http://localhost:4000/api/health`

Vite proxies `/api` to Express. The auth cookie, CSRF cookie and short Facebook OAuth session therefore work without putting any Facebook secret in the browser.

## 7. Correct API flow

### Start OAuth

```http
GET /api/clients/:clientId/social-connections/facebook/oauth/start
```

Requires a signed-in `PLATFORM_ADMIN`, or a `CLIENT_ADMIN` whose own `client_id` matches the URL. The backend verifies the client, generates a cryptographically random OAuth `state`, stores the user/client context in the server session and redirects to Meta.

### Meta callback

```http
GET /api/facebook/oauth/callback
```

The backend validates the OAuth state, exchanges the code, obtains the managed Pages and keeps Page access tokens server-side. The browser is redirected to:

```text
/clients/:clientId/social-connections?facebook=select
```

### Read safe Page choices

```http
GET /api/clients/:clientId/social-connections/facebook/pages
```

React receives only Page id, name, category and tasks. It never receives the Page access token.

### Connect selected Page

```http
POST /api/clients/:clientId/social-connections/facebook/connect
Content-Type: application/json
X-CSRF-Token: <tv_csrf cookie value>

{ "pageId": "..." }
```

The backend verifies the selected Page with Meta, AES-256-GCM encrypts its Page token, performs `ON CONFLICT (client_id, platform) DO UPDATE`, verifies the saved connection, clears the temporary OAuth Page list and returns a safe connection DTO.

### Test connection

```http
POST /api/clients/:clientId/social-connections/:connectionId/verify
```

The backend decrypts the saved token only in memory and verifies the exact Page. Meta token error code `190` turns the record into reconnect-required state.

### Disconnect

```http
DELETE /api/clients/:clientId/social-connections/:connectionId
```

This is a soft disconnect: the row is retained with `connection_status='DISCONNECTED'`. Keeping the row gives you audit continuity and allows a later Facebook OAuth to update the same row.

## 8. Files that now own the Facebook flow

Backend:

```text
src/routes/facebook.routes.js
src/controllers/facebook.controller.js
src/services/facebook.service.js
src/repositories/socialConnections.repository.js
src/routes/socialConnections.routes.js
src/controllers/socialConnections.controller.js
src/services/socialConnection.service.js
src/middleware/clientAccess.js
```

Frontend:

```text
src/pages/clients/SocialConnections.jsx
src/pages/clients/social-connections.css
src/services/socialConnections.api.js
src/services/apiClient.js
```

The old duplicate Facebook settings page and the old separate Page-selection route were removed. There is now one UI owner for this feature: `/clients/:clientId/social-connections`.

## 9. Manual acceptance test

Use one known active client and a user with the correct role.

```text
A. Open /clients/<clientId>/social-connections
B. Click Connect Facebook
C. Approve Meta authorization
D. Confirm you return to the same Social Connections page
E. Select a Page in the modal and connect it
F. Confirm the card says Connected and displays the Page name/id
G. Click Test connection
H. Click Disconnect and confirm status changes to Not connected/Reconnect
I. Click Reconnect Facebook and authorize again
J. Select the same Page (or a different Page)
K. Confirm the database still has ONE FACEBOOK row for that client
```

Database check:

```sql
SELECT
    connection_id,
    client_id,
    platform,
    external_account_id,
    external_account_name,
    connection_status,
    reconnect_required,
    connected_at,
    last_verified_at,
    updated_at
FROM social_platform_connections
WHERE client_id = <CLIENT_ID>
  AND platform = 'FACEBOOK';
```

Expected after reconnect: exactly one row, `connection_status='CONNECTED'`, with refreshed account/token metadata.

## 10. Verification performed on this corrected source

- Backend ESLint: passed.
- Backend tests: **86 total, 70 passed, 16 skipped, 0 failed**. The 16 skipped tests require `TEST_DATABASE_URL`.
- Frontend ESLint: passed with 0 errors after the Facebook UI rewrite.
- The uploaded archive contained Windows-native frontend `node_modules`, so a Linux Vite production build cannot be considered a valid build check from those copied dependencies. Install frontend dependencies cleanly on your Windows machine (or inside the target Docker/Linux environment) before running `npm run build`.

## Production note

The short Facebook OAuth Page-selection context currently uses `express-session`. This is reliable for the project's single Express process. If you later run multiple backend instances, move the Express session store to a shared store such as Redis/PostgreSQL so the OAuth callback and Page-selection request can land on different instances safely.
