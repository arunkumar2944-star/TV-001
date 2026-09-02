'use strict';

/**
 * CSRF protection - double submit cookie.
 *
 * The session lives in an HTTP-only cookie, so the browser attaches it
 * automatically and a cross-site form post would otherwise be authenticated.
 * We therefore also issue a readable `tv_csrf` cookie; the SPA echoes it in the
 * X-CSRF-Token header, which a cross-origin attacker cannot read or set.
 *
 * Exempt:
 *   - safe methods (GET/HEAD/OPTIONS)
 *   - requests authenticated with an Authorization header (no ambient cookie)
 *   - /api/n8n/* which is authenticated with the shared n8n secret / HMAC
 */

const crypto = require('crypto');
const { config } = require('../config/env');
const ApiError = require('../utils/ApiError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HEADER_NAME = 'x-csrf-token';

function cookieOptions() {
  return {
    httpOnly: false, // the SPA must read this one
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    domain: config.auth.cookieDomain,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  };
}

function issueToken(res) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(config.auth.csrfCookieName, token, cookieOptions());
  return token;
}

/** Issues a CSRF cookie when the client does not have one yet. */
function ensureCsrfCookie(req, res, next) {
  const existing = req.cookies ? req.cookies[config.auth.csrfCookieName] : null;
  req.csrfToken = existing || issueToken(res);
  next();
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const authHeader = req.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) return next();

  const cookieToken = req.cookies ? req.cookies[config.auth.csrfCookieName] : null;
  const headerToken = req.get(HEADER_NAME);

  if (!cookieToken || !headerToken || !timingSafeEqual(cookieToken, headerToken)) {
    return next(
      ApiError.forbidden('Security check failed, please refresh the page and try again', {
        code: 'CSRF_TOKEN_INVALID',
      })
    );
  }
  return next();
}

module.exports = { csrfProtection, ensureCsrfCookie, issueToken, HEADER_NAME };
