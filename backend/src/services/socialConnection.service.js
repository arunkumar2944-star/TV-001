'use strict';

const axios =
  require('axios');

const ApiError =
  require('../utils/ApiError');

const {
  encryptToken,
  decryptToken,
} = require(
  '../utils/tokenEncryption'
);

const socialConnectionRepository =
  require(
    '../repositories/socialConnections.repository'
  );

const clientRepository =
  require(
    '../repositories/clientRepository'
  );

const {
  verifyFacebookConnection,
} =
  require(
    './facebook.service'
  );

const {
  verifyInstagramConnection,
} =
  require(
    './instagram.service'
  );

const {
  verifyStoredTelegramConnection,
} =
  require(
    './telegram.service'
  );

const {
  verifyStoredThreadsConnection,
} =
  require(
    './threads.service'
  );


// ==========================================================
// X CONFIGURATION
// ==========================================================

const X_ME_URL =
  'https://api.x.com/2/users/me';


// ==========================================================
// SERVICE ERROR
// ==========================================================

function createServiceError(
  message,
  statusCode = 500,
  code = null
) {
  return new ApiError(
    statusCode,
    message,
    code
      ? {
          code,
        }
      : {}
  );
}


// ==========================================================
// NORMALIZE POSITIVE INTEGER
// ==========================================================

function normalizePositiveInteger(
  value
) {
  const parsed =
    Number(
      value
    );

  return (
    Number.isInteger(
      parsed
    ) &&
    parsed > 0
  )
    ? parsed
    : null;
}


// ==========================================================
// NORMALIZE PLATFORM
// ==========================================================

function normalizePlatform(
  platform
) {
  return String(
    platform ||
    ''
  )
    .trim()
    .toUpperCase();
}


// ==========================================================
// NORMALIZE SCOPES
// ==========================================================

function normalizeScopes(
  scopes
) {
  if (
    Array.isArray(
      scopes
    )
  ) {
    return [
      ...new Set(
        scopes
          .map(
            (scope) =>
              String(
                scope ||
                ''
              ).trim()
          )
          .filter(
            Boolean
          )
      ),
    ];
  }


  if (
    typeof scopes ===
      'string'
  ) {
    return [
      ...new Set(
        scopes
          .split(
            /[\s,]+/
          )
          .map(
            (scope) =>
              scope.trim()
          )
          .filter(
            Boolean
          )
      ),
    ];
  }


  return [];
}


// ==========================================================
// GET PROVIDER ERROR MESSAGE
// ==========================================================

function getProviderErrorMessage(
  error,
  fallback
) {
  return String(
    error
      ?.response
      ?.data
      ?.detail ||

    error
      ?.response
      ?.data
      ?.title ||

    error
      ?.response
      ?.data
      ?.error_description ||

    error
      ?.response
      ?.data
      ?.error ||

    error
      ?.response
      ?.data
      ?.errors
      ?.[0]
      ?.message ||

    error?.message ||

    fallback
  );
}


// ==========================================================
// SAFE PUBLIC CONNECTION
// ==========================================================
//
// Never expose:
//
// - access_token_encrypted
// - token_iv
// - token_auth_tag
//
// - refresh_token_encrypted
// - refresh_token_iv
// - refresh_token_auth_tag
//
// ==========================================================

function toPublicConnection(
  row
) {
  if (!row) {
    return null;
  }


  return {
    connectionId:
      row.connection_id,

    clientId:
      row.client_id,

    platform:
      row.platform,

    externalAccountId:
      row.external_account_id,

    externalAccountName:
      row.external_account_name,

    connectionStatus:
      row.connection_status ??
      row.status ??
      null,

    clientConnectionActive:
      row.client_connection_active !==
      false,

    tokenExpiresAt:
      row.token_expires_at,

    tokenType:
      row.token_type,

    permissions:
      row.permissions,

    metadata:
      row.metadata,

    connectedAt:
      row.connected_at,

    verifiedAt:
      row.verified_at,

    lastVerifiedAt:
      row.last_verified_at,

    reconnectRequired:
      Boolean(
        row.reconnect_required
      ),

    lastErrorCode:
      row.last_error_code,

    lastErrorMessage:
      row.last_error_message,

    updatedAt:
      row.updated_at,
  };
}


