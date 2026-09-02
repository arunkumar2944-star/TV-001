'use strict';

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
const {
  assertPlatformEnabled,
} = require(
  './clientPlatform.service'
);

const axios =
  require('axios');
const crypto =
  require('crypto');

const clientRepository =
  require(
    '../repositories/clientRepository'
  );
const ApiError =
  require('../utils/ApiError');

const {
  config,
} = require('../config/env');


const GRAPH_VERSION =
  config.meta?.graphVersion ||
  'v26.0';

const GRAPH_URL =
  `https://graph.facebook.com/${GRAPH_VERSION}`;

const OAUTH_STATE_TTL_MS =
  10 * 60 * 1000;

const FRONTEND_URL =
  config.frontendUrl ||
  config.frontendUrls?.[0] ||
  'http://localhost:5173';

const INSTAGRAM_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
];

/**
 * =========================================================
 * SERVICE ERROR
 * =========================================================
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
 * =========================================================
 * GET META ERROR
 * =========================================================
 */

function getMetaError(
  error
) {
  return (
    error?.response
      ?.data
      ?.error ||
    null
  );
}


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


function ensureInstagramMetaConfig() {
  if (!config.meta?.appId) {
    throw serviceError(
      'META_APP_ID is not configured.',
      500,
      'META_CONFIGURATION_ERROR'
    );
  }

  if (!config.meta?.appSecret) {
    throw serviceError(
      'META_APP_SECRET is not configured.',
      500,
      'META_CONFIGURATION_ERROR'
    );
  }

  if (
    !config.meta
      ?.instagramCallbackUrl
  ) {
    throw serviceError(
      'META_INSTAGRAM_CALLBACK_URL is not configured.',
      500,
      'META_CONFIGURATION_ERROR'
    );
  }
}


function clearInstagramOAuthSession(
  session,
  {
    preserveOutcome = false,
  } = {}
) {
  if (!session) {
    return;
  }

  delete session
    .instagramOAuthState;

  delete session
    .instagramOAuthUserId;

  delete session
    .instagramOAuthClientId;

  delete session
    .instagramOAuthStartedAt;

  delete session
    .instagramAccounts;

  if (!preserveOutcome) {
    delete session
      .instagramOAuthOutcome;
  }
}


function setInstagramOAuthOutcome(
  session,
  {
    status,
    reason = null,
    message = null,
    clientId,
    userId,
    totalAccounts = 0,
  }
) {
  if (!session) {
    return;
  }

  session.instagramOAuthOutcome = {
    status,

    reason,

    message,

    clientId:
      Number(clientId) ||
      null,

    userId:
      Number(userId) ||
      null,

    totalAccounts:
      Number(
        totalAccounts
      ) || 0,

    createdAt:
      Date.now(),
  };
}


function assertInstagramOAuthFresh(
  session
) {
  const startedAt =
    Number(
      session
        ?.instagramOAuthStartedAt
    );

  if (
    !startedAt ||
    Date.now() -
    startedAt >
    OAUTH_STATE_TTL_MS
  ) {
    clearInstagramOAuthSession(
      session
    );

    throw serviceError(
      'Instagram OAuth session expired. Please connect Instagram again.',
      401,
      'INSTAGRAM_OAUTH_EXPIRED'
    );
  }
}


function buildSocialConnectionsUrl() {
  return new URL(
    '/client/social-connections',
    FRONTEND_URL
  ).toString();
}


// ======================================================
// RESOLVE CLIENT FOR INSTAGRAM OAUTH
// ======================================================

