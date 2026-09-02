'use strict';

const express =
  require('express');

const {
  authenticate,
} = require(
  '../middleware/authenticate'
);

const {
  clientOwnerOnly,
} = require(
  '../middleware/authorize'
);

const {
  requireActiveClient,
} = require(
  '../middleware/activeclient.middleware'
);

const facebookController =
  require(
    '../controllers/facebook.controller'
  );

const router =
  express.Router();


/**
 * =====================================================
 * FACEBOOK SOCIAL CONNECTION SECURITY
 * =====================================================
 *
 * Ownership rule:
 *
 * PLATFORM_ADMIN
 *   - Can view which platforms are enabled
 *     from the Client Details page.
 *   - Cannot start Facebook OAuth.
 *   - Cannot view Facebook Pages.
 *   - Cannot select/connect a Facebook Page.
 *   - Cannot manage Facebook connection data.
 *
 * CLIENT_ADMIN
 *   - Owns Facebook social connection management.
 *
 * Normal protected Facebook routes use:
 *
 * authenticate
 *      ↓
 * clientOwnerOnly
 *      ↓
 * requireActiveClient
 *      ↓
 * controller
 *
 * The Meta OAuth callback is different because
 * Meta redirects directly to that endpoint.
 * Its security is provided by OAuth state/session
 * validation inside facebook.service.js.
 */


/**
 * =====================================================
 * START FACEBOOK OAUTH
 * =====================================================
 *
 * GET
 *
 * /api/client/social-connections/facebook/oauth/start
 *
 * CLIENT_ADMIN ONLY
 *
 * Active client:
 *
 * req.session.activeClientId
 *          ↓
 * requireActiveClient
 *          ↓
 * req.clientId
 */
router.get(
  '/client/social-connections/facebook/oauth/start',

  authenticate,

  clientOwnerOnly,

  requireActiveClient,

  facebookController
    .startFacebookConnect
);


/**
 * =====================================================
 * FACEBOOK OAUTH CALLBACK
 * =====================================================
 *
 * GET
 *
 * /api/facebook/oauth/callback
 *
 * Meta redirects the browser here.
 *
 * Do NOT add:
 *
 * - clientOwnerOnly
 * - requireActiveClient
 *
 * to this callback.
 *
 * The callback verifies:
 *
 * - OAuth state
 * - session ownership
 * - OAuth expiry
 * - stored clientId
 * - stored userId
 *
 * inside facebook.service.js.
 *
 * Meta's:
 *
 * code
 * state
 * error
 *
 * query parameters are OAuth protocol values.
 * They are not application client identifiers.
 */
router.get(
  '/facebook/oauth/callback',

  facebookController
    .handleFacebookCallback
);


/**
 * =====================================================
 * GET AVAILABLE FACEBOOK PAGES
 * =====================================================
 *
 * GET
 *
 * /api/client/social-connections/facebook/pages
 *
 * CLIENT_ADMIN ONLY
 *
 * Returns only safe Facebook Page information.
 *
 * Access tokens must remain on the backend/session
 * and must never be returned to React.
 */
router.get(
  '/client/social-connections/facebook/pages',

  authenticate,

  clientOwnerOnly,

  requireActiveClient,

  facebookController
    .getFacebookPages
);


/**
 * =====================================================
 * CONNECT SELECTED FACEBOOK PAGE
 * =====================================================
 *
 * POST
 *
 * /api/client/social-connections/facebook/connect
 *
 * CLIENT_ADMIN ONLY
 *
 * Expected body:
 *
 * {
 *   "pageId": "..."
 * }
 *
 * The frontend sends only pageId.
 *
 * It must NOT send:
 *
 * - Page access token
 * - User access token
 * - clientId
 *
 * Client ownership comes from:
 *
 * req.session.activeClientId
 *          ↓
 * requireActiveClient
 *          ↓
 * req.clientId
 *
 * Page token comes from the trusted server-side
 * Facebook OAuth session.
 */
router.post(
  '/client/social-connections/facebook/connect',

  authenticate,

  clientOwnerOnly,

  requireActiveClient,

  facebookController
    .selectFacebookPage
);


module.exports =
  router;