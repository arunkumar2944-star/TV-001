'use strict';

const axios =
  require('axios');

const crypto =
  require('crypto');

const ApiError =
  require('../utils/ApiError');

const {
  youtubeConfig,
} = require('../config/youtube');

const clientRepository =
  require(
    '../repositories/clientRepository'
  );

const youtubeRepository =
  require(
    '../repositories/youtube.repository'
  );

const {
  encryptToken,
  decryptToken,
} = require(
  '../utils/tokenEncryption'
);


/* =========================================================
 * CONSTANTS
 * ========================================================= */

const OAUTH_STATE_TTL_MS =
  10 * 60 * 1000;

const ACCESS_TOKEN_EXPIRY_SKEW_MS =
  2 * 60 * 1000;


/* =========================================================
 * ERROR HELPER
 * ========================================================= */

function serviceError(
  message,
  status = 500,
  code = null,
) {
  return new ApiError(
    status,
    message,
    code
      ? {
          code,
        }
      : {},
  );
}


/* =========================================================
 * NORMALIZE POSITIVE INTEGER
 * ========================================================= */

function normalizePositiveInteger(
  value,
) {
  const result =
    Number(value);

  return (
    Number.isInteger(
      result,
    ) &&
    result > 0
  )
    ? result
    : null;
}


/* =========================================================
 * TOKEN EXPIRY
 * ========================================================= */

function calculateTokenExpiry(
  expiresIn,
) {
  const seconds =
    Number(expiresIn);

  if (
    !Number.isFinite(
      seconds,
    ) ||
    seconds <= 0
  ) {
    return null;
  }

  return new Date(
    Date.now() +
      seconds * 1000,
  );
}


/* =========================================================
 * YOUTUBE CONFIG VALIDATION
 * ========================================================= */

function ensureYouTubeConfig() {
  if (
    !youtubeConfig.clientId
  ) {
    throw serviceError(
      'YOUTUBE_CLIENT_ID is not configured.',
      500,
      'YOUTUBE_CONFIGURATION_ERROR',
    );
  }

  if (
    !youtubeConfig.clientSecret
  ) {
    throw serviceError(
      'YOUTUBE_CLIENT_SECRET is not configured.',
      500,
      'YOUTUBE_CONFIGURATION_ERROR',
    );
  }

  if (
    !youtubeConfig.callbackUrl
  ) {
    throw serviceError(
      'YOUTUBE_CALLBACK_URI is not configured.',
      500,
      'YOUTUBE_CONFIGURATION_ERROR',
    );
  }

  if (
    !Array.isArray(
      youtubeConfig.scopes,
    ) ||
    youtubeConfig.scopes.length ===
      0
  ) {
    throw serviceError(
      'YouTube OAuth scopes are not configured.',
      500,
      'YOUTUBE_CONFIGURATION_ERROR',
    );
  }
}


/* =========================================================
 * CLEAR YOUTUBE OAUTH SESSION
 * ========================================================= */

function clearYouTubeOAuthSession(
  session,
  {
    preserveOutcome = false,
  } = {},
) {
  if (!session) {
    return;
  }

  delete session
    .youtubeOAuthState;

  delete session
    .youtubeOAuthClientId;

  delete session
    .youtubeOAuthUserId;

  delete session
    .youtubeOAuthStartedAt;

  if (!preserveOutcome) {
    delete session
      .youtubeOAuthOutcome;
  }
}


/* =========================================================
 * OAUTH OUTCOME
 * ========================================================= */

function setYouTubeOAuthOutcome(
  session,
  {
    status,
    message = null,
    reason = null,
    clientId = null,
    userId = null,
    connectionId = null,
    channelId = null,
    channelName = null,
  },
) {
  if (!session) {
    return;
  }

  session.youtubeOAuthOutcome = {
    status,

    message,

    reason,

    clientId:
      normalizePositiveInteger(
        clientId,
      ),

    userId:
      normalizePositiveInteger(
        userId,
      ),

    connectionId:
      normalizePositiveInteger(
        connectionId,
      ),

    channelId:
      channelId
        ? String(channelId)
        : null,

    channelName:
      channelName ||
      null,

    createdAt:
      Date.now(),
  };
}


function getOAuthOutcome(
  session,
) {
  if (!session) {
    return null;
  }

  return (
    session
      .youtubeOAuthOutcome ||
    null
  );
}


