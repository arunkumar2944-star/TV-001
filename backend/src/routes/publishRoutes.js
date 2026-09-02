'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const publishController = require('../controllers/publishController');
const { authenticate } = require('../middleware/authenticate');
const { staffOnly } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { idParam, jobIdParam } = require('../validators/common');
const { listPublishSchema, retrySchema } = require('../validators/workflowValidators');

const router = express.Router();

router.use(authenticate, staffOnly);

router.get('/', validate({ query: listPublishSchema }), asyncHandler(publishController.listPublish));
router.get('/integration', asyncHandler(publishController.integrationStatus));
router.get('/news/:id', validate({ params: idParam }), asyncHandler(publishController.getPublishDetail));
router.get('/:jobId', validate({ params: jobIdParam }), asyncHandler(publishController.getPublishJob));
router.post(
  '/:jobId/retry',
  validate({ params: jobIdParam, body: retrySchema }),
  asyncHandler(publishController.retry)
);

module.exports = router;
