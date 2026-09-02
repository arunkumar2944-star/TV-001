'use strict';

/**
 * Operational error carrying an HTTP status and a message that is SAFE to send
 * to the client. Anything thrown that is not an ApiError is treated as an
 * unexpected failure and reported to the client as a generic 500.
 */
class ApiError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.expose = true;
    this.code = options.code;
    this.details = options.details;
    if (options.cause) this.cause = options.cause;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message = 'Invalid request', options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'Authentication required', options) {
    return new ApiError(401, message, options);
  }

  static forbidden(message = 'You are not allowed to perform this action', options) {
    return new ApiError(403, message, options);
  }

  static notFound(message = 'Resource not found', options) {
    return new ApiError(404, message, options);
  }

  static conflict(message = 'Request conflicts with the current state', options) {
    return new ApiError(409, message, options);
  }

  static unprocessable(message = 'Request could not be processed', options) {
    return new ApiError(422, message, options);
  }

  static tooManyRequests(message = 'Too many requests', options) {
    return new ApiError(429, message, options);
  }

  static internal(message = 'Internal server error', options) {
    return new ApiError(500, message, options);
  }

  static badGateway(message = 'Upstream service failed', options) {
    return new ApiError(502, message, options);
  }
}

module.exports = ApiError;
