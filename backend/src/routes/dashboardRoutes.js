'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/authenticate');
const { staffOnly } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { listAuditSchema, dashboardStatsSchema } = require('../validators/workflowValidators');

const router = express.Router();

router.use(authenticate, staffOnly);

router.get('/summary', asyncHandler(dashboardController.summary));
router.get('/publishing', validate({ query: dashboardStatsSchema }), asyncHandler(dashboardController.publishing));
router.get('/activity', asyncHandler(dashboardController.activity));
router.get('/audit', validate({ query: listAuditSchema }), asyncHandler(dashboardController.audit));

module.exports = router;
