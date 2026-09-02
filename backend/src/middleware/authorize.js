'use strict';

/**
 * Role-based authorization middleware.
 *
 * Authentication must run before this middleware. Errors are delegated to the
 * central error handler so every API response uses the same envelope.
 */

const ApiError = require('../utils/ApiError');

function authorize(...allowedRoles) {
  const normalizedAllowedRoles = allowedRoles.map((role) =>
    String(role).trim().toUpperCase()
  );

  return function authorizationMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    const userRole = String(req.user.role || '')
      .trim()
      .toUpperCase();

    if (!userRole) {
      return next(ApiError.forbidden('User role is missing'));
    }

    if (!normalizedAllowedRoles.includes(userRole)) {
      return next(
        ApiError.forbidden('You do not have permission to perform this action')
      );
    }

    return next();
  };
}

const adminOnly = authorize('PLATFORM_ADMIN');
const clientAdminOnly = authorize('PLATFORM_ADMIN', 'CLIENT_ADMIN');
const clientOwnerOnly =
  authorize(
    'CLIENT_ADMIN'
  );
const staffOnly = authorize(
  'PLATFORM_ADMIN',
  'CLIENT_ADMIN',
  'CONTENT_CREATOR',
  'EDITOR',
  'APPROVER'
);

module.exports = {
  authorize,
  adminOnly,
  clientAdminOnly,
  clientOwnerOnly,
  staffOnly,
};
