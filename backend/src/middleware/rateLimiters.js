'use strict';

/**
 * Rate limiting.
 *
 * A strict limiter protects the login endpoint from credential stuffing; a
 * looser one protects the rest of the API from runaway clients.
 */

const rateLimit = require('express-rate-limit');
const { config } = require('../config/env');

const jsonHandler = (message) => (req, res) => {
  res.status(429).json({ success: false, message });
};

const loginLimiter = rateLimit({
  windowMs: config.auth.loginRateLimitWindowMs,
  limit: config.auth.loginRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: jsonHandler('Too many sign-in attempts. Please wait a few minutes and try again.'),
});

const apiLimiter = rateLimit({
  windowMs: config.auth.apiRateLimitWindowMs,
  limit: config.auth.apiRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: jsonHandler('Too many requests. Please slow down.'),
});

/** Uploads are expensive; keep a tighter budget on them. */
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: jsonHandler('Too many uploads in a short time. Please wait a moment.'),
});

module.exports = { loginLimiter, apiLimiter, uploadLimiter };
