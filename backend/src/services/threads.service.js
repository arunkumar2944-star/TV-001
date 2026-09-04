'use strict';

const axios =
    require('axios');

const crypto =
    require('crypto');

const ApiError =
    require('../utils/ApiError');

const {
    config,
} = require('../config/env');

const clientRepository =
    require(
        '../repositories/clientRepository'
    );
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

const THREADS_API_URL =
    'https://graph.threads.net';

const THREADS_AUTH_URL =
    'https://threads.net/oauth/authorize';

const OAUTH_STATE_TTL_MS =
    10 * 60 * 1000;

const THREADS_SCOPES = [
    'threads_basic',
    'threads_content_publish',
];


/* =========================================================
 * ERROR HELPER
 * ========================================================= */

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

/* =========================================================
 * TOKEN EXPIRY
 * ========================================================= */

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
    );
}
/* =========================================================
 * CONFIG VALIDATION
 * ========================================================= */

function ensureThreadsConfig() {
    if (
        !config.meta?.threadsAppId
    ) {
        throw serviceError(
            'META_THREADS_APP_ID  is not configured.',
            500,
            'THREADS_CONFIGURATION_ERROR'
        );
    }

    if (
        !config.meta?.threadsAppSecret
    ) {
        throw serviceError(
            'META_THREADS_APP_SECRET is not configured.',
            500,
            'THREADS_CONFIGURATION_ERROR'
        );
    }

    if (
        !config.meta
            ?.threadsCallbackUrl
    ) {
        throw serviceError(
            'META_THREADS_CALLBACK_URI is not configured.',
            500,
            'THREADS_CONFIGURATION_ERROR'
        );
    }
}


/* =========================================================
 * NORMALIZE ID
 * ========================================================= */

function normalizePositiveInteger(
    value
) {
    const result =
        Number(value);

    return (
        Number.isInteger(
            result
        ) &&
        result > 0
    )
        ? result
        : null;
}


/* =========================================================
 * CLEAR THREADS OAUTH SESSION
 * ========================================================= */

function clearThreadsOAuthSession(
    session,
    {
        preserveOutcome = false,
    } = {}
) {
    if (!session) {
        return;
    }

    delete session
        .threadsOAuthState;

    delete session
        .threadsOAuthClientId;

    delete session
        .threadsOAuthUserId;

    delete session
        .threadsOAuthStartedAt;

    if (!preserveOutcome) {
        delete session
            .threadsOAuthOutcome;
    }
}


/* =========================================================
 * SET OAUTH OUTCOME
 * ========================================================= */

function setThreadsOAuthOutcome(
    session,
    {
        status,
        message = null,
        reason = null,
        clientId = null,
        userId = null,
    }
) {
    if (!session) {
        return;
    }

    session.threadsOAuthOutcome = {
        status,

        message,

        reason,

        clientId:
            normalizePositiveInteger(
                clientId
            ),

        userId:
            normalizePositiveInteger(
                userId
            ),

        createdAt:
            Date.now(),
    };
}


/* =========================================================
 * CHECK OAUTH SESSION AGE
 * ========================================================= */

function assertThreadsOAuthFresh(
    session
) {
    const startedAt =
        Number(
            session
                ?.threadsOAuthStartedAt
        );

    if (
        !startedAt ||
        Date.now() -
        startedAt >
        OAUTH_STATE_TTL_MS
    ) {
        clearThreadsOAuthSession(
            session
        );

        throw serviceError(
            'Threads OAuth session expired. Please connect Threads again.',
            401,
            'THREADS_OAUTH_EXPIRED'
        );
    }
}


/* =========================================================
 * CHECK CLIENT
 * ========================================================= */

async function validateClient(
    clientId
) {
    const normalizedClientId =
        normalizePositiveInteger(
            clientId
        );

    if (!normalizedClientId) {
        throw serviceError(
            'Invalid client ID.',
            400,
            'INVALID_CLIENT_ID'
        );
    }

    const client =
        await clientRepository
            .findById(
                normalizedClientId
            );

    if (!client) {
        throw serviceError(
            'Client not found.',
            404,
            'CLIENT_NOT_FOUND'
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
            'CLIENT_INACTIVE'
        );
    }

    return {
        client,
        clientId:
            normalizedClientId,
    };
}


/* =========================================================
 * CHECK THREADS ENABLED
 * ========================================================= */

