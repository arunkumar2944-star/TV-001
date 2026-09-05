'use strict';

/**
 * X OAuth token lifecycle service.
 *
 * Responsibilities:
 *
 * 1. Load the X connection securely.
 * 2. Decrypt the stored access token.
 * 3. Check access-token expiry.
 * 4. Decrypt the refresh token when required.
 * 5. Refresh expired / expiring access tokens.
 * 6. Encrypt newly issued tokens.
 * 7. Persist rotated access / refresh tokens.
 * 8. Mark the connection RECONNECT_REQUIRED
 *    when authorization can no longer be refreshed.
 *
 * IMPORTANT:
 *
 * - React must never receive refresh tokens.
 * - n8n must never decrypt database credentials.
 * - Encryption/decryption happens only in backend services.
 * - Database operations stay inside x.repository.js.
 */

const axios =
  require('axios');

const ApiError =
  require(
    '../utils/ApiError'
  );

const {
  encryptToken,
  decryptToken,
} = require(
  '../utils/tokenEncryption'
);

const xRepository =
  require(
    '../repositories/x.repository'
  );


// ======================================================
// CONSTANTS
// ======================================================

const X_TOKEN_URL =
  'https://api.x.com/2/oauth2/token';


/**
 * Refresh a little before the actual expiry.
 *
 * Example:
 *
 * token expires at 18:30
 *
 * At 18:28 this service considers it
 * "expiring soon" and refreshes it.
 */
const TOKEN_REFRESH_SKEW_MS =
  2 * 60 * 1000;


// ======================================================
// ERROR HELPERS
// ======================================================

function createServiceError(
  message,
  status = 500,
  code = 'X_TOKEN_ERROR',
  cause = null
) {
  return new ApiError(
    status,
    message,
    {
      code,
      cause,
    }
  );
}


function getProviderErrorMessage(
  error
) {
  return (
    error?.response?.data
      ?.error_description ||

    error?.response?.data
      ?.detail ||

    error?.response?.data
      ?.title ||

    error?.response?.data
      ?.error ||

    error?.message ||

    'X token request failed.'
  );
}


// ======================================================
// CONFIGURATION
// ======================================================

function getXConfiguration() {
  return {
    clientId:
      String(
        process.env.X_CLIENT_ID ||
        ''
      ).trim(),

    clientSecret:
      String(
        process.env.X_CLIENT_SECRET ||
        ''
      ).trim(),
  };
}


function ensureXConfiguration() {
  const configuration =
    getXConfiguration();

  if (!configuration.clientId) {
    throw createServiceError(
      'X_CLIENT_ID is not configured.',
      500,
      'X_CONFIGURATION_ERROR'
    );
  }

  return configuration;
}


// ======================================================
// VALIDATION HELPERS
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
    throw createServiceError(
      `${fieldName} must be a positive integer.`,
      400,
      'INVALID_X_CONNECTION'
    );
  }

  return parsed;
}


function isXConnection(
  connection
) {
  return (
    String(
      connection?.platform ||
      ''
    )
      .trim()
      .toUpperCase() ===
    'X'
  );
}


// ======================================================
// TOKEN EXPIRY
// ======================================================

function isTokenExpiring(
  tokenExpiresAt,
  skewMs =
    TOKEN_REFRESH_SKEW_MS
) {
  /*
   * Some providers may not return
   * an expiry value.
   *
   * If expiry is unknown, do not
   * refresh unnecessarily.
   */
  if (!tokenExpiresAt) {
    return false;
  }

  const expiryTime =
    new Date(
      tokenExpiresAt
    ).getTime();

  /*
   * Invalid expiry should be treated
   * conservatively.
   */
  if (
    !Number.isFinite(
      expiryTime
    )
  ) {
    return true;
  }

  return (
    expiryTime <=
    Date.now() + skewMs
  );
}


function isRefreshTokenExpired(
  refreshTokenExpiresAt
) {
  if (!refreshTokenExpiresAt) {
    return false;
  }

  const expiryTime =
    new Date(
      refreshTokenExpiresAt
    ).getTime();

  if (
    !Number.isFinite(
      expiryTime
    )
  ) {
    return true;
  }

  return (
    expiryTime <=
    Date.now()
  );
}