function consumeOAuthOutcome(
  session,
  expectedClientId = null,
) {
  if (!session) {
    return null;
  }

  const outcome =
    session
      .youtubeOAuthOutcome ||
    null;

  if (!outcome) {
    return null;
  }

  const normalizedExpectedClientId =
    expectedClientId
      ? normalizePositiveInteger(
          expectedClientId,
        )
      : null;

  if (
    normalizedExpectedClientId &&
    Number(
      outcome.clientId,
    ) !==
      normalizedExpectedClientId
  ) {
    return null;
  }

  delete session
    .youtubeOAuthOutcome;

  return outcome;
}


/* =========================================================
 * OAUTH SESSION AGE
 * ========================================================= */

function assertYouTubeOAuthFresh(
  session,
) {
  const startedAt =
    Number(
      session
        ?.youtubeOAuthStartedAt,
    );

  if (
    !startedAt ||
    Date.now() -
      startedAt >
      OAUTH_STATE_TTL_MS
  ) {
    clearYouTubeOAuthSession(
      session,
    );

    throw serviceError(
      'YouTube OAuth session expired. Please connect YouTube again.',
      401,
      'YOUTUBE_OAUTH_EXPIRED',
    );
  }
}


/* =========================================================
 * STATE VALIDATION
 * ========================================================= */

function isValidOAuthState(
  receivedState,
  storedState,
) {
  if (
    typeof receivedState !==
      'string' ||
    typeof storedState !==
      'string' ||
    !receivedState ||
    !storedState
  ) {
    return false;
  }

  const receivedBuffer =
    Buffer.from(
      receivedState,
    );

  const storedBuffer =
    Buffer.from(
      storedState,
    );

  if (
    receivedBuffer.length !==
    storedBuffer.length
  ) {
    return false;
  }

  return crypto
    .timingSafeEqual(
      receivedBuffer,
      storedBuffer,
    );
}


/* =========================================================
 * VALIDATE CLIENT
 * ========================================================= */

async function validateClient(
  clientId,
) {
  const normalizedClientId =
    normalizePositiveInteger(
      clientId,
    );

  if (!normalizedClientId) {
    throw serviceError(
      'Invalid client ID.',
      400,
      'INVALID_CLIENT_ID',
    );
  }

  const client =
    await clientRepository
      .findById(
        normalizedClientId,
      );

  if (!client) {
    throw serviceError(
      'Client not found.',
      404,
      'CLIENT_NOT_FOUND',
    );
  }

  if (
    client.active ===
      false ||
    client.is_active ===
      false
  ) {
    throw serviceError(
      'Client is inactive.',
      409,
      'CLIENT_INACTIVE',
    );
  }

  return {
    client,

    clientId:
      normalizedClientId,
  };
}


/* =========================================================
 * NORMALIZE PLATFORM
 * ========================================================= */

function normalizePlatform(
  value,
) {
  if (
    typeof value ===
    'string'
  ) {
    return value
      .trim()
      .toLowerCase();
  }

  return String(
    value?.platform ||
    value?.platform_name ||
    value?.code ||
    '',
  )
    .trim()
    .toLowerCase();
}


/* =========================================================
 * CHECK YOUTUBE ENABLED FOR CLIENT
 * ========================================================= */

async function assertYouTubeEnabled(
  clientId,
) {
  /**
   * Preferred repository helper.
   */
  if (
    typeof clientRepository
      .isPlatformEnabled ===
    'function'
  ) {
    const enabled =
      await clientRepository
        .isPlatformEnabled(
          Number(clientId),
          'youtube',
        );

    if (!enabled) {
      throw serviceError(
        'YouTube is not enabled for this client.',
        409,
        'CLIENT_PLATFORM_NOT_ENABLED',
      );
    }

    return;
  }


  /**
   * Compatibility with other
   * client repository implementations.
   */
  if (
    typeof clientRepository
      .findEnabledSocialPlatforms ===
    'function'
  ) {
    const platforms =
      await clientRepository
        .findEnabledSocialPlatforms(
          Number(clientId),
        );

    const enabled =
      Array.isArray(platforms) &&
      platforms.some(
        (platform) =>
          normalizePlatform(
            platform,
          ) ===
          'youtube',
      );

    if (!enabled) {
      throw serviceError(
        'YouTube is not enabled for this client.',
        409,
        'CLIENT_PLATFORM_NOT_ENABLED',
      );
    }

    return;
  }


  if (
    typeof clientRepository
      .listEnabledPlatforms ===
    'function'
  ) {
    const platforms =
      await clientRepository
        .listEnabledPlatforms(
          Number(clientId),
        );

    const enabled =
      Array.isArray(platforms) &&
      platforms.some(
        (platform) =>
          normalizePlatform(
            platform,
          ) ===
          'youtube',
      );

    if (!enabled) {
      throw serviceError(
        'YouTube is not enabled for this client.',
        409,
        'CLIENT_PLATFORM_NOT_ENABLED',
      );
    }
  }
}


