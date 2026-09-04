'use strict';

const express =
  require('express');

const threadsController =
  require(
    '../controllers/threads.controller'
  );

const router =
  express.Router();


/*
 * Public OAuth callback.
 *
 * Meta redirects here.
 *
 * Authentication is recovered from
 * the persistent Express session.
 */
router.get(
  '/auth/threads/callback',
  threadsController
    .threadsOAuthCallback
);


module.exports =
  router;