// ==========================================================
// GET CLIENT CONNECTIONS
// ==========================================================

async function getClientConnections(
  clientId
) {
  const normalizedClientId =
    normalizePositiveInteger(
      clientId
    );


  if (!normalizedClientId) {
    throw createServiceError(
      'A valid client ID is required.',
      400,
      'INVALID_CLIENT_ID'
    );
  }


  const rows =
    await socialConnectionRepository
      .findByClientId(
        normalizedClientId
      );


  return rows.map(
    toPublicConnection
  );
}


// ==========================================================
// GET ONE INTERNAL CONNECTION
// ==========================================================
//
// Backend only.
//
// May contain encrypted credentials.
//
// Never return this object directly to React.
//
// ==========================================================

async function getConnection(
  connectionId,
  clientId
) {
  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId
    );

  const normalizedClientId =
    normalizePositiveInteger(
      clientId
    );


  if (
    !normalizedConnectionId ||
    !normalizedClientId
  ) {
    return null;
  }


  return (
    socialConnectionRepository
      .findByIdAndClientId(
        normalizedConnectionId,
        normalizedClientId
      )
  );
}


// ==========================================================
// ASSERT PLATFORM ENABLED
// ==========================================================

async function assertPlatformEnabled({
  clientId,
  platform,
}) {
  const normalizedClientId =
    normalizePositiveInteger(
      clientId
    );

  const normalizedPlatform =
    normalizePlatform(
      platform
    );


  if (!normalizedClientId) {
    throw createServiceError(
      'A valid client ID is required.',
      400,
      'INVALID_CLIENT_ID'
    );
  }


  if (!normalizedPlatform) {
    throw createServiceError(
      'Platform is required.',
      400,
      'INVALID_PLATFORM'
    );
  }


  const enabled =
    await clientRepository
      .isPlatformEnabled(
        normalizedClientId,
        normalizedPlatform
      );


  if (!enabled) {
    throw createServiceError(
      `${normalizedPlatform} is not enabled for this client.`,
      409,
      'CLIENT_PLATFORM_NOT_ENABLED'
    );
  }


  return true;
}


// ==========================================================
// VERIFY X USER
// ==========================================================
//
// X OAuth 2.0 User Context endpoint:
//
// GET https://api.x.com/2/users/me
//
// Required scopes include:
// tweet.read
// users.read
//
// ==========================================================

async function verifyXUser(
  accessToken
) {
  const normalizedToken =
    String(
      accessToken ||
      ''
    ).trim();


  if (!normalizedToken) {
    throw createServiceError(
      'X access token is required.',
      400,
      'X_ACCESS_TOKEN_REQUIRED'
    );
  }


  const response =
    await axios.get(
      X_ME_URL,
      {
        headers: {
          Authorization:
            `Bearer ${normalizedToken}`,
        },

        params: {
          'user.fields':
            [
              'id',
              'name',
              'username',
              'profile_image_url',
            ].join(','),
        },

        timeout:
          15000,
      }
    );


  const user =
    response?.data?.data;


  if (
    !user ||
    !user.id
  ) {
    throw createServiceError(
      'X did not return the authenticated user.',
      502,
      'X_USER_NOT_RETURNED'
    );
  }


  return {
    id:
      String(
        user.id
      ),

    name:
      user.name
        ? String(
            user.name
          )
        : null,

    username:
      user.username
        ? String(
            user.username
          )
        : null,

    profileImageUrl:
      user.profile_image_url
        ? String(
            user.profile_image_url
          )
        : null,
  };
}


// ==========================================================
// CONNECT TOKEN PLATFORM
// ==========================================================
//
// Currently used by:
//
// X OAuth
//
// Flow:
//
// access token
// refresh token
//      ↓
// verify X account
//      ↓
// encrypt access token
//      ↓
// encrypt refresh token
//      ↓
// repository.upsertXConnection()
//
// ==========================================================

