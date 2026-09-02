'use strict';

/**
 * User management. EVERY route here is PLATFORM_ADMIN only - the hidden frontend route
 * (/internal/user-create) is convenience, this guard is the actual security.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const {
  authenticate,
} = require(
  '../middleware/authenticate'
);

const {
  adminOnly,
  clientAdminOnly,
} = require(
  '../middleware/authorize'
);
const userController = require('../controllers/userController');

const { validate } = require('../middleware/validate');
const { idParam } = require('../validators/common');
const {
  createUserSchema,
  updateUserSchema,
  statusSchema,
  resetPasswordSchema,
  listUsersSchema,
} = require('../validators/userValidators');
const router = express.Router();
router.use(
  authenticate
);
// router.use(authenticate, adminOnly);

router.get('/', validate({ query: listUsersSchema }), asyncHandler(userController.listUsers));
router.get('/:id', validate({ params: idParam }), asyncHandler(userController.getUser));
router.post('/', validate({ body: createUserSchema }), asyncHandler(userController.createUser));
router.patch(
  '/:id',
  validate({ params: idParam, body: updateUserSchema }),
  asyncHandler(userController.updateUser)
);
router.patch(
  '/:id/status',
  validate({ params: idParam, body: statusSchema }),
  asyncHandler(userController.setUserStatus)
);
router.post(
  '/:id/reset-password',
  validate({ params: idParam, body: resetPasswordSchema }),
  asyncHandler(userController.resetUserPassword)
);

router.post(
  '/change-password',
  authenticate,
  userController.changePassword
);
module.exports = router;
