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
  requireActiveClient,
} = require(
  '../middleware/activeClient.middleware'
);

const clientController =
  require(
    '../controllers/clientController'
  );

const clientUsersController =
  require(
    '../controllers/clientUsers.controller'
  );

const socialConnectionsController =
  require(
    '../controllers/socialConnections.controller'
  );

const facebookController =
  require(
    '../controllers/facebook.controller'
  );

  const telegramController =
  require(
    '../controllers/telegram.controller'
  );

  const threadsController =
  require(
    '../controllers/threads.controller'
  );
const {
  startYouTubeOAuth,
  getYouTubeOAuthResult,
  testYouTubeConnection,
} = require(
  '../controllers/youtube.controller'
);
const router =
  express.Router();


// ======================================================
// AUTHENTICATION
// ======================================================

router.use(
  authenticate
);


// ======================================================
// ACTIVE CLIENT CONTEXT
// ======================================================
//
// PLATFORM_ADMIN
//   → req.session.activeClientId
//
// CLIENT_ADMIN
//   → req.user.client_id
//
// requireActiveClient normalizes the result to:
//
//   req.clientId
//
// Therefore none of the routes in this file need a
// client ID from URL params or request body.
//
// ======================================================

router.use(
  requireActiveClient
);


// ======================================================
// SHARED ACCESS
// ======================================================

const clientAdmins =
  authorize(
    'PLATFORM_ADMIN',
    'CLIENT_ADMIN'
  );


// ======================================================
// GET ACTIVE CLIENT
// ======================================================
//
// GET /api/client
//
// Used by:
//
// - Platform Admin selected-client view
// - Client Admin own-client view
//
// ======================================================

router.get(
  '/',
  clientAdmins,
  clientController.getClientById
);


// ======================================================
// UPDATE OWN CLIENT SOCIAL PLATFORMS
// ======================================================
//
// PUT /api/client/platforms
//
// CLIENT_ADMIN only.
//
// The client ID is NOT accepted from:
//
// - URL
// - query string
// - request body
//
// It comes from:
//
//   requireActiveClient
//        ↓
//   req.user.client_id
//        ↓
//   req.clientId
//
// Example body:
//
// {
//   "platforms": [
//     "facebook",
//     "instagram",
//     "telegram"
//   ]
// }
//
// ======================================================

router.put(
  '/platforms',

  authorize(
    'CLIENT_ADMIN'
  ),

  clientController
    .setActiveClientPlatforms
);
// =====================================================
// YOUTUBE OAUTH START
// =====================================================

router.get(
  '/social-connections/youtube/oauth/start',
   authenticate,
  requireActiveClient,
  startYouTubeOAuth
);


// =====================================================
// YOUTUBE OAUTH RESULT
// =====================================================

router.get(
  '/social-connections/youtube/oauth/result',
   authenticate,
  requireActiveClient,
  getYouTubeOAuthResult
);


// =====================================================
// YOUTUBE TEST CONNECTION
// =====================================================

router.post(
  '/social-connections/youtube/:connectionId/test',
   authenticate,
  requireActiveClient,
  testYouTubeConnection
);
// ======================================================
// GET CLIENT ONBOARDING PROGRESS
// ======================================================

router.get(
  '/onboarding',

  authorize(
    'CLIENT_ADMIN'
  ),

  clientController
    .getActiveClientOnboardingProgress
);

// ======================================================
// START CLIENT ONBOARDING
// ======================================================
//
// CLIENT_ADMIN only.
//
// POST
// /api/client/onboarding/start
//
// Client ID is resolved by requireActiveClient.
// Nothing tenant-sensitive comes from the browser.
// ======================================================

router.post(
  '/onboarding/start',

  authorize(
    'CLIENT_ADMIN'
  ),

  clientController
    .startActiveClientOnboarding
);

// ======================================================
// COMPLETE CLIENT ONBOARDING
// ======================================================