/* =========================================================
 * START GOOGLE / YOUTUBE OAUTH
 * ========================================================= */

async function startOAuth({
  clientId,
  userId,
  session,
}) {
  ensureYouTubeConfig();

  if (!session) {
    throw serviceError(
      'Session is unavailable.',
      500,
      'SESSION_UNAVAILABLE',
    );
  }

  const normalizedUserId =
    normalizePositiveInteger(
      userId,
    );

  if (!normalizedUserId) {
    throw serviceError(
      'Authenticated user information is missing.',
      401,
      'AUTHENTICATED_USER_MISSING',
    );
  }

  const {
    clientId:
      normalizedClientId,
  } =
    await validateClient(
      clientId,
    );

  await assertYouTubeEnabled(
    normalizedClientId,
  );


  const state =
    crypto
      .randomBytes(32)
      .toString('hex');


  /**
   * Clear an unfinished previous
   * YouTube OAuth attempt.
   */
  clearYouTubeOAuthSession(
    session,
  );


  /**
   * Trusted context stays in
   * the server session.
   */
  session.youtubeOAuthState =
    state;

  session.youtubeOAuthClientId =
    normalizedClientId;

  session.youtubeOAuthUserId =
    normalizedUserId;

  session.youtubeOAuthStartedAt =
    Date.now();


  const params =
    new URLSearchParams({
      client_id:
        String(
          youtubeConfig.clientId,
        ),

      redirect_uri:
        youtubeConfig.callbackUrl,

      response_type:
        'code',

      scope:
        youtubeConfig.scopes
          .join(' '),

      state,

      access_type:
        'offline',

      include_granted_scopes:
        'true',

      /**
       * Important for our publishing
       * automation:
       *
       * ask Google to issue a refresh
       * token during connect/reconnect.
       */
      prompt:
        'consent',
    });


  return {
    authorizationUrl:
      `${youtubeConfig.authorizationUrl}?${params.toString()}`,

    clientId:
      normalizedClientId,

    userId:
      normalizedUserId,
  };
}


/* =========================================================
 * EXCHANGE AUTHORIZATION CODE
 * ========================================================= */

async function exchangeCodeForToken(
  code,
) {
  ensureYouTubeConfig();

  const safeCode =
    String(
      code || '',
    )
      .trim();

  if (!safeCode) {
    throw serviceError(
      'YouTube authorization code is required.',
      400,
      'YOUTUBE_AUTH_CODE_REQUIRED',
    );
  }


  const form =
    new URLSearchParams({
      client_id:
        String(
          youtubeConfig.clientId,
        ),

      client_secret:
        String(
          youtubeConfig.clientSecret,
        ),

      code:
        safeCode,

      grant_type:
        'authorization_code',

      redirect_uri:
        youtubeConfig.callbackUrl,
    });


  const response =
    await axios.post(
      youtubeConfig.tokenUrl,
      form.toString(),
      {
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },

        timeout:
          15000,
      },
    );


  const accessToken =
    response.data
      ?.access_token;

  if (!accessToken) {
    throw serviceError(
      'Google did not return a YouTube access token.',
      502,
      'YOUTUBE_ACCESS_TOKEN_MISSING',
    );
  }


  return {
    accessToken,

    refreshToken:
      response.data
        ?.refresh_token ||
      null,

    expiresIn:
      Number(
        response.data
          ?.expires_in,
      ) ||
      null,

    tokenType:
      response.data
        ?.token_type ||
      'Bearer',

    scope:
      response.data
        ?.scope ||
      null,
  };
}


/* =========================================================
 * GET AUTHENTICATED YOUTUBE CHANNEL
 * ========================================================= */

async function getAuthenticatedChannel(
  accessToken,
) {
  if (!accessToken) {
    throw serviceError(
      'YouTube access token is required.',
      400,
      'YOUTUBE_ACCESS_TOKEN_REQUIRED',
    );
  }


  const response =
    await axios.get(
      `${youtubeConfig.apiUrl}/channels`,
      {
        params: {
          part:
            'id,snippet,status',

          mine:
            'true',

          maxResults:
            1,
        },

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },

        timeout:
          15000,
      },
    );


  const items =
    Array.isArray(
      response.data?.items,
    )
      ? response.data.items
      : [];


  if (
    items.length === 0
  ) {
    throw serviceError(
      'The selected Google account does not have an accessible YouTube channel.',
      404,
      'YOUTUBE_CHANNEL_NOT_FOUND',
    );
  }


  const channel =
    items[0];


  if (!channel?.id) {
    throw serviceError(
      'YouTube channel ID was not returned.',
      502,
      'YOUTUBE_CHANNEL_ID_MISSING',
    );
  }


  return channel;
}


