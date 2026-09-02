# Trichy Vision — Team Presentation Release

## What changed

- Clean browser navigation: `/clients` → `/client` → `/client/users` → `/client/social-connections`.
- No SPA query-string state for post filters, publishing history, Facebook OAuth results, or media downloads.
- Active client is kept in the authenticated Express session and resolved by `requireActiveClient`.
- Facebook OAuth returns to the clean Social Connections route; Meta callback protocol parameters are consumed only by the backend.
- Facebook supports Connect → Page selection → Verify → Disconnect → Reconnect from the same workspace.
- Social credentials use a normalized model:
  - `social_platform_connections`: one encrypted platform-account record.
  - `client_social_connections`: client-to-account relationship.
- Disconnect deactivates the client relationship instead of deleting credentials.
- Reconnecting the same Facebook Page reuses the same global connection record.
- Light/Dark theme support with a top-bar theme toggle.
- Presentation polish applied to Social Connections and shared design tokens.
- Instagram is visibly marked as the next integration.

## Important OAuth note

OAuth providers such as Meta must send `code`, `state`, and error fields to the **backend callback** as protocol query parameters. Those parameters cannot be removed from the OAuth protocol. The application consumes them server-side and redirects the user to the clean browser route `/client/social-connections`, so OAuth query parameters are never used as SPA navigation state.

## Database upgrade

Back up the database first. If the original Facebook migration has not been applied, apply it first:

1. `backend/sql/2026-08-30-facebook-connections.sql`
2. `backend/sql/2026-08-31-normalized-social-connections.sql`

Then run:

```powershell
npm run verify:schema
```

Expected social model:

```text
social_platform_connections
  connection_id
  platform
  external_account_id
  external_account_name
  access_token_encrypted
  token_iv
  token_auth_tag
  token_expires_at
  status
  ...operational verification fields

client_social_connections
  id
  client_id
  connection_id
  is_active
  created_at

UNIQUE (client_id, connection_id)
UNIQUE (platform, external_account_id)
```

## Clean installation

This release intentionally excludes `node_modules`, build output, `.git`, and real `.env` files.

```powershell
npm --prefix backend ci
npm --prefix frontend ci
```

Copy `backend/.env.example` to `backend/.env` and configure the real values. Keep the existing token-encryption key if existing Facebook tokens were encrypted with it.

Start the application in two terminals:

```powershell
npm run dev:backend
```

```powershell
npm run dev:frontend
```

## Demo flow

1. Sign in as Platform Admin.
2. Open **Clients**.
3. Select a client. The backend stores `activeClientId` in the session.
4. Open **Client Details** — URL remains `/client`.
5. Open **Manage Users** — URL remains `/client/users`.
6. Open **Social Connections** — URL remains `/client/social-connections`.
7. Connect Facebook.
8. Complete Meta authorization.
9. Select the Page in the in-app modal.
10. Test the connection.
11. Disconnect it.
12. Reconnect Facebook and select the same Page; the normalized model reuses the connection rather than creating duplicate credentials.
13. Toggle Light/Dark theme from the top bar during the presentation.

## Next phase

Instagram Professional Account connection can be added next using the same normalized connection architecture.
