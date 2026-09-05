'use strict';

const axios =
  require('axios');

const crypto =
  require('crypto');

const ApiError =
  require('../utils/ApiError');

const {
  config,
} = require(
  '../config/env'
);

const clientRepository =
  require(
    '../repositories/clientRepository'
  );

const socialConnectionService =
  require(
    './socialConnection.service'
  );


// ======================================================
// X CONFIGURATION
// ======================================================

const X_AUTHORIZE_URL =
  'https://x.com/i/oauth2/authorize';

const X_TOKEN_URL =
  'https://api.x.com/2/oauth2/token';

const OAUTH_STATE_TTL_MS =
  10 * 60 * 1000;


/**
 * OAuth scopes required by the application.
 *
 * offline.access is important because X access tokens
 * created through OAuth 2.0 PKCE normally expire.
 * This scope allows X to issue a refresh token.
 */
const DEFAULT_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'offline.access',
];


const FRONTEND_URL =
  config.frontendUrl ||
  config.frontendUrls?.[0] ||
  'http://localhost:5173';


// ======================================================
// ERROR HELPER
// ======================================================

function serviceError(
  message,
  status = 500,
  code = null
) {
  return new ApiError(
    status,
    message,
    code
      ? {
          code,
        }
      : {}
  );
}


// ======================================================
// USER ID NORMALIZER
// ======================================================

function getUserId(user) {
  return (
    user?.user_id ??
    user?.id ??
    user?.userId ??
    null
  );
}


// ======================================================
// POSITIVE INTEGER NORMALIZER
// ======================================================

function normalizePositiveInteger(
  value
) {
  const parsed =
    Number(value);

  return (
    Number.isInteger(parsed) &&
    parsed > 0
  )
    ? parsed
    : null;
}


// ======================================================
// BASE64 URL
// ======================================================

function base64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}


// ======================================================
// OAUTH STATE
// ======================================================

function createState() {
  return base64Url(
    crypto.randomBytes(32)
  );
}


// ======================================================
// PKCE
// ======================================================

function createPkcePair() {
  const verifier =
    base64Url(
      crypto.randomBytes(64)
    );

  const challenge =
    base64Url(
      crypto
        .createHash('sha256')
        .update(verifier)
        .digest()
    );

  return {
    verifier,
    challenge,
  };
}


// ======================================================
// CONSTANT-TIME STATE COMPARISON
// ======================================================

function safeEqual(
  first,
  second
) {
  const a =
    Buffer.from(
      String(first || ''),
      'utf8'
    );

  const b =
    Buffer.from(
      String(second || ''),
      'utf8'
    );

  if (
    a.length !==
    b.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    a,
    b
  );
}


// ======================================================
// X ENVIRONMENT CONFIGURATION
// ======================================================

function getXConfiguration() {
  const clientId =
    String(
      process.env.X_CLIENT_ID ||
      process.env.TWITTER_CLIENT_ID ||
      ''
    ).trim();

  const clientSecret =
    String(
      process.env.X_CLIENT_SECRET ||
      process.env.TWITTER_CLIENT_SECRET ||
      ''
    ).trim();

  const callbackUrl =
    String(
      process.env.X_CALLBACK_URL ||
      process.env.X_REDIRECT_URI ||
      ''
    ).trim();

  const configuredScopes =
    String(
      process.env.X_SCOPES ||
      ''
    )
      .split(/[\s,]+/)
      .map(
        (scope) =>
          scope.trim()
      )
      .filter(Boolean);

  return {
    clientId,
    clientSecret,
    callbackUrl,

    scopes:
      configuredScopes.length > 0
        ? configuredScopes
        : DEFAULT_SCOPES,
  };
}


// ======================================================
// VALIDATE X CONFIGURATION
// ======================================================

