'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const authController = require('../controllers/authController');
const { authenticate,optionalAuthenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimiters');
const { loginSchema, changePasswordSchema } = require('../validators/authValidators');
const activeClientController =
  require(
    '../controllers/activeClient.controller'
  );
const router = express.Router();

router.get('/csrf', asyncHandler(authController.csrf));
router.post('/login', loginLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
router.post('/logout', authenticate, asyncHandler(authController.logout));
router.get(
  '/me',
  optionalAuthenticate,
  asyncHandler(
    authController.me
  )
);
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword)
);
router.get(
  '/active-client',
  authenticate,
  asyncHandler(activeClientController.getActiveClient)
);

router.post(
  '/active-client',
  authenticate,
  asyncHandler(
    activeClientController
      .setActiveClient
  )
);

router.delete(
  '/active-client',
  authenticate,
  asyncHandler(
    activeClientController
      .clearActiveClient
  )
);
module.exports = router;
