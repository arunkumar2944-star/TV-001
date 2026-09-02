'use strict';

/**
 * =========================================================
 * CENTRAL ENVIRONMENT CONFIGURATION
 * =========================================================
 *
 * Responsibilities:
 *
 * - Load .env exactly once
 * - Parse environment variables
 * - Provide normalized configuration
 * - Validate required production settings
 * - Support Facebook / Meta OAuth
 * - Support frontend CORS origins
 * - Support PostgreSQL / Supabase
 * - Support n8n
 * - Support local / S3 storage
 *
 * IMPORTANT:
 * Secrets must never be hard-coded here.
 */

const path = require('path');
const dotenv = require('dotenv');

/**
 * =========================================================
 * LOAD .ENV
 * =========================================================
 *
 * env.js location:
 *
 * backend/src/config/env.js
 *
 * .env location:
 *
 * backend/.env
 */

dotenv.config({
  path: path.resolve(
    __dirname,
    '..',
    '..',
    '.env'
  ),

  quiet: true,
});


/**
 * =========================================================
 * ENVIRONMENT
 * =========================================================
 */

const NODE_ENV =
  process.env.NODE_ENV ||
  'development';

const isProduction =
  NODE_ENV === 'production';

const isTest =
  NODE_ENV === 'test';


/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

function bool(
  value,
  fallback = false
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return fallback;
  }

  return [
    '1',
    'true',
    'yes',
    'on',
  ].includes(
    String(value)
      .trim()
      .toLowerCase()
  );
}


function int(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}


function list(
  value,
  fallback = []
) {
  if (!value) {
    return fallback;
  }

  return String(value)
    .split(',')
    .map(
      (item) =>
        item.trim()
    )
    .filter(Boolean);
}


function string(
  value,
  fallback = ''
) {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  return String(value).trim();
}


/**
 * =========================================================
 * FRONTEND URLS
 * =========================================================
 *
 * Supports:
 *
 * FRONTEND_URL=http://localhost:5173
 *
 * or:
 *
 * FRONTEND_URL=http://localhost:5173,https://app.example.com
 */

const frontendUrls =
  list(
    process.env.FRONTEND_URL,
    [
      'http://localhost:5173',
    ]
  );


/**
 * Primary frontend URL.
 *
 * Facebook OAuth uses this after callback:
 *
 * config.frontendUrl
 */
const frontendUrl =
  frontendUrls[0];


/**
 * =========================================================
 * META / FACEBOOK CONFIG
 * =========================================================
 *
 * We support both:
 *
 * META_CALLBACK_URL
 *
 * and the older:
 *
 * META_REDIRECT_URI
 *
 * This prevents existing configuration from breaking.
 */

const metaCallbackUrl =
  string(
    process.env.META_CALLBACK_URL
  ) ||
  string(
    process.env.META_REDIRECT_URI
  );


/**
 * =========================================================
 * MAIN CONFIGURATION
 * =========================================================
 */