function ensureXConfig() {
  const xConfig =
    getXConfiguration();

  if (!xConfig.clientId) {
    throw serviceError(
      'X_CLIENT_ID is not configured.',
      500,
      'X_CONFIGURATION_ERROR'
    );
  }

  if (!xConfig.callbackUrl) {
    throw serviceError(
      'X_CALLBACK_URL is not configured.',
      500,
      'X_CONFIGURATION_ERROR'
    );
  }

  try {
    const callback =
      new URL(
        xConfig.callbackUrl
      );

    if (
      callback.protocol !==
        'http:' &&
      callback.protocol !==
        'https:'
    ) {
      throw new Error(
        'Invalid callback protocol.'
      );
    }
  } catch {
    throw serviceError(
      'X_CALLBACK_URL must be a valid HTTP or HTTPS URL.',
      500,
      'X_CONFIGURATION_ERROR'
    );
  }

  return xConfig;
}


// ======================================================
// FRONTEND REDIRECT URL
// ======================================================

function buildSocialConnectionsUrl() {
  return new URL(
    '/client/social-connections',
    FRONTEND_URL
  ).toString();
}


// ======================================================
// CLEAR OAUTH SESSION
// ======================================================

function clearOAuthSession(
  session,
  {
    preserveOutcome = false,
  } = {}
) {
  if (!session) {
    return;
  }

  delete session.xOAuthState;

  delete session
    .xOAuthCodeVerifier;

  delete session
    .xOAuthUserId;

  delete session
    .xOAuthClientId;

  delete session
    .xOAuthStartedAt;

  if (!preserveOutcome) {
    delete session
      .xOAuthOutcome;
  }
}


// ======================================================
// STORE ONE-TIME OAUTH OUTCOME
// ======================================================

function setOAuthOutcome(
  session,
  {
    status,
    reason = null,
    message = null,
    clientId,
    userId,
    connection = null,
  }
) {
  if (!session) {
    return;
  }

  session.xOAuthOutcome = {
    status,
    reason,
    message,

    clientId:
      normalizePositiveInteger(
        clientId
      ),

    userId:
      normalizePositiveInteger(
        userId
      ),

    connection:
      connection ||
      null,

    createdAt:
      Date.now(),
  };
}


// ======================================================
// OAUTH SESSION TTL
// ======================================================

function assertOAuthSessionFresh(
  session
) {
  const startedAt =
    Number(
      session
        ?.xOAuthStartedAt
    );

  if (
    !startedAt ||
    Date.now() -
      startedAt >
      OAUTH_STATE_TTL_MS
  ) {
    clearOAuthSession(
      session
    );

    throw serviceError(
      'X OAuth session expired. Please connect X again.',
      401,
      'X_OAUTH_EXPIRED'
    );
  }
}


// ======================================================
// CHECK X IS ENABLED FOR CLIENT
// ======================================================

async function assertXEnabledForClient(
  clientId
) {
  /*
   * Compatible with existing repository versions.
   *
   * connectTokenPlatform() also performs the
   * platform/client validation when required.
   */
  if (
    typeof clientRepository
      .getPlatformCodes !==
    'function'
  ) {
    return;
  }

  const platformCodes =
    await clientRepository
      .getPlatformCodes(
        clientId
      );

  const enabled =
    (
      Array.isArray(
        platformCodes
      )
        ? platformCodes
        : []
    )
      .map(
        (code) =>
          String(code || '')
            .trim()
            .toLowerCase()
      )
      .filter(Boolean);

  if (
    !enabled.includes(
      'x'
    )
  ) {
    throw serviceError(
      'X is not enabled for this client.',
      409,
      'PLATFORM_NOT_ENABLED_FOR_CLIENT'
    );
  }
}


// ======================================================
// START X OAUTH
// ======================================================