// async function assertThreadsEnabled(
//     clientId
// ) {
//     if (
//         typeof clientRepository
//             .isPlatformEnabled !==
//         'function'
//     ) {
//         /*
//          * Temporary compatibility.
//          *
//          * Your repository already uses this helper
//          * in the generic social connection service.
//          */
//         return;
//     }

//     const enabled =
//         await clientRepository
//             .isPlatformEnabled(
//                 Number(clientId),
//                 'threads'
//             );

//     if (!enabled) {
//         throw serviceError(
//             'Threads is not enabled for this client.',
//             409,
//             'CLIENT_PLATFORM_NOT_ENABLED'
//         );
//     }
// }

async function assertThreadsEnabled(
  clientId
) {
  const rows =
    await clientRepository
      .listEnabledPlatforms(
        Number(clientId)
      );

  const platforms =
    Array.isArray(rows)
      ? rows.map(
          (item) =>
            String(
              item?.platform ??
              item?.code ??
              item
            )
              .trim()
              .toLowerCase()
        )
      : [];

  if (
    !platforms.includes(
      'threads'
    )
  ) {
    throw serviceError(
      'Threads is not enabled for this client.',
      409,
      'CLIENT_PLATFORM_NOT_ENABLED'
    );
  }
}


/* =========================================================
 * START THREADS OAUTH
 * ========================================================= */

async function startOAuth({
    clientId,
    userId,
    session,
}) {
    ensureThreadsConfig();

    if (!session) {
        throw serviceError(
            'Session is unavailable.',
            500,
            'SESSION_UNAVAILABLE'
        );
    }

    const normalizedUserId =
        normalizePositiveInteger(
            userId
        );

    if (!normalizedUserId) {
        throw serviceError(
            'Authenticated user information is missing.',
            401,
            'AUTHENTICATED_USER_MISSING'
        );
    }

    const {
        clientId:
        normalizedClientId,
    } =
        await validateClient(
            clientId
        );

    await assertThreadsEnabled(
        normalizedClientId
    );

    const state =
        crypto
            .randomBytes(32)
            .toString('hex');


    /*
     * Remove any previous unfinished
     * Threads authorization attempt.
     */
    clearThreadsOAuthSession(
        session
    );


    /*
     * Store trusted context server-side.
     *
     * Client ID will NOT be taken from
     * React after Meta redirects back.
     */
    session.threadsOAuthState =
        state;

    session.threadsOAuthClientId =
        normalizedClientId;

    session.threadsOAuthUserId =
        normalizedUserId;

    session.threadsOAuthStartedAt =
        Date.now();


    const params =
        new URLSearchParams({
            client_id:
                String(
                    config.meta.threadsAppId
                ),
            redirect_uri:
                config.meta
                    .threadsCallbackUrl,

            scope:
                THREADS_SCOPES
                    .join(','),

            response_type:
                'code',

            state,
        });


    return {
        authorizationUrl:
            `${THREADS_AUTH_URL}?${params.toString()}`,

        clientId:
            normalizedClientId,

        userId:
            normalizedUserId,
    };
}


/* =========================================================
 * EXCHANGE AUTH CODE FOR SHORT-LIVED TOKEN
 * ========================================================= */

async function exchangeCodeForToken(
    code
) {
    ensureThreadsConfig();

    if (
        !String(
            code || ''
        ).trim()
    ) {
        throw serviceError(
            'Threads authorization code is required.',
            400,
            'THREADS_AUTH_CODE_REQUIRED'
        );
    }

    const response =
        await axios.post(
            `${THREADS_API_URL}/oauth/access_token`,
            null,
            {
                params: {
                    client_id:
                        config.meta.threadsAppId,

                    client_secret:
                        config.meta.threadsAppSecret,

                    code:
                        String(code),

                    grant_type:
                        'authorization_code',

                    redirect_uri:
                        config.meta
                            .threadsCallbackUrl,
                },

                timeout:
                    15000,
            }
        );

    const accessToken =
        response.data
            ?.access_token;

    const threadsUserId =
        response.data
            ?.user_id;

    if (!accessToken) {
        throw serviceError(
            'Threads access token was not returned.',
            502,
            'THREADS_ACCESS_TOKEN_MISSING'
        );
    }

    if (!threadsUserId) {
        throw serviceError(
            'Threads user ID was not returned.',
            502,
            'THREADS_USER_ID_MISSING'
        );
    }

    return {
        accessToken,

        userId:
            String(
                threadsUserId
            ),
    };
}


