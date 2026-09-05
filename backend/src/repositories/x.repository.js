'use strict';

/**
 * X (Twitter) social-connection repository.
 *
 * Database responsibility only:
 *  - read X connections for a client
 *  - create/update the shared X account connection
 *  - map the shared connection to a client
 *  - update encrypted access/refresh tokens
 *  - update verification/reconnect state
 *  - disconnect only the client mapping
 *
 * IMPORTANT:
 *  - OAuth/API calls belong in x.service.js / xToken.service.js.
 *  - Encryption/decryption belongs in the service layer.
 *  - This repository never returns decrypted credentials.
 */

const db =
  require('../database');

const PLATFORM =
  'X';


// ======================================================
// SELECT FRAGMENTS
// ======================================================

const PUBLIC_SELECT = `
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


const INTERNAL_SELECT = `
  ${PUBLIC_SELECT},
  spc.access_token_encrypted,
  spc.token_iv,
  spc.token_auth_tag,
  spc.refresh_token_encrypted,
  spc.refresh_token_iv,
  spc.refresh_token_auth_tag,
  spc.refresh_token_expires_at
`;


// ======================================================
// HELPERS
// ======================================================

function normalizePositiveInteger(
  value,
  fieldName
) {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      `${fieldName} must be a positive integer.`
    );
  }

  return parsed;
}


function normalizeText(
  value
) {
  const normalized =
    String(
      value ?? ''
    ).trim();

  return normalized || null;
}


function normalizeJsonArray(
  value
) {
  return Array.isArray(value)
    ? value
    : [];
}


function normalizeJsonObject(
  value
) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value;
  }

  return {};
}


// ======================================================
// READ
// ======================================================

/**
 * Return the newest X connection mapped to a client.
 * Includes inactive mappings so the UI can show DISCONNECTED
 * and allow the client to reconnect the same account.
 */
async function findByClientId(
  clientId
) {
  const normalizedClientId =
    normalizePositiveInteger(
      clientId,
      'clientId'
    );

  return db.queryOne(
    `
    SELECT
      ${INTERNAL_SELECT}

    FROM
      client_social_connections csc

    INNER JOIN
      social_platform_connections spc
        ON spc.connection_id =
           csc.connection_id

    WHERE
      csc.client_id = $1
      AND spc.platform = $2

    ORDER BY
      csc.is_active DESC,
      csc.created_at DESC,
      spc.connection_id DESC

    LIMIT 1
    `,
    [
      normalizedClientId,
      PLATFORM,
    ]
  );
}


/**
 * Secure lookup used by verify/disconnect/publish operations.
 * Both connectionId AND clientId are required so one client
 * cannot use another client's connection ID.
 */
async function findByIdAndClientId(
  connectionId,
  clientId
) {
  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId,
      'connectionId'
    );

  const normalizedClientId =
    normalizePositiveInteger(
      clientId,
      'clientId'
    );

  return db.queryOne(
    `
    SELECT
      ${INTERNAL_SELECT}

    FROM
      client_social_connections csc

    INNER JOIN
      social_platform_connections spc
        ON spc.connection_id =
           csc.connection_id

    WHERE
      spc.connection_id = $1
      AND csc.client_id = $2
      AND spc.platform = $3

    LIMIT 1
    `,
    [
      normalizedConnectionId,
      normalizedClientId,
      PLATFORM,
    ]
  );
}


/**
 * Internal lookup by connection id.
 * Use only after authorization has already been checked.
 */
async function findInternalById(
  connectionId
) {
  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId,
      'connectionId'
    );

  return db.queryOne(
    `
    SELECT
      spc.connection_id,
      spc.platform,
      spc.external_account_id,
      spc.external_account_name,
      spc.access_token_encrypted,
      spc.token_iv,
      spc.token_auth_tag,
      spc.token_expires_at,
      spc.refresh_token_encrypted,
      spc.refresh_token_iv,
      spc.refresh_token_auth_tag,
      spc.refresh_token_expires_at,
      spc.token_type,
      spc.permissions,
      spc.metadata,
      spc.status AS connection_status,
      spc.connected_by,
      spc.connected_at,
      spc.verified_at,
      spc.last_verified_at,
      spc.last_error_code,
      spc.last_error_message,
      spc.reconnect_required,
      spc.created_at,
      spc.updated_at

    FROM
      social_platform_connections spc

    WHERE
      spc.connection_id = $1
      AND spc.platform = $2

    LIMIT 1
    `,
    [
      normalizedConnectionId,
      PLATFORM,
    ]
  );
}


// ======================================================
// CREATE / RECONNECT
// ======================================================

/**
 * Store one X account globally and map it to the selected client.
 *
 * The unique key should be:
 *   (platform, external_account_id)
 *
 * Therefore the same X account is stored once even if it is
 * intentionally mapped to multiple clients.
 */
async function upsertConnection({
  clientId,
  connectedBy,
  externalAccountId,
  externalAccountName = null,
  encryptedToken,
  iv,
  authTag,
  tokenExpiresAt = null,
  encryptedRefreshToken = null,
  refreshIv = null,
  refreshAuthTag = null,
  refreshTokenExpiresAt = null,
  tokenType = 'USER',
  permissions = [],
  metadata = {},
}) {
  const normalizedClientId =
    normalizePositiveInteger(
      clientId,
      'clientId'
    );

  const normalizedConnectedBy =
    connectedBy == null
      ? null
      : normalizePositiveInteger(
          connectedBy,
          'connectedBy'
        );

  const normalizedExternalAccountId =
    normalizeText(
      externalAccountId
    );

  if (!normalizedExternalAccountId) {
    throw new Error(
      'X external account ID is required.'
    );
  }

  if (
    !encryptedToken ||
    !iv ||
    !authTag
  ) {
    throw new Error(
      'Encrypted X access-token data is incomplete.'
    );
  }

  return db.withTransaction(
    async (
      transactionClient
    ) => {
      const storedConnection =
        await db.queryOne(
          `
          INSERT INTO
            social_platform_connections
          (
            platform,
            external_account_id,
            external_account_name,
            access_token_encrypted,
            token_iv,
            token_auth_tag,
            token_expires_at,
            refresh_token_encrypted,
            refresh_token_iv,
            refresh_token_auth_tag,
            refresh_token_expires_at,
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

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13::jsonb,
            $14::jsonb,
            'CONNECTED',
            $15,
            NOW(),
            NOW(),
            NOW(),
            NULL,
            NULL,
            FALSE,
            NOW(),
            NOW()
          )

          ON CONFLICT
            (
              platform,
              external_account_id
            )

          DO UPDATE SET
            external_account_name =
              EXCLUDED.external_account_name,

            access_token_encrypted =
              EXCLUDED.access_token_encrypted,

            token_iv =
              EXCLUDED.token_iv,

            token_auth_tag =
              EXCLUDED.token_auth_tag,

            token_expires_at =
              EXCLUDED.token_expires_at,

            refresh_token_encrypted =
              COALESCE(
                EXCLUDED.refresh_token_encrypted,
                social_platform_connections
                  .refresh_token_encrypted
              ),

            refresh_token_iv =
              COALESCE(
                EXCLUDED.refresh_token_iv,
                social_platform_connections
                  .refresh_token_iv
              ),

            refresh_token_auth_tag =
              COALESCE(
                EXCLUDED.refresh_token_auth_tag,
                social_platform_connections
                  .refresh_token_auth_tag
              ),

            refresh_token_expires_at =
              COALESCE(
                EXCLUDED.refresh_token_expires_at,
                social_platform_connections
                  .refresh_token_expires_at
              ),

            token_type =
              EXCLUDED.token_type,

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
              COALESCE(
                social_platform_connections
                  .verified_at,
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

          RETURNING
            *
          `,
          [
            PLATFORM,
            normalizedExternalAccountId,
            normalizeText(
              externalAccountName
            ),
            encryptedToken,
            iv,
            authTag,
            tokenExpiresAt,
            encryptedRefreshToken,
            refreshIv,
            refreshAuthTag,
            refreshTokenExpiresAt,
            normalizeText(
              tokenType
            ) || 'USER',
            JSON.stringify(
              normalizeJsonArray(
                permissions
              )
            ),
            JSON.stringify(
              normalizeJsonObject(
                metadata
              )
            ),
            normalizedConnectedBy,
          ],
          transactionClient
        );

      if (!storedConnection) {
        throw new Error(
          'X connection could not be stored.'
        );
      }

      await db.query(
        `
        INSERT INTO
          client_social_connections
        (
          client_id,
          connection_id,
          is_active,
          created_at
        )

        VALUES
        (
          $1,
          $2,
          TRUE,
          NOW()
        )

        ON CONFLICT
          (
            client_id,
            connection_id
          )

        DO UPDATE SET
          is_active = TRUE
        `,
        [
          normalizedClientId,
          storedConnection
            .connection_id,
        ],
        transactionClient
      );

      return {
        ...storedConnection,

        client_id:
          normalizedClientId,

        client_connection_active:
          true,

        connection_status:
          storedConnection.status,
      };
    }
  );
}


// ======================================================
// TOKEN REFRESH
// ======================================================

/**
 * Persist newly encrypted OAuth tokens after X refresh.
 *
 * If X rotates the refresh token, pass the new encrypted values.
 * If X does not return a refresh token, pass null and the existing
 * stored refresh token will be preserved.
 */
async function updateOAuthTokens({
  connectionId,
  encryptedToken,
  iv,
  authTag,
  tokenExpiresAt = null,
  encryptedRefreshToken = null,
  refreshIv = null,
  refreshAuthTag = null,
  refreshTokenExpiresAt = null,
}) {
  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId,
      'connectionId'
    );

  if (
    !encryptedToken ||
    !iv ||
    !authTag
  ) {
    throw new Error(
      'Encrypted X access-token data is incomplete.'
    );
  }

  return db.queryOne(
    `
    UPDATE
      social_platform_connections

    SET
      access_token_encrypted = $2,
      token_iv = $3,
      token_auth_tag = $4,
      token_expires_at = $5,

      refresh_token_encrypted =
        COALESCE(
          $6,
          refresh_token_encrypted
        ),

      refresh_token_iv =
        COALESCE(
          $7,
          refresh_token_iv
        ),

      refresh_token_auth_tag =
        COALESCE(
          $8,
          refresh_token_auth_tag
        ),

      refresh_token_expires_at =
        COALESCE(
          $9,
          refresh_token_expires_at
        ),

      status =
        'CONNECTED',

      reconnect_required =
        FALSE,

      last_error_code =
        NULL,

      last_error_message =
        NULL,

      updated_at =
        NOW()

    WHERE
      connection_id = $1
      AND platform = $10

    RETURNING
      *
    `,
    [
      normalizedConnectionId,
      encryptedToken,
      iv,
      authTag,
      tokenExpiresAt,
      encryptedRefreshToken,
      refreshIv,
      refreshAuthTag,
      refreshTokenExpiresAt,
      PLATFORM,
    ]
  );
}


// ======================================================
// VERIFICATION STATE
// ======================================================

async function markVerified({
  connectionId,
  externalAccountName = null,
  metadata = null,
}) {
  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId,
      'connectionId'
    );

  return db.queryOne(
    `
    UPDATE
      social_platform_connections

    SET
      external_account_name =
        COALESCE(
          $2,
          external_account_name
        ),

      metadata =
        CASE
          WHEN $3::jsonb IS NULL
            THEN metadata
          ELSE COALESCE(metadata, '{}'::jsonb) || $3::jsonb
        END,

      status =
        'CONNECTED',

      verified_at =
        COALESCE(
          verified_at,
          NOW()
        ),

      last_verified_at =
        NOW(),

      reconnect_required =
        FALSE,

      last_error_code =
        NULL,

      last_error_message =
        NULL,

      updated_at =
        NOW()

    WHERE
      connection_id = $1
      AND platform = $4

    RETURNING
      connection_id,
      platform,
      external_account_id,
      external_account_name,
      status AS connection_status,
      metadata,
      verified_at,
      last_verified_at,
      reconnect_required,
      updated_at
    `,
    [
      normalizedConnectionId,
      normalizeText(
        externalAccountName
      ),
      metadata == null
        ? null
        : JSON.stringify(
            normalizeJsonObject(
              metadata
            )
          ),
      PLATFORM,
    ]
  );
}


async function markVerificationFailed({
  connectionId,
  errorCode = 'X_VERIFICATION_FAILED',
  errorMessage = 'X account verification failed.',
  reconnectRequired = false,
}) {
  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId,
      'connectionId'
    );

  const status =
    reconnectRequired
      ? 'RECONNECT_REQUIRED'
      : 'ERROR';

  return db.queryOne(
    `
    UPDATE
      social_platform_connections

    SET
      status = $2,
      last_verified_at = NOW(),
      last_error_code = $3,
      last_error_message = $4,
      reconnect_required = $5,
      updated_at = NOW()

    WHERE
      connection_id = $1
      AND platform = $6

    RETURNING
      connection_id,
      platform,
      status AS connection_status,
      reconnect_required,
      last_error_code,
      last_error_message,
      last_verified_at,
      updated_at
    `,
    [
      normalizedConnectionId,
      status,
      normalizeText(
        errorCode
      ),
      normalizeText(
        errorMessage
      ),
      Boolean(
        reconnectRequired
      ),
      PLATFORM,
    ]
  );
}


async function markReconnectRequired({
  connectionId,
  errorCode = 'X_RECONNECT_REQUIRED',
  message = 'X authorization must be reconnected.',
}) {
  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId,
      'connectionId'
    );

  return db.queryOne(
    `
    UPDATE
      social_platform_connections

    SET
      status =
        'RECONNECT_REQUIRED',

      reconnect_required =
        TRUE,

      last_verified_at =
        NOW(),

      last_error_code =
        $2,

      last_error_message =
        $3,

      updated_at =
        NOW()

    WHERE
      connection_id = $1
      AND platform = $4

    RETURNING
      connection_id,
      platform,
      status AS connection_status,
      reconnect_required,
      last_error_code,
      last_error_message,
      updated_at
    `,
    [
      normalizedConnectionId,
      normalizeText(
        errorCode
      ),
      normalizeText(
        message
      ),
      PLATFORM,
    ]
  );
}


// ======================================================
// DISCONNECT
// ======================================================

/**
 * Disconnect X for only one client.
 *
 * DO NOT delete the global social_platform_connections row here,
 * because another client may intentionally use the same X account.
 */
async function disconnectConnection({
  clientId,
  connectionId,
}) {
  const normalizedClientId =
    normalizePositiveInteger(
      clientId,
      'clientId'
    );

  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId,
      'connectionId'
    );

  return db.queryOne(
    `
    UPDATE
      client_social_connections csc

    SET
      is_active = FALSE

    FROM
      social_platform_connections spc

    WHERE
      csc.connection_id =
        spc.connection_id

      AND csc.connection_id = $1
      AND csc.client_id = $2
      AND spc.platform = $3

    RETURNING
      spc.connection_id,
      csc.client_id,
      spc.platform,
      spc.external_account_id,
      spc.external_account_name,
      'DISCONNECTED'::VARCHAR
        AS connection_status,
      csc.is_active
        AS client_connection_active,
      spc.reconnect_required,
      spc.updated_at
    `,
    [
      normalizedConnectionId,
      normalizedClientId,
      PLATFORM,
    ]
  );
}


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  findByClientId,
  findByIdAndClientId,
  findInternalById,

  upsertConnection,
  updateOAuthTokens,

  markVerified,
  markVerificationFailed,
  markReconnectRequired,

  disconnectConnection,
};