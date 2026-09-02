'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { createPlatformAdmin } = require('../controllers/user.controller');

const router = express.Router();

// One-time bootstrap. The service rejects this after the first PLATFORM_ADMIN exists.
router.post('/', asyncHandler(createPlatformAdmin));

module.exports = router;