/* =========================================================
 * LONG-LIVED THREADS TOKEN
 * ========================================================= */

async function exchangeForLongLivedToken(
  shortLivedToken
) {
  ensureThreadsConfig();

  if (!shortLivedToken) {
    throw serviceError(
      'Short-lived Threads token is required.',
      400,
      'THREADS_SHORT_TOKEN_REQUIRED'
    );
  }

  const response =
    await axios.get(
      `${THREADS_API_URL}/access_token`,
      {
        params: {
          grant_type:
            'th_exchange_token',

          client_secret:
            config.meta
              .threadsAppSecret,
        },

        headers: {
          Authorization:
            `Bearer ${shortLivedToken}`,
        },

        timeout: 15000,
      }
    );

  const accessToken =
    response.data
      ?.access_token;

  if (!accessToken) {
    throw serviceError(
      'Long-lived Threads token was not returned.',
      502,
      'THREADS_LONG_TOKEN_MISSING'
    );
  }

  return {
    accessToken,

    tokenType:
      response.data
        ?.token_type ||
      'bearer',

    expiresIn:
      Number(
        response.data
          ?.expires_in
      ) ||
      null,
  };
}


/* =========================================================
 * FETCH THREADS PROFILE
 * ========================================================= */

async function getThreadsProfile(
  accessToken
) {
  if (!accessToken) {
    throw serviceError(
      'Threads access token is required.',
      400,
      'THREADS_ACCESS_TOKEN_REQUIRED'
    );
  }

  const response =
    await axios.get(
      `${THREADS_API_URL}/me`,
      {
        params: {
          fields: [
            'id',
            'username',
            'name',
            'threads_profile_picture_url',
            'threads_biography',
          ].join(','),
        },

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },

        timeout: 15000,
      }
    );

  const profile =
    response.data;

  if (!profile?.id) {
    throw serviceError(
      'Threads profile could not be loaded.',
      502,
      'THREADS_PROFILE_MISSING'
    );
  }

  return profile;
}


/* =========================================================
 * HANDLE THREADS OAUTH CALLBACK
 * ========================================================= */

