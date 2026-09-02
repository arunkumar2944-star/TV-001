'use strict';

const axios = require('axios');
const crypto = require('crypto');

const ApiError = require('../utils/ApiError');
const { config } = require('../config/env');
const {
  encryptToken,
  decryptToken,
} = require('../utils/tokenEncryption');

const clientRepository =
  require('../repositories/clientRepository');

const socialConnectionRepository =
  require('../repositories/socialConnections.repository');

const {
  assertPlatformEnabled,
} = require(
  './clientPlatform.service'
);

const GRAPH_VERSION =
  config.meta?.graphVersion || 'v26.0';

const GRAPH_URL =
  `https://graph.facebook.com/${GRAPH_VERSION}`;

const OAUTH_STATE_TTL_MS =
  10 * 60 * 1000;

const FRONTEND_URL =
  config.frontendUrl ||
  config.frontendUrls?.[0] ||
  'http://localhost:5173';


/**
 * =====================================================
 * SERVICE ERROR
 * =====================================================
 */
function serviceError(
  message,
  status = 500,
  code
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


/**
 * =====================================================
 * USER HELPERS
 * =====================================================
 */
function getUserId(user) {
  return (
    user?.user_id ??
    user?.id ??
    user?.userId ??
    null
  );
}


function getUserClientId(user) {
  return (
    user?.client_id ??
    user?.clientId ??
    null
  );
}


function getUserRole(user) {
  return String(
    user?.role || ''
  )
    .trim()
    .toUpperCase();
}


/**
 * =====================================================
 * META CONFIGURATION
 * =====================================================
 */
function ensureMetaConfig() {
  if (!config.meta?.appId) {
    throw serviceError(
      'META_APP_ID is not configured',
      500,
      'META_CONFIGURATION_ERROR'
    );
  }

  if (!config.meta?.appSecret) {
    throw serviceError(
      'META_APP_SECRET is not configured',
      500,
      'META_CONFIGURATION_ERROR'
    );
  }

  if (!config.meta?.callbackUrl) {
    throw serviceError(
      'META_CALLBACK_URL is not configured',
      500,
      'META_CONFIGURATION_ERROR'
    );
  }
}


/**
 * =====================================================
 * CLEAR FACEBOOK OAUTH SESSION
 * =====================================================
 */
function clearOAuthSession(
  session,
  {
    preserveOutcome = false,
  } = {}
) {
  if (!session) {
    return;
  }

  delete session
    .facebookOAuthState;

  delete session
    .facebookOAuthUserId;

  delete session
    .facebookOAuthClientId;

  delete session
    .facebookOAuthStartedAt;

  delete session
    .facebookPages;

  if (!preserveOutcome) {
    delete session
      .facebookOAuthOutcome;
  }
}


/**
 * =====================================================
 * STORE SAFE OAUTH OUTCOME
 * =====================================================
 */
function setOAuthOutcome(
  session,
  {
    status,
    reason = null,
    message = null,
    clientId,
    userId,
    totalPages = 0,
  }
) {
  if (!session) {
    return;
  }

  session.facebookOAuthOutcome = {
    status,
    reason,
    message,

    clientId:
      Number(clientId) ||
      null,

    userId:
      Number(userId) ||
      null,

    totalPages:
      Number(totalPages) ||
      0,

    createdAt:
      Date.now(),
  };
}


/**
 * =====================================================
 * OAUTH EXPIRY CHECK
 * =====================================================
 */
function assertOAuthSessionFresh(
  session
) {
  const startedAt =
    Number(
      session
        ?.facebookOAuthStartedAt
    );

  if (
    !startedAt ||
    Date.now() - startedAt >
    OAUTH_STATE_TTL_MS
  ) {
    clearOAuthSession(
      session
    );

    throw serviceError(
      'Facebook OAuth session expired. Please connect Facebook again.',
      401,
      'FACEBOOK_OAUTH_EXPIRED'
    );
  }
}


/**
 * =====================================================
 * FRONTEND SOCIAL CONNECTION URL
 * =====================================================
 */
function buildSocialConnectionsUrl() {
  /*
   * Meta sends OAuth protocol query parameters
   * to the backend callback.
   *
   * React receives a clean frontend URL.
   *
   * React reads the result using the authenticated
   * session rather than OAuth tokens/query values.
   */
  return new URL(
    '/client/social-connections',
    FRONTEND_URL
  ).toString();
}


/**
 * =====================================================
 * META ERROR
 * =====================================================
 */
function getMetaError(error) {
  return (
    error
      ?.response
      ?.data
      ?.error ||
    null
  );
}


/**
 * =====================================================
 * EXCHANGE AUTHORIZATION CODE
 * =====================================================
 */
async function exchangeCodeForAccessToken(
  code
) {
  ensureMetaConfig();

  if (!code) {
    throw serviceError(
      'Facebook authorization code is required',
      400,
      'FACEBOOK_AUTH_CODE_REQUIRED'
    );
  }

  const response =
    await axios.get(
      `${GRAPH_URL}/oauth/access_token`,
      {
        params: {
          client_id:
            config.meta.appId,

          client_secret:
            config.meta.appSecret,

          redirect_uri:
            config.meta.callbackUrl,

          code,
        },

        timeout:
          15000,
      }
    );

  return response.data;
}


/**
 * =====================================================
 * EXCHANGE LONG-LIVED USER TOKEN
 * =====================================================
 */
async function exchangeForLongLivedToken(
  shortLivedToken
) {
  ensureMetaConfig();

  if (!shortLivedToken) {
    throw serviceError(
      'Short-lived Facebook access token is required',
      400,
      'FACEBOOK_SHORT_TOKEN_REQUIRED'
    );
  }

  const response =
    await axios.get(
      `${GRAPH_URL}/oauth/access_token`,
      {
        params: {
          grant_type:
            'fb_exchange_token',

          client_id:
            config.meta.appId,

          client_secret:
            config.meta.appSecret,

          fb_exchange_token:
            shortLivedToken,
        },

        timeout:
          15000,
      }
    );

  return response.data;
}


/**
 * =====================================================
 * GET MANAGED FACEBOOK PAGES
 * =====================================================
 */
async function getManagedPages(
  userAccessToken
) {
  if (!userAccessToken) {
    throw serviceError(
      'Facebook user access token is required',
      400,
      'FACEBOOK_USER_TOKEN_REQUIRED'
    );
  }

  const response =
    await axios.get(
      `${GRAPH_URL}/me/accounts`,
      {
        params: {
          fields:
            'id,name,category,access_token,tasks',

          access_token:
            userAccessToken,
        },

        timeout:
          15000,
      }
    );

  return response.data;
}


/**
 * =====================================================
 * VERIFY FACEBOOK PAGE
 * =====================================================
 */
async function verifyFacebookPage({
  pageId,
  accessToken,
}) {
  if (!pageId) {
    throw serviceError(
      'Facebook Page ID is required',
      400,
      'FACEBOOK_PAGE_ID_REQUIRED'
    );
  }

  if (!accessToken) {
    throw serviceError(
      'Facebook Page access token is required',
      400,
      'FACEBOOK_PAGE_TOKEN_REQUIRED'
    );
  }

  const response =
    await axios.get(
      `${GRAPH_URL}/${encodeURIComponent(
        String(pageId)
      )}`,
      {
        params: {
          fields:
            'id,name,category',

          access_token:
            accessToken,
        },

        timeout:
          15000,
      }
    );

  return response.data;
}


/**
 * =====================================================
 * FACEBOOK PAGE DETAILS
 * =====================================================
 */
async function getFacebookPageDetails({
  pageId,
  accessToken,
}) {
  if (
    !pageId ||
    !accessToken
  ) {
    throw serviceError(
      'Facebook Page ID and access token are required',
      400
    );
  }

  const response =
    await axios.get(
      `${GRAPH_URL}/${encodeURIComponent(
        String(pageId)
      )}`,
      {
        params: {
          fields:
            'id,name,category,link,picture',

          access_token:
            accessToken,
        },

        timeout:
          15000,
      }
    );

  return response.data;
}


/**
 * =====================================================
 * PUBLISH FACEBOOK TEXT POST
 * =====================================================
 */
async function publishFacebookTextPost({
  pageId,
  accessToken,
  message,
}) {
  if (
    !pageId ||
    !accessToken
  ) {
    throw serviceError(
      'Facebook Page ID and access token are required',
      400
    );
  }

  if (
    !message ||
    !String(message).trim()
  ) {
    throw serviceError(
      'Facebook post message is required',
      400
    );
  }

  const response =
    await axios.post(
      `${GRAPH_URL}/${encodeURIComponent(
        String(pageId)
      )}/feed`,
      null,
      {
        params: {
          message:
            String(message)
              .trim(),

          access_token:
            accessToken,
        },

        timeout:
          20000,
      }
    );

  return response.data;
}


/**
 * =====================================================
 * RESOLVE CLIENT FOR FACEBOOK OAUTH
 * =====================================================
 *
 * Social-account ownership belongs only to
 * CLIENT_ADMIN.
 *
 * PLATFORM_ADMIN may view enabled platform names,
 * but cannot start/manage OAuth connections.
 */
async function resolveClientForOAuth(
  user,
  requestedClientId
) {
  const userId =
    Number(
      getUserId(user)
    );

  const role =
    getUserRole(user);

  const userClientId =
    Number(
      getUserClientId(user)
    );

  const requested =
    Number(
      requestedClientId
    );

  /**
   * Authenticated user required.
   */
  if (
    !Number.isInteger(
      userId
    ) ||
    userId <= 0
  ) {
    throw serviceError(
      'Authenticated user information is missing.',
      401,
      'AUTH_USER_MISSING'
    );
  }

  /**
   * CLIENT_ADMIN only.
   */
  if (
    role !==
    'CLIENT_ADMIN'
  ) {
    throw serviceError(
      'Only the client administrator can manage social connections.',
      403,
      'CLIENT_ADMIN_REQUIRED'
    );
  }

  /**
   * CLIENT_ADMIN must belong to a client.
   */
  if (
    !Number.isInteger(
      userClientId
    ) ||
    userClientId <= 0
  ) {
    throw serviceError(
      'Your account is not associated with a client.',
      403,
      'CLIENT_ACCESS_DENIED'
    );
  }

  /**
   * Active client must exist.
   *
   * requestedClientId comes from:
   *
   * req.session.activeClientId
   *        ↓
   * requireActiveClient
   *        ↓
   * req.clientId
   */
  if (
    !Number.isInteger(
      requested
    ) ||
    requested <= 0
  ) {
    throw serviceError(
      'A valid active client is required.',
      409,
      'ACTIVE_CLIENT_REQUIRED'
    );
  }

  /**
   * Client Admin cannot operate on
   * another client's social connection.
   */
  if (
    requested !==
    userClientId
  ) {
    throw serviceError(
      'You do not have access to this client.',
      403,
      'CLIENT_ACCESS_DENIED'
    );
  }

  const client =
    await clientRepository
      .findById(
        userClientId
      );

  if (!client) {
    throw serviceError(
      'Client not found.',
      404,
      'CLIENT_NOT_FOUND'
    );
  }

  if (
    client.is_active ===
    false
  ) {
    throw serviceError(
      'This client is inactive.',
      409,
      'CLIENT_INACTIVE'
    );
  }

  return {
    clientId:
      userClientId,

    userId,
  };
}
async function assertFacebookEnabled(
  clientId
) {
  const enabled =
    await clientRepository
      .isPlatformEnabled(
        Number(clientId),
        'facebook'
      );

  if (!enabled) {
    throw serviceError(
      'Facebook is not enabled for this client.',
      409,
      'FACEBOOK_NOT_ENABLED'
    );
  }
}

/**
 * =====================================================
 * START FACEBOOK OAUTH
 * =====================================================
 */
async function startOAuth({
  user,
  requestedClientId,
  session,
}) {
  ensureMetaConfig();

  if (!session) {
    throw serviceError(
      'Session is unavailable.',
      500,
      'SESSION_UNAVAILABLE'
    );
  }

  const {
    clientId,
    userId,
  } =
    await resolveClientForOAuth(
      user,
      requestedClientId
    );
  await assertPlatformEnabled({
    clientId,
    platform: 'facebook',
  });
  /**
   * Cryptographically random state.
   */
  const state =
    crypto
      .randomBytes(32)
      .toString('hex');

  /**
   * Remove any previous unfinished
   * Facebook OAuth flow.
   */
  clearOAuthSession(
    session
  );

  /**
   * Trusted server-side OAuth context.
   *
   * Client ID does NOT come from URL/query.
   */
  session.facebookOAuthState =
    state;

  session.facebookOAuthUserId =
    userId;

  session.facebookOAuthClientId =
    clientId;

  session.facebookOAuthStartedAt =
    Date.now();

  const params =
    new URLSearchParams({
      client_id:
        String(
          config.meta.appId
        ),

      redirect_uri:
        config.meta.callbackUrl,

      response_type:
        'code',

      state,

      scope: [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
      ].join(','),
    });

  return {
    authorizationUrl:
      `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`,

    clientId,
    userId,
  };
}


/**
 * =====================================================
 * HANDLE FACEBOOK OAUTH CALLBACK
 * =====================================================
 */
async function handleOAuthCallback({
  query,
  session,
}) {
  /**
   * --------------------------------------------------
   * SESSION REQUIRED
   * --------------------------------------------------
   */
  if (!session) {
    throw serviceError(
      'Facebook OAuth session is unavailable.',
      400,
      'FACEBOOK_SESSION_MISSING'
    );
  }

  /**
   * --------------------------------------------------
   * READ META CALLBACK
   * --------------------------------------------------
   */
  const {
    code,
    state,
    error,

    error_description:
    errorDescription,

    error_reason:
    errorReason,
  } =
    query || {};

  /**
   * --------------------------------------------------
   * CHECK OAUTH SESSION AGE
   * --------------------------------------------------
   *
   * Perform this before accepting either
   * success or denial.
   */
  try {
    assertOAuthSessionFresh(
      session
    );
  } catch (errorObject) {
    clearOAuthSession(
      session
    );

    throw errorObject;
  }

  /**
   * --------------------------------------------------
   * READ TRUSTED SERVER-SIDE CONTEXT
   * --------------------------------------------------
   */
  const storedState =
    session
      .facebookOAuthState;

  const oauthUserId =
    Number(
      session
        .facebookOAuthUserId
    );

  const oauthClientId =
    Number(
      session
        .facebookOAuthClientId
    );

  /**
   * --------------------------------------------------
   * VALIDATE SESSION CONTEXT
   * --------------------------------------------------
   */
  if (
    !storedState ||
    !Number.isInteger(
      oauthUserId
    ) ||
    oauthUserId <= 0 ||
    !Number.isInteger(
      oauthClientId
    ) ||
    oauthClientId <= 0
  ) {
    clearOAuthSession(
      session
    );

    throw serviceError(
      'Facebook OAuth user/client context is missing. Please connect again.',
      400,
      'FACEBOOK_OAUTH_CONTEXT_MISSING'
    );
  }

  /**
   * --------------------------------------------------
   * VALIDATE OAUTH STATE
   * --------------------------------------------------
   *
   * Protects against OAuth CSRF and callbacks
   * not initiated by this session.
   */
  if (
    typeof state !==
    'string' ||
    !state ||
    state !==
    storedState
  ) {
    clearOAuthSession(
      session
    );

    throw serviceError(
      'Invalid Facebook OAuth state.',
      403,
      'FACEBOOK_OAUTH_STATE_INVALID'
    );
  }

  /**
   * --------------------------------------------------
   * CONSUME STATE
   * --------------------------------------------------
   *
   * State is one-time use.
   */
  delete session
    .facebookOAuthState;

  /**
   * --------------------------------------------------
   * USER DENIED FACEBOOK AUTHORIZATION
   * --------------------------------------------------
   */
  if (error) {
    const message =
      errorDescription ||
      errorReason ||
      String(error);

    clearOAuthSession(
      session
    );

    setOAuthOutcome(
      session,
      {
        status:
          'ERROR',

        reason:
          'authorization_denied',

        message,

        clientId:
          oauthClientId,

        userId:
          oauthUserId,
      }
    );

    return {
      redirectUrl:
        buildSocialConnectionsUrl(),

      denied:
        true,

      message,
    };
  }

  /**
   * --------------------------------------------------
   * AUTHORIZATION CODE REQUIRED
   * --------------------------------------------------
   */
  if (
    typeof code !==
    'string' ||
    !code
  ) {
    clearOAuthSession(
      session
    );

    throw serviceError(
      'Facebook authorization code is missing.',
      400,
      'FACEBOOK_AUTH_CODE_REQUIRED'
    );
  }

  /**
   * --------------------------------------------------
   * TOKEN EXCHANGE + PAGE LOAD
   * --------------------------------------------------
   */
  try {
    /**
     * Step 1:
     *
     * authorization code
     *      ↓
     * short-lived user token
     */
    const shortTokenResult =
      await exchangeCodeForAccessToken(
        code
      );

    const shortLivedToken =
      shortTokenResult
        ?.access_token;

    if (
      !shortLivedToken
    ) {
      throw serviceError(
        'Facebook did not return an access token.',
        502,
        'FACEBOOK_TOKEN_EXCHANGE_FAILED'
      );
    }

    /**
     * Step 2:
     *
     * short-lived user token
     *      ↓
     * long-lived user token
     */
    const longTokenResult =
      await exchangeForLongLivedToken(
        shortLivedToken
      );

    const userAccessToken =
      longTokenResult
        ?.access_token;

    if (
      !userAccessToken
    ) {
      throw serviceError(
        'Facebook did not return a long-lived access token.',
        502,
        'FACEBOOK_LONG_LIVED_TOKEN_FAILED'
      );
    }

    /**
     * Step 3:
     * retrieve Facebook Pages managed by
     * the authenticated Meta account.
     */
    const pagesResult =
      await getManagedPages(
        userAccessToken
      );

    const pages =
      Array.isArray(
        pagesResult?.data
      )
        ? pagesResult.data
        : [];

    /**
     * ------------------------------------------------
     * NO PAGES
     * ------------------------------------------------
     */
    if (
      !pages.length
    ) {
      clearOAuthSession(
        session
      );

      setOAuthOutcome(
        session,
        {
          status:
            'ERROR',

          reason:
            'no_pages',

          message:
            'No Facebook Pages were returned for this account.',

          clientId:
            oauthClientId,

          userId:
            oauthUserId,
        }
      );

      return {
        redirectUrl:
          buildSocialConnectionsUrl(),

        totalPages:
          0,
      };
    }

    /**
     * ------------------------------------------------
     * STORE TEMPORARY PAGE INFORMATION
     * ------------------------------------------------
     *
     * Page tokens remain only inside the
     * server-side Express session.
     *
     * React never receives accessToken.
     */
    session.facebookPages =
      pages
        .filter(
          (page) =>
            page?.id &&
            page?.access_token
        )
        .map(
          (page) => ({
            pageId:
              String(
                page.id
              ),

            pageName:
              page.name ||
              'Facebook Page',

            category:
              page.category ||
              null,

            tasks:
              Array.isArray(
                page.tasks
              )
                ? page.tasks
                : [],

            accessToken:
              page.access_token,
          })
        );

    /**
     * ------------------------------------------------
     * NO USABLE PAGE TOKEN
     * ------------------------------------------------
     */
    if (
      !session
        .facebookPages
        .length
    ) {
      clearOAuthSession(
        session
      );

      setOAuthOutcome(
        session,
        {
          status:
            'ERROR',

          reason:
            'no_publishable_pages',

          message:
            'No Page with a usable Page access token was returned.',

          clientId:
            oauthClientId,

          userId:
            oauthUserId,
        }
      );

      return {
        redirectUrl:
          buildSocialConnectionsUrl(),

        totalPages:
          0,
      };
    }

    /**
     * Start temporary Page-selection window.
     */
    session.facebookOAuthStartedAt =
      Date.now();

    /**
     * Safe result for React.
     */
    setOAuthOutcome(
      session,
      {
        status:
          'SELECT_PAGE',

        clientId:
          oauthClientId,

        userId:
          oauthUserId,

        totalPages:
          session
            .facebookPages
            .length,
      }
    );

    return {
      redirectUrl:
        buildSocialConnectionsUrl(),

      totalPages:
        session
          .facebookPages
          .length,
    };
  } catch (errorObject) {
    const metaError =
      getMetaError(
        errorObject
      );

    const message =
      errorObject instanceof
        ApiError
        ? errorObject.message
        : metaError?.message ||
        'Facebook could not complete authorization. Please try again.';

    /**
     * Never keep Page tokens or OAuth state
     * after an upstream failure.
     */
    clearOAuthSession(
      session
    );

    /**
     * Store only safe frontend outcome.
     */
    setOAuthOutcome(
      session,
      {
        status:
          'ERROR',

        reason:
          errorObject?.code ||
          'upstream_error',

        message,

        clientId:
          oauthClientId,

        userId:
          oauthUserId,
      }
    );

    return {
      redirectUrl:
        buildSocialConnectionsUrl(),

      totalPages:
        0,
    };
  }
}


/**
 * =====================================================
 * CANCEL FACEBOOK OAUTH
 * =====================================================
 */
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


/**
 * =====================================================
 * GET OAUTH OUTCOME
 * =====================================================
 */
function getOAuthOutcome({
  user,
  session,
  clientId,
}) {
  const outcome =
    session
      ?.facebookOAuthOutcome;

  if (!outcome) {
    return {
      status:
        'IDLE',

      reason:
        null,

      message:
        null,

      totalPages:
        0,
    };
  }

  const currentUserId =
    Number(
      getUserId(user)
    );

  const requestedClientId =
    Number(
      clientId
    );

  const outcomeAge =
    Date.now() -
    Number(
      outcome.createdAt ||
      0
    );

  if (
    !currentUserId ||
    currentUserId !==
    Number(
      outcome.userId
    ) ||
    !requestedClientId ||
    requestedClientId !==
    Number(
      outcome.clientId
    ) ||
    outcomeAge >
    OAUTH_STATE_TTL_MS
  ) {
    delete session
      .facebookOAuthOutcome;

    return {
      status:
        'IDLE',

      reason:
        null,

      message:
        null,

      totalPages:
        0,
    };
  }

  const result = {
    status:
      outcome.status ||
      'IDLE',

    reason:
      outcome.reason ||
      null,

    message:
      outcome.message ||
      null,

    totalPages:
      Number(
        outcome.totalPages
      ) ||
      0,
  };

  /**
   * Errors are one-shot notices.
   *
   * SELECT_PAGE stays until the user
   * selects/cancels.
   */
  if (
    result.status ===
    'ERROR'
  ) {
    delete session
      .facebookOAuthOutcome;
  }

  return result;
}


/**
 * =====================================================
 * VALIDATE FACEBOOK OAUTH OWNER
 * =====================================================
 *
 * Used by:
 *
 * getOAuthPages()
 * selectPage()
 *
 * Only CLIENT_ADMIN may continue an OAuth flow.
 */
function validateOAuthOwner({
  user,
  session,
  clientId,
}) {
  /**
   * Defence in depth:
   *
   * Even if route middleware is accidentally
   * changed later, Platform Admin cannot use
   * Facebook OAuth continuation operations.
   */
  if (
    getUserRole(user) !==
    'CLIENT_ADMIN'
  ) {
    throw serviceError(
      'Only the client administrator can manage social connections.',
      403,
      'CLIENT_ADMIN_REQUIRED'
    );
  }

  assertOAuthSessionFresh(
    session
  );

  const currentUserId =
    Number(
      getUserId(user)
    );

  const oauthUserId =
    Number(
      session
        ?.facebookOAuthUserId
    );

  const oauthClientId =
    Number(
      session
        ?.facebookOAuthClientId
    );

  const requestedClientId =
    Number(
      clientId
    );

  /**
   * Same authenticated user must continue
   * the OAuth flow.
   */
  if (
    !currentUserId ||
    !oauthUserId ||
    currentUserId !==
    oauthUserId
  ) {
    throw serviceError(
      'Facebook OAuth session belongs to another user. Please reconnect Facebook.',
      403,
      'FACEBOOK_SESSION_USER_MISMATCH'
    );
  }

  /**
   * Same active client must continue
   * the OAuth flow.
   */
  if (
    !requestedClientId ||
    !oauthClientId ||
    requestedClientId !==
    oauthClientId
  ) {
    throw serviceError(
      'Facebook OAuth session belongs to another client. Please reconnect Facebook.',
      403,
      'FACEBOOK_SESSION_CLIENT_MISMATCH'
    );
  }
}


/**
 * =====================================================
 * GET AVAILABLE FACEBOOK OAUTH PAGES
 * =====================================================
 */
async function getOAuthPages({
  user,
  session,
  clientId,
}) {
  validateOAuthOwner({
    user,
    session,
    clientId,
  });
 await assertPlatformEnabled({
  clientId,
  platform: 'facebook',
});
  const pages =
    session
      ?.facebookPages ||
    [];

  if (
    !pages.length
  ) {
    throw serviceError(
      'No Facebook Pages are available in this OAuth session. Please reconnect Facebook.',
      404,
      'FACEBOOK_PAGES_NOT_FOUND'
    );
  }

  /**
   * Never expose accessToken to React.
   */
  return {
    pages:
      pages.map(
        (page) => ({
          id:
            page.pageId,

          name:
            page.pageName,

          category:
            page.category,

          tasks:
            page.tasks,
        })
      ),
  };
}


/**
 * =====================================================
 * SELECT FACEBOOK PAGE
 * =====================================================
 */
async function selectPage({
  user,
  session,
  clientId,
  pageId,
}) {
  /**
   * Validate:
   *
   * - CLIENT_ADMIN role
   * - OAuth session freshness
   * - authenticated user ownership
   * - active client ownership
   */
  validateOAuthOwner({
    user,
    session,
    clientId,
  });
  await assertPlatformEnabled({
  clientId,
  platform: 'facebook',
});
  const connectedBy =
    Number(
      getUserId(user)
    );

  const normalizedClientId =
    Number(
      clientId
    );

  /**
   * clientId already comes from:
   *
   * requireActiveClient
   *      ↓
   * req.clientId
   */
  if (
    !Number.isInteger(
      normalizedClientId
    ) ||
    normalizedClientId <=
    0
  ) {
    throw serviceError(
      'A valid active client is required.',
      409,
      'ACTIVE_CLIENT_REQUIRED'
    );
  }

  if (!pageId) {
    throw serviceError(
      'Facebook Page ID is required.',
      400,
      'FACEBOOK_PAGE_ID_REQUIRED'
    );
  }

  /**
   * =================================================
   * FIND PAGE FROM SERVER SESSION ONLY
   * =================================================
   *
   * React sends only pageId.
   *
   * React must NEVER send:
   *
   * accessToken
   * Page token
   * OAuth user token
   */
  const pages =
    Array.isArray(
      session
        ?.facebookPages
    )
      ? session.facebookPages
      : [];

  const selectedPage =
    pages.find(
      (page) =>
        String(
          page.pageId
        ) ===
        String(
          pageId
        )
    );

  if (
    !selectedPage
  ) {
    throw serviceError(
      'Selected Facebook Page was not found in the current OAuth session.',
      400,
      'FACEBOOK_PAGE_NOT_FOUND'
    );
  }

  if (
    !selectedPage
      .accessToken
  ) {
    throw serviceError(
      'Facebook Page access token is missing.',
      400,
      'FACEBOOK_PAGE_TOKEN_MISSING'
    );
  }

  /**
   * =================================================
   * VERIFY PAGE/TOKEN WITH META
   * =================================================
   */
  let verifiedPage;

  try {
    verifiedPage =
      await verifyFacebookPage({
        pageId:
          selectedPage
            .pageId,

        accessToken:
          selectedPage
            .accessToken,
      });
  } catch (errorObject) {
    const metaError =
      getMetaError(
        errorObject
      );

    if (
      Number(
        metaError?.code
      ) ===
      190
    ) {
      throw serviceError(
        'Facebook authorization is no longer valid. Please reconnect Facebook.',
        409,
        'FACEBOOK_REAUTH_REQUIRED'
      );
    }

    throw serviceError(
      metaError?.message ||
      'Facebook Page verification failed.',
      502,
      'FACEBOOK_PAGE_VERIFICATION_FAILED'
    );
  }

  /**
   * Meta must return the exact Page selected
   * by this OAuth session.
   */
  if (
    !verifiedPage?.id ||
    String(
      verifiedPage.id
    ) !==
    String(
      selectedPage
        .pageId
    )
  ) {
    throw serviceError(
      'Facebook returned a different Page than the one selected.',
      409,
      'FACEBOOK_PAGE_ID_MISMATCH'
    );
  }

  /**
   * =================================================
   * ENCRYPT FACEBOOK PAGE ACCESS TOKEN
   * =================================================
   */
  const {
    encryptedToken,
    iv,
    authTag,
  } =
    encryptToken(
      selectedPage
        .accessToken
    );

  /**
   * =================================================
   * SAVE / REACTIVATE CONNECTION
   * =================================================
   *
   * Repository responsibilities:
   *
   * 1. Find/create global connection using:
   *
   *    platform = FACEBOOK
   *    external_account_id = Page ID
   *
   * 2. Update encrypted credentials when needed.
   *
   * 3. Create/reactivate client_social_connections
   *    for normalizedClientId.
   *
   * No duplicate global Facebook Page rows.
   */
  const connection =
    await socialConnectionRepository
      .upsertFacebookConnection({
        clientId:
          normalizedClientId,

        connectedBy,

        externalAccountId:
          selectedPage
            .pageId,

        externalAccountName:
          verifiedPage.name ||
          selectedPage
            .pageName,

        encryptedToken,

        iv,

        authTag,

        permissions:
          selectedPage.tasks ||
          [],

        metadata: {
          category:
            verifiedPage
              .category ||
            selectedPage
              .category ||
            null,

          graphVersion:
            GRAPH_VERSION,
        },
      });

  if (!connection) {
    throw serviceError(
      'Facebook connection could not be saved.',
      500,
      'FACEBOOK_CONNECTION_SAVE_FAILED'
    );
  }

  /**
   * =================================================
   * MARK CONNECTION VERIFIED
   * =================================================
   */
  const verifiedConnection =
    await socialConnectionRepository
      .markVerified({
        connectionId:
          connection
            .connection_id,

        externalAccountName:
          verifiedPage.name ||
          selectedPage
            .pageName,
      });

  /**
   * =================================================
   * REMOVE TEMPORARY OAUTH DATA
   * =================================================
   *
   * Removes:
   *
   * facebookOAuthState
   * facebookOAuthUserId
   * facebookOAuthClientId
   * facebookOAuthStartedAt
   * facebookPages
   * facebookOAuthOutcome
   *
   * Controller should persist this using
   * await saveSession(req).
   */
  clearOAuthSession(
    session
  );

  /**
   * =================================================
   * SAFE RESPONSE
   * =================================================
   *
   * Never return tokens.
   */
  const finalConnection = {
    ...connection,
    ...(
      verifiedConnection ||
      {}
    ),

    client_id:
      normalizedClientId,
  };

  return {
    connectionId:
      finalConnection
        .connection_id,

    clientId:
      normalizedClientId,

    platform:
      finalConnection
        .platform,

    externalAccountId:
      finalConnection
        .external_account_id,

    externalAccountName:
      finalConnection
        .external_account_name,

    /**
     * Temporary compatibility:
     *
     * Some repository code may expose
     * connection_status while normalized
     * tables use status.
     */
    connectionStatus:
      finalConnection
        .status ??
      finalConnection
        .connection_status ??
      null,

    verifiedAt:
      finalConnection
        .verified_at ||
      null,

    lastVerifiedAt:
      finalConnection
        .last_verified_at ||
      null,

    reconnectRequired:
      Boolean(
        finalConnection
          .reconnect_required
      ),
  };
}


/**
 * =====================================================
 * VERIFY EXISTING FACEBOOK CONNECTION
 * =====================================================
 */
async function verifyFacebookConnection(
  connection
) {
  if (!connection) {
    throw serviceError(
      'Facebook connection is missing.',
      404,
      'FACEBOOK_CONNECTION_MISSING'
    );
  }

  if (
    String(
      connection
        .connection_status ||
      ''
    )
      .toUpperCase() ===
    'DISCONNECTED'
  ) {
    throw serviceError(
      'Facebook is disconnected. Use Reconnect Facebook to authorize it again.',
      409,
      'FACEBOOK_CONNECTION_DISCONNECTED'
    );
  }

  const connectionId =
    connection
      .connection_id;

  if (
    !connectionId ||
    !connection
      .external_account_id
  ) {
    throw serviceError(
      'Stored Facebook connection is incomplete.',
      500,
      'FACEBOOK_CONNECTION_INVALID'
    );
  }

  if (
    !connection
      .access_token_encrypted ||
    !connection
      .token_iv ||
    !connection
      .token_auth_tag
  ) {
    throw serviceError(
      'Stored Facebook access token is incomplete.',
      500,
      'FACEBOOK_TOKEN_STORAGE_INVALID'
    );
  }

  try {
    /**
     * Decrypt only inside backend memory.
     */
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

    /**
     * Verify Page with Meta.
     */
    const page =
      await verifyFacebookPage({
        pageId:
          connection
            .external_account_id,

        accessToken,
      });

    if (
      !page?.id ||
      String(
        page.id
      ) !==
      String(
        connection
          .external_account_id
      )
    ) {
      throw serviceError(
        'Facebook Page ID does not match the stored connection.',
        409,
        'FACEBOOK_PAGE_ID_MISMATCH'
      );
    }

    /**
     * Persist successful verification.
     */
    const updated =
      await socialConnectionRepository
        .markVerified({
          connectionId,

          externalAccountName:
            page.name ||
            null,
        });

    if (!updated) {
      throw serviceError(
        'Facebook connection status could not be updated.',
        500,
        'FACEBOOK_CONNECTION_UPDATE_FAILED'
      );
    }

    return {
      connectionId:
        updated
          .connection_id,

      clientId:
        connection
          .client_id,

      platform:
        updated
          .platform,

      externalAccountId:
        updated
          .external_account_id,

      externalAccountName:
        updated
          .external_account_name,

      connectionStatus:
        updated
          .connection_status,

      verifiedAt:
        updated
          .verified_at,

      lastVerifiedAt:
        updated
          .last_verified_at,

      reconnectRequired:
        Boolean(
          updated
            .reconnect_required
        ),

      verified:
        true,

      page: {
        id:
          page.id,

        name:
          page.name ||
          null,

        category:
          page.category ||
          null,
      },
    };
  } catch (errorObject) {
    const metaError =
      getMetaError(
        errorObject
      );

    const metaCode =
      Number(
        metaError?.code
      );

    const reconnectRequired =
      metaCode ===
      190;

    const errorCode =
      reconnectRequired
        ? '190'
        : String(
          metaError?.code ??
          errorObject.code ??
          'FACEBOOK_VERIFICATION_ERROR'
        );

    const errorMessage =
      metaError?.message ||
      errorObject.message ||
      'Facebook verification failed.';

    /**
     * Try to persist verification failure.
     */
    try {
      await socialConnectionRepository
        .markVerificationFailed({
          connectionId,

          errorCode,

          errorMessage,

          reconnectRequired,
        });
    } catch (databaseError) {
      console.error(
        'Failed to persist Facebook verification error:',
        databaseError.message
      );
    }

    /**
     * Meta error 190 means token expired,
     * invalid, revoked, etc.
     */
    if (
      reconnectRequired
    ) {
      throw serviceError(
        'Facebook authorization is no longer valid. Please reconnect Facebook.',
        409,
        'FACEBOOK_REAUTH_REQUIRED'
      );
    }

    if (
      errorObject instanceof
      ApiError
    ) {
      throw errorObject;
    }

    throw serviceError(
      errorMessage,
      502,
      'FACEBOOK_VERIFICATION_FAILED'
    );
  }
}




/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */
module.exports = {
  startOAuth,

  handleOAuthCallback,

  getOAuthOutcome,

  cancelOAuth,

  getOAuthPages,

  selectPage,

  exchangeCodeForAccessToken,

  exchangeForLongLivedToken,

  getManagedPages,

  verifyFacebookPage,

  getFacebookPageDetails,

  publishFacebookTextPost,

  verifyFacebookConnection,
};