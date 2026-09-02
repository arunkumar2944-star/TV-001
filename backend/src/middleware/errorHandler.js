'use strict';

/**
 * Centralised error handling.
 *
 * Clients always receive { success:false, message } - never a stack trace,
 * never a PostgreSQL error, never a secret. Full detail is logged server side.
 */

const multer = require('multer');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { config } = require('../config/env');

/** PostgreSQL SQLSTATEs we can translate into something a newsroom user understands. */
const PG_MESSAGES = {
  '23505': 'That record already exists',
  '23503': 'A related record is missing or still in use',
  '23502': 'A required field is missing',
  '22001': 'One of the values is too long',
  '23514': 'A value is outside the range this system allows',
  '57014': 'The database took too long to respond, please try again',
};

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}


function errorHandler(error, req, res, next) {
  let status = 500;
  let message = 'Something went wrong. Please try again.';
  let details;
  let code;

  if (error instanceof ApiError) {
    status = error.status;
    message = error.message;
    details = error.details;
    code = error.code;
  } else if (error instanceof multer.MulterError) {
    status = 400;
    code = error.code;
    message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `File is larger than the ${config.storage.maxUploadSizeMb} MB limit`
        : error.code === 'LIMIT_FILE_COUNT'
          ? `Too many files in one upload (limit ${config.storage.maxUploadFiles})`
          : 'Upload rejected';
  } else if (error && error.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  } else if (error && error.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  } else if (error && typeof error.code === 'string' && PG_MESSAGES[error.code]) {
    status = 409;
    message = PG_MESSAGES[error.code];
    code = error.code;
  }

  const logPayload = {
    method: req.method,
    url: req.originalUrl,
    status,
    userId: req.user ? (req.user.user_id ?? req.user.id) : null,
    requestId: req.id,
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      detail: error.detail,
    },
  };

  if (status >= 500) {
    logger.error('Unhandled request failure', { ...logPayload, stack: error.stack });
  } else {
    logger.warn('Request rejected', logPayload);
  }

  const body = { success: false, message };
  if (details) body.details = details;
  if (code) body.code = code;
  // Stack traces are development only and never leak in production.
  if (!config.isProduction && status >= 500) body.debug = error.message;

  res.status(status).json(body);
}

module.exports = { errorHandler, notFoundHandler };