async function connectTokenPlatform({
  clientId,
  connectedBy,

  platform,

  accessToken,
  refreshToken = null,

  tokenExpiresAt = null,

  tokenType = 'BEARER',

  scopes = [],
}) {
  const normalizedClientId =
    normalizePositiveInteger(
      clientId
    );

  const normalizedConnectedBy =
    normalizePositiveInteger(
      connectedBy
    );

  const normalizedPlatform =
    normalizePlatform(
      platform
    );

  const normalizedAccessToken =
    String(
      accessToken ||
      ''
    ).trim();

  const normalizedRefreshToken =
    String(
      refreshToken ||
      ''
    ).trim();

  const normalizedScopes =
    normalizeScopes(
      scopes
    );


  // --------------------------------------------------------
  // VALIDATE CLIENT
  // --------------------------------------------------------

  if (!normalizedClientId) {
    throw createServiceError(
      'A valid client ID is required.',
      400,
      'INVALID_CLIENT_ID'
    );
  }


  // --------------------------------------------------------
  // VALIDATE CONNECTED USER
  // --------------------------------------------------------

  if (!normalizedConnectedBy) {
    throw createServiceError(
      'Authenticated user is required to connect a social platform.',
      401,
      'AUTHENTICATION_REQUIRED'
    );
  }


  // --------------------------------------------------------
  // VALIDATE PLATFORM
  // --------------------------------------------------------

  if (!normalizedPlatform) {
    throw createServiceError(
      'Platform is required.',
      400,
      'INVALID_PLATFORM'
    );
  }


  /*
   * This method is currently implemented specifically
   * for X.
   *
   * Do not silently accept another platform until
   * its verification/storage contract is implemented.
   */
  if (
    normalizedPlatform !==
    'X'
  ) {
    throw createServiceError(
      `Token-platform connection is not supported for platform: ${normalizedPlatform}`,
      400,
      'TOKEN_PLATFORM_NOT_SUPPORTED'
    );
  }


  // --------------------------------------------------------
  // VALIDATE TOKEN
  // --------------------------------------------------------

  if (!normalizedAccessToken) {
    throw createServiceError(
      'X access token is required.',
      400,
      'X_ACCESS_TOKEN_REQUIRED'
    );
  }


  // --------------------------------------------------------
  // VERIFY PLATFORM ENABLED
  // --------------------------------------------------------

  await assertPlatformEnabled({
    clientId:
      normalizedClientId,

    platform:
      normalizedPlatform,
  });


  // --------------------------------------------------------
  // VERIFY X TOKEN BEFORE STORAGE
  // --------------------------------------------------------

  let xUser;


  try {
    xUser =
      await verifyXUser(
        normalizedAccessToken
      );

  } catch (error) {
    if (
      error instanceof ApiError
    ) {
      throw error;
    }


    const providerStatus =
      Number(
        error
          ?.response
          ?.status
      ) ||
      502;


    const message =
      getProviderErrorMessage(
        error,
        'X account verification failed.'
      );


    throw createServiceError(
      message,
      providerStatus,
      providerStatus === 401
        ? 'X_AUTHORIZATION_INVALID'
        : 'X_VERIFICATION_FAILED'
    );
  }


  // --------------------------------------------------------
  // ENCRYPT ACCESS TOKEN
  // --------------------------------------------------------

  let encryptedAccessToken;


  try {
    encryptedAccessToken =
      encryptToken(
        normalizedAccessToken
      );

  } catch (error) {
    throw createServiceError(
      'X access token could not be encrypted.',
      500,
      'X_ACCESS_TOKEN_ENCRYPT_FAILED'
    );
  }


  if (
    !encryptedAccessToken
      ?.encryptedToken ||
    !encryptedAccessToken
      ?.iv ||
    !encryptedAccessToken
      ?.authTag
  ) {
    throw createServiceError(
      'Encrypted X access-token data is incomplete.',
      500,
      'X_ACCESS_TOKEN_ENCRYPT_INVALID'
    );
  }


  // --------------------------------------------------------
  // ENCRYPT REFRESH TOKEN
  // --------------------------------------------------------

  let encryptedRefreshToken =
    null;


  if (
    normalizedRefreshToken
  ) {
    try {
      encryptedRefreshToken =
        encryptToken(
          normalizedRefreshToken
        );

    } catch (error) {
      throw createServiceError(
        'X refresh token could not be encrypted.',
        500,
        'X_REFRESH_TOKEN_ENCRYPT_FAILED'
      );
    }


    if (
      !encryptedRefreshToken
        ?.encryptedToken ||
      !encryptedRefreshToken
        ?.iv ||
      !encryptedRefreshToken
        ?.authTag
    ) {
      throw createServiceError(
        'Encrypted X refresh-token data is incomplete.',
        500,
        'X_REFRESH_TOKEN_ENCRYPT_INVALID'
      );
    }
  }


  // --------------------------------------------------------
  // TOKEN TYPE
  // --------------------------------------------------------

  const normalizedTokenType =
    String(
      tokenType ||
      'BEARER'
    )
      .trim()
      .toUpperCase();


  // --------------------------------------------------------
  // PERMISSIONS
  // --------------------------------------------------------

  const permissions =
    normalizedScopes.length > 0
      ? normalizedScopes
      : [
          'tweet.read',
          'tweet.write',
          'users.read',
          'offline.access',
        ];


  // --------------------------------------------------------
  // STORE CONNECTION
  // --------------------------------------------------------

  let connection;


  try {
    connection =
      await socialConnectionRepository
        .upsertXConnection({
          clientId:
            normalizedClientId,

          connectedBy:
            normalizedConnectedBy,

          externalAccountId:
            xUser.id,

          externalAccountName:
            xUser.name ||
            (
              xUser.username
                ? `@${xUser.username}`
                : null
            ),

          encryptedToken:
            encryptedAccessToken
              .encryptedToken,

          iv:
            encryptedAccessToken
              .iv,

          authTag:
            encryptedAccessToken
              .authTag,

          refreshTokenEncrypted:
            encryptedRefreshToken
              ?.encryptedToken ??
            null,

          refreshTokenIv:
            encryptedRefreshToken
              ?.iv ??
            null,

          refreshTokenAuthTag:
            encryptedRefreshToken
              ?.authTag ??
            null,

          tokenExpiresAt,

          tokenType:
            normalizedTokenType,

          permissions,

          metadata: {
            oauthVersion:
              '2.0',

            oauthFlow:
              'PKCE',

            username:
              xUser.username,

            displayName:
              xUser.name,

            profileImageUrl:
              xUser.profileImageUrl,

            refreshTokenAvailable:
              Boolean(
                normalizedRefreshToken
              ),
          },
        });

  } catch (error) {
    throw createServiceError(
      error?.message ||
      'X connection could not be stored.',
      500,
      'X_CONNECTION_SAVE_FAILED'
    );
  }


  if (!connection) {
    throw createServiceError(
      'X connection could not be stored.',
      500,
      'X_CONNECTION_SAVE_FAILED'
    );
  }


  // --------------------------------------------------------
  // SAFE RESPONSE
  // --------------------------------------------------------

  return toPublicConnection(
    connection
  );
}