/* =========================================================
 * CHANNEL METADATA
 * ========================================================= */

function buildChannelMetadata(
  channel,
) {
  const snippet =
    channel?.snippet ||
    {};

  const status =
    channel?.status ||
    {};

  return {
    channelId:
      channel?.id
        ? String(
            channel.id,
          )
        : null,

    title:
      snippet.title ||
      null,

    description:
      snippet.description ||
      null,

    customUrl:
      snippet.customUrl ||
      null,

    publishedAt:
      snippet.publishedAt ||
      null,

    country:
      snippet.country ||
      null,

    thumbnailUrl:
      snippet
        ?.thumbnails
        ?.high
        ?.url ||
      snippet
        ?.thumbnails
        ?.medium
        ?.url ||
      snippet
        ?.thumbnails
        ?.default
        ?.url ||
      null,

    privacyStatus:
      status.privacyStatus ||
      null,

    isLinked:
      status.isLinked ??
      null,

    longUploadsStatus:
      status.longUploadsStatus ||
      null,
  };
}


/* =========================================================
 * HANDLE GOOGLE OAUTH CALLBACK
 * ========================================================= */

async function handleOAuthCallback({
  query,
  session,
}) {
  ensureYouTubeConfig();


  if (!session) {
    throw serviceError(
      'YouTube OAuth session is unavailable.',
      400,
      'YOUTUBE_SESSION_MISSING',
    );
  }


  const {
    code,
    state,
    error,
    error_description:
      errorDescription,
  } =
    query || {};


  assertYouTubeOAuthFresh(
    session,
  );


  const storedState =
    session
      .youtubeOAuthState;

  const clientId =
    normalizePositiveInteger(
      session
        .youtubeOAuthClientId,
    );

  const userId =
    normalizePositiveInteger(
      session
        .youtubeOAuthUserId,
    );


  if (
    !storedState ||
    !clientId ||
    !userId
  ) {
    clearYouTubeOAuthSession(
      session,
    );

    throw serviceError(
      'YouTube OAuth context is missing. Please connect YouTube again.',
      400,
      'YOUTUBE_OAUTH_CONTEXT_MISSING',
    );
  }


  if (
    !isValidOAuthState(
      state,
      storedState,
    )
  ) {
    clearYouTubeOAuthSession(
      session,
    );

    throw serviceError(
      'Invalid YouTube OAuth state.',
      403,
      'YOUTUBE_OAUTH_STATE_INVALID',
    );
  }


  /**
   * State is single-use.
   */
  delete session
    .youtubeOAuthState;


  /**
   * User denied Google authorization.
   */
  if (error) {
    const message =
      errorDescription ||
      'YouTube authorization was cancelled.';

    setYouTubeOAuthOutcome(
      session,
      {
        status:
          'ERROR',

        reason:
          String(error),

        message,

        clientId,
        userId,
      },
    );


    clearYouTubeOAuthSession(
      session,
      {
        preserveOutcome:
          true,
      },
    );


    return {
      success:
        false,

      status:
        'ERROR',

      message,
    };
  }


  if (!code) {
    setYouTubeOAuthOutcome(
      session,
      {
        status:
          'ERROR',

        reason:
          'AUTH_CODE_MISSING',

        message:
          'Google did not return a YouTube authorization code.',

        clientId,
        userId,
      },
    );


    clearYouTubeOAuthSession(
      session,
      {
        preserveOutcome:
          true,
      },
    );


    throw serviceError(
      'YouTube authorization code is missing.',
      400,
      'YOUTUBE_AUTH_CODE_REQUIRED',
    );
  }


  /**
   * Validate again after returning
   * from Google.
   */
  await validateClient(
    clientId,
  );

  await assertYouTubeEnabled(
    clientId,
  );


  try {
    /* -----------------------------------------------------
     * 1. EXCHANGE AUTHORIZATION CODE
     * ----------------------------------------------------- */

    const tokenResult =
      await exchangeCodeForToken(
        code,
      );


    /* -----------------------------------------------------
     * 2. FETCH AUTHENTICATED YOUTUBE CHANNEL
     * ----------------------------------------------------- */

    const channel =
      await getAuthenticatedChannel(
        tokenResult.accessToken,
      );


    const channelId =
      String(
        channel.id,
      );

    const channelName =
      channel
        ?.snippet
        ?.title ||
      'YouTube channel';


    /* -----------------------------------------------------
     * 3. TOKEN EXPIRY
     * ----------------------------------------------------- */

    const tokenExpiresAt =
      calculateTokenExpiry(
        tokenResult.expiresIn,
      );


    /* -----------------------------------------------------
     * 4. ENCRYPT ACCESS TOKEN
     * ----------------------------------------------------- */

    const {
      encryptedToken,
      iv,
      authTag,
    } =
      encryptToken(
        tokenResult.accessToken,
      );


    /* -----------------------------------------------------
     * 5. ENCRYPT REFRESH TOKEN
     * ----------------------------------------------------- */

    let encryptedRefreshToken =
      null;

    let refreshIv =
      null;

    let refreshAuthTag =
      null;


    if (
      tokenResult.refreshToken
    ) {
      const encryptedRefresh =
        encryptToken(
          tokenResult.refreshToken,
        );

      encryptedRefreshToken =
        encryptedRefresh
          .encryptedToken;

      refreshIv =
        encryptedRefresh.iv;

      refreshAuthTag =
        encryptedRefresh
          .authTag;
    }


    /**
     * On reconnect Google may occasionally
     * omit a new refresh token.
     *
     * Existing DB refresh credentials will
     * be preserved by repository COALESCE.
     */
    if (
      !tokenResult.refreshToken
    ) {
      const existingConnection =
        await youtubeRepository
          .findByClientId(
            clientId,
          );

      const hasStoredRefreshToken =
        Boolean(
          existingConnection
            ?.refresh_token_encrypted &&
          existingConnection
            ?.refresh_token_iv &&
          existingConnection
            ?.refresh_token_auth_tag,
        );

      if (!hasStoredRefreshToken) {
        throw serviceError(
          'Google did not return a refresh token. Reconnect YouTube and grant access again.',
          409,
          'YOUTUBE_REFRESH_TOKEN_MISSING',
        );
      }
    }


    /* -----------------------------------------------------
     * 6. STORE NORMALIZED CONNECTION
     * ----------------------------------------------------- */

    const connection =
      await youtubeRepository
        .upsertConnection({
          clientId,

          connectedBy:
            userId,

          externalAccountId:
            channelId,

          externalAccountName:
            channelName,

          encryptedToken,

          iv,

          authTag,

          tokenExpiresAt,

          encryptedRefreshToken,

          refreshIv,

          refreshAuthTag,

          /**
           * Google does not normally
           * provide a fixed expiry for
           * normal refresh tokens.
           */
          refreshTokenExpiresAt:
            null,

          permissions:
            youtubeConfig.scopes,

          metadata:
            buildChannelMetadata(
              channel,
            ),
        });


    if (!connection) {
      throw serviceError(
        'YouTube connection could not be saved.',
        500,
        'YOUTUBE_CONNECTION_SAVE_FAILED',
      );
    }


    /* -----------------------------------------------------
     * 7. SAVE SAFE OAUTH RESULT
     * ----------------------------------------------------- */

    setYouTubeOAuthOutcome(
      session,
      {
        status:
          'CONNECTED',

        message:
          `YouTube channel "${channelName}" connected successfully.`,

        clientId,

        userId,

        connectionId:
          connection
            .connection_id,

        channelId,

        channelName,
      },
    );


    clearYouTubeOAuthSession(
      session,
      {
        preserveOutcome:
          true,
      },
    );


    return {
      success:
        true,

      status:
        'CONNECTED',

      connectionId:
        connection
          .connection_id,

      clientId,

      platform:
        'YOUTUBE',

      externalAccountId:
        channelId,

      externalAccountName:
        channelName,

      connectionStatus:
        'CONNECTED',

      reconnectRequired:
        false,

      channel:
        buildChannelMetadata(
          channel,
        ),
    };
  } catch (
    callbackError
  ) {
    const message =
      getGoogleErrorMessage(
        callbackError,
      ) ||
      callbackError.message ||
      'YouTube connection failed.';


    setYouTubeOAuthOutcome(
      session,
      {
        status:
          'ERROR',

        reason:
          getGoogleErrorCode(
            callbackError,
          ) ||
          callbackError
            ?.details
            ?.code ||
          'YOUTUBE_OAUTH_FAILED',

        message,

        clientId,

        userId,
      },
    );


    clearYouTubeOAuthSession(
      session,
      {
        preserveOutcome:
          true,
      },
    );


    throw callbackError;
  }
}


