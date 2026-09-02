'use strict';

const express =
  require('express');

const {
  authenticate,
} =
  require('../middleware/authenticate');

const {
  authorize,
} =
  require('../middleware/authorize');

const clientAdminController =
  require(
    '../controllers/clientAdmin.controller'
  );

const router =
  express.Router();


router.post(
  '/',
  authenticate,
  authorize(
    'PLATFORM_ADMIN'
  ),
  clientAdminController
    .createClientAdmin
);


module.exports =
  router;