'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { requireActiveClient } = require('../middleware/activeClient.middleware');
const clientController = require('../controllers/clientController');
const clientUsersController = require('../controllers/clientUsers.controller');
const socialConnectionsController = require('../controllers/socialConnections.controller');
const facebookController = require('../controllers/facebook.controller');

const router = express.Router();

router.use(authenticate);
router.use(requireActiveClient);

const clientAdmins = authorize('PLATFORM_ADMIN', 'CLIENT_ADMIN');

router.get('/', clientAdmins, clientController.getClientById);

router.get('/users', authorize('PLATFORM_ADMIN'), clientUsersController.getClientUsers);
router.post('/users', authorize('PLATFORM_ADMIN'), clientUsersController.createUser);

router.get('/social-connections', clientAdmins, socialConnectionsController.getClientSocialConnections);
router.post(
  '/social-connections/:connectionId/verify',
  clientAdmins,
  socialConnectionsController.verifySocialConnection
);
router.delete(
  '/social-connections/:connectionId',
  clientAdmins,
  socialConnectionsController.disconnectConnection
);

router.get(
  '/social-connections/facebook/oauth/start',
  clientAdmins,
  facebookController.startFacebookConnect
);
router.get(
  '/social-connections/facebook/oauth-result',
  clientAdmins,
  facebookController.getFacebookOAuthResult
);
router.delete(
  '/social-connections/facebook/oauth-result',
  clientAdmins,
  facebookController.cancelFacebookOAuth
);
router.get(
  '/social-connections/facebook/pages',
  clientAdmins,
  facebookController.getFacebookPages
);
router.post(
  '/social-connections/facebook/connect',
  clientAdmins,
  facebookController.selectFacebookPage
);

module.exports = router;
