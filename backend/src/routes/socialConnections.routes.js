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

const {
  getClientSocialConnections,
  verifySocialConnection,
  disconnectConnection,
} = require(
  '../controllers/socialConnections.controller'
);

const router =
  express.Router();

/**
 * --------------------------------------------------
 * SOCIAL CONNECTION SECURITY
 * --------------------------------------------------
 *
 * These routes belong to the client.
 *
 * Only CLIENT_ADMIN can:
 *
 * - View connected social accounts
 * - Verify connections
 * - Disconnect connections
 *
 * PLATFORM_ADMIN can view which platforms
 * are enabled for the client from the
 * client details page, but cannot access
 * connection credentials or manage accounts.
 *
 * Middleware order:
 *
 * authenticate
 *      ↓
 * clientOwnerOnly
 *      ↓
 * requireActiveClient
 *      ↓
 * controller
 */
const socialConnectionGuards = [
  authenticate,
  clientOwnerOnly,
  requireActiveClient,
];

/**
 * ==================================================
 * GET ACTIVE CLIENT SOCIAL CONNECTIONS
 * ==================================================
 *
 * GET
 * /api/client/social-connections
 *
 * CLIENT_ADMIN only.
 *
 * Client identification:
 *
 * req.session.activeClientId
 *          ↓
 * requireActiveClient
 *          ↓
 * req.clientId
 */
router.get(
  '/client/social-connections',
  ...socialConnectionGuards,
  getClientSocialConnections
);

/**
 * ==================================================
 * VERIFY / TEST SOCIAL CONNECTION
 * ==================================================
 *
 * POST
 * /api/client/social-connections/:connectionId/verify
 *
 * CLIENT_ADMIN only.
 *
 * Supports:
 *
 * - Facebook
 * - Instagram
 *
 * Later:
 *
 * - WhatsApp
 * - YouTube
 * - Telegram
 * - X
 * - Threads
 */
router.post(
  '/client/social-connections/:connectionId/verify',
  ...socialConnectionGuards,
  verifySocialConnection
);

/**
 * ==================================================
 * DISCONNECT SOCIAL CONNECTION
 * ==================================================
 *
 * DELETE
 * /api/client/social-connections/:connectionId
 *
 * CLIENT_ADMIN only.
 *
 * Only the relationship between the active
 * client and the social connection should be
 * disabled.
 *
 * Shared/global token records should not be
 * deleted unless your service explicitly owns
 * that lifecycle.
 */
router.delete(
  '/client/social-connections/:connectionId',
  ...socialConnectionGuards,
  disconnectConnection
);

module.exports =
  router;