async function resolveClientForInstagramOAuth(
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
   * Only CLIENT_ADMIN owns
   * social connections.
   */
  if (
    role !==
    'CLIENT_ADMIN'
  ) {
    throw serviceError(
      'Only the client administrator can manage Instagram connections.',
      403,
      'CLIENT_ADMIN_REQUIRED'
    );
  }


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
   * req.clientId should already
   * come from requireActiveClient.
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
   * Never allow a Client Admin
   * to operate on another client.
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
/**
 * =========================================================
 * GET INSTAGRAM ACCOUNT DETAILS
 * =========================================================
 *
 * Instagram API with Facebook Login uses:
 *
 * graph.facebook.com
 *
 * and a Facebook Page access token.
 *
 * We do NOT use:
 *
 * graph.instagram.com
 *
 * for this Facebook Login architecture.
 */

async function getInstagramAccountDetails({
  instagramUserId,
  pageAccessToken,
}) {
  if (!instagramUserId) {
    throw serviceError(
      'Instagram account ID is required.',
      400,
      'INSTAGRAM_ACCOUNT_ID_REQUIRED'
    );
  }

  if (!pageAccessToken) {
    throw serviceError(
      'Facebook Page access token is required.',
      400,
      'INSTAGRAM_PAGE_TOKEN_REQUIRED'
    );
  }

  try {
    const response =
      await axios.get(
        `${GRAPH_URL}/${encodeURIComponent(
          String(
            instagramUserId
          )
        )}`,
        {
          params: {
            fields: [
              'id',
              'username',
              'name',
              'profile_picture_url',
            ].join(','),

            access_token:
              pageAccessToken,
          },

          timeout: 15000,
        }
      );

    return response.data;
  } catch (error) {
    const metaError =
      getMetaError(
        error
      );

    throw serviceError(
      metaError?.message ||
      'Instagram account details could not be loaded.',
      502,
      'INSTAGRAM_ACCOUNT_LOOKUP_FAILED'
    );
  }
}


/**
 * =========================================================
 * GET MANAGED INSTAGRAM ACCOUNTS
 * =========================================================
 *
 * FLOW:
 *
 * Facebook user token
 *      ↓
 * /me/accounts
 *      ↓
 * Facebook Pages
 *      ↓
 * instagram_business_account
 *      ↓
 * Instagram Professional Account
 *
 * The returned Page access token is kept only
 * on the backend.
 */

async function getManagedInstagramAccounts(
  userAccessToken
) {
  if (!userAccessToken) {
    throw serviceError(
      'Meta user access token is required.',
      400,
      'META_USER_TOKEN_REQUIRED'
    );
  }

  let pageResponse;

  try {
    pageResponse =
      await axios.get(
        `${GRAPH_URL}/me/accounts`,
        {
          params: {
            fields: [
              'id',
              'name',
              'access_token',
              'tasks',
              'instagram_business_account',
            ].join(','),

            access_token:
              userAccessToken,
          },

          timeout: 15000,
        }
      );
  } catch (error) {
    const metaError =
      getMetaError(
        error
      );

    throw serviceError(
      metaError?.message ||
      'Facebook Pages could not be loaded for Instagram.',
      502,
      'INSTAGRAM_PAGE_DISCOVERY_FAILED'
    );
  }


  const pages =
    Array.isArray(
      pageResponse
        ?.data
        ?.data
    )
      ? pageResponse.data.data
      : [];


  /**
   * Only Pages linked to an Instagram
   * Professional account are useful.
   */

  const linkedPages =
    pages.filter(
      (page) =>
        page?.id &&
        page?.access_token &&
        page
          ?.instagram_business_account
          ?.id
    );


  if (!linkedPages.length) {
    return [];
  }


  /**
   * Get safe Instagram profile details
   * for every linked account.
   */

  const accounts =
    [];

  for (
    const page of linkedPages
  ) {
    const instagramUserId =
      String(
        page
          .instagram_business_account
          .id
      );

    try {
      const instagramAccount =
        await getInstagramAccountDetails({
          instagramUserId,

          pageAccessToken:
            page.access_token,
        });


      accounts.push({
        /**
         * Safe Instagram identity.
         */

        instagramUserId:
          String(
            instagramAccount.id
          ),

        username:
          instagramAccount
            .username ||
          null,

        name:
          instagramAccount
            .name ||
          null,

        profilePictureUrl:
          instagramAccount
            .profile_picture_url ||
          null,


        /**
         * Facebook Page relationship.
         */

        facebookPageId:
          String(
            page.id
          ),

        facebookPageName:
          page.name ||
          null,

        tasks:
          Array.isArray(
            page.tasks
          )
            ? page.tasks
            : [],


        /**
         * IMPORTANT:
         *
         * This token remains backend-only.
         *
         * Never send it to React.
         */
        pageAccessToken:
          page.access_token,
      });
    } catch (error) {
      /**
       * One bad Page should not stop
       * discovery of other valid accounts.
       */
      if (
        config.nodeEnv !==
        'production'
      ) {
        console.warn(
          'Instagram account discovery skipped one Page:',
          {
            pageId:
              page.id,

            error:
              error.message,
          }
        );
      }
    }
  }


  return accounts;
}


// ======================================================
// SELECT / CONNECT INSTAGRAM ACCOUNT
// ======================================================
//
// POST
// /api/client/social-connections/instagram/connect
//
// Body:
// {
//   "instagramUserId": "1784..."
// }
//
// IMPORTANT:
//
// React sends ONLY the Instagram account ID.
// Access tokens remain in the encrypted
// server-side OAuth session.
//
// ======================================================

// async function selectInstagramAccount(
//   req,
//   res,
//   next
// ) {
//   try {
//     const {
//       instagramUserId,
//     } = req.body || {};


//     const result =
//       await instagramService
//         .selectInstagramAccount({
//           user:
//             req.user,

//           session:
//             req.session,

//           clientId:
//             req.clientId,

//           instagramUserId,
//         });


//     /*
//      * selectInstagramAccount() clears
//      * temporary OAuth session data after
//      * successful database persistence.
//      *
//      * Save that cleanup to PostgreSQL.
//      */
//     await saveSession(req);


//     return res
//       .status(200)
//       .json({
//         success: true,
//         data: result,
//       });
//   } catch (error) {
//     return next(error);
//   }
// }

/**
 * =========================================================
 * SAFE ACCOUNT RESPONSE
 * =========================================================
 *
 * Convert internal account objects into
 * frontend-safe objects.
 *
 * pageAccessToken is intentionally removed.
 */

function sanitizeInstagramAccounts(
  accounts
) {
  if (
    !Array.isArray(
      accounts
    )
  ) {
    return [];
  }

  return accounts.map(
    (account) => ({
      id:
        account.instagramUserId,

      username:
        account.username,

      name:
        account.name,

      profilePictureUrl:
        account.profilePictureUrl,

      facebookPageId:
        account.facebookPageId,

      facebookPageName:
        account.facebookPageName,
    })
  );
}


// ======================================================
// EXCHANGE INSTAGRAM OAUTH CODE
// ======================================================

async function exchangeCodeForAccessToken(
  code
) {
  ensureInstagramMetaConfig();

  if (!code) {
    throw serviceError(
      'Instagram authorization code is required.',
      400,
      'INSTAGRAM_AUTH_CODE_REQUIRED'
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
            config.meta
              .instagramCallbackUrl,

          code,
        },

        timeout: 15000,
      }
    );

  return response.data;
}


