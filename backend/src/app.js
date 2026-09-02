'use strict';

/**
 * Express application wiring.
 *
 * Middleware order:
 *
 *  1. Trust proxy / Express settings
 *  2. Helmet
 *  3. CORS
 *  4. Request context
 *  5. Body parsing
 *  6. Cookie parser
 *  7. Persistent Express session
 *  8. Rate limiting
 *  9. CSRF cookie initialization
 * 10. CSRF protection
 * 11. Facebook OAuth / connection routes
 * 12. Instagram OAuth / connection routes
 * 13. User routes
 * 14. Client Admin onboarding routes
 * 15. Client user routes
 * 16. Active-client routes
 * 17. Platform-admin routes
 * 18. Client-management routes
 * 19. Application routes
 * 20. Social-connection routes
 * 21. Root / health
 * 22. 404
 * 23. Central error handler
 */


const express =
  require('express');

const cors =
  require('cors');

const session =
  require('express-session');

const helmet =
  require('helmet');

const cookieParser =
  require('cookie-parser');


const {
  config,
} = require(
  './config/env'
);


const {
  getPostgresSessionStore,
} = require(
  './session/PostgresSessionStore'
);


// ======================================================
// ROUTES
// ======================================================

const routes =
  require('./routes');


const facebookRoutes =
  require(
    './routes/facebook.routes'
  );


const instagramRoutes =
  require(
    './routes/instagram.routes'
  );


const socialConnectionsRoutes =
  require(
    './routes/socialConnections.routes'
  );


const platformAdminRoutes =
  require(
    './routes/platformAdminRoutes'
  );


const clientAdminRoutes =
  require(
    './routes/clientAdmin.routes'
  );


const clientRoutes =
  require(
    './routes/clientRoutes'
  );


const clientUsersRoutes =
  require(
    './routes/clientUsers.routes'
  );


const activeClientRoutes =
  require(
    './routes/activeClient.routes'
  );


const userRoutes =
  require(
    './routes/userRoutes'
  );


// ======================================================
// MIDDLEWARE
// ======================================================

const requestContext =
  require(
    './middleware/requestContext'
  );


const {
  csrfProtection,
  ensureCsrfCookie,
} = require(
  './middleware/csrf'
);


const {
  apiLimiter,
} = require(
  './middleware/rateLimiters'
);


const {
  errorHandler,
  notFoundHandler,
} = require(
  './middleware/errorHandler'
);


const logger =
  require(
    './utils/logger'
  );


// ======================================================
// CORS CONFIGURATION
// ======================================================

function isAllowedDevelopmentOrigin(
  origin
) {
  if (
    config.isProduction
  ) {
    return false;
  }

  try {
    const url =
      new URL(
        origin
      );

    return (
      [
        'http:',
        'https:',
      ].includes(
        url.protocol
      ) &&
      [
        'localhost',
        '127.0.0.1',
      ].includes(
        url.hostname
      )
    );

  } catch {
    return false;
  }
}


function buildCorsOptions() {
  const allowedOrigins =
    new Set(
      config.frontendUrls ||
      []
    );

  return {

    origin(
      origin,
      callback
    ) {

      /*
       * Postman / curl / n8n /
       * server-to-server requests
       * may not contain Origin.
       */
      if (
        !origin
      ) {
        return callback(
          null,
          true
        );
      }


      if (
        allowedOrigins.has(
          origin
        ) ||
        isAllowedDevelopmentOrigin(
          origin
        )
      ) {
        return callback(
          null,
          true
        );
      }


      logger.warn(
        'Blocked cross-origin request',
        {
          origin,
        }
      );


      const error =
        new Error(
          'Origin not allowed by CORS'
        );


      error.status =
        403;

      error.statusCode =
        403;

      error.code =
        'CORS_ORIGIN_REJECTED';


      return callback(
        error
      );
    },


    credentials:
      true,


    methods: [
      'GET',
      'POST',
      'PATCH',
      'PUT',
      'DELETE',
      'OPTIONS',
    ],


    allowedHeaders: [
      'Content-Type',
      'X-CSRF-Token',
      'X-Request-Id',
      'Authorization',
      'Range',
    ],


    exposedHeaders: [
      'X-Request-Id',
      'Content-Range',
      'Accept-Ranges',
      'Content-Length',
    ],


    maxAge:
      600,
  };
}


