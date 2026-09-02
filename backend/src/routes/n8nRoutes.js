'use strict';

/**
 * The n8n integration boundary.
 *
 * Authentication here is the shared secret / HMAC signature - NOT a user
 * session - so these routes are deliberately outside the cookie + CSRF stack.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const n8nController = require('../controllers/n8nController');
const mediaController = require('../controllers/mediaController');
const n8nAuth = require('../middleware/n8nAuth');
const { validate } = require('../middleware/validate');
const { idParam, jobIdParam } = require('../validators/common');
const { publishResultSchema, jobProgressSchema } = require('../validators/workflowValidators');

const router = express.Router();

router.use(n8nAuth);

router.get('/health', asyncHandler(n8nController.health));
router.get('/jobs/:jobId', validate({ params: jobIdParam }), asyncHandler(n8nController.getJobContent));
router.get('/media/:id/file', validate({ params: idParam }), asyncHandler(mediaController.streamMedia));
router.post(
  '/publish-result',
  validate({ body: publishResultSchema }),
  asyncHandler(n8nController.publishResult)
);
router.post('/job-progress', validate({ body: jobProgressSchema }), asyncHandler(n8nController.jobProgress));

module.exports = router;