// ======================================================
// EXCHANGE FOR LONG-LIVED META TOKEN
// ======================================================

async function exchangeForLongLivedToken(
  shortLivedToken
) {
  ensureInstagramMetaConfig();

  if (!shortLivedToken) {
    throw serviceError(
      'Short-lived Meta token is required.',
      400,
      'INSTAGRAM_SHORT_TOKEN_REQUIRED'
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

        timeout: 15000,
      }
    );

  return response.data;
}


// ======================================================
// START INSTAGRAM OAUTH
// ======================================================

async function startOAuth({
  user,
  requestedClientId,
  session,
}) {
  ensureInstagramMetaConfig();

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
    await resolveClientForInstagramOAuth(
      user,
      requestedClientId
    );
  await assertPlatformEnabled({
    clientId,
    platform: 'instagram',
  });

  const state =
    crypto
      .randomBytes(32)
      .toString('hex');


  clearInstagramOAuthSession(
    session
  );


  session.instagramOAuthState =
    state;

  session.instagramOAuthUserId =
    userId;

  session.instagramOAuthClientId =
    clientId;

  session.instagramOAuthStartedAt =
    Date.now();


  const params =
    new URLSearchParams({
      client_id:
        String(
          config.meta.appId
        ),

      redirect_uri:
        config.meta
          .instagramCallbackUrl,

      response_type:
        'code',

      state,

      scope:
        INSTAGRAM_SCOPES
          .join(','),
    });


  return {
    authorizationUrl:
      `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`,

    clientId,

    userId,
  };
}

// ======================================================
// HANDLE INSTAGRAM OAUTH CALLBACK
// ======================================================

