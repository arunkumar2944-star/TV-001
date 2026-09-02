'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Protect routes that operate on /clients/:clientId resources.
 *
 * PLATFORM_ADMIN can manage any client. CLIENT_ADMIN can manage only the
 * client linked to their account. Authentication and role authorization must
 * run before this middleware.
 */
function requireClientAccess(req, res, next) {
  const requestedClientId = Number(req.clientId);

  if (!Number.isInteger(requestedClientId) || requestedClientId <= 0) {
    return next(ApiError.badRequest('Invalid client ID'));
  }

  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }

  const role = String(req.user.role || '').trim().toUpperCase();

  if (role === 'PLATFORM_ADMIN') {
    return next();
  }

  const userClientId = Number(req.user.client_id ?? req.user.clientId);

  if (
    role === 'CLIENT_ADMIN' &&
    Number.isInteger(userClientId) &&
    userClientId === requestedClientId
  ) {
    return next();
  }

  return next(
    ApiError.forbidden('You do not have access to this client')
  );
}

module.exports = { requireClientAccess };
