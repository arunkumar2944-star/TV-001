'use strict';

const express =
  require('express');

const {
  authenticate,
} =
  require(
    '../middleware/authenticate'
  );

const {
  clientOwnerOnly,
} =
  require(
    '../middleware/authorize'
  );

const {
  requireActiveClient,
} =
  require(
    '../middleware/activeclient.middleware'
  );

const instagramController =
  require(
    '../controllers/instagram.controller'
  );


const router =
  express.Router();


/**
 * =====================================================
 * CLIENT ADMIN GUARDS
 * =====================================================
 *
 * Only CLIENT_ADMIN can:
 *
 * - start Instagram OAuth
 * - read OAuth result
 * - read discovered accounts
 * - connect selected account
 * - cancel OAuth
 *
 * req.clientId is resolved by requireActiveClient.
 */
const instagramGuards = [
  authenticate,
  clientOwnerOnly,
  requireActiveClient,
];


/**
 * =====================================================
 * START INSTAGRAM OAUTH
 * =====================================================
 *
 * GET
 * /api/client/social-connections/instagram/oauth/start
 */
router.get(
  '/client/social-connections/instagram/oauth/start',
  ...instagramGuards,
  instagramController
    .startInstagramConnect
);


/**
 * =====================================================
 * INSTAGRAM OAUTH CALLBACK
 * =====================================================
 *
 * GET
 * /api/instagram/oauth/callback
 *
 * IMPORTANT:
 *
 * Do NOT put:
 *
 * authenticate
 * clientOwnerOnly
 * requireActiveClient
 *
 * here.
 *
 * Meta redirects directly to this URL.
 * OAuth state/session validation is handled
 * inside instagram.service.js.
 */
router.get(
  '/instagram/oauth/callback',
  instagramController
    .handleInstagramCallback
);


/**
 * =====================================================
 * GET OAUTH RESULT
 * =====================================================
 *
 * React calls this after Meta redirects back
 * to /client/social-connections.
 */
router.get(
  '/client/social-connections/instagram/oauth-result',
  ...instagramGuards,
  instagramController
    .getInstagramOAuthResult
);


/**
 * =====================================================
 * GET DISCOVERED INSTAGRAM ACCOUNTS
 * =====================================================
 */
router.get(
  '/client/social-connections/instagram/accounts',
  ...instagramGuards,
  instagramController
    .getInstagramAccounts
);


/**
 * =====================================================
 * CONNECT SELECTED INSTAGRAM ACCOUNT
 * =====================================================
 *
 * Body:
 *
 * {
 *   "instagramUserId": "1784..."
 * }
 */
router.post(
  '/client/social-connections/instagram/connect',
  ...instagramGuards,
  instagramController
    .selectInstagramAccount
);


/**
 * =====================================================
 * CANCEL TEMPORARY INSTAGRAM OAUTH
 * =====================================================
 */
router.post(
  '/client/social-connections/instagram/oauth/cancel',
  ...instagramGuards,
  instagramController
    .cancelInstagramOAuth
);


module.exports =
  router;