async function handleOAuthCallback({
  query,
  session,
}) {
  if (!session) {
    throw serviceError(
      'Instagram OAuth session is unavailable.',
      400,
      'INSTAGRAM_SESSION_MISSING'
    );
  }


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


  /*
   * ====================================================
   * 1. CHECK SESSION EXPIRY
   * ====================================================
   */

  assertInstagramOAuthFresh(
    session
  );


  /*
   * ====================================================
   * 2. READ TRUSTED SERVER-SIDE CONTEXT
   * ====================================================
   */

  const storedState =
    session.instagramOAuthState;

  const oauthUserId =
    Number(
      session.instagramOAuthUserId
    );

  const oauthClientId =
    Number(
      session.instagramOAuthClientId
    );


  /*
   * ====================================================
   * 3. VALIDATE OAUTH CONTEXT
   * ====================================================
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
    clearInstagramOAuthSession(
      session
    );

    throw serviceError(
      'Instagram OAuth user/client context is missing. Please connect again.',
      400,
      'INSTAGRAM_OAUTH_CONTEXT_MISSING'
    );
  }


  /*
   * ====================================================
   * 4. VALIDATE STATE
   * ====================================================
   *
   * State MUST be checked before processing
   * either success or denial.
   */

  if (
    typeof state !== 'string' ||
    !state ||
    state !== storedState
  ) {
    clearInstagramOAuthSession(
      session
    );

    throw serviceError(
      'Invalid Instagram OAuth state.',
      403,
      'INSTAGRAM_OAUTH_STATE_INVALID'
    );
  }


  /*
   * ====================================================
   * 5. CONSUME ONE-TIME STATE
   * ====================================================
   */

  delete session
    .instagramOAuthState;


  /*
   * ====================================================
   * 6. USER DENIED AUTHORIZATION
   * ====================================================
   */

  if (error) {
    const message =
      errorDescription ||
      errorReason ||
      String(error);

    clearInstagramOAuthSession(
      session
    );

    setInstagramOAuthOutcome(
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

      denied: true,

      message,
    };
  }


  /*
   * ====================================================
   * 7. AUTHORIZATION CODE REQUIRED
   * ====================================================
   */

  if (
    typeof code !== 'string' ||
    !code
  ) {
    clearInstagramOAuthSession(
      session
    );

    throw serviceError(
      'Instagram authorization code is missing.',
      400,
      'INSTAGRAM_AUTH_CODE_REQUIRED'
    );
  }


  try {
    /*
     * ==================================================
     * 8. AUTH CODE → SHORT-LIVED TOKEN
     * ==================================================
     */
    await assertPlatformEnabled({
      clientId:
        oauthClientId,

      platform:
        'instagram',
    });

    const shortTokenResult =
      await exchangeCodeForAccessToken(
        code
      );

    const shortLivedToken =
      shortTokenResult
        ?.access_token;

    if (!shortLivedToken) {
      throw serviceError(
        'Meta did not return an access token.',
        502,
        'INSTAGRAM_TOKEN_EXCHANGE_FAILED'
      );
    }


    /*
     * ==================================================
     * 9. SHORT-LIVED → LONG-LIVED USER TOKEN
     * ==================================================
     */

    const longTokenResult =
      await exchangeForLongLivedToken(
        shortLivedToken
      );

    const userAccessToken =
      longTokenResult
        ?.access_token;

    if (!userAccessToken) {
      throw serviceError(
        'Meta did not return a long-lived access token.',
        502,
        'INSTAGRAM_LONG_LIVED_TOKEN_FAILED'
      );
    }


    /*
     * ==================================================
     * 10. DISCOVER LINKED INSTAGRAM ACCOUNTS
     * ==================================================
     *
     * User token
     *    ↓
     * Facebook Pages
     *    ↓
     * instagram_business_account
     *    ↓
     * Instagram Professional account
     */

    const accounts =
      await getManagedInstagramAccounts(
        userAccessToken
      );


    /*
     * ==================================================
     * 11. NO INSTAGRAM ACCOUNT FOUND
     * ==================================================
     */

    if (
      !Array.isArray(
        accounts
      ) ||
      !accounts.length
    ) {
      clearInstagramOAuthSession(
        session
      );

      setInstagramOAuthOutcome(
        session,
        {
          status:
            'ERROR',

          reason:
            'no_instagram_accounts',

          message:
            'No linked Instagram Professional account was found.',

          clientId:
            oauthClientId,

          userId:
            oauthUserId,
        }
      );

      return {
        redirectUrl:
          buildSocialConnectionsUrl(),

        totalAccounts: 0,
      };
    }


    /*
     * ==================================================
     * 12. STORE TEMPORARY ACCOUNT DATA
     * ==================================================
     *
     * IMPORTANT:
     *
     * Internal account objects contain the
     * Facebook Page access token.
     *
     * This remains backend-only inside our
     * encrypted PostgreSQL Express session.
     */

    session.instagramAccounts =
      accounts;


    /*
     * Start a new timeout window for
     * account selection.
     */

    session.instagramOAuthStartedAt =
      Date.now();


    /*
     * ==================================================
     * 13. SAFE FRONTEND OUTCOME
     * ==================================================
     */

    setInstagramOAuthOutcome(
      session,
      {
        status:
          'SELECT_ACCOUNT',

        clientId:
          oauthClientId,

        userId:
          oauthUserId,

        totalAccounts:
          accounts.length,
      }
    );


    return {
      redirectUrl:
        buildSocialConnectionsUrl(),

      totalAccounts:
        accounts.length,
    };
  } catch (errorObject) {
    const metaError =
      getMetaError(
        errorObject
      );

    const message =
      errorObject instanceof ApiError
        ? errorObject.message
        : metaError?.message ||
        'Instagram authorization could not be completed. Please try again.';


    /*
     * Remove tokens / temporary accounts.
     */

    clearInstagramOAuthSession(
      session
    );


    /*
     * Store only safe error information
     * for React.
     */

    setInstagramOAuthOutcome(
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

      totalAccounts: 0,
    };
  }
}


// ======================================================
// VALIDATE INSTAGRAM OAUTH OWNER
// ======================================================

