'use strict';

const express =
  require('express');

const {
  getClientUsers,
  getClientUserDetails,
  createUser,
  updateUserStatus,
  updateUserProfile,
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
 *   - can VIEW users for the selected active client
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
 * CLIENT_ADMIN only.
 *
 * Used when creating normal client users.
 *
 * Allowed target roles:
 *   CONTENT_CREATOR
 *   APPROVER
 *
 * CLIENT_ADMIN creation is handled separately through:
 *
 *   POST /api/client/admin
 *
 * PLATFORM_ADMIN must not use POST /api/client/users
 * to create users.
 */
const clientUserCreateGuards = [
  authenticate,

  authorize(
    'CLIENT_ADMIN'
  ),

  requireActiveClient,
];


/**
 * PLATFORM_ADMIN
 *   - may activate/deactivate CLIENT_ADMIN
 *     belonging to the active client
 *
 * CLIENT_ADMIN
 *   - may activate/deactivate CONTENT_CREATOR
 *     and APPROVER belonging to their client
 *
 * IMPORTANT:
 *
 * The route only decides which authenticated roles may
 * reach the operation.
 *
 * The service layer must validate whether the acting
 * user is allowed to modify the requested target user.
 */
const clientUserStatusGuards = [
  authenticate,

  authorize(
    'PLATFORM_ADMIN',
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
//   req.clientId comes from the selected active client.
//
// CLIENT_ADMIN:
//   req.clientId comes from req.user.client_id.
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
// Allowed roles:
//
//   CONTENT_CREATOR
//   APPROVER
//
// Not allowed:
//
//   CLIENT_ADMIN
//   PLATFORM_ADMIN
//
// CLIENT_ADMIN creation belongs to:
//
//   POST /api/client/admin
//
// ======================================================

router.post(
  '/',
  ...clientUserCreateGuards,
  createUser
);


// ======================================================
// ACTIVATE / DEACTIVATE CLIENT USER
// ======================================================
//
// PATCH /api/client/users/:userId/status
//
// Request:
//
// {
//   "isActive": false
// }
//
// PLATFORM_ADMIN:
//   can manage CLIENT_ADMIN for active client.
//
// CLIENT_ADMIN:
//   can manage CONTENT_CREATOR / APPROVER
//   for own client.
//
// Service layer must additionally enforce:
//
// - target user belongs to req.clientId
// - PLATFORM_ADMIN cannot change normal client users
// - CLIENT_ADMIN cannot change CLIENT_ADMIN
// - nobody can change PLATFORM_ADMIN here
// - CLIENT_ADMIN cannot deactivate themselves
// - userId must be valid
//
// ======================================================

router.patch(
  '/:userId/status',
  ...clientUserStatusGuards,
  updateUserStatus
);

router.get(
  '/:userId',
  ...clientUserViewGuards,
  getClientUserDetails
);

router.patch(
  '/:userId/profile',
  ...clientUserStatusGuards,
  updateUserProfile
);

module.exports =
  router;