// ======================================================
// SESSION COOKIE CONFIGURATION
// ======================================================

function buildSessionCookieOptions() {
  return {

    httpOnly:
      true,


    /*
     * Development:
     *
     * http://localhost
     *
     * Production:
     *
     * HTTPS
     */
    secure:
      config.nodeEnv ===
      'production',


    /*
     * Required for OAuth top-level redirects.
     */
    sameSite:
      'lax',


    maxAge:
      config.sessionStore
        .ttlMs,


    path:
      '/',
  };
}


// ======================================================
// CREATE EXPRESS APP
// ======================================================

function createApp() {

  const app =
    express();


  // ====================================================
  // EXPRESS / PROXY CONFIGURATION
  // ====================================================

  app.set(
    'trust proxy',
    1
  );


  app.disable(
    'x-powered-by'
  );


  // ====================================================
  // SECURITY HEADERS
  // ====================================================

  app.use(
    helmet({

      contentSecurityPolicy: {

        directives: {

          defaultSrc: [
            "'self'",
          ],


          scriptSrc: [
            "'self'",
          ],


          styleSrc: [
            "'self'",
            "'unsafe-inline'",
          ],


          imgSrc: [
            "'self'",
            'data:',
            'blob:',
          ],


          mediaSrc: [
            "'self'",
            'blob:',
          ],


          connectSrc: [
            "'self'",

            ...(
              config.frontendUrls ||
              []
            ),
          ],


          objectSrc: [
            "'none'",
          ],


          frameAncestors: [
            "'none'",
          ],


          baseUri: [
            "'self'",
          ],


          formAction: [
            "'self'",
          ],
        },
      },


      crossOriginResourcePolicy: {

        policy:
          'same-site',
      },


      referrerPolicy: {

        policy:
          'same-origin',
      },


      hsts:
        config.isProduction

          ? {

            maxAge:
              15552000,


            includeSubDomains:
              true,
          }

          : false,
    })
  );


  // ====================================================
  // CORS
  // ====================================================

  app.use(
    cors(
      buildCorsOptions()
    )
  );


  // ====================================================
  // REQUEST CONTEXT
  // ====================================================

  app.use(
    requestContext
  );


  // ====================================================
  // BODY PARSING
  // ====================================================

  app.use(
    express.json({

      limit:
        '2mb',


      verify: (
        req,
        _res,
        buffer
      ) => {

        /*
         * n8n endpoints may need
         * the raw body for signature
         * verification.
         */

        if (
          req.originalUrl
            .startsWith(
              '/api/n8n'
            )
        ) {

          req.rawBody =
            buffer.toString(
              'utf8'
            );
        }
      },
    })
  );


  app.use(
    express.urlencoded({

      extended:
        false,


      limit:
        '1mb',
    })
  );


  // ====================================================
  // COOKIE PARSER
  // ====================================================

  app.use(
    cookieParser()
  );


  // ====================================================
  // PERSISTENT EXPRESS SESSION
  // ====================================================

  app.use(
    session({

      name:
        config.sessionStore
          .cookieName,


      secret:
        config.sessionSecret,


      store:
        getPostgresSessionStore(),


      resave:
        false,


      saveUninitialized:
        false,


      /*
       * Refresh session expiry
       * while the user is active.
       */
      rolling:
        true,


      cookie:
        buildSessionCookieOptions(),
    })
  );


  // ====================================================
  // API RATE LIMITING
  // ====================================================

  app.use(
    '/api',
    apiLimiter
  );


  // ====================================================
  // CSRF COOKIE INITIALIZATION
  // ====================================================

  app.use(
    '/api',
    ensureCsrfCookie
  );


  // ====================================================
  // CSRF PROTECTION
  // ====================================================

  app.use(
    '/api',

    (
      req,
      res,
      next
    ) => {

      /*
       * n8n endpoints use their
       * own authentication /
       * signature mechanism.
       */

      if (
        req.path.startsWith(
          '/n8n'
        )
      ) {

        return next();
      }


      return csrfProtection(
        req,
        res,
        next
      );
    }
  );


  // ====================================================
  // FACEBOOK OAUTH / CONNECTION ROUTES
  // ====================================================

  app.use(
    '/api',
    facebookRoutes
  );


  // ====================================================
  // INSTAGRAM OAUTH / CONNECTION ROUTES
  // ====================================================

  app.use(
    '/api',
    instagramRoutes
  );


  // ====================================================
  // USER ROUTES
  // ====================================================

  app.use(
    '/api/users',
    userRoutes
  );


  // ====================================================
  // CLIENT ADMIN ONBOARDING
  // ====================================================
  //
  // PLATFORM_ADMIN creates the first
  // CLIENT_ADMIN for the currently
  // selected client.
  //
  // POST /api/client/admin
  //
  // IMPORTANT:
  //
  // This specific route MUST be mounted
  // before the generic /api/client router.
  //
  // ====================================================

  app.use(
    '/api/client/admin',
    clientAdminRoutes
  );


  // ====================================================
  // CLIENT USER MANAGEMENT
  // ====================================================
  //
  // GET /api/client/users
  //
  // PLATFORM_ADMIN:
  //
  //   Can VIEW users belonging to
  //   selected active client.
  //
  //   Client context:
  //
  //   req.session.activeClientId
  //
  //
  // CLIENT_ADMIN:
  //
  //   Can VIEW users belonging to
  //   their own client.
  //
  //   Can CREATE normal client users.
  //
  //   Client context:
  //
  //   req.user.client_id
  //
  //
  // requireActiveClient resolves both
  // cases and stores:
  //
  // req.clientId
  //
  // IMPORTANT:
  //
  // This route MUST come before
  // /api/client.
  //
  // ====================================================

  app.use(
    '/api/client/users',
    clientUsersRoutes
  );


  // ====================================================
  // ACTIVE CLIENT ROUTES
  // ====================================================
  //
  // Generic active-client routes.
  //
  // Examples:
  //
  // GET  /api/client
  // PUT  /api/client/platforms
  //
  // PLATFORM_ADMIN:
  //
  // client comes from:
  //
  // req.session.activeClientId
  //
  // IMPORTANT:
  //
  // Generic /api/client is intentionally
  // mounted AFTER:
  //
  // /api/client/admin
  // /api/client/users
  //
  // ====================================================

  app.use(
    '/api/client',
    activeClientRoutes
  );


  // ====================================================
  // PLATFORM ADMIN / BOOTSTRAP
  // ====================================================

  app.use(
    '/api/platform-admins',
    platformAdminRoutes
  );


  // ====================================================
  // CLIENT MANAGEMENT
  // ====================================================
  //
  // PLATFORM_ADMIN operations:
  //
  // GET  /api/clients
  // POST /api/clients
  //
  // etc.
  //
  // ====================================================

  app.use(
    '/api/clients',
    clientRoutes
  );


  // ====================================================
  // APPLICATION ROUTES
  // ====================================================

  app.use(
    '/api',
    routes
  );


  // ====================================================
  // SOCIAL CONNECTION ROUTES
  // ====================================================

  app.use(
    '/api',
    socialConnectionsRoutes
  );


  // ====================================================
  // ROOT ENDPOINT
  // ====================================================

  app.get(
    '/',

    (
      _req,
      res
    ) => {

      return res.json({

        success:
          true,


        service:
          'Content Publishing API',


        docs:
          '/api/health',
      });
    }
  );


  // ====================================================
  // 404
  // ====================================================

  app.use(
    notFoundHandler
  );


  // ====================================================
  // CENTRAL ERROR HANDLER
  // ====================================================

  app.use(
    errorHandler
  );


  return app;
}


// ======================================================
// EXPORTS
// ======================================================

module.exports = {

  createApp,

  buildCorsOptions,

  buildSessionCookieOptions,
};