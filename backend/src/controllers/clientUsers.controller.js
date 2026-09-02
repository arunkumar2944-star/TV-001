'use strict';

const 
  clientUsersService 
 = require('../services/clientUsers.service');
console.log(
  'clientUsersService exports:',
  Object.keys(
    clientUsersService
  )
);
/**
 * --------------------------------------------------
 * GET CLIENT USERS
 * --------------------------------------------------
 *
 * GET /api/client-users
 *
 * Client ID comes from active-client middleware.
 */
async function getClientUsers(
  req,
  res,
  next
) {
  try {
    const clientId =
      req.clientId;

    const result =
      await clientUsersService
        .getClientUsersService({
          clientId,
        });

    return res
      .status(200)
      .json({
        success: true,
        data: result,
      });

  } catch (error) {
    next(error);
  }
}

/**
 * --------------------------------------------------
 * CREATE CLIENT USER
 * --------------------------------------------------
 *
 * POST /api/client-users
 *
 * Important:
 *
 * - clientId comes from active-client middleware
 * - logged-in user comes from auth middleware
 * - clientId is NEVER accepted from req.body
 * - service decides whether the actor can create
 *   the requested role
 */
async function createUser(
  req,
  res,
  next
) {
  try {
    const clientId = Number(
      req.clientId ??
      req.params?.clientId
    );

    if (
      !Number.isInteger(clientId) ||
      clientId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid or missing active client.',
      });
    }

    /**
     * Logged-in user ID.
     */
    const actorUserId = Number(
      req.user?.user_id ??
      req.user?.id
    );

    if (
      !Number.isInteger(actorUserId) ||
      actorUserId <= 0
    ) {
      return res.status(401).json({
        success: false,
        message:
          'Authenticated user information is invalid.',
      });
    }

    /**
     * Logged-in user role.
     */
    const actorRole = String(
      req.user?.role ?? ''
    )
      .trim()
      .toUpperCase();

    if (!actorRole) {
      return res.status(401).json({
        success: false,
        message:
          'Authenticated user role is missing.',
      });
    }

    /**
     * Pass request data to service.
     *
     * Service will:
     *
     * - validate fields
     * - validate client
     * - check client status
     * - enforce role permissions
     * - prevent duplicate CLIENT_ADMIN
     * - hash password
     * - call repository
     */
    const user =
      await clientUsersService.createClientUserService({
        clientId,

        actorUserId,

        actorRole,

        username:
          req.body?.username,

        fullName:
          req.body?.fullName,

        email:
          req.body?.email,

        password:
          req.body?.password,

        requestedRole:
          req.body?.role,
      });

    return res.status(201).json({
      success: true,

      message:
        'Client user created successfully.',

      data: {
        user,
      },
    });
  } catch (error) {
    /**
     * Business errors created by service.
     */
    if (error.statusCode) {
      return res
        .status(error.statusCode)
        .json({
          success: false,

          code:
            error.appCode ??
            error.code ??
            'REQUEST_FAILED',

          message:
            error.message,
        });
    }

    next(error);
  }
}

module.exports = {
  getClientUsers,
  createUser,
};