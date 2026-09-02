-- ============================================================================
-- Trichy Vision - Facebook social connection support
-- Safe, additive PostgreSQL migration for the client-scoped Facebook OAuth flow.
-- Review and run once against the application's PostgreSQL database.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS social_platform_connections (
    connection_id          BIGSERIAL PRIMARY KEY,
    client_id              BIGINT       NOT NULL REFERENCES clients (client_id) ON DELETE CASCADE,
    platform               VARCHAR(30)  NOT NULL,
    external_account_id    VARCHAR(255) NOT NULL,
    external_account_name  VARCHAR(255),
    access_token_encrypted TEXT         NOT NULL,
    token_iv               VARCHAR(255) NOT NULL,
    token_auth_tag         VARCHAR(255) NOT NULL,
    token_expires_at       TIMESTAMPTZ,
    token_type             VARCHAR(30),
    permissions            JSONB        NOT NULL DEFAULT '[]'::jsonb,
    metadata               JSONB        NOT NULL DEFAULT '{}'::jsonb,
    connection_status      VARCHAR(40)  NOT NULL DEFAULT 'PENDING_VERIFICATION',
    connected_by           BIGINT       REFERENCES client_users (user_id),
    connected_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    verified_at            TIMESTAMPTZ,
    last_verified_at       TIMESTAMPTZ,
    last_error_code        VARCHAR(100),
    last_error_message     TEXT,
    reconnect_required     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS token_type VARCHAR(30);
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS connection_status VARCHAR(40) DEFAULT 'PENDING_VERIFICATION';
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS connected_by BIGINT;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(100);
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS reconnect_required BOOLEAN DEFAULT FALSE;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- The repository uses ON CONFLICT (client_id, platform). This unique index is
-- what guarantees that disconnect -> reconnect updates the same logical row
-- instead of creating duplicate Facebook connections.
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_platform_connections_client_platform
    ON social_platform_connections (client_id, platform);

CREATE INDEX IF NOT EXISTS social_platform_connections_client_idx
    ON social_platform_connections (client_id);

CREATE INDEX IF NOT EXISTS social_platform_connections_status_idx
    ON social_platform_connections (connection_status);

COMMIT;

-- Pre-flight duplicate check if the unique-index statement above fails:
-- SELECT client_id, platform, COUNT(*)
-- FROM social_platform_connections
-- GROUP BY client_id, platform
-- HAVING COUNT(*) > 1;
