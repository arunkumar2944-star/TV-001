'use strict';

/**
 * News posts, their media and their workflow actions.
 * ADMIN and EDITOR have identical access here (business rule 4).
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const newsController = require('../controllers/newsController');
const mediaController = require('../controllers/mediaController');
const approvalController = require('../controllers/approvalController');
const publishController = require('../controllers/publishController');
const { authenticate } = require('../middleware/authenticate');
const { staffOnly } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { mediaUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiters');
const { idParam } = require('../validators/common');
const {
  createNewsSchema,
  updateNewsSchema,
  listNewsSchema,
  reorderMediaSchema,
  platformContentSchema,
} = require('../validators/newsValidators');
const { approveSchema, rejectSchema } = require('../validators/workflowValidators');

const router = express.Router();

router.use(authenticate, staffOnly);

// ---- form metadata --------------------------------------------------------
router.get('/options', asyncHandler(newsController.getFormOptions));

// ---- posts ----------------------------------------------------------------
router.get('/', validate({ query: listNewsSchema }), asyncHandler(newsController.listNews));
router.post('/', validate({ body: createNewsSchema }), asyncHandler(newsController.createNews));
router.get('/:id', validate({ params: idParam }), asyncHandler(newsController.getNews));
router.patch(
  '/:id',
  validate({ params: idParam, body: updateNewsSchema }),
  asyncHandler(newsController.updateNews)
);
router.delete('/:id', validate({ params: idParam }), asyncHandler(newsController.deleteNews));
router.post('/:id/archive', validate({ params: idParam }), asyncHandler(newsController.archiveNews));
router.get('/:id/readiness', validate({ params: idParam }), asyncHandler(newsController.readiness));
router.put(
  '/:id/platform-content',
  validate({ params: idParam, body: platformContentSchema }),
  asyncHandler(newsController.setPlatformContent)
);

// ---- media ----------------------------------------------------------------
router.get('/:id/media', validate({ params: idParam }), asyncHandler(mediaController.listMedia));
router.post(
  '/:id/media',
  uploadLimiter,
  validate({ params: idParam }),
  mediaUpload,
  asyncHandler(mediaController.uploadMedia)
);
router.patch(
  '/:id/media/order',
  validate({ params: idParam, body: reorderMediaSchema }),
  asyncHandler(mediaController.reorderMedia)
);

// ---- approval workflow ----------------------------------------------------
router.post(
  '/:id/submit-approval',
  validate({ params: idParam }),
  asyncHandler(approvalController.submitForApproval)
);
router.post(
  '/:id/approve',
  validate({ params: idParam, body: approveSchema }),
  asyncHandler(approvalController.approve)
);
router.post(
  '/:id/reject',
  validate({ params: idParam, body: rejectSchema }),
  asyncHandler(approvalController.reject)
);
router.get('/:id/approvals', validate({ params: idParam }), asyncHandler(approvalController.history));

// ---- publishing -----------------------------------------------------------
router.post('/:id/publish', validate({ params: idParam }), asyncHandler(publishController.publish));

module.exports = router;
