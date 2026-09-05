'use strict';

const xService =
  require('../services/x.service');

const socialConnectionService =
  require('../services/socialConnection.service');


// ======================================================
// SAVE EXPRESS SESSION
// ======================================================

function saveSession(
  req
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      if (
        !req.session ||
        typeof req.session.save !==
          'function'
      ) {
        resolve();
        return;
      }


      req.session.save(
        (error) => {
          if (error) {
            reject(
              error
            );

            return;
          }


          resolve();
        }
      );
    }
  );
}


// ======================================================
// NORMALIZE POSITIVE INTEGER
// ======================================================

function normalizePositiveInteger(
  value
) {
  const parsed =
    Number(
      value
    );


  return (
    Number.isInteger(
      parsed
    ) &&
    parsed > 0
  )
    ? parsed
    : null;
}


// ======================================================
// START X OAUTH
// ======================================================
//
// GET
// /api/client/social-connections/x/oauth/start
//
// Active client comes from middleware.
//
// React must NOT send clientId.
// ======================================================

async function startOAuth(
  req,
  res,
  next
) {
  try {
    const clientId =
      normalizePositiveInteger(
        req.clientId
      );


    if (!clientId) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            'A valid active client is required.',
        });
    }


    const result =
      await xService
        .startOAuth({
          user:
            req.user,

          requestedClientId:
            clientId,

          session:
            req.session,
        });


    /*
     * OAuth state + PKCE verifier are stored
     * in the server session.
     *
     * Force session persistence before React
     * redirects the browser to X.
     */
    await saveSession(
      req
    );


    return res
      .status(200)
      .json({
        success:
          true,

        authorizationUrl:
          result
            .authorizationUrl,
      });

  } catch (error) {
    next(
      error
    );
  }
}


// ======================================================
// HANDLE X OAUTH CALLBACK
// ======================================================
//
// X redirects the browser here after:
//
// - successful authorization
// - cancellation
// - provider error
//
// ======================================================

async function handleOAuthCallback(
  req,
  res,
  next
) {
  try {
    const result =
      await xService
        .handleOAuthCallback({
          query:
            req.query,

          session:
            req.session,
        });


    /*
     * Persist:
     *
     * - OAuth success result
     * - OAuth error result
     * - cleared PKCE/state values
     */
    await saveSession(
      req
    );


    return res.redirect(
      result.redirectUrl
    );

  } catch (error) {
    next(
      error
    );
  }
}


// ======================================================
// GET ONE-TIME X OAUTH RESULT
// ======================================================
//
// GET
// /api/client/social-connections/x/oauth/result
//
// Called by React after X redirects back to the SPA.
// ======================================================

async function getOAuthResult(
  req,
  res,
  next
) {
  try {
    const clientId =
      normalizePositiveInteger(
        req.clientId
      );


    if (!clientId) {
      return res
        .status(400)
        .json({
          success:
            false,

          status:
            'ERROR',

          message:
            'A valid active client is required.',
        });
    }


    const outcome =
      xService
        .getOAuthOutcome({
          user:
            req.user,

          session:
            req.session,

          clientId,
        });


    /*
     * No new OAuth result.
     *
     * This is normal when the page is refreshed
     * without completing a new X OAuth flow.
     */
    if (!outcome) {
      return res
        .status(200)
        .json({
          success:
            true,

          status:
            'NONE',
        });
    }


    /*
     * getOAuthOutcome() removes the one-time
     * result from the session.
     *
     * Persist that removal.
     */
    await saveSession(
      req
    );


    return res
      .status(200)
      .json({
        success:
          outcome.status ===
          'CONNECTED',

        ...outcome,
      });

  } catch (error) {
    next(
      error
    );
  }
}


// ======================================================
// CANCEL X OAUTH
// ======================================================

async function cancelOAuth(
  req,
  res,
  next
) {
  try {
    const result =
      xService
        .cancelOAuth(
          req.session
        );


    await saveSession(
      req
    );


    return res
      .status(200)
      .json({
        success:
          true,

        ...result,
      });

  } catch (error) {
    next(
      error
    );
  }
}


// ======================================================
// TEST STORED X CONNECTION
// ======================================================
//
// POST
// /api/client/social-connections/x/:connectionId/test
//
// Flow:
//
// authenticated user
//       ↓
// active client middleware
//       ↓
// connectionId from route
//       ↓
// socialConnectionService.verifyConnection()
//       ↓
// verify ownership
// verify platform enabled
// verify X access token
// GET /2/users/me
//       ↓
// CONNECTED / error
//
// No token is returned to React.
// ======================================================

async function testConnection(
  req,
  res,
  next
) {
  try {
    const clientId =
      normalizePositiveInteger(
        req.clientId
      );


    const connectionId =
      normalizePositiveInteger(
        req.params
          .connectionId
      );


    // --------------------------------------------------
    // VALIDATE ACTIVE CLIENT
    // --------------------------------------------------

    if (!clientId) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            'A valid active client is required.',
        });
    }


    // --------------------------------------------------
    // VALIDATE CONNECTION ID
    // --------------------------------------------------

    if (!connectionId) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            'A valid X connection ID is required.',
        });
    }


    // --------------------------------------------------
    // VERIFY STORED CONNECTION
    // --------------------------------------------------

    const connection =
      await socialConnectionService
        .verifyConnection({
          clientId,
          connectionId,
        });


    // --------------------------------------------------
    // ADDITIONAL PLATFORM SAFETY CHECK
    // --------------------------------------------------

    if (
      String(
        connection
          ?.platform ||
        ''
      )
        .trim()
        .toUpperCase() !==
      'X'
    ) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            'The selected connection is not an X connection.',
        });
    }


    // --------------------------------------------------
    // SAFE RESPONSE
    // --------------------------------------------------

    return res
      .status(200)
      .json({
        success:
          true,

        message:
          'X connection verified successfully.',

        connection,
      });

  } catch (error) {
    next(
      error
    );
  }
}


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  startOAuth,
  handleOAuthCallback,
  getOAuthResult,
  cancelOAuth,
  testConnection,
};