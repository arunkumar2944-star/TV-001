'use strict';

const { getPool } = require('../database/pool');

const INTERNAL_SELECT = `
  spc.connection_id,
  csc.client_id,
  spc.platform,
  spc.external_account_id,
  spc.external_account_name,
  spc.access_token_encrypted,
  spc.token_iv,
  spc.token_auth_tag,
  spc.token_expires_at,
  spc.token_type,
  spc.permissions,
  spc.metadata,
  CASE
    WHEN csc.is_active = FALSE THEN 'DISCONNECTED'
    ELSE spc.status
  END AS connection_status,
  csc.is_active AS client_connection_active,
  spc.connected_by,
  spc.connected_at,
  spc.verified_at,
  spc.last_verified_at,
  spc.last_error_code,
  spc.last_error_message,
  spc.reconnect_required,
  spc.created_at,
  spc.updated_at
`;

async function findByIdAndClientId(connectionId, clientId) {
  const pool = getPool();

  const result = await pool.query(
    `
      SELECT ${INTERNAL_SELECT}
      FROM client_social_connections csc
      JOIN social_platform_connections spc
        ON spc.connection_id = csc.connection_id
      WHERE spc.connection_id = $1
        AND csc.client_id = $2
        AND spc.platform = 'THREADS'
      LIMIT 1
    `,
    [connectionId, clientId]
  );

  return result.rows[0] ?? null;
}

async function findByClientId(clientId) {
  const pool = getPool();

  const result = await pool.query(
    `
      SELECT ${INTERNAL_SELECT}
      FROM client_social_connections csc
      JOIN social_platform_connections spc
        ON spc.connection_id = csc.connection_id
      WHERE csc.client_id = $1
        AND spc.platform = 'THREADS'
      ORDER BY
        csc.is_active DESC,
        csc.created_at DESC,
        spc.connection_id DESC
      LIMIT 1
    `,
    [clientId]
  );

  return result.rows[0] ?? null;
}

/**
 * Save/reconnect a Threads account using the normalized social-connection model.
 *
 * social_platform_connections:
 *   one row per globally unique Threads account.
 *
 * client_social_connections:
 *   client -> Threads account relationship.
 *
 * Reconnecting the same Threads account reuses the same connection_id.
 */
async function upsertConnection({
  clientId,
  connectedBy,
  externalAccountId,
  externalAccountName,
  encryptedToken,
  iv,
  authTag,
  tokenExpiresAt = null,
  permissions = [],
  metadata = {},
}) {
  const pool = getPool();
  const db = await pool.connect();

  try {
    await db.query('BEGIN');

    const stored = await db.query(
      `
        INSERT INTO social_platform_connections (
          platform,
          external_account_id,
          external_account_name,
          access_token_encrypted,
          token_iv,
          token_auth_tag,
          token_expires_at,
          token_type,
          permissions,
          metadata,
          status,
          connected_by,
          connected_at,
          verified_at,
          last_verified_at,
          last_error_code,
          last_error_message,
          reconnect_required,
          created_at,
          updated_at
        )
        VALUES (
          'THREADS',
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'BEARER',
          $7::jsonb,
          $8::jsonb,
          'CONNECTED',
          $9,
          NOW(),
          NOW(),
          NOW(),
          NULL,
          NULL,
          FALSE,
          NOW(),
          NOW()
        )
        ON CONFLICT (platform, external_account_id)
        DO UPDATE SET
          external_account_name = EXCLUDED.external_account_name,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          token_iv = EXCLUDED.token_iv,
          token_auth_tag = EXCLUDED.token_auth_tag,
          token_expires_at = EXCLUDED.token_expires_at,
          token_type = EXCLUDED.token_type,
          permissions = EXCLUDED.permissions,
          metadata = EXCLUDED.metadata,
          status = 'CONNECTED',
          connected_by = EXCLUDED.connected_by,
          connected_at = NOW(),
          verified_at = COALESCE(
            social_platform_connections.verified_at,
            NOW()
          ),
          last_verified_at = NOW(),
          last_error_code = NULL,
          last_error_message = NULL,
          reconnect_required = FALSE,
          updated_at = NOW()
        RETURNING *
      `,
      [
        String(externalAccountId),
        externalAccountName || null,
        encryptedToken,
        iv,
        authTag,
        tokenExpiresAt,
        JSON.stringify(permissions || []),
        JSON.stringify(metadata || {}),
        connectedBy ?? null,
      ]
    );

    const connection = stored.rows[0];

    if (!connection) {
      throw new Error('Threads connection could not be stored.');
    }

    // A client exposes one active Threads account at a time.
    // Historical links remain available for auditability.
    await db.query(
      `
        UPDATE client_social_connections csc
        SET is_active = FALSE
        FROM social_platform_connections spc
        WHERE csc.connection_id = spc.connection_id
          AND csc.client_id = $1
          AND spc.platform = 'THREADS'
          AND csc.connection_id <> $2
      `,
      [clientId, connection.connection_id]
    );

    // Reconnect reactivates the existing relationship rather than duplicating it.
    await db.query(
      `
        INSERT INTO client_social_connections (
          client_id,
          connection_id,
          is_active,
          created_at
        )
        VALUES ($1, $2, TRUE, NOW())
        ON CONFLICT (client_id, connection_id)
        DO UPDATE SET is_active = TRUE
      `,
      [clientId, connection.connection_id]
    );

    await db.query('COMMIT');

    return {
      ...connection,
      client_id: Number(clientId),
      client_connection_active: true,
      connection_status: 'CONNECTED',
    };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

async function markVerified({
  connectionId,
  externalAccountName = null,
  metadata = null,
}) {
  const pool = getPool();

  const result = await pool.query(
    `
      UPDATE social_platform_connections
      SET
        external_account_name = COALESCE($2, external_account_name),
        metadata = CASE
          WHEN $3::jsonb IS NULL THEN metadata
          ELSE metadata || $3::jsonb
        END,
        status = 'CONNECTED',
        verified_at = COALESCE(verified_at, NOW()),
        last_verified_at = NOW(),
        last_error_code = NULL,
        last_error_message = NULL,
        reconnect_required = FALSE,
        updated_at = NOW()
      WHERE connection_id = $1
        AND platform = 'THREADS'
      RETURNING *
    `,
    [
      connectionId,
      externalAccountName,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  return result.rows[0] ?? null;
}

async function markVerificationFailed({
  connectionId,
  errorCode,
  errorMessage,
  reconnectRequired = false,
}) {
  const pool = getPool();

  const status = reconnectRequired
    ? 'RECONNECT_REQUIRED'
    : 'ERROR';

  const result = await pool.query(
    `
      UPDATE social_platform_connections
      SET
        status = $2,
        last_verified_at = NOW(),
        last_error_code = $3,
        last_error_message = $4,
        reconnect_required = $5,
        updated_at = NOW()
      WHERE connection_id = $1
        AND platform = 'THREADS'
      RETURNING *
    `,
    [
      connectionId,
      status,
      errorCode ?? null,
      errorMessage ?? null,
      Boolean(reconnectRequired),
    ]
  );

  return result.rows[0] ?? null;
}

async function markReauthRequired({
  connectionId,
  errorCode = 'THREADS_REAUTH_REQUIRED',
  message = 'Threads authorization is no longer valid.',
}) {
  return markVerificationFailed({
    connectionId,
    errorCode: String(errorCode),
    errorMessage: message,
    reconnectRequired: true,
  });
}

module.exports = {
  findByIdAndClientId,
  findByClientId,
  upsertConnection,
  markVerified,
  markVerificationFailed,
  markReauthRequired,
};
