# Verification report - 2026-08-28

## Verified

- Backend source lint: PASS.
- Backend application module loading: PASS.
- Backend unit tests: 70/70 PASS.
- Frontend lint: PASS with one pre-existing non-blocking warning in `vite.config.js` about an unnecessary eslint-disable comment.

## Corrected

- Consolidated authentication on `client_users` / `user_id`.
- Added `PLATFORM_ADMIN`, `CLIENT_ADMIN`, `CONTENT_CREATOR`, `EDITOR`, `APPROVER` constants.
- Corrected JWT `sub` to use `user_id` and added `client_id` context.
- Updated login/logout/password-change audit actor ids to `user_id`.
- Updated authorization guards for `PLATFORM_ADMIN`.
- Isolated the one-time platform-admin bootstrap route from user-management routes.
- Bootstrap now refuses creation after any platform administrator exists.
- Corrected Facebook global-admin role check to `PLATFORM_ADMIN`.
- Migrated user joins in backend service SQL from `users(id)` to `client_users(user_id)` where present.
- Updated frontend role constants and platform-admin checks.
- Updated schema verification and seed guidance for `client_users`.
- Removed the real backend `.env` and `.git` history from this distributable.

## Not changed yet

Client registration/client management is intentionally the next module. Social connection routing should be finalized after client selection/authorization exists.

The checked-in `node_modules` directories were removed from the distributable. Run `npm install` in `backend` and `frontend` after extraction.