// ======================================================
// DECRYPT ACCESS TOKEN
// ======================================================

function decryptAccessToken(
  connection
) {
  if (
    !connection
      ?.access_token_encrypted ||
    !connection?.token_iv ||
    !connection?.token_auth_tag
  ) {
    throw createServiceError(
      'Stored X access token is incomplete.',
      500,
      'X_ACCESS_TOKEN_INCOMPLETE'
    );
  }

  try {
    return decryptToken({
      encryptedToken:
        connection
          .access_token_encrypted,

      iv:
        connection.token_iv,

      authTag:
        connection.token_auth_tag,
    });
  } catch (error) {
    throw createServiceError(
      'Stored X access token could not be decrypted.',
      500,
      'X_ACCESS_TOKEN_DECRYPT_FAILED',
      error
    );
  }
}


// ======================================================
// DECRYPT REFRESH TOKEN
// ======================================================

function decryptRefreshToken(
  connection
) {
  if (
    !connection
      ?.refresh_token_encrypted ||
    !connection
      ?.refresh_token_iv ||
    !connection
      ?.refresh_token_auth_tag
  ) {
    return null;
  }

  try {
    return decryptToken({
      encryptedToken:
        connection
          .refresh_token_encrypted,

      iv:
        connection
          .refresh_token_iv,

      authTag:
        connection
          .refresh_token_auth_tag,
    });
  } catch (error) {
    throw createServiceError(
      'Stored X refresh token could not be decrypted.',
      500,
      'X_REFRESH_TOKEN_DECRYPT_FAILED',
      error
    );
  }
}


// ======================================================
// CALCULATE TOKEN EXPIRY
// ======================================================

function calculateTokenExpiry(
  expiresIn
) {
  const seconds =
    Number(expiresIn);

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return null;
  }

  return new Date(
    Date.now() +
    seconds * 1000
  ).toISOString();
}


// ======================================================
// MARK RECONNECT REQUIRED
// ======================================================

async function markReconnectRequired({
  connectionId,
  errorCode,
  message,
}) {
  try {
    await xRepository
      .markReconnectRequired({
        connectionId,
        errorCode,
        message,
      });
  } catch {
    /*
     * Do not hide the original OAuth
     * failure because updating the
     * connection status also failed.
     */
  }
}


// ======================================================
// REQUEST NEW TOKENS FROM X
// ======================================================

async function requestTokenRefresh(
  refreshToken
) {
  const configuration =
    ensureXConfiguration();

  const body =
    new URLSearchParams();

  body.set(
    'grant_type',
    'refresh_token'
  );

  body.set(
    'refresh_token',
    refreshToken
  );

  const headers = {
    'Content-Type':
      'application/x-www-form-urlencoded',
  };


  /*
   * --------------------------------------------------
   * CONFIDENTIAL CLIENT
   * --------------------------------------------------
   *
   * When X_CLIENT_SECRET exists,
   * authenticate using HTTP Basic.
   */
  if (
    configuration.clientSecret
  ) {
    const credentials =
      Buffer
        .from(
          `${configuration.clientId}:${configuration.clientSecret}`,
          'utf8'
        )
        .toString(
          'base64'
        );

    headers.Authorization =
      `Basic ${credentials}`;
  }


  /*
   * --------------------------------------------------
   * PUBLIC CLIENT
   * --------------------------------------------------
   *
   * Public PKCE clients send client_id
   * in the form body.
   */
  else {
    body.set(
      'client_id',
      configuration.clientId
    );
  }


  const response =
    await axios.post(
      X_TOKEN_URL,

      body.toString(),

      {
        headers,

        timeout:
          15000,

        validateStatus:
          () => true,
      }
    );


  if (
    response.status < 200 ||
    response.status >= 300
  ) {
    const error =
      new Error(
        response.data
          ?.error_description ||
        response.data
          ?.detail ||
        response.data
          ?.error ||
        `X returned HTTP ${response.status}`
      );

    error.response =
      response;

    throw error;
  }


  return (
    response.data ||
    {}
  );
}


