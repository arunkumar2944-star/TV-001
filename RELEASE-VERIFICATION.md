# Release Verification — 2026-08-31

## Completed checks

- Backend ESLint: **PASS**
- Frontend ESLint: **PASS**
- Backend tests: **86 total / 70 passed / 16 skipped / 0 failed**
- Browser-route query-state scan: **PASS** — no `useSearchParams`, post-status query links, publishing-history query links, or media-download query links remain in `frontend/src`.
- Active-client route structure: `/clients` → `/client` → `/client/users` → `/client/social-connections`.
- Normalized social connection migration included: `backend/sql/2026-08-31-normalized-social-connections.sql`.

## Frontend build note

A production Vite build could not be completed in the Linux verification container because the uploaded `node_modules` was created for another platform and does not contain the Linux native Rolldown binding. This is a dependency-installation environment issue, not an ESLint/source parse failure.

The release therefore excludes all `node_modules`. On the Windows development machine run:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
npm run build
```

A clean install will download the correct native package for that machine.

## Database-dependent tests

16 integration tests were skipped because `TEST_DATABASE_URL` was not supplied to the verification environment. The remaining 70 tests passed.
