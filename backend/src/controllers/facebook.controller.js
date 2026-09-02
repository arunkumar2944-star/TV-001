'use strict';

const facebookService =
  require(
    '../services/facebook.service'
  );

const {
  saveSession,
} = require(
  '../utils/session'
);


// ======================================================
// START FACEBOOK OAUTH
// ======================================================
//
// Client identity comes only from:
//
// req.session.activeClientId
//        ↓
// requireActiveClient
//        ↓
// req.clientId
//
// The service writes the OAuth state/details
// into req.session.
//
// We explicitly save the session BEFORE
// redirecting the browser to Meta.
//
// ======================================================

async function startFacebookConnect(
  req,
  res,
  next
) {
  try {
    const result =
      await facebookService
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
     * Persist OAuth state to PostgreSQL
     * before leaving our application.
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
// FACEBOOK OAUTH CALLBACK
// ======================================================
//
// Meta redirects here:
//
// GET /api/facebook/oauth/callback
//     ?code=...
//     &state=...
//
// This route does not depend on a clientId
// from the URL.
//
// The service validates the returned OAuth
// state against the state stored in the
// encrypted Express session.
//
// ======================================================

async function handleFacebookCallback(
  req,
  res,
  next
) {
  try {
    const result =
      await facebookService
        .handleOAuthCallback({
          query:
            req.query,

          session:
            req.session,
        });

    /*
     * The callback normally updates
     * temporary OAuth/page-selection state.
     *
     * Persist it before redirecting back
     * to React.
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
// GET FACEBOOK OAUTH RESULT
// ======================================================
//
// React can retrieve the safe OAuth result
// after Meta redirects back.
//
// Tokens must never be exposed here.
//
// ======================================================

async function getFacebookOAuthResult(
  req,
  res,
  next
) {
  try {
    const result =
      facebookService
        .getOAuthOutcome({
          user:
            req.user,

          session:
            req.session,

          clientId:
            req.clientId,
        });

    /*
     * Keep this save because getOAuthOutcome()
     * may consume/clear a one-time OAuth
     * outcome in the session.
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
// CANCEL FACEBOOK OAUTH
// ======================================================

async function cancelFacebookOAuth(
  req,
  res,
  next
) {
  try {
    const result =
      facebookService
        .cancelOAuth(
          req.session
        );

    /*
     * cancelOAuth() modifies session state,
     * therefore explicitly persist it.
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
// GET FACEBOOK PAGES
// ======================================================
//
// Pages were discovered during OAuth and
// are temporarily held server-side.
//
// Access tokens must NOT be returned.
//
// ======================================================

async function getFacebookPages(
  req,
  res,
  next
) {
  try {
    const result =
      await facebookService
        .getOAuthPages({
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

        totalPages:
          result.pages.length,

        pages:
          result.pages,
      });
  } catch (error) {
    return next(error);
  }
}


// ======================================================
// CONNECT SELECTED FACEBOOK PAGE
// ======================================================
//
// POST
// /api/client/social-connections/facebook/connect
//
// Body:
// {
//   "pageId": "..."
// }
//
// The client comes from req.clientId.
//
// ======================================================

async function selectFacebookPage(
  req,
  res,
  next
) {
  try {
    const result =
      await facebookService
        .selectPage({
          user:
            req.user,

          session:
            req.session,

          clientId:
            req.clientId,

          pageId:
            req.body?.pageId,
        });

    /*
     * selectPage() normally consumes or
     * cleans temporary OAuth/Page state.
     *
     * Persist that cleanup.
     */
    await saveSession(req);

    return res
      .status(200)
      .json({
        success: true,

        message:
          'Facebook Page connected and verified successfully.',

        data:
          result,
      });
  } catch (error) {
    return next(error);
  }
}


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  startFacebookConnect,
  handleFacebookCallback,
  getFacebookOAuthResult,
  cancelFacebookOAuth,
  getFacebookPages,
  selectFacebookPage,
};