function validateOAuthOwner({
  user,
  session,
  clientId,
}) {
  assertInstagramOAuthFresh(
    session
  );


  const currentUserId =
    Number(
      getUserId(user)
    );

  const oauthUserId =
    Number(
      session
        ?.instagramOAuthUserId
    );

  const oauthClientId =
    Number(
      session
        ?.instagramOAuthClientId
    );

  const requestedClientId =
    Number(clientId);


  /*
   * Same authenticated user
   * must complete the flow.
   */

  if (
    !Number.isInteger(
      currentUserId
    ) ||
    currentUserId <= 0 ||
    !Number.isInteger(
      oauthUserId
    ) ||
    oauthUserId <= 0 ||
    currentUserId !==
    oauthUserId
  ) {
    throw serviceError(
      'Instagram OAuth session belongs to another user. Please reconnect Instagram.',
      403,
      'INSTAGRAM_SESSION_USER_MISMATCH'
    );
  }


  /*
   * Same active client
   * must complete the flow.
   */

  if (
    !Number.isInteger(
      requestedClientId
    ) ||
    requestedClientId <= 0 ||
    !Number.isInteger(
      oauthClientId
    ) ||
    oauthClientId <= 0 ||
    requestedClientId !==
    oauthClientId
  ) {
    throw serviceError(
      'Instagram OAuth session belongs to another client. Please reconnect Instagram.',
      403,
      'INSTAGRAM_SESSION_CLIENT_MISMATCH'
    );
  }
}


// ======================================================
// GET INSTAGRAM OAUTH ACCOUNTS
// ======================================================
//
// Returns only frontend-safe account data.
//
// Internal session data may contain:
// pageAccessToken
//
// sanitizeInstagramAccounts()
// removes that token before React receives anything.
//
// ======================================================

async function getOAuthAccounts({
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
    platform: 'instagram',
  });


  const accounts =
    Array.isArray(
      session?.instagramAccounts
    )
      ? session.instagramAccounts
      : [];


  if (!accounts.length) {
    throw serviceError(
      'No Instagram accounts are available in this OAuth session. Please reconnect Instagram.',
      404,
      'INSTAGRAM_ACCOUNTS_NOT_FOUND'
    );
  }


  return {
    accounts:
      sanitizeInstagramAccounts(
        accounts
      ),
  };
}


// ======================================================
// SELECT / CONNECT INSTAGRAM ACCOUNT
// ======================================================