router.post(
  '/onboarding/complete',

  authorize(
    'CLIENT_ADMIN'
  ),

  clientController
    .completeActiveClientOnboarding
);
// ======================================================
// CLIENT USERS
// ======================================================
//
// These routes are preserved as-is so existing
// functionality is not changed.
//
// The dedicated /api/client/users router remains the
// primary user-management route in the application.
//
// ======================================================

router.get(
  '/users',

  authorize(
    'PLATFORM_ADMIN'
  ),

  clientUsersController
    .getClientUsers
);


router.post(
  '/users',

  authorize(
    'PLATFORM_ADMIN'
  ),

  clientUsersController
    .createUser
);


// ======================================================
// SOCIAL CONNECTIONS
// ======================================================
//
// GET /api/client/social-connections
//
// ======================================================

router.get(
  '/social-connections',

  clientAdmins,

  socialConnectionsController
    .getClientSocialConnections
);


// ======================================================
// VERIFY SOCIAL CONNECTION
// ======================================================

router.post(
  '/social-connections/:connectionId/verify',

  clientAdmins,

  socialConnectionsController
    .verifySocialConnection
);


// ======================================================
// DISCONNECT SOCIAL CONNECTION
// ======================================================

router.delete(
  '/social-connections/:connectionId',

  clientAdmins,

  socialConnectionsController
    .disconnectConnection
);


// ======================================================
// FACEBOOK OAUTH START
// ======================================================

router.get(
  '/social-connections/facebook/oauth/start',

  clientAdmins,

  facebookController
    .startFacebookConnect
);


// ======================================================
// FACEBOOK OAUTH RESULT
// ======================================================

router.get(
  '/social-connections/facebook/oauth-result',

  clientAdmins,

  facebookController
    .getFacebookOAuthResult
);


// ======================================================
// CANCEL FACEBOOK OAUTH
// ======================================================

router.delete(
  '/social-connections/facebook/oauth-result',

  clientAdmins,

  facebookController
    .cancelFacebookOAuth
);


// ======================================================
// FACEBOOK PAGE LIST
// ======================================================

router.get(
  '/social-connections/facebook/pages',

  clientAdmins,

  facebookController
    .getFacebookPages
);


// ======================================================
// SELECT FACEBOOK PAGE
// ======================================================

router.post(
  '/social-connections/facebook/connect',

  clientAdmins,

  facebookController
    .selectFacebookPage
);


// ======================================================
// TELEGRAM CONNECTION
// ======================================================
//
// POST
// /api/client/social-connections/telegram/connect
//
// Client ID comes from:
//
// requireActiveClient
//        ↓
// req.clientId
//
// Never from the browser URL.
//
// ======================================================

router.post(
  '/social-connections/telegram/connect',

  authorize(
    'PLATFORM_ADMIN',
    'CLIENT_ADMIN'
  ),

  telegramController
    .connectTelegram
);

// ======================================================
// VERIFY ACTIVE CLIENT SOCIAL CONNECTION
// ======================================================

router.post(
  '/social-connections/:connectionId/verify',

  authorize(
    'PLATFORM_ADMIN',
    'CLIENT_ADMIN'
  ),

  socialConnectionsController
    .verifySocialConnection
);


// =====================================================
// THREADS OAUTH START
// =====================================================

router.get(
  '/social-connections/threads/oauth/start',
  authorize(
    'PLATFORM_ADMIN',
    'CLIENT_ADMIN'
  ),
  threadsController
    .startThreadsOAuth
);


// =====================================================
// THREADS OAUTH RESULT
// =====================================================

router.get(
  '/social-connections/threads/oauth/result',
  authorize(
    'PLATFORM_ADMIN',
    'CLIENT_ADMIN'
  ),
  threadsController
    .getThreadsOAuthResult
);

// ======================================================
// EXPORT
// ======================================================

module.exports =
  router;