// ==========================================================
// VERIFY STORED X CONNECTION
// ==========================================================

async function verifyStoredXConnection(
  connection
) {
  if (!connection) {
    throw createServiceError(
      'X connection is missing.',
      404,
      'X_CONNECTION_MISSING'
    );
  }


  const connectionId =
    normalizePositiveInteger(
      connection.connection_id
    );


  if (!connectionId) {
    throw createServiceError(
      'X connection ID is missing.',
      500,
      'X_CONNECTION_INVALID'
    );
  }


  if (
    !connection
      .access_token_encrypted ||
    !connection.token_iv ||
    !connection.token_auth_tag
  ) {
    throw createServiceError(
      'Stored X access token is incomplete.',
      500,
      'X_TOKEN_STORAGE_INVALID'
    );
  }


  // --------------------------------------------------------
  // CHECK EXPIRY
  // --------------------------------------------------------

  if (
    connection.token_expires_at
  ) {
    const expiryTime =
      new Date(
        connection
          .token_expires_at
      ).getTime();


    if (
      Number.isFinite(
        expiryTime
      ) &&
      expiryTime <=
        Date.now()
    ) {
      await socialConnectionRepository
        .markVerificationFailed({
          connectionId,

          errorCode:
            'X_ACCESS_TOKEN_EXPIRED',

          errorMessage:
            'X access token has expired.',

          reconnectRequired:
            true,
        });


      throw createServiceError(
        'X access token has expired. Reconnect X.',
        401,
        'X_ACCESS_TOKEN_EXPIRED'
      );
    }
  }


  // --------------------------------------------------------
  // DECRYPT ACCESS TOKEN
  // --------------------------------------------------------

  let accessToken;


  try {
    accessToken =
      decryptToken({
        encryptedToken:
          connection
            .access_token_encrypted,

        iv:
          connection
            .token_iv,

        authTag:
          connection
            .token_auth_tag,
      });

  } catch (error) {
    throw createServiceError(
      'Stored X access token could not be decrypted.',
      500,
      'X_TOKEN_DECRYPT_FAILED'
    );
  }


  if (!accessToken) {
    throw createServiceError(
      'Stored X access token could not be decrypted.',
      500,
      'X_TOKEN_DECRYPT_FAILED'
    );
  }


  // --------------------------------------------------------
  // VERIFY AGAINST X
  // --------------------------------------------------------

  try {
    const xUser =
      await verifyXUser(
        accessToken
      );


    if (
      !xUser?.id
    ) {
      throw createServiceError(
        'X did not return an account ID.',
        502,
        'X_ACCOUNT_ID_MISSING'
      );
    }


    if (
      connection
        .external_account_id &&
      String(
        connection
          .external_account_id
      ) !==
        String(
          xUser.id
        )
    ) {
      await socialConnectionRepository
        .markVerificationFailed({
          connectionId,

          errorCode:
            'X_ACCOUNT_ID_MISMATCH',

          errorMessage:
            'X authenticated account does not match the stored account.',

          reconnectRequired:
            true,
        });


      throw createServiceError(
        'X authenticated account does not match the stored account. Reconnect X.',
        409,
        'X_ACCOUNT_ID_MISMATCH'
      );
    }


    // ------------------------------------------------------
    // MARK VERIFIED
    // ------------------------------------------------------

    const updated =
      await socialConnectionRepository
        .markVerified({
          connectionId,

          externalAccountName:
            xUser.name ||
            (
              xUser.username
                ? `@${xUser.username}`
                : null
            ),
        });


    if (!updated) {
      throw createServiceError(
        'X connection status could not be updated.',
        500,
        'X_CONNECTION_UPDATE_FAILED'
      );
    }


    return toPublicConnection({
      ...connection,
      ...updated,

      client_id:
        connection.client_id,

      client_connection_active:
        connection
          .client_connection_active,
    });

  } catch (error) {
    /*
     * Do not overwrite a deliberate service error
     * such as account-ID mismatch.
     */
    if (
      error instanceof ApiError
    ) {
      throw error;
    }


    const providerStatus =
      Number(
        error
          ?.response
          ?.status
      ) ||
      502;


    const reconnectRequired =
      providerStatus ===
        401;


    const errorCode =
      reconnectRequired
        ? 'X_AUTHORIZATION_INVALID'
        : 'X_VERIFICATION_FAILED';


    const message =
      getProviderErrorMessage(
        error,
        'X connection verification failed.'
      );


    try {
      await socialConnectionRepository
        .markVerificationFailed({
          connectionId,

          errorCode,

          errorMessage:
            message,

          reconnectRequired,
        });

    } catch {
      /*
       * Keep the original provider error.
       */
    }


    throw createServiceError(
      reconnectRequired
        ? 'X authorization is no longer valid. Reconnect X.'
        : message,

      reconnectRequired
        ? 401
        : providerStatus,

      errorCode
    );
  }
}