// ======================================================
// REFRESH ACCESS TOKEN
// ======================================================

async function refreshAccessToken(
  connection
) {
  const connectionId =
    normalizePositiveInteger(
      connection
        ?.connection_id,
      'connectionId'
    );


  if (
    !isXConnection(
      connection
    )
  ) {
    throw createServiceError(
      'The supplied connection is not an X connection.',
      400,
      'INVALID_X_PLATFORM'
    );
  }


  /*
   * Refresh token itself has expired.
   */
  if (
    isRefreshTokenExpired(
      connection
        .refresh_token_expires_at
    )
  ) {
    await markReconnectRequired({
      connectionId,

      errorCode:
        'X_REFRESH_TOKEN_EXPIRED',

      message:
        'X authorization expired. Please reconnect the X account.',
    });


    throw createServiceError(
      'X authorization expired. Please reconnect the X account.',
      401,
      'X_REFRESH_TOKEN_EXPIRED'
    );
  }


  const refreshToken =
    decryptRefreshToken(
      connection
    );


  /*
   * Existing X connection may have
   * been created before offline.access
   * was added.
   */
  if (!refreshToken) {
    await markReconnectRequired({
      connectionId,

      errorCode:
        'X_REFRESH_TOKEN_MISSING',

      message:
        'X refresh token is unavailable. Please reconnect the X account.',
    });


    throw createServiceError(
      'X refresh token is unavailable. Reconnect X to enable automatic authorization refresh.',
      401,
      'X_REFRESH_TOKEN_MISSING'
    );
  }


  let tokenData;


  try {
    tokenData =
      await requestTokenRefresh(
        refreshToken
      );
  } catch (error) {
    const providerMessage =
      getProviderErrorMessage(
        error
      );


    await markReconnectRequired({
      connectionId,

      errorCode:
        'X_REFRESH_FAILED',

      message:
        providerMessage,
    });


    throw createServiceError(
      `X authorization refresh failed: ${providerMessage}`,
      401,
      'X_REFRESH_FAILED',
      error
    );
  }


  // ====================================================
  // VALIDATE X RESPONSE
  // ====================================================

  const newAccessToken =
    String(
      tokenData
        ?.access_token ||
      ''
    ).trim();


  if (!newAccessToken) {
    throw createServiceError(
      'X did not return a new access token.',
      502,
      'X_REFRESH_ACCESS_TOKEN_MISSING'
    );
  }


  /*
   * X may rotate refresh tokens.
   *
   * If X returns a new refresh token,
   * use it.
   *
   * Otherwise retain the current one.
   */
  const newRefreshToken =
    String(
      tokenData
        ?.refresh_token ||
      refreshToken
    ).trim();


  const tokenExpiresAt =
    calculateTokenExpiry(
      tokenData
        ?.expires_in
    );


  // ====================================================
  // ENCRYPT NEW ACCESS TOKEN
  // ====================================================

  const encryptedAccessToken =
    encryptToken(
      newAccessToken
    );


  // ====================================================
  // ENCRYPT CURRENT / ROTATED REFRESH TOKEN
  // ====================================================

  const encryptedRefreshToken =
    encryptToken(
      newRefreshToken
    );


  // ====================================================
  // UPDATE DATABASE
  // ====================================================

  const updatedConnection =
    await xRepository
      .updateOAuthTokens({
        connectionId,

        encryptedToken:
          encryptedAccessToken
            .encryptedToken,

        iv:
          encryptedAccessToken
            .iv,

        authTag:
          encryptedAccessToken
            .authTag,

        tokenExpiresAt,

        encryptedRefreshToken:
          encryptedRefreshToken
            .encryptedToken,

        refreshIv:
          encryptedRefreshToken
            .iv,

        refreshAuthTag:
          encryptedRefreshToken
            .authTag,

        /*
         * Keep null unless you explicitly
         * have a documented refresh-token
         * expiration time.
         */
        refreshTokenExpiresAt:
          connection
            .refresh_token_expires_at ||
          null,
      });


  if (!updatedConnection) {
    throw createServiceError(
      'X connection was not found while saving refreshed authorization.',
      404,
      'X_CONNECTION_NOT_FOUND'
    );
  }


  return {
    accessToken:
      newAccessToken,

    tokenExpiresAt,

    refreshed:
      true,

    connection:
      updatedConnection,
  };
}


