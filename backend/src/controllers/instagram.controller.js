'use strict';

const instagramService =
  require(
    '../services/instagram.service'
  );

const {
  saveSession,
} = require(
  '../utils/session'
);


// ======================================================
// START INSTAGRAM OAUTH
// ======================================================
//
// GET
// /api/client/social-connections/instagram/oauth/start
//
// req.clientId comes from:
// activeclient.middleware.js
//
// ======================================================

async function startInstagramConnect(
  req,
  res,
  next
) {
  try {
    const result =
      await instagramService
        .startOAuth({
          user:
            req.user,

          requestedClientId:
            req.clientId,

          session:
            req.session,
        });

    /*
     * Critical:
     *
     * Persist OAuth state before
     * redirecting browser to Meta.
     */
    await saveSession(req);

    return res.redirect(
      result.authorizationUrl
    );
  } catch (error) {
    return next(error);
  }
}


// ======================================================
// INSTAGRAM OAUTH CALLBACK
// ======================================================
//
// GET
// /api/instagram/oauth/callback
//
// Meta sends:
// ?code=...
// &state=...
//
// ======================================================

async function handleInstagramCallback(
  req,
  res,
  next
) {
  try {
    const result =
      await instagramService
        .handleOAuthCallback({
          query:
            req.query,

          session:
            req.session,
        });

    /*
     * Persist discovered accounts /
     * safe OAuth outcome before redirecting
     * back to React.
     */
    await saveSession(req);

    return res.redirect(
      result.redirectUrl
    );
  } catch (error) {
    return next(error);
  }
}


// ======================================================
// GET INSTAGRAM OAUTH RESULT
// ======================================================
//
// GET
// /api/client/social-connections/instagram/oauth-result
//
// Returns only:
// IDLE
// SELECT_ACCOUNT
// ERROR
//
// ======================================================

async function getInstagramOAuthResult(
  req,
  res,
  next
) {
  try {
    const result =
      instagramService
        .getOAuthOutcome({
          user:
            req.user,

          session:
            req.session,

          clientId:
            req.clientId,
        });

    /*
     * getOAuthOutcome may remove
     * one-time ERROR outcomes.
     */
    await saveSession(req);

    return res
      .status(200)
      .json({
        success: true,
        data: result,
      });
  } catch (error) {
    return next(error);
  }
}


// ======================================================
// GET AVAILABLE INSTAGRAM ACCOUNTS
// ======================================================
//
// GET
// /api/client/social-connections/instagram/accounts
//
// IMPORTANT:
//
// Instagram service sanitizes accounts before
// returning them.
//
// No Page access token is exposed.
//
// ======================================================

async function getInstagramAccounts(
  req,
  res,
  next
) {
  try {
    const result =
      await instagramService
        .getOAuthAccounts({
          user:
            req.user,

          session:
            req.session,

          clientId:
            req.clientId,
        });

    return res
      .status(200)
      .json({
        success: true,

        totalAccounts:
          result.accounts.length,

        accounts:
          result.accounts,
      });
  } catch (error) {
    return next(error);
  }
}

async function selectInstagramAccount(
  req,
  res,
  next
) {
  try {
    const {
      instagramUserId,
    } = req.body || {};

    const result =
      await instagramService
        .selectInstagramAccount({
          user: req.user,
          session: req.session,
          clientId: req.clientId,
          instagramUserId,
        });

    await saveSession(req);

    return res
      .status(200)
      .json({
        success: true,
        data: result,
      });
  } catch (error) {
    return next(error);
  }
}


// ======================================================
// CANCEL INSTAGRAM OAUTH
// ======================================================
//
// POST
// /api/client/social-connections/instagram/oauth/cancel
//
// ======================================================

async function cancelInstagramOAuth(
  req,
  res,
  next
) {
  try {
    const result =
      instagramService
        .cancelOAuth(
          req.session
        );

    /*
     * Persist cleanup to PostgreSQL.
     */
    await saveSession(req);

    return res
      .status(200)
      .json({
        success: true,
        data: result,
      });
  } catch (error) {
    return next(error);
  }
}


module.exports = {
  startInstagramConnect,
  handleInstagramCallback,
  getInstagramOAuthResult,
  getInstagramAccounts,
  selectInstagramAccount,
  cancelInstagramOAuth,
  

};