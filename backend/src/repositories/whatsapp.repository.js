'use strict';

const {
  getPool,
} = require('../database/pool');


// ======================================================
// CONSTANTS
// ======================================================

const PLATFORM =
  'WHATSAPP';


// ======================================================
// ROW MAPPER
// ======================================================

function mapConnection(
  row
) {
  if (!row) {
    return null;
  }

  return {
    connectionId:
      Number(
        row.connection_id
      ),

    clientId:
      Number(
        row.client_id
      ),

    platform:
      row.platform,

    externalAccountId:
      row.external_account_id,

    externalAccountName:
      row.external_account_name,

    tokenExpiresAt:
      row.token_expires_at,

    tokenType:
      row.token_type,

    permissions:
      row.permissions || [],

    metadata:
      row.metadata || {},

    status:
      row.connection_status ??
      row.status,

    connectedBy:
      row.connected_by,

    connectedAt:
      row.connected_at,

    verifiedAt:
      row.verified_at,

    lastVerifiedAt:
      row.last_verified_at,

    lastErrorCode:
      row.last_error_code,

    lastErrorMessage:
      row.last_error_message,

    reconnectRequired:
      Boolean(
        row.reconnect_required
      ),

    clientConnectionActive:
      row.client_connection_active !==
      false,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


// ======================================================
// BASE SELECT
// ======================================================

const BASE_SELECT = `
  SELECT
    spc.connection_id,
    csc.client_id,
    spc.platform,
    spc.external_account_id,
    spc.external_account_name,
    spc.token_expires_at,
    spc.token_type,
    spc.permissions,
    spc.metadata,

    CASE
      WHEN csc.is_active = FALSE
        THEN 'DISCONNECTED'
      ELSE spc.status
    END AS connection_status,

    spc.connected_by,
    spc.connected_at,
    spc.verified_at,
    spc.last_verified_at,
    spc.last_error_code,
    spc.last_error_message,
    spc.reconnect_required,
    csc.is_active
      AS client_connection_active,
    spc.created_at,
    spc.updated_at

  FROM social_platform_connections spc

  INNER JOIN client_social_connections csc
    ON csc.connection_id =
       spc.connection_id
`;


// ======================================================
// FIND BY CLIENT
// ======================================================

async function findByClientId(
  clientId
) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        ${BASE_SELECT}

        WHERE csc.client_id = $1
          AND LOWER(spc.platform) =
              LOWER($2)

        ORDER BY
          csc.is_active DESC,
          spc.updated_at DESC,
          spc.connection_id DESC

        LIMIT 1
      `,
      [
        clientId,
        PLATFORM,
      ]
    );

  return mapConnection(
    result.rows[0]
  );
}


// ======================================================
// FIND BY CONNECTION + CLIENT
// ======================================================

async function findByIdAndClientId({
  connectionId,
  clientId,
}) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        ${BASE_SELECT}

        WHERE spc.connection_id = $1
          AND csc.client_id = $2
          AND LOWER(spc.platform) =
              LOWER($3)

        LIMIT 1
      `,
      [
        connectionId,
        clientId,
        PLATFORM,
      ]
    );

  return mapConnection(
    result.rows[0]
  );
}


// ======================================================
// FIND GLOBAL WHATSAPP ACCOUNT
// ======================================================

async function findByExternalAccountId(
  externalAccountId
) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        SELECT
          connection_id,
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

        FROM social_platform_connections

        WHERE LOWER(platform) =
              LOWER($1)

          AND external_account_id =
              $2

        LIMIT 1
      `,
      [
        PLATFORM,
        externalAccountId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}


// ======================================================
// FIND CONNECTION INCLUDING ENCRYPTED CREDENTIAL
// ======================================================

async function findCredentialByIdAndClientId({
  connectionId,
  clientId,
}) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        SELECT
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
          spc.status,
          spc.connected_by,
          spc.connected_at,
          spc.verified_at,
          spc.last_verified_at,
          spc.last_error_code,
          spc.last_error_message,
          spc.reconnect_required,

          csc.is_active
            AS client_connection_active,

          spc.created_at,
          spc.updated_at

        FROM social_platform_connections spc

        INNER JOIN client_social_connections csc
          ON csc.connection_id =
             spc.connection_id

        WHERE spc.connection_id = $1
          AND csc.client_id = $2
          AND LOWER(spc.platform) =
              LOWER($3)

        LIMIT 1
      `,
      [
        connectionId,
        clientId,
        PLATFORM,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}


// ======================================================
// UPSERT WHATSAPP CONNECTION
// ======================================================

