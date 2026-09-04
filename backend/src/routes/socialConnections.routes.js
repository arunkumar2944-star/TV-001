'use strict';

const express =
  require('express');

const {
  authenticate,
} = require(
  '../middleware/authenticate'
);

const {
  authorize,
} = require(
  '../middleware/authorize'
);

const {
  requireClientAccess,
} = require(
  '../middleware/clientAccess'
);


/* =========================================================
 * GENERIC SOCIAL CONNECTION CONTROLLER
 * ========================================================= */

const {
  getClientSocialConnections,
  verifySocialConnection,
  disconnectConnection,
} = require(
  '../controllers/socialConnections.controller'
);


/* =========================================================
 * THREADS CONTROLLER
 * ========================================================= */

const {
  startThreadsOAuth,
  threadsOAuthCallback,
  getThreadsOAuthResult,
  testThreadsConnection,
} = require(
  '../controllers/threads.controller'
);


/* =========================================================
 * YOUTUBE CONTROLLER
 * ========================================================= */

const {
  startYouTubeOAuth,
  youtubeOAuthCallback,
  getYouTubeOAuthResult,
  testYouTubeConnection,
} = require(
  '../controllers/youtube.controller'
);


const router =
  express.Router();


/* =========================================================
 * AUTHORIZATION
 * ========================================================= */

const connectionAdmins =
  authorize(
    'PLATFORM_ADMIN',
    'CLIENT_ADMIN',
  );


const guards = [
  authenticate,
  connectionAdmins,
  requireClientAccess,
];


/* =========================================================
 * THREADS OAUTH CALLBACK
 * ========================================================= */

/**
 * Meta redirects here.
 *
 * Do not accept client ID from OAuth
 * query parameters.
 *
 * Client context is stored in the session.
 */
router.get(
  '/social-connections/threads/oauth/callback',

  threadsOAuthCallback,
);


/* =========================================================
 * YOUTUBE OAUTH CALLBACK
 * ========================================================= */

/**
 * Google redirects here.
 *
 * This callback intentionally does not use
 * authenticate / requireClientAccess because
 * Google is redirecting the browser.
 *
 * OAuth state + client/user context are
 * validated from the existing session.
 */
router.get(
  '/social-connections/youtube/oauth/callback',

  youtubeOAuthCallback,
);


/* =========================================================
 * THREADS CONNECT / RECONNECT
 * ========================================================= */

router.get(
  '/clients/:clientId/social-connections/threads/oauth/start',

  ...guards,

  startThreadsOAuth,
);


router.get(
  '/clients/:clientId/social-connections/threads/oauth/result',

  ...guards,

  getThreadsOAuthResult,
);


/* =========================================================
 * THREADS TEST CONNECTION
 * ========================================================= */

router.post(
  '/clients/:clientId/social-connections/threads/:connectionId/test',

  ...guards,

  testThreadsConnection,
);


/* =========================================================
 * YOUTUBE CONNECT / RECONNECT
 * ========================================================= */

/**
 * Start Google OAuth.
 */
router.get(
  '/clients/:clientId/social-connections/youtube/oauth/start',

  ...guards,

  startYouTubeOAuth,
);


/**
 * React consumes OAuth result after Google
 * redirects back through our backend.
 */
router.get(
  '/clients/:clientId/social-connections/youtube/oauth/result',

  ...guards,

  getYouTubeOAuthResult,
);


/* =========================================================
 * YOUTUBE TEST CONNECTION
 * ========================================================= */

/**
 * Verifies channel access.
 *
 * The service automatically refreshes
 * an expired access token when a valid
 * refresh token is available.
 */
router.post(
  '/clients/:clientId/social-connections/youtube/:connectionId/test',

  ...guards,

  testYouTubeConnection,
);


/* =========================================================
 * GENERIC CONNECTION LIST
 * ========================================================= */

router.get(
  '/clients/:clientId/social-connections',

  ...guards,

  getClientSocialConnections,
);


/* =========================================================
 * GENERIC VERIFY
 * ========================================================= */

/**
 * Existing Facebook etc. verification.
 *
 * YouTube and Threads use their dedicated
 * test endpoints above.
 */
router.post(
  '/clients/:clientId/social-connections/:connectionId/verify',

  ...guards,

  verifySocialConnection,
);


/* =========================================================
 * GENERIC DISCONNECT
 * ========================================================= */

/**
 * Soft disconnect.
 *
 * client_social_connections.is_active
 * becomes FALSE.
 *
 * social_platform_connections remains so:
 *
 * - history is retained
 * - encrypted credentials stay centralized
 * - reconnecting the same account can reuse
 *   the existing connection
 */
router.delete(
  '/clients/:clientId/social-connections/:connectionId',

  ...guards,

  disconnectConnection,
);


module.exports =
  router;