async function selectInstagramAccount({
  user,
  session,
  clientId,
  instagramUserId,
}) {
  /*
   * Verify that this OAuth session belongs
   * to the same authenticated user/client.
   */
  validateOAuthOwner({
    user,
    session,
    clientId,
  });
await assertPlatformEnabled({
  clientId,
  platform: 'instagram',
});

  const normalizedClientId =
    Number(clientId);

  const connectedBy =
    Number(
      getUserId(user)
    );


  if (
    !Number.isInteger(
      normalizedClientId
    ) ||
    normalizedClientId <= 0
  ) {
    throw serviceError(
      'A valid active client is required.',
      409,
      'ACTIVE_CLIENT_REQUIRED'
    );
  }


  if (!instagramUserId) {
    throw serviceError(
      'Instagram account ID is required.',
      400,
      'INSTAGRAM_ACCOUNT_ID_REQUIRED'
    );
  }


  /*
   * =====================================================
   * FIND ACCOUNT FROM SERVER SESSION ONLY
   * =====================================================
   *
   * React sends only:
   *
   * {
   *   instagramUserId: "..."
   * }
   *
   * It must NOT send us an access token.
   */

  const accounts =
    Array.isArray(
      session?.instagramAccounts
    )
      ? session.instagramAccounts
      : [];


  const selectedAccount =
    accounts.find(
      (account) =>
        String(
          account.instagramUserId
        ) ===
        String(
          instagramUserId
        )
    );


  if (!selectedAccount) {
    throw serviceError(
      'Selected Instagram account was not found in the current OAuth session.',
      400,
      'INSTAGRAM_ACCOUNT_NOT_FOUND'
    );
  }


  /*
   * The token was discovered by our backend
   * during Meta OAuth.
   */
  const pageAccessToken =
    selectedAccount
      .pageAccessToken;


  if (!pageAccessToken) {
    throw serviceError(
      'Instagram Page access token is missing.',
      400,
      'INSTAGRAM_PAGE_TOKEN_MISSING'
    );
  }


  /*
   * =====================================================
   * VERIFY INSTAGRAM ACCOUNT WITH META
   * =====================================================
   */

  let verifiedAccount;

  try {
    verifiedAccount =
      await getInstagramAccountDetails({
        instagramUserId:
          selectedAccount
            .instagramUserId,

        pageAccessToken,
      });
  } catch (errorObject) {
    const metaError =
      getMetaError(
        errorObject
      );

    /*
     * Meta error 190 usually means the
     * access token is invalid/expired.
     */
    if (
      Number(
        metaError?.code
      ) === 190
    ) {
      throw serviceError(
        'Instagram authorization is no longer valid. Please reconnect Instagram.',
        409,
        'INSTAGRAM_REAUTH_REQUIRED'
      );
    }

    if (
      errorObject instanceof
      ApiError
    ) {
      throw errorObject;
    }

    throw serviceError(
      metaError?.message ||
      'Instagram account verification failed.',
      502,
      'INSTAGRAM_ACCOUNT_VERIFICATION_FAILED'
    );
  }


  /*
   * Meta must return exactly the account
   * the user selected.
   */

  if (
    !verifiedAccount?.id ||
    String(
      verifiedAccount.id
    ) !==
    String(
      selectedAccount
        .instagramUserId
    )
  ) {
    throw serviceError(
      'Meta returned a different Instagram account than the one selected.',
      409,
      'INSTAGRAM_ACCOUNT_ID_MISMATCH'
    );
  }


  /*
   * =====================================================
   * ENCRYPT PAGE ACCESS TOKEN
   * =====================================================
   */

  const {
    encryptedToken,
    iv,
    authTag,
  } =
    encryptToken(
      pageAccessToken
    );


  /*
   * =====================================================
   * SAVE NORMALIZED CONNECTION
   * =====================================================
   */

  const connection =
    await socialConnectionRepository
      .upsertInstagramConnection({
        clientId:
          normalizedClientId,

        connectedBy,

        externalAccountId:
          String(
            verifiedAccount.id
          ),

        externalAccountName:
          verifiedAccount
            .username ||
          verifiedAccount
            .name ||
          selectedAccount
            .username ||
          selectedAccount
            .name ||
          'Instagram Account',

        encryptedToken,

        iv,

        authTag,

        tokenExpiresAt:
          null,

        /*
         * Keep Page tasks for now,
         * matching the Facebook architecture.
         */
        permissions:
          Array.isArray(
            selectedAccount.tasks
          )
            ? selectedAccount.tasks
            : [],

        metadata: {
          username:
            verifiedAccount
              .username ||
            selectedAccount
              .username ||
            null,

          displayName:
            verifiedAccount
              .name ||
            selectedAccount
              .name ||
            null,

          profilePictureUrl:
            verifiedAccount
              .profile_picture_url ||
            selectedAccount
              .profilePictureUrl ||
            null,

          facebookPageId:
            selectedAccount
              .facebookPageId ||
            null,

          facebookPageName:
            selectedAccount
              .facebookPageName ||
            null,

          graphVersion:
            GRAPH_VERSION,
        },
      });


  if (!connection) {
    throw serviceError(
      'Instagram connection could not be saved.',
      500,
      'INSTAGRAM_CONNECTION_SAVE_FAILED'
    );
  }


  /*
   * =====================================================
   * CLEAN TEMPORARY OAUTH DATA
   * =====================================================
   *
   * Remove:
   *
   * instagramOAuthState
   * instagramOAuthUserId
   * instagramOAuthClientId
   * instagramOAuthStartedAt
   * instagramAccounts
   * instagramOAuthOutcome
   *
   * The controller will call saveSession(req)
   * afterward so this cleanup is persisted.
   */

  clearInstagramOAuthSession(
    session
  );


  /*
   * =====================================================
   * SAFE RESPONSE
   * =====================================================
   *
   * Never return:
   *
   * pageAccessToken
   * encryptedToken
   * iv
   * authTag
   */

  return {
    connectionId:
      connection.connection_id,

    clientId:
      normalizedClientId,

    platform:
      connection.platform,

    externalAccountId:
      connection
        .external_account_id,

    externalAccountName:
      connection
        .external_account_name,

    connectionStatus:
      connection.status ??
      connection.connection_status ??
      null,

    verifiedAt:
      connection.verified_at ||
      null,

    lastVerifiedAt:
      connection
        .last_verified_at ||
      null,

    reconnectRequired:
      Boolean(
        connection
          .reconnect_required
      ),

    instagram: {
      id:
        String(
          verifiedAccount.id
        ),

      username:
        verifiedAccount
          .username ||
        null,

      name:
        verifiedAccount
          .name ||
        null,

      profilePictureUrl:
        verifiedAccount
          .profile_picture_url ||
        null,

      facebookPageId:
        selectedAccount
          .facebookPageId ||
        null,

      facebookPageName:
        selectedAccount
          .facebookPageName ||
        null,
    },
  };
}
// ======================================================
// VALIDATE INSTAGRAM OAUTH OWNER
// ======================================================

function validateOAuthOwner({
  user,
  session,
  clientId,
}) {
  assertInstagramOAuthFresh(
    session
  );


  const currentUserId =
    Number(
      getUserId(user)
    );

  const oauthUserId =
    Number(
      session
        ?.instagramOAuthUserId
    );

  const oauthClientId =
    Number(
      session
        ?.instagramOAuthClientId
    );

  const requestedClientId =
    Number(clientId);


  /*
   * Same authenticated user
   * must complete the flow.
   */

  if (
    !Number.isInteger(
      currentUserId
    ) ||
    currentUserId <= 0 ||
    !Number.isInteger(
      oauthUserId
    ) ||
    oauthUserId <= 0 ||
    currentUserId !==
    oauthUserId
  ) {
    throw serviceError(
      'Instagram OAuth session belongs to another user. Please reconnect Instagram.',
      403,
      'INSTAGRAM_SESSION_USER_MISMATCH'
    );
  }


  /*
   * Same active client
   * must complete the flow.
   */

  if (
    !Number.isInteger(
      requestedClientId
    ) ||
    requestedClientId <= 0 ||
    !Number.isInteger(
      oauthClientId
    ) ||
    oauthClientId <= 0 ||
    requestedClientId !==
    oauthClientId
  ) {
    throw serviceError(
      'Instagram OAuth session belongs to another client. Please reconnect Instagram.',
      403,
      'INSTAGRAM_SESSION_CLIENT_MISMATCH'
    );
  }
}