async function upsertConnection({
  clientId,

  externalAccountId,
  externalAccountName,

  accessTokenEncrypted,
  tokenIv,
  tokenAuthTag,
  tokenExpiresAt = null,

  permissions = [],
  metadata = {},

  connectedBy,
}) {
  const pool =
    getPool();

  const dbClient =
    await pool.connect();

  try {
    await dbClient.query(
      'BEGIN'
    );


    // --------------------------------------------------
    // UPSERT GLOBAL PLATFORM ACCOUNT
    // --------------------------------------------------

    const connectionResult =
      await dbClient.query(
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
            $1,
            $2,
            $3,

            $4,
            $5,
            $6,
            $7,
            'BEARER',

            $8::jsonb,
            $9::jsonb,

            'CONNECTED',
            $10,
            NOW(),

            NOW(),
            NOW(),

            NULL,
            NULL,
            FALSE,

            NOW(),
            NOW()
          )

          ON CONFLICT (
            platform,
            external_account_id
          )

          DO UPDATE SET
            external_account_name =
              EXCLUDED.external_account_name,

            access_token_encrypted =
              COALESCE(
                EXCLUDED.access_token_encrypted,
                social_platform_connections
                  .access_token_encrypted
              ),

            token_iv =
              COALESCE(
                EXCLUDED.token_iv,
                social_platform_connections
                  .token_iv
              ),

            token_auth_tag =
              COALESCE(
                EXCLUDED.token_auth_tag,
                social_platform_connections
                  .token_auth_tag
              ),

            token_expires_at =
              EXCLUDED.token_expires_at,

            token_type =
              'BEARER',

            permissions =
              EXCLUDED.permissions,

            metadata =
              EXCLUDED.metadata,

            status =
              'CONNECTED',

            connected_by =
              EXCLUDED.connected_by,

            connected_at =
              NOW(),

            verified_at =
              NOW(),

            last_verified_at =
              NOW(),

            last_error_code =
              NULL,

            last_error_message =
              NULL,

            reconnect_required =
              FALSE,

            updated_at =
              NOW()

          RETURNING
            connection_id
        `,
        [
          PLATFORM,
          externalAccountId,
          externalAccountName,

          accessTokenEncrypted,
          tokenIv,
          tokenAuthTag,
          tokenExpiresAt,

          JSON.stringify(
            permissions
          ),

          JSON.stringify(
            metadata
          ),

          connectedBy,
        ]
      );


    const connectionId =
      Number(
        connectionResult
          .rows[0]
          .connection_id
      );


    // --------------------------------------------------
    // ONLY ONE ACTIVE WHATSAPP CONNECTION PER CLIENT
    // --------------------------------------------------

    await dbClient.query(
      `
        UPDATE client_social_connections csc

        SET is_active = FALSE

        WHERE csc.client_id = $1
          AND csc.connection_id <> $2
          AND csc.is_active = TRUE

          AND EXISTS (
            SELECT 1

            FROM social_platform_connections spc

            WHERE spc.connection_id =
                  csc.connection_id

              AND LOWER(spc.platform) =
                  LOWER($3)
          )
      `,
      [
        clientId,
        connectionId,
        PLATFORM,
      ]
    );


    // --------------------------------------------------
    // LINK / REACTIVATE CLIENT CONNECTION
    // --------------------------------------------------

    await dbClient.query(
      `
        INSERT INTO client_social_connections (
          client_id,
          connection_id,
          is_active,
          created_at
        )
        VALUES (
          $1,
          $2,
          TRUE,
          NOW()
        )

        ON CONFLICT (
          client_id,
          connection_id
        )

        DO UPDATE SET
          is_active = TRUE
      `,
      [
        clientId,
        connectionId,
      ]
    );


    await dbClient.query(
      'COMMIT'
    );


    return await findByIdAndClientId({
      connectionId,
      clientId,
    });

  } catch (error) {
    try {
      await dbClient.query(
        'ROLLBACK'
      );
    } catch {
      // Preserve the original database error.
    }

    throw error;
  } finally {
    dbClient.release();
  }
}


// ======================================================
// MARK VERIFIED
// ======================================================

async function markVerified({
  connectionId,
  metadata = null,
}) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        UPDATE social_platform_connections

        SET
          status =
            'CONNECTED',

          metadata =
            CASE
              WHEN $2::jsonb IS NULL
                THEN metadata
              ELSE $2::jsonb
            END,

          verified_at =
            COALESCE(
              verified_at,
              NOW()
            ),

          last_verified_at =
            NOW(),

          last_error_code =
            NULL,

          last_error_message =
            NULL,

          reconnect_required =
            FALSE,

          updated_at =
            NOW()

        WHERE connection_id = $1
          AND LOWER(platform) =
              LOWER($3)

        RETURNING connection_id
      `,
      [
        connectionId,

        metadata === null
          ? null
          : JSON.stringify(
            metadata
          ),

        PLATFORM,
      ]
    );

  return (
    result.rowCount > 0
  );
}


// ======================================================
// MARK VERIFICATION FAILED
// ======================================================

async function markVerificationFailed({
  connectionId,
  errorCode = null,
  errorMessage = null,
}) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        UPDATE social_platform_connections

        SET
          status =
            'ERROR',

          last_error_code =
            $2,

          last_error_message =
            $3,

          last_verified_at =
            NOW(),

          updated_at =
            NOW()

        WHERE connection_id = $1
          AND LOWER(platform) =
              LOWER($4)

        RETURNING connection_id
      `,
      [
        connectionId,
        errorCode,
        errorMessage,
        PLATFORM,
      ]
    );

  return (
    result.rowCount > 0
  );
}


// ======================================================
// MARK REAUTH REQUIRED
// ======================================================

async function markReauthRequired({
  connectionId,
  errorCode = null,
  errorMessage = null,
}) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        UPDATE social_platform_connections

        SET
          status =
            'RECONNECT_REQUIRED',

          reconnect_required =
            TRUE,

          last_error_code =
            $2,

          last_error_message =
            $3,

          updated_at =
            NOW()

        WHERE connection_id = $1
          AND LOWER(platform) =
              LOWER($4)

        RETURNING connection_id
      `,
      [
        connectionId,
        errorCode,
        errorMessage,
        PLATFORM,
      ]
    );

  return (
    result.rowCount > 0
  );
}


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  findByClientId,
  findByIdAndClientId,
  findByExternalAccountId,
  findCredentialByIdAndClientId,

  upsertConnection,

  markVerified,
  markVerificationFailed,
  markReauthRequired,
};