'use strict';

/**
 * Authenticates inbound n8n requests with the shared secret (header) or an
 * HMAC-SHA256 signature over the raw body. Cookies and CSRF do not apply here.
 */

const n8nService = require('../services/n8nService');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

function n8nAuth(req, res, next) {
  const result = n8nService.verifyInbound(req);
  if (!result.ok) {
    logger.warn('Rejected n8n callback', {
      ip: req.ip,
      url: req.originalUrl,
      reason: result.reason,
    });
    return next(ApiError.unauthorized('Invalid automation credentials'));
  }
  req.n8nAuthMethod = result.method;
  return next();
}

module.exports = n8nAuth;
