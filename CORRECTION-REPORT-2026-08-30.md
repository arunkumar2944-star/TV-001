# Trichy Vision - Facebook connection correction report

## Result

The project now has one client-scoped Facebook Page connection flow instead of two competing implementations.

### Fixed backend architecture

- `facebook.routes.js` is now a thin routing layer.
- OAuth/business logic lives in `facebook.service.js`.
- Database access stays in `socialConnections.repository.js`.
- Facebook Page tokens are never returned to React.
- Selected Page tokens are verified before storage and encrypted with AES-256-GCM.
- `PLATFORM_ADMIN` can manage any client; `CLIENT_ADMIN` can manage only its own client.
- OAuth state binds the authorization to the signed-in user and selected client.
- Page selection POST, verify POST and disconnect DELETE are CSRF-protected.
- Disconnect/reconnect uses one `(client_id, platform)` database row through PostgreSQL upsert.
- The router-wide authentication bug that converted unknown `/api/*` routes into 401 responses was removed.
- Authorization middleware now delegates errors to the central error handler.
- Temporary per-request session debug logging was removed.

### Fixed frontend architecture

- One page owns the feature: `/clients/:clientId/social-connections`.
- Removed the duplicate legacy `/settings/social/facebook` UI.
- Removed the separate Facebook Page-selection route.
- Meta callback returns to the same Social Connections page.
- Page selection appears as an in-page modal.
- All social connection requests use the shared `apiClient` for credentials and CSRF.
- Facebook supports Connect, Test Connection, Change/Reconnect and Disconnect.
- After disconnect, Reconnect starts the same OAuth flow from the same page.
- Incomplete platform connectors are visibly disabled as `Coming soon` instead of pretending to work.

### Database

Added:

`backend/sql/2026-08-30-facebook-connections.sql`

The critical database rule is the unique `(client_id, platform)` index used by `ON CONFLICT` during reconnect.

### Validation

- Backend ESLint: passed.
- Backend Node test suite: 86 tests, 70 passed, 16 skipped because `TEST_DATABASE_URL` is not set, 0 failed.
- Frontend ESLint: passed.
- Production Vite build could not be validated in the Linux review environment because the uploaded `node_modules` was installed on Windows and contains Windows-native Rolldown binaries. The corrected delivery intentionally excludes `node_modules`; install dependencies fresh on the target operating system.

See `FACEBOOK-CONNECTION-GUIDE.md` for setup and acceptance testing.
