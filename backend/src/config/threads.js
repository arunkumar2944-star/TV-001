'use strict';

const { config } = require('./env');

/**
 * Threads-specific configuration.
 *
 * Threads has its own App ID / App Secret in the Meta App Dashboard.
 * We prefer dedicated environment variables and keep the existing Meta
 * values only as a compatibility fallback for projects where both products
 * use the same configured credentials.
 */
const threadsConfig = Object.freeze({
  appId:
    process.env.META_THREADS_APP_ID ||
    config.meta?.threadsAppId ||
    config.meta?.appId ||
    null,

  appSecret:
    process.env.META_THREADS_APP_SECRET ||
    config.meta?.threadsAppSecret ||
    config.meta?.appSecret ||
    null,

  callbackUrl:
    process.env.META_THREADS_CALLBACK_URI ||
    config.meta?.threadsCallbackUrl ||
    null,

  frontendUrl:
    config.frontendUrl ||
    config.frontendUrls?.[0] ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173',

  authorizationUrl: 'https://threads.net/oauth/authorize',
  apiUrl: 'https://graph.threads.net',

  // Keep publish permission now so the client will not have to authorize
  // Threads again when the publishing phase is added later.
  scopes: Object.freeze([
    'threads_basic',
    'threads_content_publish',
  ]),
});

module.exports = {
  threadsConfig,
};
