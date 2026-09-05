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

const xController =
  require(
    '../controllers/x.controller'
  );

const router =
  express.Router();

const connectionAdmins =
  authorize(
    'PLATFORM_ADMIN',
    'CLIENT_ADMIN'
  );

const guards = [
  authenticate,
  connectionAdmins,
  requireActiveClient,
];


// ======================================================
// START X OAUTH
// ======================================================
//
// GET
// /api/client/social-connections/x/oauth/start
//
// IMPORTANT:
//
// The application client is resolved from:
//
// req.session.activeClientId
//        or
// req.user.client_id
//        ↓
// requireActiveClient
//        ↓
// req.clientId
//
// No internal clientId is placed in the URL.
//
// ======================================================

router.get(
  '/client/social-connections/x/oauth/start',
  ...guards,
  xController.startOAuth
);


// ======================================================
// X OAUTH CALLBACK
// ======================================================
//
// GET
// /api/x/oauth/callback
//
// X redirects the browser here with:
//
// ?code=...
// &state=...
//
// This route intentionally does not use authenticate /
// requireActiveClient because the browser is returning
// from X. Ownership is validated against the encrypted
// server-side OAuth session instead.
//
// ======================================================

router.get(
  '/social-connections/x/oauth/callback',
  xController.handleOAuthCallback
);


// ======================================================
// GET ONE-TIME X OAUTH RESULT
// ======================================================
//
// GET
// /api/client/social-connections/x/oauth/result
//
// React calls this after the browser returns to the
// Social Connections page. No token is returned.
//
// ======================================================

router.get(
  '/client/social-connections/x/oauth/result',
  ...guards,
  xController.getOAuthResult
);


// ======================================================
// CANCEL / CLEAR X OAUTH SESSION
// ======================================================
//
// POST
// /api/client/social-connections/x/oauth/cancel
//
// ======================================================

// router.post(
//   '/client/social-connections/x/oauth/cancel',
//   ...guards,
//   xController.cancel
// );
router.post(
  '/client/social-connections/x/:connectionId/test',
  ...guards,
  xController.testConnection
);

module.exports =
  router;
