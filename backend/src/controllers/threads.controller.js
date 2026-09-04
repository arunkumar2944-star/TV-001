'use strict';

const threadsService = require('../services/threads.service');
const { threadsConfig } = require('../config/threads');
const logger = require('../utils/logger');

function getUserId(user) {
  return (
    user?.user_id ??
    user?.id ??
    user?.userId ??
    null
  );
}

function getClientId(req) {
  return Number(
    req.clientId ??
    req.params?.clientId
  );
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      resolve();
      return;
    }

    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function getSocialConnectionsUrl() {
  return new URL(
    '/client/social-connections',
    threadsConfig.frontendUrl
  ).toString();
}

async function startThreadsOAuth(req, res, next) {
  try {
    const result = await threadsService.startOAuth({
      clientId: getClientId(req),
      userId: getUserId(req.user),
      session: req.session,
    });

    // Persist state before the browser leaves for Threads.
    await saveSession(req);

    return res.status(200).json({
      success: true,
      data: {
        authorizationUrl: result.authorizationUrl,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Meta redirects the browser here. This endpoint intentionally returns the
 * browser to a clean React URL. The one-time OAuth outcome remains in the
 * authenticated server session and is consumed by the React page afterward.
 */
async function threadsOAuthCallback(req, res) {
  try {
    await threadsService.handleOAuthCallback({
      query: req.query,
      session: req.session,
    });

    await saveSession(req);
  } catch (error) {
    logger.error('Threads OAuth callback failed', {
      message: error?.message,
      code: error?.details?.code || error?.code || null,
    });

    try {
      await saveSession(req);
    } catch (sessionError) {
      logger.error('Threads OAuth outcome session save failed', {
        message: sessionError?.message,
      });
    }
  }

  return res.redirect(getSocialConnectionsUrl());
}

async function getThreadsOAuthResult(req, res, next) {
  try {
    const clientId = getClientId(req);

    const outcome = threadsService.consumeOAuthOutcome(
      req.session,
      clientId
    );

    await saveSession(req);

    return res.status(200).json({
      success: true,
      data: outcome,
    });
  } catch (error) {
    return next(error);
  }
}

async function testThreadsConnection(req, res, next) {
  try {
    const result = await threadsService.verifyConnection({
      clientId: getClientId(req),
      connectionId: Number(req.params.connectionId),
    });

    return res.status(200).json({
      success: true,
      message: 'Threads connection verified successfully.',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  startThreadsOAuth,
  threadsOAuthCallback,
  getThreadsOAuthResult,
  testThreadsConnection,
};
