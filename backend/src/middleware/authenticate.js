'use strict';

/**
 * Authentication middleware.
 *
 * Reads the session token from the HTTP-only cookie (an Authorization: Bearer
 * header is accepted as well for server-to-server tooling and tests), verifies
 * the signature, then re-loads the user on every request so a deactivated
 * account loses access immediately instead of at token expiry.
 */

const tokenService = require('../services/tokenService');
const userService = require('../services/userService');
const ApiError = require('../utils/ApiError');
const { config } = require('../config/env');

function extractToken(req) {
  const cookieToken = req.cookies ? req.cookies[config.auth.cookieName] : null;
  if (cookieToken) return { token: cookieToken, source: 'cookie' };

  const header = req.get('authorization');
  if (header && header.toLowerCase().startsWith('bearer ')) {
    return { token: header.slice(7).trim(), source: 'header' };
  }
  return { token: null, source: null };
}

async function authenticate(req, res, next) {
  try {
    const { token, source } = extractToken(req);
    if (!token) throw ApiError.unauthorized('Authentication required');

    let claims;
    try {
      claims = tokenService.verify(token);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('Your session has expired, please sign in again');
      }
      throw ApiError.unauthorized('Invalid session');
    }

    const user = await userService.findById(Number(claims.sub));
    if (!user) throw ApiError.unauthorized('Invalid session');
    if (!user.is_active) throw ApiError.forbidden('This account has been deactivated');

    req.user = user;
    req.authToken = token;
    req.authSource = source;
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Populates req.user when a valid session exists, but never rejects. */
async function optionalAuthenticate(req, res, next) {
  try {
    const { token } = extractToken(req);
    if (!token) return next();
    const claims = tokenService.verify(token);
    const user = await userService.findById(Number(claims.sub));
    if (user && user.is_active) {
      req.user = user;
      req.authToken = token;
    }
  } catch {
    // Anonymous request - carry on.
  }
  return next();
}

module.exports = { authenticate, optionalAuthenticate, extractToken };
