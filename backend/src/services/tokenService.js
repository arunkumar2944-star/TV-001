'use strict';

/**
 * Session tokens.
 *
 * A JWT signed with AUTH_SECRET is delivered in an HTTP-only cookie, so the
 * token is never readable by JavaScript in the browser and AUTH_SECRET never
 * leaves the server.
 *
 * Logout revokes the token id (jti) in addition to clearing the cookie. The
 * revocation list is in-process: it is correct for the single-instance office
 * deployment this system targets. Behind more than one API instance, back it
 * with Redis (see AUTHENTICATION.md) - the interface below does not change.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

const revoked = new Map(); // jti -> expiry epoch seconds
let sweepTimer = null;

function sweep() {
  const now = Math.floor(Date.now() / 1000);
  for (const [jti, expiresAt] of revoked) {
    if (expiresAt <= now) revoked.delete(jti);
  }
}

function ensureSweeper() {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweep, 10 * 60 * 1000);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
}

function sign(user) {
  ensureSweeper();
  const userId = user.user_id ?? user.id;
  if (!userId) throw new Error('Cannot create session token without user id');
  const payload = {
    sub: String(userId),
    role: user.role,
    email: user.email,
    name: user.full_name,
    client_id: user.client_id ?? null,
  };
  return jwt.sign(payload, config.auth.secret, {
    expiresIn: config.auth.tokenTtl,
    issuer: 'trichy-vision',
    audience: 'trichy-vision-app',
    jwtid: crypto.randomUUID(),
  });
}

/** @throws {Error} when the token is invalid, expired or revoked */
function verify(token) {
  const decoded = jwt.verify(token, config.auth.secret, {
    issuer: 'trichy-vision',
    audience: 'trichy-vision-app',
  });
  if (decoded.jti && revoked.has(decoded.jti)) {
    const error = new Error('Token revoked');
    error.name = 'TokenRevokedError';
    throw error;
  }
  return decoded;
}

function revoke(token) {
  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.jti) {
      revoked.set(decoded.jti, decoded.exp || Math.floor(Date.now() / 1000) + 86400);
    }
  } catch {
    // A malformed token cannot be replayed anyway.
  }
}

/** Test helper - clears in-process state. */
function _reset() {
  revoked.clear();
}

module.exports = { sign, verify, revoke, _reset };
