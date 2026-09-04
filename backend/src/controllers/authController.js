'use strict';

const authService = require('../services/authService');
const userService = require('../services/userService');
const passwordService = require('../services/passwordService');
const tokenService = require('../services/tokenService');
const auditService = require('../services/auditService');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/respond');
const { config } = require('../config/env');
const { issueToken } = require('../middleware/csrf');
const { AUDIT_STAGE, AUDIT_STATUS } = require('../config/constants');
const {
  regenerateSession,
  destroySession,
} = require(
  '../utils/session'
);
function sessionCookieOptions() {
  return {
    httpOnly: true, // JavaScript in the browser can never read the session
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    domain: config.auth.cookieDomain,
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  };
}

async function login(req, res) {
  const { user, token } =
    await authService.login(
      req.body,
      {
        ip: req.ip,
        userAgent:
          req.get('user-agent'),
      }
    );

  /*
   * Authentication succeeded.
   *
   * Generate a fresh Express session so
   * activeClientId / OAuth state from an
   * older login cannot carry into this
   * user's session.
   */
  await regenerateSession(req);

  res.cookie(
    config.auth.cookieName,
    token,
    sessionCookieOptions()
  );

  const csrfToken =
    issueToken(res);

  return ok(
    res,
    {
      user,
      csrfToken,
    }
  );
}
function expireCookie(
  res,
  name,
  {
    httpOnly,
    secure,
    sameSite,
    domain,
    path = '/',
  }
) {
  if (!name) {
    return;
  }

  const baseOptions = {
    httpOnly,
    secure,
    sameSite,
    path,

    /*
     * Force the browser to expire
     * the cookie immediately.
     */
    expires: new Date(0),
    maxAge: 0,
  };

  /*
   * First expire a host-only version.
   *
   * This is important for localhost.
   */
  res.cookie(
    name,
    '',
    baseOptions
  );

  /*
   * If an older version of the application
   * created the same cookie using Domain=...,
   * expire that version as well.
   */
  if (
    typeof domain === 'string' &&
    domain.trim()
  ) {
    res.cookie(
      name,
      '',
      {
        ...baseOptions,
        domain: domain.trim(),
      }
    );
  }
}


async function logout(
  req,
  res
) {
  /*
   * =====================================================
   * 1. REVOKE APPLICATION AUTH TOKEN
   * =====================================================
   */

  await authService.logout(
    req.user,
    req.authToken,
    {
      ip: req.ip,
    }
  );


  /*
   * =====================================================
   * 2. DESTROY EXPRESS / POSTGRESQL SESSION
   * =====================================================
   *
   * This calls:
   *
   * req.session.destroy()
   *
   * which then calls:
   *
   * PostgresSessionStore.destroy()
   *
   * DELETE FROM app_sessions
   * WHERE sid = ...
   */

  await destroySession(req);


  /*
   * =====================================================
   * 3. EXPIRE AUTHENTICATION COOKIE
   * =====================================================
   */

  expireCookie(
    res,
    config.auth.cookieName,
    {
      httpOnly: true,

      secure:
        Boolean(
          config.auth.cookieSecure
        ),

      sameSite:
        config.auth.cookieSameSite ||
        'lax',

      domain:
        config.auth.cookieDomain,

      path: '/',
    }
  );


  /*
   * =====================================================
   * 4. EXPIRE CSRF COOKIE
   * =====================================================
   */

  expireCookie(
    res,
    config.auth.csrfCookieName,
    {
      httpOnly: false,

      secure:
        Boolean(
          config.auth.cookieSecure
        ),

      sameSite:
        config.auth.cookieSameSite ||
        'lax',

      domain:
        config.auth.cookieDomain,

      path: '/',
    }
  );


  /*
   * =====================================================
   * 5. EXPIRE PERSISTENT EXPRESS SESSION COOKIE
   * =====================================================
   *
   * app.js uses:
   *
   * name:
   *   config.sessionStore.cookieName
   *
   * Usually:
   *
   * publishing.sid
   */

  expireCookie(
    res,
    config.sessionStore.cookieName,
    {
      httpOnly: true,

      secure:
        config.nodeEnv ===
        'production',

      sameSite: 'lax',

      /*
       * Our current Express-session cookie
       * does not use Domain.
       */
      domain: null,

      path: '/',
    }
  );


  /*
   * =====================================================
   * 6. REMOVE OLD EXPRESS DEFAULT COOKIE
   * =====================================================
   *
   * Before PostgreSQL persistent sessions,
   * Express may have created:
   *
   * connect.sid
   *
   * Remove it during migration.
   */

  expireCookie(
    res,
    'connect.sid',
    {
      httpOnly: true,

      secure:
        config.nodeEnv ===
        'production',

      sameSite: 'lax',

      domain: null,

      path: '/',
    }
  );


  /*
   * =====================================================
   * 7. DEBUG COOKIE HEADERS
   * =====================================================
   *
   * Keep this temporarily while testing.
   *
   * It prints cookie names/headers,
   * not sensitive cookie values from the request.
   */

  console.log(
    'Logout cookies expired:',
    {
      authCookie:
        config.auth.cookieName,

      csrfCookie:
        config.auth.csrfCookieName,

      sessionCookie:
        config.sessionStore.cookieName,

      legacySessionCookie:
        'connect.sid',
    }
  );

  console.log(
    'Logout Set-Cookie headers:',
    res.getHeader(
      'Set-Cookie'
    )
  );


  /*
   * =====================================================
   * 8. RESPONSE
   * =====================================================
   */

  return ok(
    res,
    {
      loggedOut: true,
    }
  );
}

async function me(
  req,
  res
) {
  /*
   * No valid authentication token.
   *
   * This is the normal state when
   * displaying the Login page.
   */
  if (!req.user) {
    return res.status(200).json({
      success: true,

      authenticated:
        false,

      data: {
        user: null,
      },
    });
  }

  /*
   * optionalAuthenticate already:
   *
   * 1. verified the token
   * 2. loaded the user
   * 3. checked is_active
   *
   * So there is no need to query
   * the database again here.
   */
  return res.status(200).json({
    success: true,

    authenticated:
      true,

    data: {
      user:
        req.user,
    },
  });
}

/** A signed-in user changing their own password. */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  const withSecret = await userService.findByEmailWithSecret(req.user.email);
  const matches = await passwordService.compare(currentPassword, withSecret ? withSecret.password_hash : null);
  if (!matches) throw ApiError.unauthorized('Your current password is not correct');

  const problems = passwordService.validateStrength(newPassword);
  if (problems.length > 0) throw ApiError.badRequest(problems[0]);

  await userService.resetPassword(req.user.user_id, newPassword);

  // Force a fresh sign-in with the new credentials.
  tokenService.revoke(req.authToken);
  res.clearCookie(config.auth.cookieName, { ...sessionCookieOptions(), maxAge: undefined });

  auditService.recordSafe({
    actorUserId: req.user.user_id,
    stage: AUDIT_STAGE.UPDATE_USER,
    status: AUDIT_STATUS.SUCCESS,
    message: `${req.user.full_name} changed their password`,
  });

  return ok(res, { passwordChanged: true, signOutRequired: true });
}

/** Hands the SPA a CSRF token before it makes its first mutating request. */
async function csrf(req, res) {
  return ok(res, { csrfToken: req.csrfToken });
}

module.exports = { login, logout, me, changePassword, csrf, sessionCookieOptions };