const config = {

  /**
   * -------------------------------------------------------
   * APPLICATION
   * -------------------------------------------------------
   */

  env:
    NODE_ENV,

  isProduction,

  isTest,

  port:
    int(
      process.env.PORT,
      4000
    ),

  logLevel:
    process.env.LOG_LEVEL ||
    (
      isTest
        ? 'error'
        : 'info'
    ),


  /**
   * -------------------------------------------------------
   * DATABASE
   * -------------------------------------------------------
   */

  database: {

    url:
      string(
        process.env.DATABASE_URL
      ),

    ssl:
      bool(
        process.env.DATABASE_SSL,
        true
      ),

    sslRejectUnauthorized:
      bool(
        process.env
          .DATABASE_SSL_REJECT_UNAUTHORIZED,
        false
      ),

    caCertPath:
      string(
        process.env
          .DATABASE_CA_CERT
      ),

    poolMax:
      int(
        process.env
          .DATABASE_POOL_MAX,
        10
      ),

    statementTimeoutMs:
      int(
        process.env
          .DATABASE_STATEMENT_TIMEOUT_MS,
        15000
      ),
  },


  /**
   * -------------------------------------------------------
   * AUTHENTICATION
   * -------------------------------------------------------
   */

  auth: {

    secret:
      string(
        process.env.AUTH_SECRET
      ),

    tokenTtl:
      process.env
        .AUTH_TOKEN_TTL ||
      '8h',

    cookieName:
      process.env
        .AUTH_COOKIE_NAME ||
      'tv_session',

    csrfCookieName:
      process.env
        .AUTH_CSRF_COOKIE_NAME ||
      'tv_csrf',

    cookieSecure:
      bool(
        process.env
          .AUTH_COOKIE_SECURE,
        isProduction
      ),

    cookieSameSite:
      (
        process.env
          .AUTH_COOKIE_SAMESITE ||
        'lax'
      ).toLowerCase(),

    cookieDomain:
      string(
        process.env
          .AUTH_COOKIE_DOMAIN
      ) ||
      undefined,

    loginRateLimitMax:
      int(
        process.env
          .LOGIN_RATE_LIMIT_MAX,
        10
      ),

    loginRateLimitWindowMs:
      int(
        process.env
          .LOGIN_RATE_LIMIT_WINDOW_MS,
        15 * 60 * 1000
      ),

    apiRateLimitMax:
      int(
        process.env
          .API_RATE_LIMIT_MAX,
        600
      ),

    apiRateLimitWindowMs:
      int(
        process.env
          .API_RATE_LIMIT_WINDOW_MS,
        60 * 1000
      ),

    bcryptRounds:
      int(
        process.env
          .BCRYPT_ROUNDS,
        12
      ),
  },


  /**
   * -------------------------------------------------------
   * EXPRESS SESSION
   * -------------------------------------------------------
   *
   * Facebook OAuth depends on this session.
   */

  sessionSecret:
    string(
      process.env.SESSION_SECRET
    ),
  /**
   * -------------------------------------------------------
   * PERSISTENT SESSION STORE
   * -------------------------------------------------------
   */

  sessionStore: {
    cookieName:
      string(
        process.env.SESSION_COOKIE_NAME,
        'publishing.sid'
      ),

    ttlMs:
      Math.max(
        int(
          process.env.SESSION_TTL_MS,
          8 * 60 * 60 * 1000
        ),
        5 * 60 * 1000
      ),

    cleanupIntervalMs:
      Math.max(
        int(
          process.env.SESSION_CLEANUP_INTERVAL_MS,
          15 * 60 * 1000
        ),
        60 * 1000
      ),

    encryptionKey:
      string(
        process.env.SESSION_ENCRYPTION_KEY
      ) ||
      string(
        process.env.TOKEN_ENCRYPTION_KEY
      ),
  },

  /**
   * -------------------------------------------------------
   * FRONTEND
   * -------------------------------------------------------
   *
   * frontendUrls:
   * used for CORS.
   *
   * frontendUrl:
   * primary frontend used for OAuth redirects.
   */

  frontendUrls,

  frontendUrl,


  /**
   * -------------------------------------------------------
   * META / FACEBOOK
   * -------------------------------------------------------
   */

  meta: {
    appId:
      process.env.META_APP_ID?.trim(),

    appSecret:
      process.env.META_APP_SECRET?.trim(),

    callbackUrl:
      metaCallbackUrl,

    // backward compatibility
    redirectUri:
      metaCallbackUrl,
    instagramCallbackUrl:
      string(
        process.env
          .META_INSTAGRAM_CALLBACK_URL
      ),
    graphVersion:
      process.env.META_GRAPH_VERSION?.trim() ||
      'v26.0',
  },


  /**
   * -------------------------------------------------------
   * N8N
   * -------------------------------------------------------
   */

  n8n: {

    webhookUrl:
      string(
        process.env
          .N8N_WEBHOOK_URL
      ),

    webhookSecret:
      string(
        process.env
          .N8N_WEBHOOK_SECRET
      ),

    timeoutMs:
      int(
        process.env
          .N8N_TIMEOUT_MS,
        15000
      ),

    publicApiUrl:
      string(
        process.env
          .PUBLIC_API_URL
      ).replace(
        /\/+$/,
        ''
      ),
  },


  /**
   * -------------------------------------------------------
   * FILE STORAGE
   * -------------------------------------------------------
   */

  storage: {

    driver:
      (
        process.env
          .STORAGE_DRIVER ||
        'local'
      ).toLowerCase(),

    localDir:
      process.env
        .STORAGE_LOCAL_DIR ||
      './storage/uploads',

    maxUploadSizeMb:
      int(
        process.env
          .MAX_UPLOAD_SIZE_MB,
        200
      ),

    maxUploadFiles:
      int(
        process.env
          .MAX_UPLOAD_FILES,
        10
      ),

    s3: {

      endpoint:
        string(
          process.env
            .S3_ENDPOINT
        ) ||
        undefined,

      region:
        process.env
          .S3_REGION ||
        'us-east-1',

      bucket:
        string(
          process.env
            .S3_BUCKET
        ),

      accessKeyId:
        string(
          process.env
            .S3_ACCESS_KEY_ID
        ),

      secretAccessKey:
        string(
          process.env
            .S3_SECRET_ACCESS_KEY
        ),

      forcePathStyle:
        bool(
          process.env
            .S3_FORCE_PATH_STYLE,
          true
        ),

      signedUrlTtl:
        int(
          process.env
            .S3_SIGNED_URL_TTL,
          900
        ),
    },
  },


  /**
   * -------------------------------------------------------
   * TEST DATABASE
   * -------------------------------------------------------
   */

  testDatabaseUrl:
    string(
      process.env
        .TEST_DATABASE_URL
    ),
};