/* =========================================================
 * GOOGLE ERROR HELPERS
 * ========================================================= */

function getGoogleErrorCode(
  error,
) {
  const responseError =
    error
      ?.response
      ?.data
      ?.error;

  if (
    typeof responseError ===
    'string'
  ) {
    return responseError;
  }

  return (
    responseError
      ?.status ||
    responseError
      ?.errors?.[0]
      ?.reason ||
    responseError
      ?.code ||
    error
      ?.details
      ?.code ||
    null
  );
}


function getGoogleErrorMessage(
  error,
) {
  const data =
    error
      ?.response
      ?.data;

  if (
    typeof data?.error_description ===
    'string'
  ) {
    return data
      .error_description;
  }

  if (
    typeof data?.error?.message ===
    'string'
  ) {
    return data
      .error
      .message;
  }

  if (
    typeof data?.error ===
    'string'
  ) {
    return data.error;
  }

  return (
    error?.message ||
    null
  );
}


function isGoogleReauthError(
  error,
) {
  const status =
    Number(
      error
        ?.response
        ?.status,
    );

  const code =
    String(
      getGoogleErrorCode(
        error,
      ) || '',
    )
      .trim()
      .toLowerCase();

  const message =
    String(
      getGoogleErrorMessage(
        error,
      ) || '',
    )
      .trim()
      .toLowerCase();


  return (
    status === 401 ||

    code ===
      'invalid_grant' ||

    code ===
      'invalid_token' ||

    code ===
      'autherror' ||

    message.includes(
      'token has been expired',
    ) ||

    message.includes(
      'token has been revoked',
    ) ||

    (
      message.includes(
        'invalid',
      ) &&
      message.includes(
        'token',
      )
    )
  );
}


