-- ============================================================================
--  Trichy Vision - reference schema
-- ============================================================================
--  This file DOCUMENTS the structure the API expects from the EXISTING
--  Supabase PostgreSQL database. It is NOT a migration framework and it is
--  never executed automatically by the application.
--
--  SAFETY
--    * Every statement is additive and idempotent
--      (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--    * There is no DROP, no TRUNCATE, no DELETE and no type change.
--    * Running it against a database that already matches is a no-op.
--
--  USAGE
--    Verify first (read only, changes nothing):
--        npm run verify:schema
--    Only if verify reports missing objects, review this file and apply it
--    deliberately, e.g.:
--        psql "$DATABASE_URL" -f backend/sql/schema-reference.sql
--
--  PostgreSQL syntax only - no MySQL constructs anywhere.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    full_name       TEXT        NOT NULL,
    email           TEXT        NOT NULL,
    username        TEXT,
    password_hash   TEXT        NOT NULL,
    role            TEXT        NOT NULL DEFAULT 'EDITOR',
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role          TEXT DEFAULT 'EDITOR';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active     BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by    BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx      ON users (role);
CREATE INDEX IF NOT EXISTS users_is_active_idx ON users (is_active);

-- ---------------------------------------------------------------------------
-- 2. news
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news (
    id            BIGSERIAL PRIMARY KEY,
    headline      TEXT        NOT NULL,
    summary       TEXT,
    content       TEXT        NOT NULL,
    source        TEXT,
    category      TEXT,
    district      TEXT,
    state         TEXT        DEFAULT 'Tamil Nadu',
    country       TEXT        DEFAULT 'India',
    status        TEXT        NOT NULL DEFAULT 'DRAFT',
    created_by    BIGINT      REFERENCES users (id),
    updated_by    BIGINT      REFERENCES users (id),
    approved_by   BIGINT      REFERENCES users (id),
    approved_at   TIMESTAMPTZ,
    published_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE news ADD COLUMN IF NOT EXISTS summary      TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS source       TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS category     TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS district     TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS state        TEXT DEFAULT 'Tamil Nadu';
ALTER TABLE news ADD COLUMN IF NOT EXISTS country      TEXT DEFAULT 'India';
ALTER TABLE news ADD COLUMN IF NOT EXISTS status       TEXT DEFAULT 'DRAFT';
ALTER TABLE news ADD COLUMN IF NOT EXISTS created_by   BIGINT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS updated_by   BIGINT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS approved_by  BIGINT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ;
ALTER TABLE news ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE news ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now();
ALTER TABLE news ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS news_status_idx     ON news (status);
CREATE INDEX IF NOT EXISTS news_created_by_idx ON news (created_by);
CREATE INDEX IF NOT EXISTS news_created_at_idx ON news (created_at DESC);
CREATE INDEX IF NOT EXISTS news_category_idx   ON news (category);
CREATE INDEX IF NOT EXISTS news_district_idx   ON news (district);

-- ---------------------------------------------------------------------------
-- 3. news_media  (metadata only - binaries live in object storage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_media (
    id                BIGSERIAL PRIMARY KEY,
    news_id           BIGINT      NOT NULL REFERENCES news (id) ON DELETE CASCADE,
    media_type        TEXT        NOT NULL,
    original_filename TEXT,
    storage_key       TEXT        NOT NULL,
    storage_driver    TEXT        DEFAULT 'local',
    mime_type         TEXT,
    file_size         BIGINT,
    width             INTEGER,
    height            INTEGER,
    duration_seconds  NUMERIC(10, 3),
    checksum          TEXT,
    sort_order        INTEGER     NOT NULL DEFAULT 0,
    uploaded_by       BIGINT      REFERENCES users (id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE news_media ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE news_media ADD COLUMN IF NOT EXISTS storage_key       TEXT;
ALTER TABLE news_media ADD COLUMN IF NOT EXISTS storage_driver    TEXT DEFAULT 'local';
ALTER TABLE news_media ADD COLUMN IF NOT EXISTS mime_type         TEXT;
ALTER TABLE news_media ADD COLUMN IF NOT EXISTS file_size         BIGINT;
ALTER TABLE news_media ADD COLUMN IF NOT EXISTS width             INTEGER;
ALTER TABLE news_media ADD COLUMN IF NOT EXISTS height            INTEGER;
ALTER TABLE news_media ADD COLUMN IF NOT EXISTS duration_seconds  NUMERIC(10, 3);
ALTER TABLE news_media ADD COLUMN IF NOT EXISTS checksum          TEXT;
ALTER TABLE news_media ADD COLUMN IF NOT EXISTS sort_order        INTEGER DEFAULT 0;
ALTER TABLE news_media ADD COLUMN IF NOT EXISTS uploaded_by       BIGINT;
ALTER TABLE news_media ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS news_media_news_id_idx    ON news_media (news_id);
CREATE INDEX IF NOT EXISTS news_media_media_type_idx ON news_media (news_id, media_type);

-- ---------------------------------------------------------------------------
-- 4. social_platforms  (master data - seeded by npm run seed:platforms)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_platforms (
    id         BIGSERIAL PRIMARY KEY,
    code       TEXT        NOT NULL,
    name       TEXT        NOT NULL,
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    sort_order INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE social_platforms ADD COLUMN IF NOT EXISTS code       TEXT;
ALTER TABLE social_platforms ADD COLUMN IF NOT EXISTS name       TEXT;
ALTER TABLE social_platforms ADD COLUMN IF NOT EXISTS is_active  BOOLEAN DEFAULT TRUE;
ALTER TABLE social_platforms ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE social_platforms ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS social_platforms_code_key ON social_platforms (lower(code));

-- ---------------------------------------------------------------------------
-- 5. news_platform_targets  (which platforms a post is meant for)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_platform_targets (
    id               BIGSERIAL PRIMARY KEY,
    news_id          BIGINT      NOT NULL REFERENCES news (id) ON DELETE CASCADE,
    platform_id      BIGINT      NOT NULL REFERENCES social_platforms (id),
    platform_content JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE news_platform_targets ADD COLUMN IF NOT EXISTS platform_content JSONB;
ALTER TABLE news_platform_targets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS news_platform_targets_unique
    ON news_platform_targets (news_id, platform_id);
CREATE INDEX IF NOT EXISTS news_platform_targets_news_idx ON news_platform_targets (news_id);

-- ---------------------------------------------------------------------------
-- 6. news_approvals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_approvals (
    id               BIGSERIAL PRIMARY KEY,
    news_id          BIGINT      NOT NULL REFERENCES news (id) ON DELETE CASCADE,
    submitted_by     BIGINT      REFERENCES users (id),
    submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by      BIGINT      REFERENCES users (id),
    reviewed_at      TIMESTAMPTZ,
    status           TEXT        NOT NULL DEFAULT 'PENDING',
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE news_approvals ADD COLUMN IF NOT EXISTS submitted_by     BIGINT;
ALTER TABLE news_approvals ADD COLUMN IF NOT EXISTS submitted_at     TIMESTAMPTZ DEFAULT now();
ALTER TABLE news_approvals ADD COLUMN IF NOT EXISTS reviewed_by      BIGINT;
ALTER TABLE news_approvals ADD COLUMN IF NOT EXISTS reviewed_at      TIMESTAMPTZ;
ALTER TABLE news_approvals ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'PENDING';
ALTER TABLE news_approvals ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE news_approvals ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT now();
ALTER TABLE news_approvals ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS news_approvals_news_idx   ON news_approvals (news_id);
CREATE INDEX IF NOT EXISTS news_approvals_status_idx ON news_approvals (status);
-- At most one open approval request per post.
CREATE UNIQUE INDEX IF NOT EXISTS news_approvals_one_pending
    ON news_approvals (news_id) WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------
-- 7. publish_jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publish_jobs (
    id               BIGSERIAL PRIMARY KEY,
    news_id          BIGINT      NOT NULL REFERENCES news (id) ON DELETE CASCADE,
    triggered_by     BIGINT      REFERENCES users (id),
    job_type         TEXT        NOT NULL DEFAULT 'PUBLISH',
    status           TEXT        NOT NULL DEFAULT 'QUEUED',
    attempt_count    INTEGER     NOT NULL DEFAULT 1,
    parent_job_id    BIGINT,
    n8n_execution_id TEXT,
    workflow_name    TEXT,
    error_message    TEXT,
    dispatched_at    TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS triggered_by     BIGINT;
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS job_type         TEXT DEFAULT 'PUBLISH';
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'QUEUED';
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS attempt_count    INTEGER DEFAULT 1;
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS parent_job_id    BIGINT;
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS n8n_execution_id TEXT;
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS workflow_name    TEXT;
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS error_message    TEXT;
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS dispatched_at    TIMESTAMPTZ;
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ;
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT now();
ALTER TABLE publish_jobs ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS publish_jobs_news_idx   ON publish_jobs (news_id);
CREATE INDEX IF NOT EXISTS publish_jobs_status_idx ON publish_jobs (status);
CREATE INDEX IF NOT EXISTS publish_jobs_created_idx ON publish_jobs (created_at DESC);
-- Guards against a double-click creating two live jobs for the same post.
CREATE UNIQUE INDEX IF NOT EXISTS publish_jobs_one_active
    ON publish_jobs (news_id)
    WHERE status IN ('QUEUED', 'DISPATCHED', 'IN_PROGRESS');

-- ---------------------------------------------------------------------------
-- 8. social_publish_status  (one row per platform per job)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_publish_status (
    id              BIGSERIAL PRIMARY KEY,
    news_id         BIGINT      NOT NULL REFERENCES news (id) ON DELETE CASCADE,
    publish_job_id  BIGINT      NOT NULL REFERENCES publish_jobs (id) ON DELETE CASCADE,
    platform_id     BIGINT      NOT NULL REFERENCES social_platforms (id),
    status          TEXT        NOT NULL DEFAULT 'PENDING',
    attempt_count   INTEGER     NOT NULL DEFAULT 0,
    external_post_id TEXT,
    published_url   TEXT,
    error_type      TEXT,
    error_message   TEXT,
    retry_allowed   BOOLEAN     NOT NULL DEFAULT TRUE,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE social_publish_status ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'PENDING';
ALTER TABLE social_publish_status ADD COLUMN IF NOT EXISTS attempt_count    INTEGER DEFAULT 0;
ALTER TABLE social_publish_status ADD COLUMN IF NOT EXISTS external_post_id TEXT;
ALTER TABLE social_publish_status ADD COLUMN IF NOT EXISTS published_url    TEXT;
ALTER TABLE social_publish_status ADD COLUMN IF NOT EXISTS error_type       TEXT;
ALTER TABLE social_publish_status ADD COLUMN IF NOT EXISTS error_message    TEXT;
ALTER TABLE social_publish_status ADD COLUMN IF NOT EXISTS retry_allowed    BOOLEAN DEFAULT TRUE;
ALTER TABLE social_publish_status ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ;
ALTER TABLE social_publish_status ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT now();
ALTER TABLE social_publish_status ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT now();

-- IDEMPOTENCY KEY: (publish_job_id, platform_id) is the logical publishing
-- operation. A duplicate n8n callback updates this row instead of inserting.
CREATE UNIQUE INDEX IF NOT EXISTS social_publish_status_job_platform_key
    ON social_publish_status (publish_job_id, platform_id);
CREATE INDEX IF NOT EXISTS social_publish_status_news_idx     ON social_publish_status (news_id);
CREATE INDEX IF NOT EXISTS social_publish_status_status_idx   ON social_publish_status (status);
CREATE INDEX IF NOT EXISTS social_publish_status_platform_idx ON social_publish_status (platform_id, status);

-- ---------------------------------------------------------------------------
-- 9. news_execution_audit  (application audit trail + n8n execution tracking)
-- ---------------------------------------------------------------------------
--  news_id is NULLABLE on purpose: account level events (LOGIN, LOGOUT,
--  CREATE_USER, DISABLE_USER) are recorded here too.
CREATE TABLE IF NOT EXISTS news_execution_audit (
    id               BIGSERIAL PRIMARY KEY,
    news_id          BIGINT      REFERENCES news (id) ON DELETE SET NULL,
    publish_job_id   BIGINT      REFERENCES publish_jobs (id) ON DELETE SET NULL,
    platform_id      BIGINT      REFERENCES social_platforms (id),
    actor_user_id    BIGINT      REFERENCES users (id),
    stage            TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'INFO',
    attempt_count    INTEGER,
    n8n_execution_id TEXT,
    workflow_name    TEXT,
    message          TEXT,
    error_type       TEXT,
    retry_allowed    BOOLEAN,
    metadata         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS publish_job_id   BIGINT;
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS platform_id      BIGINT;
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS actor_user_id    BIGINT;
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS stage            TEXT;
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'INFO';
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS attempt_count    INTEGER;
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS n8n_execution_id TEXT;
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS workflow_name    TEXT;
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS message          TEXT;
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS error_type       TEXT;
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS retry_allowed    BOOLEAN;
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS metadata         JSONB;
ALTER TABLE news_execution_audit ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS news_execution_audit_news_idx    ON news_execution_audit (news_id);
CREATE INDEX IF NOT EXISTS news_execution_audit_job_idx     ON news_execution_audit (publish_job_id);
CREATE INDEX IF NOT EXISTS news_execution_audit_stage_idx   ON news_execution_audit (stage);
CREATE INDEX IF NOT EXISTS news_execution_audit_created_idx ON news_execution_audit (created_at DESC);

-- ---------------------------------------------------------------------------
-- 10. dashboard_news_summary  (view)
-- ---------------------------------------------------------------------------
--  The API does NOT depend on this view: dashboardService reads it when the
--  shape is recognised and otherwise aggregates the base tables directly.
--  CREATE OR REPLACE keeps an existing compatible definition working.
CREATE OR REPLACE VIEW dashboard_news_summary AS
SELECT
    n.status                                              AS status,
    COUNT(*)                                              AS total,
    COUNT(*) FILTER (WHERE n.created_at >= date_trunc('day', now())) AS today_total
FROM news n
GROUP BY n.status;


-- ---------------------------------------------------------------------------
-- 10. social_platform_connections + client_social_connections
--     normalized reusable social account ownership
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_platform_connections (
    connection_id          BIGSERIAL PRIMARY KEY,
    platform               VARCHAR(30)  NOT NULL,
    external_account_id    VARCHAR(255) NOT NULL,
    external_account_name  VARCHAR(255),
    access_token_encrypted TEXT         NOT NULL,
    token_iv               VARCHAR(255) NOT NULL,
    token_auth_tag         VARCHAR(255) NOT NULL,
    token_expires_at       TIMESTAMPTZ,
    status                 VARCHAR(40)  NOT NULL DEFAULT 'PENDING_VERIFICATION',
    token_type             VARCHAR(30),
    permissions            JSONB        NOT NULL DEFAULT '[]'::jsonb,
    metadata               JSONB        NOT NULL DEFAULT '{}'::jsonb,
    connected_by           BIGINT,
    connected_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    verified_at            TIMESTAMPTZ,
    last_verified_at       TIMESTAMPTZ,
    last_error_code        VARCHAR(100),
    last_error_message     TEXT,
    reconnect_required     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_platform_connections_platform_account
    ON social_platform_connections (platform, external_account_id);

CREATE TABLE IF NOT EXISTS client_social_connections (
    id            BIGSERIAL PRIMARY KEY,
    client_id     BIGINT      NOT NULL REFERENCES clients (client_id) ON DELETE CASCADE,
    connection_id BIGINT      NOT NULL REFERENCES social_platform_connections (connection_id) ON DELETE CASCADE,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_client_social_connections UNIQUE (client_id, connection_id)
);

CREATE INDEX IF NOT EXISTS client_social_connections_client_idx
    ON client_social_connections (client_id, is_active);
CREATE INDEX IF NOT EXISTS client_social_connections_connection_idx
    ON client_social_connections (connection_id);
CREATE INDEX IF NOT EXISTS social_platform_connections_status_idx
    ON social_platform_connections (status);

COMMIT;

-- ============================================================================
--  OPTIONAL - only if verify-schema reports news_execution_audit.news_id as
--  NOT NULL. Account level audit rows (LOGIN / CREATE_USER) have no news_id.
--  Review before running; it is reversible with SET NOT NULL.
-- ============================================================================
-- ALTER TABLE news_execution_audit ALTER COLUMN news_id DROP NOT NULL;
