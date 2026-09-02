'use strict';

/**
 * Wraps an async route handler so rejected promises reach the central error
 * handler. (Express 5 forwards them automatically; the wrapper keeps the intent
 * explicit and keeps handlers portable.)
 */
module.exports = function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};
