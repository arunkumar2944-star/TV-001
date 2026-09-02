'use strict';

const { getPool } = require('../database/pool');

/*
 * Normalized social connection storage
 * ------------------------------------
 * social_platform_connections = one platform account + encrypted credentials
 * client_social_connections   = client <-> platform-account relationship
 *
 * Public queries alias `status` as `connection_status` so the service/UI
 * contract stays stable while ownership is normalized.
 */

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
  spc.token_auth_tag
`;

async function findByClientId(clientId) {
  const pool = getPool();
  const result = await pool.query(
    `
      SELECT DISTINCT ON (spc.platform)
        ${PUBLIC_SELECT}
      FROM client_social_connections csc
      JOIN social_platform_connections spc
        ON spc.connection_id = csc.connection_id
      WHERE csc.client_id = $1
      ORDER BY
        spc.platform ASC,
        csc.is_active DESC,
        csc.created_at DESC,
        spc.connection_id DESC
    `,
    [clientId]
  );

  return result.rows;
}

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
      LIMIT 1
    `,
    [connectionId, clientId]
  );

  return result.rows[0] ?? null;
}

async function findFacebookByClientId(clientId) {
  const pool = getPool();
  const result = await pool.query(
    `
      SELECT ${INTERNAL_SELECT}
      FROM client_social_connections csc
      JOIN social_platform_connections spc
        ON spc.connection_id = csc.connection_id
      WHERE csc.client_id = $1
        AND spc.platform = 'FACEBOOK'
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
 * One Facebook Page is stored once globally and can be linked to many clients.
 * Reconnecting the same Page therefore reuses the same connection_id.
 */
async function upsertFacebookConnection({
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
  const normalizedClientId =
    Number(clientId);

  if (
    !Number.isInteger(
      normalizedClientId
    ) ||
    normalizedClientId <= 0
  ) {
    throw new Error(
      'A valid clientId is required.'
    );
  }

  if (
    !externalAccountId
  ) {
    throw new Error(
      'Facebook external account ID is required.'
    );
  }

  if (
    !encryptedToken ||
    !iv ||
    !authTag
  ) {
    throw new Error(
      'Encrypted Facebook token data is incomplete.'
    );
  }


  const pool =
    getPool();

  const db =
    await pool.connect();

  try {
    await db.query(
      'BEGIN'
    );


    /*
     * ===================================================
     * GLOBAL FACEBOOK PAGE
     * ===================================================
     *
     * UNIQUE:
     *
     * platform + external_account_id
     *
     * Therefore the same Facebook Page is stored only
     * once globally, regardless of how many clients use it.
     *
     * Important:
     *
     * selectPage() already verifies the Page/token pair
     * with Meta BEFORE calling this repository.
     *
     * Therefore we can safely persist the new credential as
     * CONNECTED rather than temporarily changing a shared
     * global connection to PENDING_VERIFICATION.
     */

    const stored =
      await db.query(
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
          'FACEBOOK',
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'PAGE',
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

        ON CONFLICT (
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

          token_type =
            EXCLUDED.token_type,

          permissions =
            EXCLUDED.permissions,

          metadata =
            EXCLUDED.metadata,

          /*
           * The new Page/token pair has already been
           * verified by facebook.service.js.
           */
          status =
            'CONNECTED',

          connected_by =
            EXCLUDED.connected_by,

          connected_at =
            NOW(),

          /*
           * Preserve the original first-verification time,
           * but refresh the latest verification time.
           */
          verified_at =
            COALESCE(
              social_platform_connections.verified_at,
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

        RETURNING *
        `,
        [
          String(
            externalAccountId
          ),

          externalAccountName ||
            null,

          encryptedToken,

          iv,

          authTag,

          tokenExpiresAt,

          JSON.stringify(
            permissions || []
          ),

          JSON.stringify(
            metadata || {}
          ),

          connectedBy ??
            null,
        ]
      );


    const connectionRow =
      stored.rows[0];

    if (!connectionRow) {
      throw new Error(
        'Facebook connection could not be stored.'
      );
    }


    /*
     * ===================================================
     * ONE ACTIVE FACEBOOK ACCOUNT PER CLIENT
     * ===================================================
     *
     * Keep old links for history but deactivate any other
     * Facebook Page currently selected by this client.
     *
     * This does NOT affect other clients.
     */

    await db.query(
      `
      UPDATE client_social_connections csc

      SET
        is_active = FALSE

      FROM social_platform_connections spc

      WHERE
        csc.connection_id =
          spc.connection_id

        AND csc.client_id =
          $1

        AND spc.platform =
          'FACEBOOK'

        AND csc.connection_id <>
          $2
      `,
      [
        normalizedClientId,
        connectionRow.connection_id,
      ]
    );


    /*
     * ===================================================
     * CLIENT ↔ GLOBAL CONNECTION
     * ===================================================
     *
     * Existing relationship:
     *
     * is_active FALSE → TRUE
     *
     * New relationship:
     *
     * INSERT
     */

    await db.query(
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
        is_active =
          TRUE
      `,
      [
        normalizedClientId,
        connectionRow.connection_id,
      ]
    );


    await db.query(
      'COMMIT'
    );


    return {
      ...connectionRow,

      client_id:
        normalizedClientId,

      client_connection_active:
        true,

      connection_status:
        connectionRow.status,
    };
  } catch (error) {
    await db.query(
      'ROLLBACK'
    );

    throw error;
  } finally {
    db.release();
  }
}

async function upsertInstagramConnection({
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
  const normalizedClientId =
    Number(clientId);

  if (
    !Number.isInteger(
      normalizedClientId
    ) ||
    normalizedClientId <= 0
  ) {
    throw new Error(
      'A valid clientId is required.'
    );
  }

  if (!externalAccountId) {
    throw new Error(
      'Instagram account ID is required.'
    );
  }

  if (
    !encryptedToken ||
    !iv ||
    !authTag
  ) {
    throw new Error(
      'Encrypted Instagram token data is incomplete.'
    );
  }


  const pool =
    getPool();

  const db =
    await pool.connect();

  try {
    await db.query(
      'BEGIN'
    );


    /*
     * ===================================================
     * GLOBAL INSTAGRAM ACCOUNT
     * ===================================================
     *
     * One Instagram Professional account is stored once.
     *
     * UNIQUE:
     *
     * platform + external_account_id
     */

    const stored =
      await db.query(
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
          'INSTAGRAM',
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'PAGE',
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

        ON CONFLICT (
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

        RETURNING *
        `,
        [
          String(
            externalAccountId
          ),

          externalAccountName ||
            null,

          encryptedToken,

          iv,

          authTag,

          tokenExpiresAt,

          JSON.stringify(
            permissions || []
          ),

          JSON.stringify(
            metadata || {}
          ),

          connectedBy ??
            null,
        ]
      );


    const connectionRow =
      stored.rows[0];

    if (!connectionRow) {
      throw new Error(
        'Instagram connection could not be stored.'
      );
    }


    /*
     * ===================================================
     * ONE ACTIVE INSTAGRAM ACCOUNT PER CLIENT
     * ===================================================
     *
     * Keep old relationship rows for history,
     * but deactivate any other Instagram account
     * currently active for this client.
     */

    await db.query(
      `
      UPDATE client_social_connections csc

      SET
        is_active = FALSE

      FROM social_platform_connections spc

      WHERE
        csc.connection_id =
          spc.connection_id

        AND csc.client_id =
          $1

        AND spc.platform =
          'INSTAGRAM'

        AND csc.connection_id <>
          $2
      `,
      [
        normalizedClientId,
        connectionRow.connection_id,
      ]
    );


    /*
     * ===================================================
     * CLIENT ↔ INSTAGRAM ACCOUNT
     * ===================================================
     *
     * New:
     * INSERT
     *
     * Reconnect:
     * is_active FALSE → TRUE
     */

    await db.query(
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
        is_active =
          TRUE
      `,
      [
        normalizedClientId,
        connectionRow.connection_id,
      ]
    );


    await db.query(
      'COMMIT'
    );


    return {
      ...connectionRow,

      client_id:
        normalizedClientId,

      client_connection_active:
        true,

      connection_status:
        connectionRow.status,
    };
  } catch (error) {
    await db.query(
      'ROLLBACK'
    );

    throw error;
  } finally {
    db.release();
  }
}

async function markVerified({ connectionId, externalAccountName }) {
  const pool = getPool();
  const result = await pool.query(
    `
      UPDATE social_platform_connections
      SET
        external_account_name = COALESCE($2, external_account_name),
        status = 'CONNECTED',
        verified_at = COALESCE(verified_at, NOW()),
        last_verified_at = NOW(),
        reconnect_required = FALSE,
        last_error_code = NULL,
        last_error_message = NULL,
        updated_at = NOW()
      WHERE connection_id = $1
      RETURNING
        connection_id,
        platform,
        external_account_id,
        external_account_name,
        status AS connection_status,
        verified_at,
        last_verified_at,
        reconnect_required,
        updated_at
    `,
    [connectionId, externalAccountName ?? null]
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
  const status = reconnectRequired ? 'RECONNECT_REQUIRED' : 'ERROR';
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
    [connectionId, status, errorCode ?? null, errorMessage ?? null, Boolean(reconnectRequired)]
  );

  return result.rows[0] ?? null;
}

async function disconnectConnection({ clientId, connectionId }) {
  const pool = getPool();
  const result = await pool.query(
    `
      UPDATE client_social_connections csc
      SET is_active = FALSE
      FROM social_platform_connections spc
      WHERE csc.connection_id = spc.connection_id
        AND csc.connection_id = $1
        AND csc.client_id = $2
      RETURNING
        spc.connection_id,
        csc.client_id,
        spc.platform,
        spc.external_account_id,
        spc.external_account_name,
        'DISCONNECTED'::varchar AS connection_status,
        csc.is_active AS client_connection_active,
        spc.reconnect_required,
        spc.updated_at
    `,
    [connectionId, clientId]
  );

  return result.rows[0] ?? null;
}

async function markReauthRequired({ connectionId, message, errorCode = '190' }) {
  const pool = getPool();
  const result = await pool.query(
    `
      UPDATE social_platform_connections
      SET
        status = 'RECONNECT_REQUIRED',
        reconnect_required = TRUE,
        last_verified_at = NOW(),
        last_error_code = $2,
        last_error_message = $3,
        updated_at = NOW()
      WHERE connection_id = $1
      RETURNING
        connection_id,
        platform,
        status AS connection_status,
        reconnect_required,
        last_error_code,
        last_error_message,
        updated_at
    `,
    [connectionId, String(errorCode), message ?? 'Facebook authorization has expired.']
  );

  return result.rows[0] ?? null;
}

module.exports = {
  findByClientId,
  findByIdAndClientId,
  findFacebookByClientId,

  upsertFacebookConnection,
  upsertInstagramConnection,
  
  markVerified,
  markVerificationFailed,
  markReauthRequired,
  disconnectConnection,
};
