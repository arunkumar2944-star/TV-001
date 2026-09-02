'use strict';

const express =
  require('express');

const {
  getClientUsers,
  createUser,
} = require(
  '../controllers/clientUsers.controller'
);

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
  '../middleware/activeclient.middleware'
);


const router =
  express.Router();


// ======================================================
// GUARDS
// ======================================================

/**
 * PLATFORM_ADMIN
 *   - can VIEW users for the selected client
 *
 * CLIENT_ADMIN
 *   - can VIEW users for their own client
 */
const clientUserViewGuards = [
  authenticate,

  authorize(
    'PLATFORM_ADMIN',
    'CLIENT_ADMIN'
  ),

  requireActiveClient,
];


/**
 * CLIENT_ADMIN only
 *
 * Used for creating/managing normal client users.
 */
const clientUserManageGuards = [
  authenticate,

  authorize(
    'CLIENT_ADMIN'
  ),

  requireActiveClient,
];


// ======================================================
// LIST CLIENT USERS
// ======================================================
//
// GET /api/client/users
//
// PLATFORM_ADMIN:
//   req.clientId comes from session.activeClientId
//
// CLIENT_ADMIN:
//   req.clientId comes from req.user.client_id
//
// ======================================================

router.get(
  '/',
  ...clientUserViewGuards,
  getClientUsers
);


// ======================================================
// CREATE CLIENT USER
// ======================================================
//
// POST /api/client/users
//
// CLIENT_ADMIN only.
//
// Allowed roles should be enforced by service:
//
// CONTENT_CREATOR
// EDITOR
// APPROVER
//
// Not allowed:
//
// CLIENT_ADMIN
// PLATFORM_ADMIN
//
// ======================================================

router.post(
  '/',
  ...clientUserManageGuards,
  createUser
);


module.exports =
  router;