// ======================================================
// GET INSTAGRAM OAUTH OUTCOME
// ======================================================

function getOAuthOutcome({
  user,
  session,
  clientId,
}) {
  const outcome =
    session
      ?.instagramOAuthOutcome;


  if (!outcome) {
    return {
      status:
        'IDLE',

      reason:
        null,

      message:
        null,

      totalAccounts:
        0,
    };
  }


  const currentUserId =
    Number(
      getUserId(user)
    );

  const requestedClientId =
    Number(clientId);

  const outcomeAge =
    Date.now() -
    Number(
      outcome.createdAt ||
      0
    );


  /*
   * Outcome must belong to:
   *
   * - current user
   * - current active client
   * - current OAuth window
   */

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
      .instagramOAuthOutcome;

    return {
      status:
        'IDLE',

      reason:
        null,

      message:
        null,

      totalAccounts:
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

    totalAccounts:
      Number(
        outcome.totalAccounts
      ) ||
      0,
  };


  /*
   * Errors are one-shot.
   *
   * SELECT_ACCOUNT remains available
   * until selection or cancellation.
   */

  if (
    result.status ===
    'ERROR'
  ) {
    delete session
      .instagramOAuthOutcome;
  }


  return result;
}

// ======================================================
// CANCEL INSTAGRAM OAUTH
// ======================================================

function cancelOAuth(
  session
) {
  clearInstagramOAuthSession(
    session
  );

  return {
    cancelled: true,
  };
}


// ======================================================
// VERIFY SAVED INSTAGRAM CONNECTION
// ======================================================
//
// Used by:
//
// POST
// /api/client/social-connections/:connectionId/verify
//
// FLOW:
//
// saved Instagram connection
//        ↓
// decrypt Page access token
//        ↓
// call Meta Graph API
//        ↓
// verify Instagram account identity
//        ↓
// update verification timestamp/status
//
// ======================================================