// ======================================================
// GET USABLE TOKEN FROM CONNECTION
// ======================================================

async function getUsableAccessTokenFromConnection(
  connection,
  {
    forceRefresh = false,
  } = {}
) {
  if (!connection) {
    throw createServiceError(
      'X connection was not found.',
      404,
      'X_CONNECTION_NOT_FOUND'
    );
  }


  if (
    !isXConnection(
      connection
    )
  ) {
    throw createServiceError(
      'Connection does not belong to X.',
      400,
      'INVALID_X_PLATFORM'
    );
  }


  /*
   * Do not use credentials that have
   * already been marked as requiring
   * reauthorization.
   */
  const reconnectRequired =
    connection
      .reconnect_required ===
      true ||
    String(
      connection
        .connection_status ||
      ''
    )
      .trim()
      .toUpperCase() ===
      'RECONNECT_REQUIRED';


  if (
    reconnectRequired &&
    !forceRefresh
  ) {
    throw createServiceError(
      'X authorization requires reconnection.',
      401,
      'X_RECONNECT_REQUIRED'
    );
  }


  if (
    forceRefresh ||
    isTokenExpiring(
      connection
        .token_expires_at
    )
  ) {
    const refreshed =
      await refreshAccessToken(
        connection
      );

    return {
      accessToken:
        refreshed.accessToken,

      refreshed:
        true,

      connection:
        refreshed.connection,
    };
  }


  return {
    accessToken:
      decryptAccessToken(
        connection
      ),

    refreshed:
      false,

    connection,
  };
}


// ======================================================
// SECURE CLIENT-SCOPED ACCESS TOKEN
// ======================================================

/**
 * This should normally be used by:
 *
 * - verify X
 * - publish to X
 * - n8n publishing endpoint
 *
 * It verifies:
 *
 * clientId
 *     +
 * connectionId
 *     +
 * platform = X
 *
 * before returning a usable token.
 */
async function getUsableAccessToken({
  clientId,
  connectionId,
  forceRefresh = false,
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


  const connection =
    await xRepository
      .findByIdAndClientId(
        normalizedConnectionId,
        normalizedClientId
      );


  if (!connection) {
    throw createServiceError(
      'X connection was not found for this client.',
      404,
      'X_CONNECTION_NOT_FOUND'
    );
  }


  /*
   * Client disconnected this mapping.
   */
  if (
    connection
      .client_connection_active ===
    false
  ) {
    throw createServiceError(
      'X connection is disconnected for this client.',
      409,
      'X_CONNECTION_DISCONNECTED'
    );
  }


  return getUsableAccessTokenFromConnection(
    connection,
    {
      forceRefresh,
    }
  );
}


// ======================================================
// INTERNAL CONNECTION TOKEN
// ======================================================

/**
 * Internal service use only.
 *
 * Prefer getUsableAccessToken()
 * whenever client context exists.
 */
async function getInternalUsableAccessToken({
  connectionId,
  forceRefresh = false,
}) {
  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId,
      'connectionId'
    );


  const connection =
    await xRepository
      .findInternalById(
        normalizedConnectionId
      );


  if (!connection) {
    throw createServiceError(
      'X connection was not found.',
      404,
      'X_CONNECTION_NOT_FOUND'
    );
  }


  return getUsableAccessTokenFromConnection(
    connection,
    {
      forceRefresh,
    }
  );
}


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  isTokenExpiring,
  isRefreshTokenExpired,

  decryptAccessToken,
  decryptRefreshToken,

  refreshAccessToken,

  getUsableAccessToken,
  getInternalUsableAccessToken,
  getUsableAccessTokenFromConnection,
};