async function startOAuth({
  user,
  requestedClientId,
  session,
}) {
  if (!session) {
    throw serviceError(
      'OAuth session is unavailable.',
      500,
      'X_OAUTH_SESSION_MISSING'
    );
  }

  const userId =
    normalizePositiveInteger(
      getUserId(user)
    );

  const clientId =
    normalizePositiveInteger(
      requestedClientId
    );

  if (!userId) {
    throw serviceError(
      'Authenticated user is required.',
      401,
      'AUTHENTICATION_REQUIRED'
    );
  }

  if (!clientId) {
    throw serviceError(
      'Please select a client first.',
      409,
      'ACTIVE_CLIENT_REQUIRED'
    );
  }

  await assertXEnabledForClient(
    clientId
  );

  const xConfig =
    ensureXConfig();

  const state =
    createState();

  const {
    verifier,
    challenge,
  } =
    createPkcePair();


  /*
   * Remove stale X OAuth state before
   * beginning a new authorization flow.
   */
  clearOAuthSession(
    session
  );


  /*
   * Important:
   *
   * Our internal database client ID stays only
   * inside the authenticated server session.
   *
   * It is never placed in the X OAuth URL.
   */
  session.xOAuthState =
    state;

  session.xOAuthCodeVerifier =
    verifier;

  session.xOAuthUserId =
    userId;

  session.xOAuthClientId =
    clientId;

  session.xOAuthStartedAt =
    Date.now();


  const authorizationUrl =
    new URL(
      X_AUTHORIZE_URL
    );


  authorizationUrl
    .searchParams
    .set(
      'response_type',
      'code'
    );


  /*
   * This is the X Developer App Client ID.
   *
   * It is NOT clients.client_id from PostgreSQL.
   */
  authorizationUrl
    .searchParams
    .set(
      'client_id',
      xConfig.clientId
    );


  authorizationUrl
    .searchParams
    .set(
      'redirect_uri',
      xConfig.callbackUrl
    );


  authorizationUrl
    .searchParams
    .set(
      'scope',
      xConfig.scopes
        .join(' ')
    );


  authorizationUrl
    .searchParams
    .set(
      'state',
      state
    );


  authorizationUrl
    .searchParams
    .set(
      'code_challenge',
      challenge
    );


  authorizationUrl
    .searchParams
    .set(
      'code_challenge_method',
      'S256'
    );


  return {
    authorizationUrl:
      authorizationUrl
        .toString(),
  };
}


// ======================================================
// EXCHANGE AUTHORIZATION CODE
// ======================================================

async function exchangeCodeForToken({
  code,
  codeVerifier,
}) {
  const xConfig =
    ensureXConfig();

  const safeCode =
    String(
      code || ''
    ).trim();

  const safeVerifier =
    String(
      codeVerifier || ''
    ).trim();


  if (!safeCode) {
    throw serviceError(
      'X authorization code is required.',
      400,
      'X_AUTH_CODE_REQUIRED'
    );
  }


  if (!safeVerifier) {
    throw serviceError(
      'X PKCE verifier is required.',
      400,
      'X_PKCE_VERIFIER_REQUIRED'
    );
  }


  const body =
    new URLSearchParams();


  body.set(
    'code',
    safeCode
  );


  body.set(
    'grant_type',
    'authorization_code'
  );


  body.set(
    'redirect_uri',
    xConfig.callbackUrl
  );


  body.set(
    'code_verifier',
    safeVerifier
  );


  const headers = {
    'Content-Type':
      'application/x-www-form-urlencoded',
  };


  /*
   * Web App / confidential client.
   *
   * X allows confidential clients to authenticate
   * using HTTP Basic with Client ID + Client Secret.
   */
  if (xConfig.clientSecret) {
    const credentials =
      Buffer.from(
        `${xConfig.clientId}:${xConfig.clientSecret}`,
        'utf8'
      )
        .toString(
          'base64'
        );

    headers.Authorization =
      `Basic ${credentials}`;
  } else {
    /*
     * Public client fallback.
     *
     * Public clients must send client_id
     * in the form body.
     */
    body.set(
      'client_id',
      xConfig.clientId
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
      }
    );


  const tokenData =
    response?.data ||
    {};


  if (
    !String(
      tokenData.access_token ||
      ''
    ).trim()
  ) {
    throw serviceError(
      'X did not return an access token.',
      502,
      'X_ACCESS_TOKEN_MISSING'
    );
  }


  return tokenData;
}


