'use strict';

/**
 * Login / logout.
 *
 * Failure responses are deliberately identical for "no such account" and "wrong
 * password" so the endpoint cannot be used to enumerate staff email addresses.
 */

const userService = require('./userService');
const passwordService = require('./passwordService');
const tokenService = require('./tokenService');
const auditService = require('./auditService');
const ApiError = require('../utils/ApiError');
const { AUDIT_STAGE, AUDIT_STATUS } = require('../config/constants');

const GENERIC_FAILURE = 'Invalid email or password';

async function login({ email, password }, context = {}) {
  const user = await userService.findByEmailWithSecret(email);

  const passwordMatches = await passwordService.compare(password, user ? user.password_hash : null);

  if (!user || !passwordMatches) {
    auditService.recordSafe({
      actorUserId: user ? user.user_id : null,
      stage: AUDIT_STAGE.LOGIN_FAILED,
      status: AUDIT_STATUS.FAILED,
      message: `Failed sign-in attempt for ${String(email || '').slice(0, 120)}`,
      metadata: { ip: context.ip, userAgent: context.userAgent },
    });
    throw ApiError.unauthorized(GENERIC_FAILURE);
  }

  if (!user.is_active) {
    auditService.recordSafe({
      actorUserId: user.user_id,
      stage: AUDIT_STAGE.LOGIN_FAILED,
      status: AUDIT_STATUS.FAILED,
      message: 'Sign-in blocked: account is deactivated',
      metadata: { ip: context.ip },
    });
    throw ApiError.forbidden('This account has been deactivated. Contact an administrator.');
  }

  const safeUser = userService.toPublic(user);
  const token = tokenService.sign(safeUser);

  await userService.recordLogin(safeUser.user_id);
  auditService.recordSafe({
    actorUserId: safeUser.user_id,
    stage: AUDIT_STAGE.LOGIN,
    status: AUDIT_STATUS.SUCCESS,
    message: `${safeUser.full_name} signed in`,
    metadata: { ip: context.ip, userAgent: context.userAgent },
  });

  return { user: safeUser, token };
}

async function logout(user, token, context = {}) {
  if (token) tokenService.revoke(token);
  if (user) {
    auditService.recordSafe({
      actorUserId: user.user_id,
      stage: AUDIT_STAGE.LOGOUT,
      status: AUDIT_STATUS.INFO,
      message: `${user.full_name} signed out`,
      metadata: { ip: context.ip },
    });
  }
}

module.exports = { login, logout, GENERIC_FAILURE };
