'use strict';

function requireEnv(name) {
  const value =
    String(
      process.env[name] || ''
    ).trim();

  if (!value) {
    throw new Error(
      `${name} is not configured.`
    );
  }

  return value;
}

const threadsConfig = {
  appId:
    process.env.META_THREADS_APP_ID
      ? String(
          process.env.META_THREADS_APP_ID
        ).trim()
      : '',

  appSecret:
    process.env.META_THREADS_APP_SECRET
      ? String(
          process.env.META_THREADS_APP_SECRET
        ).trim()
      : '',

  callbackUrl:
    process.env.META_THREADS_CALLBACK_URI
      ? String(
          process.env.META_THREADS_CALLBACK_URI
        ).trim()
      : '',

  frontendUrl:
    String(
      process.env.FRONTEND_URL ||
      'http://localhost:5173'
    ).trim(),
};

function validateThreadsConfig() {
  requireEnv(
    'META_THREADS_APP_ID'
  );

  requireEnv(
    'META_THREADS_APP_SECRET'
  );

  requireEnv(
    'META_THREADS_CALLBACK_URI'
  );
}

module.exports = {
  threadsConfig,
  validateThreadsConfig,
};