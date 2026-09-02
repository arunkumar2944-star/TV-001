'use strict';

const crypto = require('crypto');
const logger = require('../utils/logger');
const { config } = require('../config/env');

/** Attaches a request id and logs a one-line summary when the response ends. */
function requestContext(req, res, next) {
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  if (config.isTest) return next();

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info('request', {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(elapsedMs),
      userId: req.user ? (req.user.user_id ?? req.user.id) : null,
    });
  });
  return next();
}

module.exports = requestContext;