/* =========================================================
 * ACCESS TOKEN FRESHNESS
 * ========================================================= */

function isAccessTokenFresh(
  connection,
) {
  if (
    !connection
      ?.token_expires_at
  ) {
    return true;
  }

  const expiresAt =
    new Date(
      connection
        .token_expires_at,
    );

  if (
    Number.isNaN(
      expiresAt.getTime(),
    )
  ) {
    return false;
  }

  return (
    expiresAt.getTime() >
    Date.now() +
      ACCESS_TOKEN_EXPIRY_SKEW_MS
  );
}


/* =========================================================
 * DECRYPT ACCESS TOKEN
 * ========================================================= */

function decryptAccessToken(
  connection,
) {
  if (
    !connection
      ?.access_token_encrypted ||
    !connection
      ?.token_iv ||
    !connection
      ?.token_auth_tag
  ) {
    throw serviceError(
      'Stored YouTube access token is incomplete.',
      500,
      'YOUTUBE_ACCESS_TOKEN_STORAGE_INVALID',
    );
  }


  const accessToken =
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


  if (!accessToken) {
    throw serviceError(
      'Stored YouTube access token could not be decrypted.',
      500,
      'YOUTUBE_ACCESS_TOKEN_DECRYPT_FAILED',
    );
  }


  return accessToken;
}


/* =========================================================
 * DECRYPT REFRESH TOKEN
 * ========================================================= */

