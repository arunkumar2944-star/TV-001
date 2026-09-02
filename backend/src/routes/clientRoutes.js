'use strict';

const express = require('express');

const clientController =
  require('../controllers/clientController');

const { authenticate } =
  require('../middleware/authenticate');

const { authorize } =
  require('../middleware/authorize');

const router = express.Router();


// ======================================================
// CREATE CLIENT
// ======================================================

router.post(
  '/',
  authenticate,
  authorize('PLATFORM_ADMIN'),
  clientController.createClient
);


// ======================================================
// LIST CLIENTS
// ======================================================

router.get(
  '/',
  authenticate,
  authorize('PLATFORM_ADMIN'),
  clientController.listClients
);


// ======================================================
// GET CLIENT BY ID
// ======================================================

router.get(
  '/:clientId',
  authenticate,
  authorize('PLATFORM_ADMIN'),
  clientController.getClientById
);


// ======================================================
// ACTIVATE / DEACTIVATE CLIENT
// ======================================================

router.patch(
  '/:clientId/status',
  authenticate,
  authorize('PLATFORM_ADMIN'),
  clientController.setClientActiveStatus
);


module.exports = router;