-- ============================================================================
-- Trichy Vision - normalized social connection ownership
--
-- Model:
--   social_platform_connections = one encrypted platform account record
--   client_social_connections   = many-to-many client <-> account relationship
--
-- A Facebook Page can be linked to more than one client without duplicating
-- credentials. Disconnecting only deactivates the client relationship;
-- reconnecting the same Page reuses the same connection_id.
-- ============================================================================

BEGIN;

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
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Operational fields required by verification/reconnect flows.
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS token_type VARCHAR(30);
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS connected_by BIGINT;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(100);
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS reconnect_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE social_platform_connections ADD COLUMN IF NOT EXISTS status VARCHAR(40);

-- Upgrade legacy connection_status -> status.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'social_platform_connections'
      AND column_name = 'connection_status'
  ) THEN
    EXECUTE $sql$
      UPDATE social_platform_connections
      SET status = COALESCE(status, connection_status, 'PENDING_VERIFICATION')
    $sql$;
  END IF;
END $$;

UPDATE social_platform_connections
SET
  platform = UPPER(TRIM(platform)),
  status = COALESCE(status, 'PENDING_VERIFICATION');

ALTER TABLE social_platform_connections
  ALTER COLUMN status SET DEFAULT 'PENDING_VERIFICATION';
ALTER TABLE social_platform_connections
  ALTER COLUMN status SET NOT NULL;

CREATE TABLE IF NOT EXISTS client_social_connections (
    id            BIGSERIAL PRIMARY KEY,
    client_id     BIGINT      NOT NULL REFERENCES clients (client_id) ON DELETE CASCADE,
    connection_id BIGINT      NOT NULL REFERENCES social_platform_connections (connection_id) ON DELETE CASCADE,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_client_social_connections UNIQUE (client_id, connection_id)
);

-- Copy legacy ownership into the relationship table before client_id is removed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'social_platform_connections'
      AND column_name = 'client_id'
  ) THEN
    EXECUTE $sql$
      INSERT INTO client_social_connections (
        client_id,
        connection_id,
        is_active,
        created_at
      )
      SELECT
        client_id,
        connection_id,
        CASE
          WHEN COALESCE(status, 'PENDING_VERIFICATION') = 'DISCONNECTED' THEN FALSE
          ELSE TRUE
        END,
        COALESCE(created_at, NOW())
      FROM social_platform_connections
      WHERE client_id IS NOT NULL
      ON CONFLICT (client_id, connection_id)
      DO UPDATE SET is_active = EXCLUDED.is_active
    $sql$;
  END IF;
END $$;

/*
 * Legacy client-scoped rows may contain the same Page more than once.
 * Repoint client links to one canonical Page row, then remove duplicates.
 */
WITH ranked AS (
  SELECT
    connection_id,
    FIRST_VALUE(connection_id) OVER (
      PARTITION BY platform, external_account_id
      ORDER BY
        CASE status
          WHEN 'CONNECTED' THEN 0
          WHEN 'PENDING_VERIFICATION' THEN 1
          WHEN 'RECONNECT_REQUIRED' THEN 2
          ELSE 3
        END,
        updated_at DESC NULLS LAST,
        connection_id DESC
    ) AS keep_connection_id,
    ROW_NUMBER() OVER (
      PARTITION BY platform, external_account_id
      ORDER BY
        CASE status
          WHEN 'CONNECTED' THEN 0
          WHEN 'PENDING_VERIFICATION' THEN 1
          WHEN 'RECONNECT_REQUIRED' THEN 2
          ELSE 3
        END,
        updated_at DESC NULLS LAST,
        connection_id DESC
    ) AS row_number
  FROM social_platform_connections
), duplicate_map AS (
  SELECT connection_id AS duplicate_connection_id, keep_connection_id
  FROM ranked
  WHERE row_number > 1
), merged_links AS (
  SELECT
    csc.client_id,
    dm.keep_connection_id AS connection_id,
    BOOL_OR(csc.is_active) AS is_active,
    MIN(csc.created_at) AS created_at
  FROM client_social_connections csc
  JOIN duplicate_map dm
    ON dm.duplicate_connection_id = csc.connection_id
  GROUP BY csc.client_id, dm.keep_connection_id
)
INSERT INTO client_social_connections (client_id, connection_id, is_active, created_at)
SELECT client_id, connection_id, is_active, created_at
FROM merged_links
ON CONFLICT (client_id, connection_id)
DO UPDATE SET is_active = client_social_connections.is_active OR EXCLUDED.is_active;

WITH ranked AS (
  SELECT
    connection_id,
    ROW_NUMBER() OVER (
      PARTITION BY platform, external_account_id
      ORDER BY
        CASE status
          WHEN 'CONNECTED' THEN 0
          WHEN 'PENDING_VERIFICATION' THEN 1
          WHEN 'RECONNECT_REQUIRED' THEN 2
          ELSE 3
        END,
        updated_at DESC NULLS LAST,
        connection_id DESC
    ) AS row_number
  FROM social_platform_connections
)
DELETE FROM client_social_connections
WHERE connection_id IN (
  SELECT connection_id FROM ranked WHERE row_number > 1
);

WITH ranked AS (
  SELECT
    connection_id,
    ROW_NUMBER() OVER (
      PARTITION BY platform, external_account_id
      ORDER BY
        CASE status
          WHEN 'CONNECTED' THEN 0
          WHEN 'PENDING_VERIFICATION' THEN 1
          WHEN 'RECONNECT_REQUIRED' THEN 2
          ELSE 3
        END,
        updated_at DESC NULLS LAST,
        connection_id DESC
    ) AS row_number
  FROM social_platform_connections
)
DELETE FROM social_platform_connections
WHERE connection_id IN (
  SELECT connection_id FROM ranked WHERE row_number > 1
);

DROP INDEX IF EXISTS uq_social_platform_connections_client_platform;
DROP INDEX IF EXISTS social_platform_connections_client_idx;
DROP INDEX IF EXISTS social_platform_connections_status_idx;

ALTER TABLE social_platform_connections DROP COLUMN IF EXISTS client_id;
ALTER TABLE social_platform_connections DROP COLUMN IF EXISTS connection_status;

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_platform_connections_platform_account
    ON social_platform_connections (platform, external_account_id);

CREATE INDEX IF NOT EXISTS client_social_connections_client_idx
    ON client_social_connections (client_id, is_active);

CREATE INDEX IF NOT EXISTS client_social_connections_connection_idx
    ON client_social_connections (connection_id);

CREATE INDEX IF NOT EXISTS social_platform_connections_platform_idx
    ON social_platform_connections (platform);

CREATE INDEX IF NOT EXISTS social_platform_connections_status_idx
    ON social_platform_connections (status);

COMMIT;

-- Validation:
-- SELECT platform, external_account_id, COUNT(*)
-- FROM social_platform_connections
-- GROUP BY platform, external_account_id
-- HAVING COUNT(*) > 1;
