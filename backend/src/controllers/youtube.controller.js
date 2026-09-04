'use strict';

const youtubeService =
    require('../services/youtube.service');

const {
    youtubeConfig,
} = require('../config/youtube');

const logger =
    require('../utils/logger');


/* =========================================================
 * HELPERS
 * ========================================================= */

function getUserId(
    user,
) {
    return (
        user?.user_id ??
        user?.id ??
        user?.userId ??
        null
    );
}


function getClientId(
    req,
) {
    const candidates = [
        req.params?.clientId,
        req.clientId,
        req.activeClientId,
        req.session?.activeClientId,
        req.session?.active_client_id,
    ];

    for (
        const value of candidates
    ) {
        const clientId =
            Number(value);

        if (
            Number.isInteger(
                clientId,
            ) &&
            clientId > 0
        ) {
            return clientId;
        }
    }

    return null;
}


/**
 * OAuth state/result is stored in
 * Express session.
 *
 * Save it before redirecting the browser
 * away from our application.
 */
function saveSession(
    req,
) {
    return new Promise(
        (
            resolve,
            reject,
        ) => {
            if (!req.session) {
                resolve();
                return;
            }

            req.session.save(
                (error) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                },
            );
        },
    );
}


/**
 * Clean frontend destination after
 * Google redirects to our backend.
 */
function getSocialConnectionsUrl() {
    return new URL(
        '/client/social-connections',
        youtubeConfig.frontendUrl,
    ).toString();
}


/* =========================================================
 * START YOUTUBE OAUTH
 * ========================================================= */

async function startYouTubeOAuth(
    req,
    res,
    next,
) {
    try {
        console.log(
            'YouTube OAuth client resolver:',
            {
                paramClientId:
                    req.params?.clientId,

                reqClientId:
                    req.clientId,

                activeClientId:
                    req.activeClientId,

                sessionActiveClientId:
                    req.session
                        ?.activeClientId,

                resolvedClientId:
                    getClientId(req),
            },
        );

        const result =
            await youtubeService
                .startOAuth({
                    clientId:
                        getClientId(
                            req,
                        ),

                    userId:
                        getUserId(
                            req.user,
                        ),

                    session:
                        req.session,
                });


        /**
         * Important:
         * persist OAuth state before browser
         * leaves our application.
         */
        await saveSession(
            req,
        );


        return res
            .status(200)
            .json({
                success:
                    true,

                data: {
                    authorizationUrl:
                        result
                            .authorizationUrl,
                },
            });
    } catch (
    error
    ) {
        return next(
            error,
        );
    }
}


/* =========================================================
 * GOOGLE OAUTH CALLBACK
 * ========================================================= */

/**
 * Google redirects the browser here.
 *
 * Do not take client ID from Google query
 * parameters.
 *
 * Trusted client/user context was stored
 * in the Express session when OAuth started.
 */
async function youtubeOAuthCallback(
    req,
    res,
) {
    try {
        await youtubeService
            .handleOAuthCallback({
                query:
                    req.query,

                session:
                    req.session,
            });


        await saveSession(
            req,
        );
    } catch (
    error
    ) {
        logger.error(
            'YouTube OAuth callback failed',
            {
                message:
                    error?.message,

                code:
                    error
                        ?.details
                        ?.code ||
                    error?.code ||
                    null,
            },
        );


        /**
         * handleOAuthCallback normally stores
         * a safe OAuth outcome before throwing.
         *
         * Persist it so React can display the
         * error after redirect.
         */
        try {
            await saveSession(
                req,
            );
        } catch (
        sessionError
        ) {
            logger.error(
                'YouTube OAuth outcome session save failed',
                {
                    message:
                        sessionError
                            ?.message,
                },
            );
        }
    }


    return res.redirect(
        getSocialConnectionsUrl(),
    );
}


/* =========================================================
 * GET ONE-TIME OAUTH RESULT
 * ========================================================= */

async function getYouTubeOAuthResult(
    req,
    res,
    next,
) {
    try {
        const clientId =
            getClientId(
                req,
            );


        /**
         * The result is one-time.
         *
         * After React reads it, the value is
         * removed from the session.
         */
        const outcome =
            youtubeService
                .consumeOAuthOutcome(
                    req.session,
                    clientId,
                );


        await saveSession(
            req,
        );


        return res
            .status(200)
            .json({
                success:
                    true,

                data:
                    outcome,
            });
    } catch (
    error
    ) {
        return next(
            error,
        );
    }
}


/* =========================================================
 * TEST YOUTUBE CONNECTION
 * ========================================================= */

async function testYouTubeConnection(
    req,
    res,
    next,
) {
    try {
        const result =
            await youtubeService
                .verifyConnection({
                    clientId:
                        getClientId(
                            req,
                        ),

                    connectionId:
                        Number(
                            req.params
                                .connectionId,
                        ),
                });


        return res
            .status(200)
            .json({
                success:
                    true,

                message:
                    'YouTube connection verified successfully.',

                data:
                    result,
            });
    } catch (
    error
    ) {
        return next(
            error,
        );
    }
}


/* =========================================================
 * EXPORTS
 * ========================================================= */

module.exports = {
    startYouTubeOAuth,
    youtubeOAuthCallback,
    getYouTubeOAuthResult,
    testYouTubeConnection,
};