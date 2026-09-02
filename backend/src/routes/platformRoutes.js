'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const platformService = require('../services/platformService');
const { authenticate } = require('../middleware/authenticate');
const { staffOnly } = require('../middleware/authorize');
const { ok } = require('../utils/respond');

const router = express.Router();

router.use(authenticate, staffOnly);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const platforms = await platformService.listPlatforms({
      activeOnly: req.query.all !== 'true',
    });
    return ok(res, platforms);
  })
);

module.exports = router;
