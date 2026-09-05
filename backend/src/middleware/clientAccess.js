'use strict';

const ApiError =
  require('../utils/ApiError');

/**
 * Protect routes that operate on
 * /clients/:clientId resources.
 *
 * PLATFORM_ADMIN:
 * - Can manage any valid client.
 *
 * CLIENT_ADMIN:
 * - Can manage only the client linked
 *   to their authenticated account.
 *
 * IMPORTANT:
 * Authentication and role authorization
 * must run before this middleware.
 */

/**
 * Resolve client ID safely.
 *
 * Priority:
 * 1. Route parameter /clients/:clientId
 * 2. Existing req.clientId
 */
function resolveRequestedClientId(req) {
  const routeClientId =
    Number(
      req.params?.clientId
    );

  if (
    Number.isInteger(routeClientId) &&
    routeClientId > 0
  ) {
    return routeClientId;
  }

  const requestClientId =
    Number(
      req.clientId
    );

  if (
    Number.isInteger(requestClientId) &&
    requestClientId > 0
  ) {
    return requestClientId;
  }

  return null;
}

function requireClientAccess(
  req,
  res,
  next
) {
  const requestedClientId =
    resolveRequestedClientId(req);

  if (!requestedClientId) {
    return next(
      ApiError.badRequest(
        'Invalid client ID'
      )
    );
  }

  if (!req.user) {
    return next(
      ApiError.unauthorized(
        'Authentication required'
      )
    );
  }

  const role =
    String(
      req.user.role || ''
    )
      .trim()
      .toUpperCase();

  /**
   * Normalize the validated client ID
   * onto req.clientId.
   *
   * Downstream controllers/services can
   * safely use req.clientId.
   */
  req.clientId =
    requestedClientId;

  /**
   * PLATFORM ADMIN
   *
   * Can manage any client.
   */
  if (
    role === 'PLATFORM_ADMIN'
  ) {
    return next();
  }

  /**
   * CLIENT ADMIN
   *
   * Can manage only their own client.
   */
  const userClientId =
    Number(
      req.user.client_id ??
      req.user.clientId
    );

  if (
    role === 'CLIENT_ADMIN' &&
    Number.isInteger(
      userClientId
    ) &&
    userClientId > 0 &&
    userClientId ===
      requestedClientId
  ) {
    return next();
  }

  return next(
    ApiError.forbidden(
      'You do not have access to this client'
    )
  );
}

module.exports = {
  requireClientAccess,
};