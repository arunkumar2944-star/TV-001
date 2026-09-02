'use strict';

const clientService = require('../services/clientService');
const ApiError = require('../utils/ApiError');

function getUserClientId(user) {
  return Number(user?.client_id ?? user?.clientId);
}

function requireSession(req) {
  if (!req.session) {
    throw ApiError.internal(
      'Server session is unavailable. Check express-session middleware configuration.'
    );
  }

  return req.session;
}

/**
 * Select the client that subsequent /api/client/* routes operate on.
 *
 * We intentionally do not call req.session.save() manually here. express-session
 * persists a modified session before the response is completed. Avoiding an
 * explicit save removes an unnecessary failure point and still guarantees that
 * the session cookie is committed before the browser follows the next route.
 */
async function setActiveClient(req, res, next) {
  try {
    const clientId = Number(req.body?.clientId);

    if (!Number.isInteger(clientId) || clientId <= 0) {
      throw ApiError.badRequest('A valid client is required.');
    }

    const client = await clientService.getClientById(clientId);
    const role = String(req.user?.role || '').trim().toUpperCase();

    if (role !== 'PLATFORM_ADMIN') {
      const userClientId = getUserClientId(req.user);

      if (role !== 'CLIENT_ADMIN' || userClientId !== clientId) {
        throw ApiError.forbidden('You do not have access to this client.');
      }
    }

    const session = requireSession(req);
    session.activeClientId = clientId;

    return res.status(200).json({
      success: true,
      message: 'Active client selected.',
      data: {
        client,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getActiveClient(req, res, next) {
  try {
    const role = String(req.user?.role || '').trim().toUpperCase();

    const clientId =
      role === 'CLIENT_ADMIN'
        ? getUserClientId(req.user)
        : Number(req.session?.activeClientId);

    if (!Number.isInteger(clientId) || clientId <= 0) {
      throw ApiError.conflict('Please select a client first.', {
        code: 'ACTIVE_CLIENT_REQUIRED',
      });
    }

    const client = await clientService.getClientById(clientId);

    return res.status(200).json({
      success: true,
      data: {
        client,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function clearActiveClient(req, res, next) {
  try {
    const session = requireSession(req);

    delete session.activeClientId;
    delete session.facebookOAuthState;
    delete session.facebookOAuthUserId;
    delete session.facebookOAuthClientId;
    delete session.facebookOAuthStartedAt;
    delete session.facebookPages;
    delete session.facebookOAuthOutcome;

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  setActiveClient,
  getActiveClient,
  clearActiveClient,
};
