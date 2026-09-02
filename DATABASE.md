# Database

## Ground rules

The Supabase PostgreSQL database **already exists**. This application:

- never creates, drops, truncates, resets or migrates it
- never uses Prisma, Sequelize or any other ORM
- uses `pg` with **parameterised SQL only** - no user input is ever concatenated into a statement
- uses **PostgreSQL syntax only** - no MySQL constructs anywhere
- uses transactions for every multi-table write

Credentials come from `DATABASE_URL` and are never hard-coded.

## Verifying the live database

Read-only, changes nothing:

```bash
npm --prefix backend run verify:schema
```

It reports each expected table and column, whether `dashboard_news_summary` exists, whether the
critical unique index on `social_publish_status (publish_job_id, platform_id)` is present, and
whether `news_execution_audit.news_id` accepts NULL.

If something is missing, review `backend/sql/schema-reference.sql`. It is additive and idempotent
(`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) with **no
`DROP`, `TRUNCATE`, `DELETE` or type change**. It is never executed by the application; apply it
deliberately:

```bash
psql "$DATABASE_URL" -f backend/sql/schema-reference.sql
```

## Connection

`backend/src/database/pool.js` creates one `pg.Pool`:

| Setting | Default | Variable |
| --- | --- | --- |
| Max clients | 10 | `DATABASE_POOL_MAX` |
| Idle timeout | 30 s | - |
| Connection timeout | 10 s | - |
| Statement timeout | 15 s | `DATABASE_STATEMENT_TIMEOUT_MS` |
| TLS | on | `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_CA_CERT` |

Supabase terminates TLS with a chain Node does not bundle, so `DATABASE_SSL_REJECT_UNAUTHORIZED`
defaults to `false` - the connection is still encrypted. To pin the certificate, set
`DATABASE_CA_CERT` to the Supabase CA file; the pool then verifies it strictly.

`int8` (BIGINT) and `numeric` are parsed to JavaScript numbers so ids and durations arrive typed.

## Tables

Column lists below are what the API reads and writes. Extra columns in the live database are
harmless - every query names its columns explicitly.

### `client_users`

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | bigint PK | canonical application user identifier |
| `client_id` | bigint nullable | NULL only for `PLATFORM_ADMIN`; client users belong to one client |
| `full_name` | text | required |
| `email` | text | unique, case-insensitive login lookup |
| `username` | text | required handle |
| `password_hash` | text | bcrypt only; selected only on authentication/password verification paths |
| `role` | text | `PLATFORM_ADMIN`, `CLIENT_ADMIN`, `CONTENT_CREATOR`, `EDITOR`, `APPROVER` |
| `is_active` | boolean | checked on every authenticated request |
| `last_login_at` | timestamptz | |
| `created_by` | bigint | creator user id when applicable |
| `created_at`, `updated_at` | timestamptz | |

Identity tenancy rule: `PLATFORM_ADMIN` has `client_id IS NULL`; every client role has `client_id IS NOT NULL`.

### `news`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | |
| `headline` | text | required |
| `summary`, `content`, `source` | text | `content` required |
| `category`, `district` | text | |
| `state`, `country` | text | default `Tamil Nadu` / `India` |
| `status` | text | see below |
| `created_by`, `updated_by`, `approved_by` | bigint → `client_users(user_id)` | |
| `approved_at`, `published_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

`status` values: `DRAFT`, `PENDING_APPROVAL`, `REJECTED`, `APPROVED`, `PUBLISHING`, `PUBLISHED`,
`PARTIALLY_PUBLISHED`, `FAILED`, `ARCHIVED`.

Indexes: `status`, `created_by`, `created_at DESC`, `category`, `district`.

### `news_media` — metadata only

Large binaries are **never** stored in PostgreSQL.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint PK | |
| `news_id` | bigint → `news(id)` ON DELETE CASCADE | |
| `media_type` | text | `MAIN_IMAGE`, `NEWS_POSTER`, `AD_POSTER`, `IMAGE`, `VIDEO`, `AUDIO` |
| `original_filename` | text | sanitised, display only |
| `storage_key` | text | key/path inside the storage layer |
| `storage_driver` | text | `local` or `s3` - lets storage be migrated post-upload |
| `mime_type` | text | verified against the file's magic bytes |
| `file_size` | bigint | |
| `width`, `height` | integer | read server-side from the image header |
| `duration_seconds` | numeric(10,3) | client-reported for video/audio |
| `checksum` | text | sha256, for integrity checks and de-duplication |
| `sort_order` | integer | |
| `uploaded_by` | bigint | |
| `created_at` | timestamptz | |

### `social_platforms` — master data

`id`, `code` (`facebook`, `instagram`, `whatsapp`, `youtube`, `telegram`, `x`, `threads`), `name`,
`is_active`, `sort_order`. `code` is the stable key shared with n8n. Seed with
`npm run seed:platforms` (inserts only what is missing, never deletes).

### `news_platform_targets` — the platform selection

`id`, `news_id`, `platform_id`, `platform_content` (jsonb, reserved for per-platform captions),
`created_at`.

**Unique `(news_id, platform_id)`.** Selected platforms are rows here - never a JSON blob on `news` -
so publishing, retries and reporting can all join on them.

### `news_approvals`

| Column | Notes |
| --- | --- |
| `id`, `news_id` | |
| `submitted_by`, `submitted_at` | who sent it for review |
| `reviewed_by`, `reviewed_at` | who decided - **never equal to `news.created_by`** |
| `status` | `PENDING`, `APPROVED`, `REJECTED` |
| `rejection_reason` | required when rejecting |

Partial unique index `(news_id) WHERE status = 'PENDING'` keeps at most one open request per post.

### `publish_jobs`

| Column | Notes |
| --- | --- |
| `id`, `news_id`, `triggered_by` | |
| `job_type` | `PUBLISH` or `RETRY` |
| `status` | `QUEUED`, `DISPATCHED`, `IN_PROGRESS`, `COMPLETED`, `PARTIAL`, `FAILED`, `CANCELLED` |
| `attempt_count` | 1 for the first publish, incremented per retry |
| `parent_job_id` | the job a retry descends from |
| `n8n_execution_id`, `workflow_name` | reported by n8n |
| `error_message` | dispatch or job-level failure |
| `dispatched_at`, `completed_at`, `created_at`, `updated_at` | |

Partial unique index `(news_id) WHERE status IN ('QUEUED','DISPATCHED','IN_PROGRESS')` - a double
click can never create two live jobs for one post.

### `social_publish_status` — one row per platform per job

| Column | Notes |
| --- | --- |
| `id`, `news_id`, `publish_job_id`, `platform_id` | |
| `status` | `PENDING`, `READY`, `PUBLISHING`, `PUBLISHED`, `FAILED`, `CANCELLED` |
| `attempt_count` | incremented on each result callback |
| `external_post_id`, `published_url` | what the platform returned, via n8n |
| `error_type`, `error_message` | on failure |
| `retry_allowed` | n8n can mark a failure as final |
| `published_at`, `created_at`, `updated_at` | |

**`UNIQUE (publish_job_id, platform_id)` is the idempotency key.** A repeated callback updates (or is
ignored on) the same row instead of inserting a second success.

The current state of a platform for a post is the newest row:

```sql
SELECT DISTINCT ON (platform_id) platform_id, status
  FROM social_publish_status
 WHERE news_id = $1
 ORDER BY platform_id, publish_job_id DESC, id DESC;
```

### `news_execution_audit` — audit trail + n8n execution tracking

`id`, `news_id` (**nullable**), `publish_job_id`, `platform_id`, `actor_user_id`, `stage`, `status`,
`attempt_count`, `n8n_execution_id`, `workflow_name`, `message`, `error_type`, `retry_allowed`,
`metadata` (jsonb), `created_at`.

Stages recorded: `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `CREATE_USER`, `DISABLE_USER`, `ENABLE_USER`,
`UPDATE_USER`, `CREATE_POST`, `UPDATE_POST`, `DELETE_POST`, `UPLOAD_MEDIA`, `DELETE_MEDIA`,
`SUBMIT_APPROVAL`, `APPROVE_POST`, `REJECT_POST`, `PUBLISH_TRIGGER`, `PUBLISH_DISPATCH`,
`PUBLISH_DISPATCH_FAILED`, `PUBLISH_SUCCESS`, `PUBLISH_FAILED`, `PUBLISH_RETRY`, `PUBLISH_CALLBACK`,
`PUBLISH_CALLBACK_DUPLICATE`, `JOB_COMPLETED`.

No separate audit table is introduced - the existing one carries everything, including refused
self-approvals.

### `dashboard_news_summary` (view)

The API does **not** depend on this view. `dashboardService` reads it when its shape is recognisable
(a status column plus a count column) and otherwise aggregates the base tables. A differently shaped
existing view therefore cannot break the dashboard.

## Transactions

| Operation | Written together |
| --- | --- |
| Create post | `news` + `news_platform_targets` + audit |
| Update post | `news` + `news_platform_targets` + audit |
| Upload media | `news_media` (+ replacing a single-slot file) + audit |
| Submit for approval | `news_approvals` + `news.status` + audit |
| Approve / reject | `news_approvals` + `news.status` (+ `approved_by`/`approved_at`) + audit |
| Create publish job | `publish_jobs` + `social_publish_status` (all platforms) + `news.status` + audit |
| Retry | new `publish_jobs` + `social_publish_status` (failed platforms only) + `news.status` + audit |
| n8n result | `social_publish_status` + `publish_jobs` + `news.status` + audit |

Status changes lock the row first (`SELECT ... FOR UPDATE`), so two simultaneous approvals or two
publish clicks cannot interleave.

## Assumptions

1. Primary keys are integer/bigint and fit in a JavaScript number.
2. `client_users.email` is unique case-insensitively.
3. `news.status` accepts the nine documented values (as text or a matching enum/check).
4. `news_media.news_id` cascades on delete, so deleting a draft removes its media rows.
5. `news_execution_audit.news_id` is nullable (account-level events have no post).
6. `social_publish_status` has a unique index on `(publish_job_id, platform_id)`.
7. `social_platforms.code` holds the seven lower-case codes.

`verify:schema` checks all of these and prints exactly which one fails.

## Database changes that may be required

Nothing is applied automatically. If `verify:schema` reports one of these, here is the exact SQL and
why.

### 1. Idempotency index (**required**)

Without it, a duplicate n8n callback could create a second success row for the same job and platform.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS social_publish_status_job_platform_key
    ON social_publish_status (publish_job_id, platform_id);
```

Additive, non-destructive. It fails only if duplicates already exist - list them first with:

```sql
SELECT publish_job_id, platform_id, COUNT(*)
  FROM social_publish_status
 GROUP BY 1, 2 HAVING COUNT(*) > 1;
```

### 2. Nullable audit `news_id` (**recommended**)

Account-level events (`LOGIN`, `LOGOUT`, `CREATE_USER`, `DISABLE_USER`) have no post. If the column
is `NOT NULL`, those audit rows are skipped (the write fails, is logged, and never breaks the
operation it describes).

```sql
ALTER TABLE news_execution_audit ALTER COLUMN news_id DROP NOT NULL;
```

Reversible with `SET NOT NULL` once existing NULL rows are removed.

### 3. Single live job per post (**recommended**)

Belt and braces alongside the application check.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS publish_jobs_one_active
    ON publish_jobs (news_id)
    WHERE status IN ('QUEUED', 'DISPATCHED', 'IN_PROGRESS');
```

### 4. One open approval per post (**recommended**)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS news_approvals_one_pending
    ON news_approvals (news_id) WHERE status = 'PENDING';
```

### 5. Missing optional columns (**as reported**)

Columns such as `publish_jobs.parent_job_id`, `news_media.storage_driver`, `news_media.checksum` or
`news_platform_targets.platform_content` may not exist yet:

```sql
ALTER TABLE publish_jobs          ADD COLUMN IF NOT EXISTS parent_job_id    BIGINT;
ALTER TABLE news_media            ADD COLUMN IF NOT EXISTS storage_driver   TEXT DEFAULT 'local';
ALTER TABLE news_media            ADD COLUMN IF NOT EXISTS checksum         TEXT;
ALTER TABLE news_platform_targets ADD COLUMN IF NOT EXISTS platform_content JSONB;
```

All additive, all `IF NOT EXISTS`, none destructive.

## Performance

- Every list endpoint paginates (default 20, maximum 100) and returns a total for the pager.
- Indexes back every filter offered by the UI: status, category, district, author, created date.
- Media rows carry metadata only - a video's bytes are never loaded to render a list.
- `DISTINCT ON` with a matching sort order gives the latest platform state without a self-join.
- Connection pooling is on by default; raise `DATABASE_POOL_MAX` only alongside Supabase's own limit.