/**
 * =========================================================
 * URL VALIDATION HELPER
 * =========================================================
 */

function isValidHttpUrl(
  value
) {
  if (!value) {
    return false;
  }

  try {

    const url =
      new URL(value);

    return (
      url.protocol ===
      'http:' ||
      url.protocol ===
      'https:'
    );

  } catch {

    return false;
  }
}


/**
 * =========================================================
 * CONFIG VALIDATION
 * =========================================================
 */

function validate() {

  const fatal = [];

  const warnings = [];


  /**
   * -------------------------------------------------------
   * DATABASE
   * -------------------------------------------------------
   */

  if (!config.database.url) {

    fatal.push(
      'DATABASE_URL is not set - the API cannot reach the PostgreSQL database.'
    );
  }


  /**
   * -------------------------------------------------------
   * AUTH
   * -------------------------------------------------------
   */

  if (!config.auth.secret) {

    fatal.push(
      'AUTH_SECRET is not set - refusing to sign authentication tokens.'
    );

  } else if (
    config.auth.secret.length < 32
  ) {

    (
      isProduction
        ? fatal
        : warnings
    ).push(
      'AUTH_SECRET is shorter than 32 characters - generate a longer random secret.'
    );

  } else if (
    /change_me/i.test(
      config.auth.secret
    )
  ) {

    (
      isProduction
        ? fatal
        : warnings
    ).push(
      'AUTH_SECRET still contains the placeholder value.'
    );
  }


  /**
   * -------------------------------------------------------
   * SESSION
   * -------------------------------------------------------
   *
   * Required for Facebook OAuth.
   */

  if (!config.sessionSecret) {

    (
      isProduction
        ? fatal
        : warnings
    ).push(
      'SESSION_SECRET is not set - Facebook OAuth sessions will not work correctly.'
    );

  } else if (
    config.sessionSecret.length < 32
  ) {

    (
      isProduction
        ? fatal
        : warnings
    ).push(
      'SESSION_SECRET is shorter than 32 characters.'
    );
  }
  /**
   * -------------------------------------------------------
   * PERSISTENT SESSION ENCRYPTION
   * -------------------------------------------------------
   */

  if (
    !/^[a-fA-F0-9]{64}$/.test(
      config.sessionStore
        .encryptionKey || ''
    )
  ) {
    fatal.push(
      'SESSION_ENCRYPTION_KEY ' +
      '(or TOKEN_ENCRYPTION_KEY fallback) ' +
      'must be exactly 64 hexadecimal characters.'
    );
  }

  if (
    !Number.isInteger(
      config.sessionStore.ttlMs
    ) ||
    config.sessionStore.ttlMs <
    5 * 60 * 1000
  ) {
    fatal.push(
      'SESSION_TTL_MS must be at least 300000 milliseconds.'
    );
  }

  if (
    !Number.isInteger(
      config.sessionStore
        .cleanupIntervalMs
    ) ||
    config.sessionStore
      .cleanupIntervalMs <
    60 * 1000
  ) {
    fatal.push(
      'SESSION_CLEANUP_INTERVAL_MS must be at least 60000 milliseconds.'
    );
  }
  /**
   * -------------------------------------------------------
   * FRONTEND
   * -------------------------------------------------------
   */

  if (
    !config.frontendUrl
  ) {

    fatal.push(
      'FRONTEND_URL is not configured.'
    );

  } else if (
    !isValidHttpUrl(
      config.frontendUrl
    )
  ) {

    fatal.push(
      `Invalid FRONTEND_URL: ${config.frontendUrl}`
    );
  }


  /**
   * -------------------------------------------------------
   * META / FACEBOOK
   * -------------------------------------------------------
   */

  if (!config.meta.appId) {

    (
      isProduction
        ? fatal
        : warnings
    ).push(
      'META_APP_ID is not set - Facebook OAuth will not work.'
    );
  }


  if (!config.meta.appSecret) {

    (
      isProduction
        ? fatal
        : warnings
    ).push(
      'META_APP_SECRET is not set - Facebook OAuth will not work.'
    );
  }


  if (!config.meta.callbackUrl) {

    (
      isProduction
        ? fatal
        : warnings
    ).push(
      'META_CALLBACK_URL or META_REDIRECT_URI is not set - Facebook OAuth redirect_uri will be missing.'
    );

  } else if (
    !isValidHttpUrl(
      config.meta.callbackUrl
    )
  ) {

    (
      isProduction
        ? fatal
        : warnings
    ).push(
      `Invalid Meta callback URL: ${config.meta.callbackUrl}`
    );
  }


  if (
    !config.meta.graphVersion
  ) {

    warnings.push(
      'META_GRAPH_VERSION is not configured.'
    );
  }


  const tokenEncryptionKey =
    string(process.env.TOKEN_ENCRYPTION_KEY);

  if (!tokenEncryptionKey) {
    (isProduction ? fatal : warnings).push(
      'TOKEN_ENCRYPTION_KEY is not set - social access tokens cannot be stored securely.'
    );
  } else if (!/^[a-fA-F0-9]{64}$/.test(tokenEncryptionKey)) {
    (isProduction ? fatal : warnings).push(
      'TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.'
    );
  }


  /**
   * -------------------------------------------------------
   * N8N
   * -------------------------------------------------------
   */

  if (!config.n8n.webhookUrl) {

    warnings.push(
      'N8N_WEBHOOK_URL is not set - publish jobs will be queued but not dispatched.'
    );
  }


  if (!config.n8n.webhookSecret) {

    (
      isProduction
        ? fatal
        : warnings
    ).push(
      'N8N_WEBHOOK_SECRET is not set - the n8n callback endpoint cannot be authenticated.'
    );
  }


  /**
   * -------------------------------------------------------
   * COOKIE SECURITY
   * -------------------------------------------------------
   */

  if (
    isProduction &&
    !config.auth.cookieSecure
  ) {

    warnings.push(
      'AUTH_COOKIE_SECURE is false in production - cookies may travel over HTTP.'
    );
  }


  /**
   * -------------------------------------------------------
   * STORAGE
   * -------------------------------------------------------
   */

  if (
    config.storage.driver ===
    's3' &&
    !config.storage.s3.bucket
  ) {

    fatal.push(
      'STORAGE_DRIVER=s3 but S3_BUCKET is not set.'
    );
  }


  if (
    ![
      'local',
      's3',
    ].includes(
      config.storage.driver
    )
  ) {

    fatal.push(
      `Unsupported STORAGE_DRIVER "${config.storage.driver}" (expected "local" or "s3").`
    );
  }


  return {
    fatal,
    warnings,
  };
}


/**
 * =========================================================
 * EXPORTS
 * =========================================================
 */
module.exports = {
  config,
  validate,
};