// ======================================================
// HANDLE X CALLBACK
// ======================================================

async function handleOAuthCallback({
  query,
  session,
}) {
  if (!session) {
    throw serviceError(
      'X OAuth session is unavailable.',
      500,
      'X_OAUTH_SESSION_MISSING'
    );
  }


  const oauthUserId =
    normalizePositiveInteger(
      session
        .xOAuthUserId
    );


  const oauthClientId =
    normalizePositiveInteger(
      session
        .xOAuthClientId
    );


  const redirectUrl =
    buildSocialConnectionsUrl();


  // ----------------------------------------------------
  // USER CANCELLED / X RETURNED ERROR
  // ----------------------------------------------------

  if (query?.error) {
    const message =
      String(
        query
          .error_description ||
        query.error ||
        'X authorization was cancelled.'
      );


    setOAuthOutcome(
      session,
      {
        status:
          'ERROR',

        reason:
          String(
            query.error
          ),

        message,

        clientId:
          oauthClientId,

        userId:
          oauthUserId,
      }
    );


    clearOAuthSession(
      session,
      {
        preserveOutcome:
          true,
      }
    );


    return {
      redirectUrl,
    };
  }


  // ----------------------------------------------------
  // VALIDATE SESSION AGE
  // ----------------------------------------------------

  assertOAuthSessionFresh(
    session
  );


  // ----------------------------------------------------
  // VALIDATE STATE
  // ----------------------------------------------------

  const returnedState =
    String(
      query?.state ||
      ''
    );


  const expectedState =
    String(
      session
        .xOAuthState ||
      ''
    );


  if (
    !returnedState ||
    !expectedState ||
    !safeEqual(
      returnedState,
      expectedState
    )
  ) {
    clearOAuthSession(
      session
    );

    throw serviceError(
      'Invalid X OAuth state. Please reconnect X.',
      403,
      'X_OAUTH_STATE_MISMATCH'
    );
  }


  // ----------------------------------------------------
  // READ AUTHORIZATION CODE
  // ----------------------------------------------------

  const code =
    String(
      query?.code ||
      ''
    ).trim();


  const codeVerifier =
    String(
      session
        .xOAuthCodeVerifier ||
      ''
    ).trim();


  if (!code) {
    throw serviceError(
      'X authorization code is missing.',
      400,
      'X_AUTH_CODE_REQUIRED'
    );
  }


  if (!codeVerifier) {
    throw serviceError(
      'X PKCE verifier is missing. Please reconnect X.',
      401,
      'X_PKCE_VERIFIER_MISSING'
    );
  }


  // ----------------------------------------------------
  // VALIDATE OWNERSHIP
  // ----------------------------------------------------

  if (
    !oauthUserId ||
    !oauthClientId
  ) {
    clearOAuthSession(
      session
    );

    throw serviceError(
      'X OAuth ownership information is missing. Please reconnect X.',
      401,
      'X_OAUTH_OWNER_MISSING'
    );
  }


  // ----------------------------------------------------
  // EXCHANGE AUTHORIZATION CODE
  // ----------------------------------------------------

  let tokenData;


  try {
    tokenData =
      await exchangeCodeForToken({
        code,
        codeVerifier,
      });
  } catch (error) {
    const providerMessage =
      error
        ?.response
        ?.data
        ?.error_description ||
      error
        ?.response
        ?.data
        ?.detail ||
      error
        ?.response
        ?.data
        ?.error ||
      error?.message ||
      'X token exchange failed.';


    setOAuthOutcome(
      session,
      {
        status:
          'ERROR',

        reason:
          'TOKEN_EXCHANGE_FAILED',

        message:
          String(
            providerMessage
          ),

        clientId:
          oauthClientId,

        userId:
          oauthUserId,
      }
    );


    clearOAuthSession(
      session,
      {
        preserveOutcome:
          true,
      }
    );


    return {
      redirectUrl,
    };
  }


  // ----------------------------------------------------
  // ACCESS TOKEN
  // ----------------------------------------------------

  const accessToken =
    String(
      tokenData
        .access_token ||
      ''
    ).trim();


  if (!accessToken) {
    throw serviceError(
      'X did not return an access token.',
      502,
      'X_ACCESS_TOKEN_MISSING'
    );
  }


  /*
   * We intentionally do not store the refresh token
   * in this service yet.
   *
   * It will be passed into socialConnection.service.js
   * after we confirm the generic encrypted credential
   * storage contract.
   *
   * Never store refresh_token in plain text.
   */
  const refreshToken =
    String(
      tokenData
        .refresh_token ||
      ''
    ).trim();


  // ----------------------------------------------------
  // TOKEN EXPIRY
  // ----------------------------------------------------

  const expiresInSeconds =
    Number(
      tokenData
        .expires_in
    );


  const tokenExpiresAt =
    Number.isFinite(
      expiresInSeconds
    ) &&
    expiresInSeconds > 0
      ? new Date(
          Date.now() +
          expiresInSeconds *
            1000
        ).toISOString()
      : null;


  // ----------------------------------------------------
  // STORE X CONNECTION
  // ----------------------------------------------------

  let connection;


  try {
    connection =
      await socialConnectionService
        .connectTokenPlatform({
          clientId:
            oauthClientId,

          connectedBy:
            oauthUserId,

          platform:
            'X',

          accessToken,

          tokenExpiresAt,
        });
  } catch (error) {
    setOAuthOutcome(
      session,
      {
        status:
          'ERROR',

        reason:
          error
            ?.details
            ?.code ||
          'X_CONNECTION_FAILED',

        message:
          error?.message ||
          'X account could not be connected.',

        clientId:
          oauthClientId,

        userId:
          oauthUserId,
      }
    );


    clearOAuthSession(
      session,
      {
        preserveOutcome:
          true,
      }
    );


    return {
      redirectUrl,
    };
  }


  /*
   * refreshToken is intentionally not returned to React
   * and is never placed inside xOAuthOutcome.
   *
   * We will add encrypted refresh-token persistence
   * in the next backend step.
   */
  void refreshToken;


  // ----------------------------------------------------
  // SUCCESS OUTCOME
  // ----------------------------------------------------

  setOAuthOutcome(
    session,
    {
      status:
        'CONNECTED',

      message:
        'X account connected and verified successfully.',

      clientId:
        oauthClientId,

      userId:
        oauthUserId,

      connection,
    }
  );


  clearOAuthSession(
    session,
    {
      preserveOutcome:
        true,
    }
  );


  return {
    redirectUrl,
  };
}


