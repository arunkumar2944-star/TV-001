'use strict';


// ======================================================
// HELPERS
// ======================================================

function normalizeRole(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toUpperCase();
}


function parsePositiveInteger(
  value
) {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}


// ======================================================
// REQUIRE ACTIVE CLIENT
// ======================================================
//
// PLATFORM_ADMIN
// ----------------
// Uses selected client from session:
//
// req.session.activeClientId
//
// CLIENT_ADMIN
// ----------------
// Uses the client permanently attached
// to the authenticated user:
//
// req.user.client_id
//
// Result:
//
// req.clientId
//
// ======================================================

function requireActiveClient(
  req,
  res,
  next
) {
  const role =
    normalizeRole(
      req.user?.role
    );
    'use strict';


// ======================================================
// HELPERS
// ======================================================

function normalizeRole(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toUpperCase();
}


function parsePositiveInteger(
  value
) {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}


// ======================================================
// REQUIRE ACTIVE CLIENT
// ======================================================
//
// PLATFORM_ADMIN
// ----------------
// Uses selected client from session:
//
// req.session.activeClientId
//
// CLIENT_ADMIN
// ----------------
// Uses the client permanently attached
// to the authenticated user:
//
// req.user.client_id
//
// Result:
//
// req.clientId
//
// ======================================================

function requireActiveClient(
  req,
  res,
  next
) {
  const role =
    normalizeRole(
      req.user?.role
    );


  // ====================================================
  // PLATFORM ADMIN
  // ====================================================

  if (
    role === 'PLATFORM_ADMIN'
  ) {
    const clientId =
      parsePositiveInteger(
        req.session?.activeClientId ??
        req.session?.active_client_id
      );

    if (!clientId) {
      return res
        .status(409)
        .json({
          success: false,

          message:
            'Select a client before performing this action.',
        });
    }

    req.clientId =
      clientId;

    req.activeClientId =
      clientId;

    return next();
  }


  // ====================================================
  // CLIENT ADMIN
  // ====================================================

  if (
    role === 'CLIENT_ADMIN'
  ) {
    const clientId =
      parsePositiveInteger(
        req.user?.client_id ??
        req.user?.clientId
      );

    if (!clientId) {
      return res
        .status(403)
        .json({
          success: false,

          message:
            'Your account is not associated with a client.',
        });
    }

    req.clientId =
      clientId;

    req.activeClientId =
      clientId;

    return next();
  }


  // ====================================================
  // UNSUPPORTED ROLE
  // ====================================================

  return res
    .status(403)
    .json({
      success: false,

      message:
        'You do not have permission to access client resources.',
    });
}


module.exports = {
  requireActiveClient,
};


  // ====================================================
  // PLATFORM ADMIN
  // ====================================================

  if (
    role === 'PLATFORM_ADMIN'
  ) {
    const clientId =
      parsePositiveInteger(
        req.session?.activeClientId ??
        req.session?.active_client_id
      );

    if (!clientId) {
      return res
        .status(409)
        .json({
          success: false,

          message:
            'Select a client before performing this action.',
        });
    }

    req.clientId =
      clientId;

    req.activeClientId =
      clientId;

    return next();
  }


  // ====================================================
  // CLIENT ADMIN
  // ====================================================

  if (
    role === 'CLIENT_ADMIN'
  ) {
    const clientId =
      parsePositiveInteger(
        req.user?.client_id ??
        req.user?.clientId
      );

    if (!clientId) {
      return res
        .status(403)
        .json({
          success: false,

          message:
            'Your account is not associated with a client.',
        });
    }

    req.clientId =
      clientId;

    req.activeClientId =
      clientId;

    return next();
  }


  // ====================================================
  // UNSUPPORTED ROLE
  // ====================================================

  return res
    .status(403)
    .json({
      success: false,

      message:
        'You do not have permission to access client resources.',
    });
}


module.exports = {
  requireActiveClient,
};