// ==========================================================
// VERIFY SOCIAL CONNECTION
// ==========================================================

async function verifyConnection({
  clientId,
  connectionId,
}) {
  const normalizedClientId =
    normalizePositiveInteger(
      clientId
    );

  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId
    );


  // --------------------------------------------------------
  // VALIDATE INPUT
  // --------------------------------------------------------

  if (!normalizedClientId) {
    throw createServiceError(
      'A valid client ID is required.',
      400,
      'INVALID_CLIENT_ID'
    );
  }


  if (!normalizedConnectionId) {
    throw createServiceError(
      'A valid connection ID is required.',
      400,
      'INVALID_CONNECTION_ID'
    );
  }


  // --------------------------------------------------------
  // GET CONNECTION BELONGING TO CLIENT
  // --------------------------------------------------------

  const connection =
    await socialConnectionRepository
      .findByIdAndClientId(
        normalizedConnectionId,
        normalizedClientId
      );


  if (!connection) {
    throw createServiceError(
      'Social connection not found.',
      404,
      'SOCIAL_CONNECTION_NOT_FOUND'
    );
  }


  // --------------------------------------------------------
  // VERIFY PLATFORM IS STILL ENABLED
  // --------------------------------------------------------

  await assertPlatformEnabled({
    clientId:
      normalizedClientId,

    platform:
      connection.platform,
  });


  // --------------------------------------------------------
  // VERIFY CLIENT RELATIONSHIP ACTIVE
  // --------------------------------------------------------

  if (
    connection
      .client_connection_active ===
    false
  ) {
    throw createServiceError(
      'This social connection is disconnected for the selected client.',
      409,
      'SOCIAL_CONNECTION_DISCONNECTED'
    );
  }


  // --------------------------------------------------------
  // NORMALIZE PLATFORM
  // --------------------------------------------------------

  const platform =
    normalizePlatform(
      connection.platform
    );


  // --------------------------------------------------------
  // PLATFORM VERIFICATION ROUTER
  // --------------------------------------------------------

  switch (
    platform
  ) {

    // ------------------------------------------------------
    // FACEBOOK
    // ------------------------------------------------------

    case 'FACEBOOK':
      return (
        verifyFacebookConnection(
          connection
        )
      );


    // ------------------------------------------------------
    // INSTAGRAM
    // ------------------------------------------------------

    case 'INSTAGRAM':
      return (
        verifyInstagramConnection(
          connection
        )
      );


    // ------------------------------------------------------
    // TELEGRAM
    // ------------------------------------------------------

    case 'TELEGRAM':
      return (
        verifyStoredTelegramConnection(
          connection
        )
      );


    // ------------------------------------------------------
    // THREADS
    // ------------------------------------------------------

    case 'THREADS':
      return (
        verifyStoredThreadsConnection(
          connection
        )
      );


    // ------------------------------------------------------
    // X
    // ------------------------------------------------------

    case 'X':
      return (
        verifyStoredXConnection(
          connection
        )
      );


    // ------------------------------------------------------
    // UNSUPPORTED
    // ------------------------------------------------------

    default:
      throw createServiceError(
        `Connection verification is not supported for platform: ${platform}`,
        400,
        'PLATFORM_VERIFICATION_NOT_SUPPORTED'
      );
  }
}


