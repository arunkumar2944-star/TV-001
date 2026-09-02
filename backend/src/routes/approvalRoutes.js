'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const approvalController = require('../controllers/approvalController');
const { authenticate } = require('../middleware/authenticate');
const { staffOnly } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { listApprovalsSchema } = require('../validators/workflowValidators');

const router = express.Router();

router.use(authenticate, staffOnly);

router.get('/', validate({ query: listApprovalsSchema }), asyncHandler(approvalController.listApprovals));

module.exports = router;