function decryptRefreshToken(
  connection,
) {
  if (
    !connection
      ?.refresh_token_encrypted ||
    !connection
      ?.refresh_token_iv ||
    !connection
      ?.refresh_token_auth_tag
  ) {
    throw serviceError(
      'Stored YouTube refresh token is unavailable. Reconnect YouTube.',
      409,
      'YOUTUBE_REAUTH_REQUIRED',
    );
  }


  const refreshToken =
    decryptToken({
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


  if (!refreshToken) {
    throw serviceError(
      'Stored YouTube refresh token could not be decrypted.',
      409,
      'YOUTUBE_REAUTH_REQUIRED',
    );
  }


  return refreshToken;
}


/* =========================================================
 * REQUEST NEW ACCESS TOKEN
 * ========================================================= */

async function refreshGoogleAccessToken(
  refreshToken,
) {
  ensureYouTubeConfig();


  const form =
    new URLSearchParams({
      client_id:
        String(
          youtubeConfig.clientId,
        ),

      client_secret:
        String(
          youtubeConfig.clientSecret,
        ),

      refresh_token:
        String(
          refreshToken,
        ),

      grant_type:
        'refresh_token',
    });


  const response =
    await axios.post(
      youtubeConfig.tokenUrl,
      form.toString(),
      {
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },

        timeout:
          15000,
      },
    );


  const accessToken =
    response.data
      ?.access_token;


  if (!accessToken) {
    throw serviceError(
      'Google did not return a refreshed YouTube access token.',
      502,
      'YOUTUBE_REFRESH_ACCESS_TOKEN_MISSING',
    );
  }


  return {
    accessToken,

    expiresIn:
      Number(
        response.data
          ?.expires_in,
      ) ||
      null,

    tokenType:
      response.data
        ?.token_type ||
      'Bearer',

    refreshToken:
      response.data
        ?.refresh_token ||
      null,
  };
}


/* =========================================================
 * REFRESH STORED ACCESS TOKEN
 * ========================================================= */

async function refreshStoredAccessToken(
  connection,
) {
  const connectionId =
    normalizePositiveInteger(
      connection
        ?.connection_id,
    );

  if (!connectionId) {
    throw serviceError(
      'YouTube connection ID is invalid.',
      500,
      'YOUTUBE_CONNECTION_INVALID',
    );
  }


  try {
    const refreshToken =
      decryptRefreshToken(
        connection,
      );


    const tokenResult =
      await refreshGoogleAccessToken(
        refreshToken,
      );


    const accessEncrypted =
      encryptToken(
        tokenResult.accessToken,
      );


    let encryptedRefreshToken =
      null;

    let refreshIv =
      null;

    let refreshAuthTag =
      null;


    /**
     * Google normally does not return a
     * new refresh token during refresh,
     * but support it if it does.
     */
    if (
      tokenResult.refreshToken
    ) {
      const refreshEncrypted =
        encryptToken(
          tokenResult.refreshToken,
        );

      encryptedRefreshToken =
        refreshEncrypted
          .encryptedToken;

      refreshIv =
        refreshEncrypted.iv;

      refreshAuthTag =
        refreshEncrypted
          .authTag;
    }


    const updated =
      await youtubeRepository
        .updateAccessToken({
          connectionId,

          encryptedToken:
            accessEncrypted
              .encryptedToken,

          iv:
            accessEncrypted.iv,

          authTag:
            accessEncrypted
              .authTag,

          tokenExpiresAt:
            calculateTokenExpiry(
              tokenResult
                .expiresIn,
            ),

          encryptedRefreshToken,

          refreshIv,

          refreshAuthTag,

          refreshTokenExpiresAt:
            null,
        });


    if (!updated) {
      throw serviceError(
        'Refreshed YouTube credentials could not be saved.',
        500,
        'YOUTUBE_TOKEN_UPDATE_FAILED',
      );
    }


    return {
      accessToken:
        tokenResult.accessToken,

      connection:
        updated,
    };
  } catch (
    refreshError
  ) {
    if (
      isGoogleReauthError(
        refreshError,
      ) ||
      refreshError
        ?.details
        ?.code ===
        'YOUTUBE_REAUTH_REQUIRED'
    ) {
      const message =
        'YouTube authorization is no longer valid. Please reconnect YouTube.';


      await youtubeRepository
        .markReauthRequired({
          connectionId,

          errorCode:
            getGoogleErrorCode(
              refreshError,
            ) ||
            'YOUTUBE_REAUTH_REQUIRED',

          message,
        });


      throw serviceError(
        message,
        409,
        'YOUTUBE_REAUTH_REQUIRED',
      );
    }


    throw refreshError;
  }
}


/* =========================================================
 * GET VALID ACCESS TOKEN
 * ========================================================= */

async function getValidAccessToken(
  connection,
) {
  if (
    isAccessTokenFresh(
      connection,
    )
  ) {
    return {
      accessToken:
        decryptAccessToken(
          connection,
        ),

      connection,
    };
  }


  return refreshStoredAccessToken(
    connection,
  );
}


/* =========================================================
 * TEST / VERIFY YOUTUBE CONNECTION
 * ========================================================= */

async function verifyConnection({
  clientId,
  connectionId,
}) {
  const normalizedClientId =
    normalizePositiveInteger(
      clientId,
    );

  const normalizedConnectionId =
    normalizePositiveInteger(
      connectionId,
    );


  if (!normalizedClientId) {
    throw serviceError(
      'Invalid client ID.',
      400,
      'INVALID_CLIENT_ID',
    );
  }


  if (!normalizedConnectionId) {
    throw serviceError(
      'Invalid YouTube connection ID.',
      400,
      'INVALID_CONNECTION_ID',
    );
  }


  const connection =
    await youtubeRepository
      .findByIdAndClientId(
        normalizedConnectionId,
        normalizedClientId,
      );


  if (!connection) {
    throw serviceError(
      'YouTube connection not found.',
      404,
      'YOUTUBE_CONNECTION_NOT_FOUND',
    );
  }


  if (
    String(
      connection.platform ||
      '',
    )
      .trim()
      .toUpperCase() !==
    'YOUTUBE'
  ) {
    throw serviceError(
      'The selected connection is not a YouTube connection.',
      400,
      'INVALID_YOUTUBE_CONNECTION',
    );
  }


  if (
    connection
      .client_connection_active ===
      false ||
    String(
      connection
        .connection_status ||
      '',
    )
      .trim()
      .toUpperCase() ===
      'DISCONNECTED'
  ) {
    throw serviceError(
      'YouTube is disconnected. Reconnect YouTube before testing the connection.',
      409,
      'YOUTUBE_CONNECTION_DISCONNECTED',
    );
  }


  const storedChannelId =
    String(
      connection
        .external_account_id ||
      '',
    )
      .trim();


  if (!storedChannelId) {
    throw serviceError(
      'Stored YouTube channel ID is missing.',
      500,
      'YOUTUBE_CHANNEL_ID_MISSING',
    );
  }


  try {
    let {
      accessToken,
    } =
      await getValidAccessToken(
        connection,
      );


    let channel;


    try {
      channel =
        await getAuthenticatedChannel(
          accessToken,
        );
    } catch (
      channelError
    ) {
      /**
       * If Google rejects an apparently
       * non-expired token, refresh it once
       * and retry the API request.
       */
      if (
        Number(
          channelError
            ?.response
            ?.status,
        ) === 401
      ) {
        const refreshed =
          await refreshStoredAccessToken(
            connection,
          );

        accessToken =
          refreshed.accessToken;


        channel =
          await getAuthenticatedChannel(
            accessToken,
          );
      } else {
        throw channelError;
      }
    }


    const returnedChannelId =
      String(
        channel.id,
      );


    if (
      returnedChannelId !==
      storedChannelId
    ) {
      throw serviceError(
        'Google returned a different YouTube channel than the stored connection.',
        409,
        'YOUTUBE_CHANNEL_ID_MISMATCH',
      );
    }


    const channelName =
      channel
        ?.snippet
        ?.title ||
      connection
        .external_account_name ||
      'YouTube channel';


    const updated =
      await youtubeRepository
        .markVerified({
          connectionId:
            normalizedConnectionId,

          externalAccountName:
            channelName,

          metadata:
            buildChannelMetadata(
              channel,
            ),
        });


    if (!updated) {
      throw serviceError(
        'YouTube verification status could not be updated.',
        500,
        'YOUTUBE_VERIFICATION_UPDATE_FAILED',
      );
    }


    return {
      connectionId:
        normalizedConnectionId,

      clientId:
        normalizedClientId,

      platform:
        'YOUTUBE',

      externalAccountId:
        returnedChannelId,

      externalAccountName:
        channelName,

      connectionStatus:
        'CONNECTED',

      verified:
        true,

      reconnectRequired:
        false,

      verifiedAt:
        updated
          .verified_at ||
        null,

      lastVerifiedAt:
        updated
          .last_verified_at ||
        null,

      channel:
        buildChannelMetadata(
          channel,
        ),
    };
  } catch (
    verificationError
  ) {
    if (
      verificationError
        ?.details
        ?.code ===
        'YOUTUBE_REAUTH_REQUIRED'
    ) {
      throw verificationError;
    }


    const reconnectRequired =
      isGoogleReauthError(
        verificationError,
      );


    const errorCode =
      String(
        getGoogleErrorCode(
          verificationError,
        ) ||
        verificationError
          ?.details
          ?.code ||
        'YOUTUBE_VERIFICATION_FAILED',
      );


    const errorMessage =
      getGoogleErrorMessage(
        verificationError,
      ) ||
      verificationError
        ?.message ||
      'YouTube connection verification failed.';


    if (reconnectRequired) {
      await youtubeRepository
        .markReauthRequired({
          connectionId:
            normalizedConnectionId,

          errorCode,

          message:
            errorMessage,
        });
    } else {
      await youtubeRepository
        .markVerificationFailed({
          connectionId:
            normalizedConnectionId,

          errorCode,

          errorMessage,

          reconnectRequired:
            false,
        });
    }


    if (
      verificationError instanceof
      ApiError
    ) {
      throw verificationError;
    }


    throw serviceError(
      reconnectRequired
        ? 'YouTube authorization is no longer valid. Please reconnect YouTube.'
        : errorMessage,

      reconnectRequired
        ? 409
        : 502,

      reconnectRequired
        ? 'YOUTUBE_REAUTH_REQUIRED'
        : 'YOUTUBE_VERIFICATION_FAILED',
    );
  }
}


/* =========================================================
 * EXPORTS
 * ========================================================= */

module.exports = {
  startOAuth,

  handleOAuthCallback,

  exchangeCodeForToken,

  getAuthenticatedChannel,

  refreshGoogleAccessToken,

  refreshStoredAccessToken,

  getValidAccessToken,

  verifyConnection,

  getOAuthOutcome,

  consumeOAuthOutcome,

  clearYouTubeOAuthSession,

  setYouTubeOAuthOutcome,

  assertYouTubeOAuthFresh,
};