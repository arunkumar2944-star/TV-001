'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const mediaController = require('../controllers/mediaController');
const { authenticate } = require('../middleware/authenticate');
const { staffOnly } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { idParam } = require('../validators/common');

const router = express.Router();

router.use(authenticate, staffOnly);

router.get('/:id/file', validate({ params: idParam }), asyncHandler(mediaController.streamMedia));
router.get('/:id/download', validate({ params: idParam }), asyncHandler(mediaController.downloadMedia));
router.delete('/:id', validate({ params: idParam }), asyncHandler(mediaController.deleteMedia));

module.exports = router;