// ======================================================
// GET ONE-TIME OAUTH RESULT
// ======================================================

function getOAuthOutcome({
  user,
  session,
  clientId,
}) {
  const currentUserId =
    normalizePositiveInteger(
      getUserId(user)
    );


  const currentClientId =
    normalizePositiveInteger(
      clientId
    );


  const outcome =
    session
      ?.xOAuthOutcome ||
    null;


  if (!outcome) {
    return null;
  }


  if (
    Number(
      outcome.userId
    ) !==
    currentUserId
  ) {
    throw serviceError(
      'X OAuth result belongs to another user.',
      403,
      'X_OAUTH_USER_MISMATCH'
    );
  }


  if (
    Number(
      outcome.clientId
    ) !==
    currentClientId
  ) {
    throw serviceError(
      'X OAuth result belongs to another client.',
      403,
      'X_OAUTH_CLIENT_MISMATCH'
    );
  }


  /*
   * One-time result.
   *
   * React receives it once after the OAuth redirect.
   */
  delete session
    .xOAuthOutcome;


  return outcome;
}


// ======================================================
// CANCEL X OAUTH
// ======================================================

function cancelOAuth(
  session
) {
  clearOAuthSession(
    session
  );


  return {
    cancelled:
      true,
  };
}


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  startOAuth,
  handleOAuthCallback,
  getOAuthOutcome,
  cancelOAuth,
};