async function verifyInstagramConnection(
  connection
) {
  // ----------------------------------------------------
  // VALIDATE CONNECTION
  // ----------------------------------------------------

  if (!connection) {
    throw serviceError(
      'Instagram connection is missing.',
      404,
      'INSTAGRAM_CONNECTION_MISSING'
    );
  }


  const connectionId =
    Number(
      connection.connection_id
    );


  if (
    !Number.isInteger(
      connectionId
    ) ||
    connectionId <= 0
  ) {
    throw serviceError(
      'Instagram connection ID is missing.',
      500,
      'INSTAGRAM_CONNECTION_ID_MISSING'
    );
  }


  const instagramUserId =
    connection
      .external_account_id;


  if (!instagramUserId) {
    throw serviceError(
      'Stored Instagram account ID is missing.',
      500,
      'INSTAGRAM_ACCOUNT_ID_MISSING'
    );
  }


  // ----------------------------------------------------
  // VERIFY TOKEN STORAGE
  // ----------------------------------------------------

  if (
    !connection
      .access_token_encrypted ||
    !connection.token_iv ||
    !connection.token_auth_tag
  ) {
    throw serviceError(
      'Stored Instagram access token is incomplete.',
      500,
      'INSTAGRAM_TOKEN_STORAGE_INVALID'
    );
  }


  try {
    // ==================================================
    // 1. DECRYPT PAGE ACCESS TOKEN
    // ==================================================

    const pageAccessToken =
      decryptToken({
        encryptedToken:
          connection
            .access_token_encrypted,

        iv:
          connection.token_iv,

        authTag:
          connection
            .token_auth_tag,
      });


    if (!pageAccessToken) {
      throw serviceError(
        'Instagram access token could not be decrypted.',
        500,
        'INSTAGRAM_TOKEN_DECRYPT_FAILED'
      );
    }


    // ==================================================
    // 2. VERIFY INSTAGRAM ACCOUNT WITH META
    // ==================================================
    //
    // We call Meta directly here instead of
    // getInstagramAccountDetails() because verification
    // must preserve Meta error code 190.
    //
    // Error 190 means:
    // invalid / expired / revoked token.
    // ==================================================

    const response =
      await axios.get(
        `${GRAPH_URL}/${encodeURIComponent(
          String(
            instagramUserId
          )
        )}`,
        {
          params: {
            fields: [
              'id',
              'username',
              'name',
              'profile_picture_url',
            ].join(','),

            access_token:
              pageAccessToken,
          },

          timeout: 15000,
        }
      );


    const instagramAccount =
      response?.data;


    // ==================================================
    // 3. VERIFY META RETURNED AN ACCOUNT
    // ==================================================

    if (
      !instagramAccount?.id
    ) {
      throw serviceError(
        'Meta did not return an Instagram account ID.',
        502,
        'INSTAGRAM_INVALID_META_RESPONSE'
      );
    }


    // ==================================================
    // 4. VERIFY ACCOUNT IDENTITY
    // ==================================================

    if (
      String(
        instagramAccount.id
      ) !==
      String(
        instagramUserId
      )
    ) {
      throw serviceError(
        'Instagram account ID does not match the stored connection.',
        409,
        'INSTAGRAM_ACCOUNT_ID_MISMATCH'
      );
    }


    // ==================================================
    // 5. UPDATE DATABASE VERIFICATION STATUS
    // ==================================================

    const externalAccountName =
      instagramAccount
        .username ||
      instagramAccount
        .name ||
      connection
        .external_account_name ||
      null;


    const updated =
      await socialConnectionRepository
        .markVerified({
          connectionId,

          externalAccountName,
        });


    if (!updated) {
      throw serviceError(
        'Instagram connection status could not be updated.',
        500,
        'INSTAGRAM_CONNECTION_UPDATE_FAILED'
      );
    }


    // ==================================================
    // 6. SAFE RESPONSE
    // ==================================================
    //
    // Never return:
    //
    // pageAccessToken
    // encrypted token
    // IV
    // auth tag
    // ==================================================

    return {
      connectionId:
        updated.connection_id ??
        connectionId,

      clientId:
        connection.client_id ??
        null,

      platform:
        updated.platform ??
        connection.platform ??
        'INSTAGRAM',

      externalAccountId:
        updated
          .external_account_id ??
        connection
          .external_account_id,

      externalAccountName:
        updated
          .external_account_name ??
        externalAccountName,

      connectionStatus:
        updated
          .connection_status ??
        updated.status ??
        'CONNECTED',

      verifiedAt:
        updated.verified_at ??
        connection.verified_at ??
        null,

      lastVerifiedAt:
        updated
          .last_verified_at ??
        null,

      reconnectRequired:
        Boolean(
          updated
            .reconnect_required
        ),

      verified:
        true,

      instagram: {
        id:
          String(
            instagramAccount.id
          ),

        username:
          instagramAccount
            .username ||
          null,

        name:
          instagramAccount
            .name ||
          null,

        profilePictureUrl:
          instagramAccount
            .profile_picture_url ||
          null,
      },
    };

  } catch (errorObject) {
    // ==================================================
    // META ERROR HANDLING
    // ==================================================

    const metaError =
      getMetaError(
        errorObject
      );


    const metaCode =
      Number(
        metaError?.code
      );


    // Meta error 190:
    //
    // token expired
    // token invalid
    // permission revoked

    const reconnectRequired =
      metaCode === 190;


    const errorCode =
      reconnectRequired
        ? '190'
        : String(
          metaError?.code ??
          errorObject?.code ??
          'INSTAGRAM_VERIFICATION_ERROR'
        );


    const errorMessage =
      metaError?.message ||
      errorObject?.message ||
      'Instagram verification failed.';


    // ==================================================
    // SAVE FAILURE STATE
    // ==================================================

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
        'Failed to persist Instagram verification error:',
        databaseError.message
      );
    }


    // ==================================================
    // TOKEN INVALID / EXPIRED
    // ==================================================

    if (reconnectRequired) {
      throw serviceError(
        'Instagram authorization is no longer valid. Please reconnect Instagram.',
        409,
        'INSTAGRAM_REAUTH_REQUIRED'
      );
    }


    // Preserve our own service errors.

    if (
      errorObject instanceof
      ApiError
    ) {
      throw errorObject;
    }


    // Other Meta / network failure.

    throw serviceError(
      errorMessage,
      502,
      'INSTAGRAM_VERIFICATION_FAILED'
    );
  }
}



module.exports = {
  /*
   * Account discovery
   */
  getManagedInstagramAccounts,
  getInstagramAccountDetails,
  sanitizeInstagramAccounts,

  /*
   * OAuth
   */
  startOAuth,
  handleOAuthCallback,
  getOAuthAccounts,
  getOAuthOutcome,
  cancelOAuth,
  validateOAuthOwner,
  selectInstagramAccount,


  /*
  * Verification
  */
  verifyInstagramConnection,

  /*
   * Token helpers
   */
  exchangeCodeForAccessToken,
  exchangeForLongLivedToken,
};