// ==========================================================
// DISCONNECT SOCIAL CONNECTION
// ==========================================================
//
// Only client_social_connections is deactivated.
//
// The global encrypted platform account is preserved.
//
// ==========================================================

async function disconnectConnection({
  clientId,
  connectionId,
}) {
  const normalizedClientId =
    normalizePositiveInteger(
      clientId
    );

  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId
    );


  if (!normalizedClientId) {
    throw createServiceError(
      'A valid client ID is required.',
      400,
      'INVALID_CLIENT_ID'
    );
  }


  if (!normalizedConnectionId) {
    throw createServiceError(
      'A valid connection ID is required.',
      400,
      'INVALID_CONNECTION_ID'
    );
  }


  // --------------------------------------------------------
  // VERIFY CONNECTION EXISTS
  // --------------------------------------------------------

  const existing =
    await socialConnectionRepository
      .findByIdAndClientId(
        normalizedConnectionId,
        normalizedClientId
      );


  if (!existing) {
    throw createServiceError(
      'Social connection not found for this client.',
      404,
      'SOCIAL_CONNECTION_NOT_FOUND'
    );
  }


  // --------------------------------------------------------
  // VERIFY PLATFORM ENABLED
  // --------------------------------------------------------

  await assertPlatformEnabled({
    clientId:
      normalizedClientId,

    platform:
      existing.platform,
  });


  // --------------------------------------------------------
  // SOFT DISCONNECT
  // --------------------------------------------------------

  const connection =
    await socialConnectionRepository
      .disconnectConnection({
        clientId:
          normalizedClientId,

        connectionId:
          normalizedConnectionId,
      });


  if (!connection) {
    throw createServiceError(
      'Social connection could not be disconnected.',
      500,
      'SOCIAL_CONNECTION_DISCONNECT_FAILED'
    );
  }


  return toPublicConnection(
    connection
  );
}


// ==========================================================
// EXPORTS
// ==========================================================

module.exports = {
  getClientConnections,
  getConnection,

  connectTokenPlatform,

  verifyConnection,
  verifyStoredXConnection,

  disconnectConnection,
};