async function handleOAuthCallback({
    query,
    session,
}) {
    ensureThreadsConfig();


    if (!session) {
        throw serviceError(
            'Threads OAuth session is unavailable.',
            400,
            'THREADS_SESSION_MISSING'
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


    /*
     * Ensure this OAuth attempt
     * has not expired.
     */
    assertThreadsOAuthFresh(
        session
    );


    const storedState =
        session
            .threadsOAuthState;

    const clientId =
        normalizePositiveInteger(
            session
                .threadsOAuthClientId
        );

    const userId =
        normalizePositiveInteger(
            session
                .threadsOAuthUserId
        );


    /*
     * Server-side OAuth context
     * must exist.
     */
    if (
        !storedState ||
        !clientId ||
        !userId
    ) {
        clearThreadsOAuthSession(
            session
        );

        throw serviceError(
            'Threads OAuth context is missing. Please connect Threads again.',
            400,
            'THREADS_OAUTH_CONTEXT_MISSING'
        );
    }


    /*
     * OAuth state is validated before
     * processing either success or denial.
     */
    if (
        typeof state !==
        'string' ||
        !state ||
        state !==
        storedState
    ) {
        clearThreadsOAuthSession(
            session
        );

        throw serviceError(
            'Invalid Threads OAuth state.',
            403,
            'THREADS_OAUTH_STATE_INVALID'
        );
    }


    /*
     * State is single-use.
     */
    delete session
        .threadsOAuthState;


    /*
     * User denied authorization or
     * Threads returned an OAuth error.
     */
    if (error) {
        setThreadsOAuthOutcome(
            session,
            {
                status:
                    'ERROR',

                reason:
                    String(error),

                message:
                    errorDescription ||
                    'Threads authorization was cancelled.',

                clientId,
                userId,
            }
        );

        clearThreadsOAuthSession(
            session,
            {
                preserveOutcome:
                    true,
            }
        );

        return {
            success:
                false,

            status:
                'ERROR',

            message:
                errorDescription ||
                'Threads authorization was cancelled.',
        };
    }


    if (!code) {
        setThreadsOAuthOutcome(
            session,
            {
                status:
                    'ERROR',

                reason:
                    'AUTH_CODE_MISSING',

                message:
                    'Threads authorization code was not returned.',

                clientId,
                userId,
            }
        );

        clearThreadsOAuthSession(
            session,
            {
                preserveOutcome:
                    true,
            }
        );

        throw serviceError(
            'Threads authorization code is missing.',
            400,
            'THREADS_AUTH_CODE_REQUIRED'
        );
    }


    /*
     * Confirm the client still exists,
     * is active, and Threads is still
     * enabled before storing credentials.
     */
    await validateClient(
        clientId
    );

    await assertThreadsEnabled(
        clientId
    );


    try {

        /* -----------------------------------------------------
         * 1. SHORT-LIVED TOKEN
         * ----------------------------------------------------- */

        const shortTokenResult =
            await exchangeCodeForToken(
                code
            );


        const shortLivedToken =
            shortTokenResult
                .accessToken;

        const oauthThreadsUserId =
            String(
                shortTokenResult
                    .userId
            );


        /* -----------------------------------------------------
         * 2. LONG-LIVED TOKEN
         * ----------------------------------------------------- */

        const longTokenResult =
            await exchangeForLongLivedToken(
                shortLivedToken
            );


        const longLivedToken =
            longTokenResult
                .accessToken;


        /* -----------------------------------------------------
         * 3. FETCH THREADS PROFILE
         * ----------------------------------------------------- */

        const profile =
            await getThreadsProfile(
                longLivedToken
            );


        /*
         * The account returned by /me must
         * match the identity returned during
         * token exchange.
         */
        if (
            !profile?.id ||
            String(profile.id) !==
            oauthThreadsUserId
        ) {
            throw serviceError(
                'Threads returned a different account than the OAuth token owner.',
                409,
                'THREADS_ACCOUNT_ID_MISMATCH'
            );
        }


        /* -----------------------------------------------------
         * 4. TOKEN EXPIRY
         * ----------------------------------------------------- */

        const tokenExpiresAt =
            calculateTokenExpiry(
                longTokenResult
                    .expiresIn
            );


        /* -----------------------------------------------------
         * 5. ENCRYPT TOKEN
         * ----------------------------------------------------- */

        const {
            encryptedToken,
            iv,
            authTag,
        } =
            encryptToken(
                longLivedToken
            );


        /* -----------------------------------------------------
         * 6. SAVE NORMALIZED CONNECTION
         * ----------------------------------------------------- */

        const username =
            profile.username
                ? String(
                    profile.username
                ).replace(
                    /^@/,
                    ''
                )
                : null;


        const externalAccountName =
            username
                ? `@${username}`
                : profile.name ||
                'Threads account';


        const connection =
            await socialConnectionRepository
                .upsertThreadsConnection({
                    clientId,

                    connectedBy:
                        userId,

                    externalAccountId:
                        String(
                            profile.id
                        ),

                    externalAccountName,

                    encryptedToken,

                    iv,

                    authTag,

                    tokenExpiresAt,

                    permissions: [
                        'threads_basic',
                        'threads_content_publish',
                    ],

                    metadata: {
                        username,

                        displayName:
                            profile.name ||
                            null,

                        profilePictureUrl:
                            profile
                                .threads_profile_picture_url ||
                            null,

                        biography:
                            profile
                                .threads_biography ||
                            null,
                    },
                });


        if (!connection) {
            throw serviceError(
                'Threads connection could not be saved.',
                500,
                'THREADS_CONNECTION_SAVE_FAILED'
            );
        }


        /* -----------------------------------------------------
         * 7. MARK CONNECTION VERIFIED
         * ----------------------------------------------------- */

        const verified =
            await socialConnectionRepository
                .markVerified({
                    connectionId:
                        connection
                            .connection_id,

                    externalAccountName,
                });


        const finalConnection = {
            ...connection,
            ...(verified || {}),
        };


        /* -----------------------------------------------------
         * 8. STORE SAFE OAUTH RESULT
         * ----------------------------------------------------- */

        setThreadsOAuthOutcome(
            session,
            {
                status:
                    'CONNECTED',

                message:
                    `${externalAccountName} connected successfully.`,

                clientId,

                userId,
            }
        );


        /*
         * Remove state/client/user OAuth
         * fields but keep the safe outcome
         * for React to read.
         */
        clearThreadsOAuthSession(
            session,
            {
                preserveOutcome:
                    true,
            }
        );


        /*
         * Never return an access token.
         */
        return {
            success:
                true,

            connection: {
                connectionId:
                    finalConnection
                        .connection_id,

                clientId,

                platform:
                    'THREADS',

                externalAccountId:
                    String(
                        profile.id
                    ),

                externalAccountName,

                connectionStatus:
                    finalConnection
                        .status ??
                    finalConnection
                        .connection_status ??
                    'CONNECTED',

                tokenExpiresAt:
                    tokenExpiresAt,

                reconnectRequired:
                    Boolean(
                        finalConnection
                            .reconnect_required
                    ),

                lastVerifiedAt:
                    finalConnection
                        .last_verified_at ||
                    null,
            },
        };

    } catch (callbackError) {

        /*
         * Save only a safe UI outcome.
         *
         * Never store/log access tokens here.
         */

        setThreadsOAuthOutcome(
            session,
            {
                status:
                    'ERROR',

                reason:
                    callbackError
                        ?.details
                        ?.code ||
                    callbackError
                        ?.code ||
                    'THREADS_CONNECTION_FAILED',

                message:
                    callbackError
                        ?.message ||
                    'Threads connection failed.',

                clientId,

                userId,
            }
        );


        clearThreadsOAuthSession(
            session,
            {
                preserveOutcome:
                    true,
            }
        );


        throw callbackError;
    }
}


/* =========================================================
 * OAUTH OUTCOME
 * ========================================================= */

function getOAuthOutcome(
    session
) {
    if (!session) {
        return null;
    }

    return (
        session
            .threadsOAuthOutcome ||
        null
    );
}


function consumeOAuthOutcome(
    session
) {
    if (!session) {
        return null;
    }

    const outcome =
        session
            .threadsOAuthOutcome ||
        null;

    delete session
        .threadsOAuthOutcome;

    return outcome;
}


/* =========================================================
 * THREADS API ERROR HELPERS
 * ========================================================= */

function getThreadsApiError(
    error
) {
    return (
        error?.response
            ?.data
            ?.error ||
        null
    );
}


function isThreadsReauthError(
    error
) {
    const apiError =
        getThreadsApiError(
            error
        );

    const status =
        Number(
            error?.response
                ?.status
        );

    const code =
        Number(
            apiError?.code
        );

    const message =
        String(
            apiError?.message ||
            error?.message ||
            ''
        )
            .trim()
            .toLowerCase();

    return (
        status === 401 ||
        code === 190 ||
        message.includes(
            'access token'
        ) &&
        (
            message.includes(
                'invalid'
            ) ||
            message.includes(
                'expired'
            ) ||
            message.includes(
                'revoked'
            )
        )
    );
}


/* =========================================================
 * VERIFY STORED THREADS CONNECTION
 * ========================================================= */

async function verifyStoredThreadsConnection(
    connection
) {
    if (!connection) {
        throw serviceError(
            'Threads connection is missing.',
            404,
            'THREADS_CONNECTION_MISSING'
        );
    }

    const platform =
        String(
            connection.platform ||
            ''
        )
            .trim()
            .toUpperCase();

    if (
        platform !==
        'THREADS'
    ) {
        throw serviceError(
            'The stored connection is not a Threads connection.',
            400,
            'INVALID_THREADS_CONNECTION'
        );
    }

    if (
        connection
            .client_connection_active ===
        false ||
        String(
            connection
                .connection_status ||
            ''
        )
            .trim()
            .toUpperCase() ===
        'DISCONNECTED'
    ) {
        throw serviceError(
            'Threads is disconnected. Reconnect Threads before verification.',
            409,
            'THREADS_CONNECTION_DISCONNECTED'
        );
    }

    const connectionId =
        normalizePositiveInteger(
            connection
                .connection_id
        );

    if (!connectionId) {
        throw serviceError(
            'Threads connection ID is missing.',
            500,
            'THREADS_CONNECTION_INVALID'
        );
    }

    const storedAccountId =
        String(
            connection
                .external_account_id ||
            ''
        )
            .trim();

    if (!storedAccountId) {
        throw serviceError(
            'Stored Threads account ID is missing.',
            500,
            'THREADS_ACCOUNT_ID_MISSING'
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
            'Stored Threads access token is incomplete.',
            500,
            'THREADS_TOKEN_STORAGE_INVALID'
        );
    }

    if (
        connection
            .token_expires_at
    ) {
        const expiresAt =
            new Date(
                connection
                    .token_expires_at
            );

        if (
            !Number.isNaN(
                expiresAt.getTime()
            ) &&
            expiresAt.getTime() <=
            Date.now()
        ) {
            const message =
                'Threads access token has expired. Please reconnect Threads.';

            await socialConnectionRepository
                .markReauthRequired({
                    connectionId,
                    message,
                    errorCode:
                        'THREADS_TOKEN_EXPIRED',
                });

            throw serviceError(
                message,
                409,
                'THREADS_REAUTH_REQUIRED'
            );
        }
    }

    try {
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
                'Unable to decrypt the stored Threads access token.',
                500,
                'THREADS_TOKEN_DECRYPT_FAILED'
            );
        }

        const profile =
            await getThreadsProfile(
                accessToken
            );

        if (
            !profile?.id ||
            String(
                profile.id
            ) !==
            storedAccountId
        ) {
            throw serviceError(
                'Threads account ID does not match the stored connection.',
                409,
                'THREADS_ACCOUNT_ID_MISMATCH'
            );
        }

        const username =
            profile.username
                ? String(
                    profile.username
                ).replace(
                    /^@/,
                    ''
                )
                : null;

        const externalAccountName =
            username
                ? `@${username}`
                : profile.name ||
                connection
                    .external_account_name ||
                'Threads account';

        const updated =
            await socialConnectionRepository
                .markVerified({
                    connectionId,

                    externalAccountName,
                });

        if (!updated) {
            throw serviceError(
                'Threads connection status could not be updated.',
                500,
                'THREADS_CONNECTION_UPDATE_FAILED'
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
                'THREADS',

            externalAccountId:
                storedAccountId,

            externalAccountName,

            connectionStatus:
                updated.status ??
                updated
                    .connection_status ??
                'CONNECTED',

            verifiedAt:
                updated
                    .verified_at ||
                null,

            lastVerifiedAt:
                updated
                    .last_verified_at ||
                null,

            reconnectRequired:
                Boolean(
                    updated
                        .reconnect_required
                ),

            verified:
                true,

            profile: {
                id:
                    String(
                        profile.id
                    ),

                username,

                name:
                    profile.name ||
                    null,

                profilePictureUrl:
                    profile
                        .threads_profile_picture_url ||
                    null,

                biography:
                    profile
                        .threads_biography ||
                    null,
            },
        };

    } catch (verificationError) {
        if (
            verificationError
                ?.details
                ?.code ===
            'THREADS_REAUTH_REQUIRED'
        ) {
            throw verificationError;
        }

        const apiError =
            getThreadsApiError(
                verificationError
            );

        const reconnectRequired =
            isThreadsReauthError(
                verificationError
            );

        const errorCode =
            reconnectRequired
                ? String(
                    apiError?.code ||
                    verificationError
                        ?.response
                        ?.status ||
                    'THREADS_REAUTH_REQUIRED'
                )
                : String(
                    apiError?.code ||
                    verificationError
                        ?.details
                        ?.code ||
                    verificationError
                        ?.code ||
                    'THREADS_VERIFICATION_FAILED'
                );

        const errorMessage =
            apiError?.message ||
            verificationError
                ?.message ||
            'Threads connection verification failed.';

        if (reconnectRequired) {
            await socialConnectionRepository
                .markReauthRequired({
                    connectionId,

                    message:
                        errorMessage,

                    errorCode,
                });
        } else {
            await socialConnectionRepository
                .markVerificationFailed({
                    connectionId,

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
                ? 'Threads authorization is no longer valid. Please reconnect Threads.'
                : errorMessage,

            reconnectRequired
                ? 409
                : 502,

            reconnectRequired
                ? 'THREADS_REAUTH_REQUIRED'
                : 'THREADS_VERIFICATION_FAILED'
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

    exchangeForLongLivedToken,

    getThreadsProfile,

    getOAuthOutcome,

    consumeOAuthOutcome,

    verifyStoredThreadsConnection,

    assertThreadsOAuthFresh,

    clearThreadsOAuthSession,

    setThreadsOAuthOutcome,
};