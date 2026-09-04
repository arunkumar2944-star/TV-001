'use strict';

const clientUsersService =
  require(
    '../services/clientUsers.service'
  );


// ======================================================
// HELPERS
// ======================================================

function getPositiveInteger(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    return null;
  }

  return number;
}


/**
 * Return service/business errors in a consistent format.
 *
 * Returns true when the response was handled.
 */
function handleBusinessError(
  error,
  res
) {
  if (!error?.statusCode) {
    return false;
  }

  res
    .status(
      error.statusCode
    )
    .json({
      success: false,

      code:
        error.appCode ??
        error.code ??
        'REQUEST_FAILED',

      message:
        error.message,
    });

  return true;
}


// ======================================================
// GET CLIENT USERS
// ======================================================
//
// GET /api/client/users
//
// PLATFORM_ADMIN:
//   client ID is resolved from the selected active client.
//
// CLIENT_ADMIN:
//   client ID is resolved from the authenticated user's
//   own client.
//
// requireActiveClient places the final client ID on:
//
//   req.clientId
//
// ======================================================

async function getClientUsers(
  req,
  res,
  next
) {
  try {
    const clientId =
      getPositiveInteger(
        req.clientId
      );

    if (!clientId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'Invalid or missing active client.',
        });
    }

    const result =
      await clientUsersService
        .getClientUsersService({
          clientId,
        });

    return res
      .status(200)
      .json({
        success: true,

        data:
          result,
      });

  } catch (error) {
    if (
      handleBusinessError(
        error,
        res
      )
    ) {
      return;
    }

    return next(error);
  }
}


// ======================================================
// CREATE CLIENT USER
// ======================================================
//
// POST /api/client/users
//
// CLIENT_ADMIN only.
//
// Important:
//
// - clientId comes from requireActiveClient
// - actor comes from authenticate
// - clientId is NEVER accepted from req.body
// - service enforces target-role permissions
//
// Allowed target roles:
//
//   CONTENT_CREATOR
//   APPROVER
//
// CLIENT_ADMIN creation is handled separately through:
//
//   POST /api/client/admin
//
// ======================================================

async function createUser(
  req,
  res,
  next
) {
  try {
    const clientId =
      getPositiveInteger(
        req.clientId
      );

    if (!clientId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'Invalid or missing active client.',
        });
    }


    // --------------------------------------------------
    // AUTHENTICATED ACTOR
    // --------------------------------------------------

    const actorUserId =
      getPositiveInteger(
        req.user?.user_id ??
        req.user?.id
      );

    if (!actorUserId) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            'Authenticated user information is invalid.',
        });
    }


    const actorRole =
      String(
        req.user?.role ??
        ''
      )
        .trim()
        .toUpperCase();

    if (!actorRole) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            'Authenticated user role is missing.',
        });
    }


    // --------------------------------------------------
    // CREATE USER
    // --------------------------------------------------

    const user =
      await clientUsersService
        .createClientUserService({
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


    return res
      .status(201)
      .json({
        success: true,

        message:
          'Client user created successfully.',

        data: {
          user,
        },
      });

  } catch (error) {
    if (
      handleBusinessError(
        error,
        res
      )
    ) {
      return;
    }

    return next(error);
  }
}


// ======================================================
// UPDATE CLIENT USER STATUS
// ======================================================
//
// PATCH /api/client/users/:userId/status
//
// Request:
//
// {
//   "isActive": false
// }
//
// PLATFORM_ADMIN:
//   may manage CLIENT_ADMIN belonging to active client.
//
// CLIENT_ADMIN:
//   may manage CONTENT_CREATOR / APPROVER belonging
//   to their own client.
//
// Service layer is responsible for enforcing:
//
// - target user belongs to req.clientId
// - target user exists
// - PLATFORM_ADMIN -> CLIENT_ADMIN only
// - CLIENT_ADMIN -> CONTENT_CREATOR / APPROVER only
// - PLATFORM_ADMIN cannot be modified here
// - CLIENT_ADMIN cannot modify another CLIENT_ADMIN
// - user cannot deactivate themselves
//
// ======================================================

async function updateUserStatus(
  req,
  res,
  next
) {
  try {

    // --------------------------------------------------
    // ACTIVE CLIENT
    // --------------------------------------------------

    const clientId =
      getPositiveInteger(
        req.clientId
      );

    if (!clientId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'Invalid or missing active client.',
        });
    }


    // --------------------------------------------------
    // TARGET USER
    // --------------------------------------------------

    const targetUserId =
      getPositiveInteger(
        req.params?.userId
      );

    if (!targetUserId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'A valid user ID is required.',
        });
    }


    // --------------------------------------------------
    // AUTHENTICATED ACTOR
    // --------------------------------------------------

    const actorUserId =
      getPositiveInteger(
        req.user?.user_id ??
        req.user?.id
      );

    if (!actorUserId) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            'Authenticated user information is invalid.',
        });
    }


    const actorRole =
      String(
        req.user?.role ??
        ''
      )
        .trim()
        .toUpperCase();

    if (!actorRole) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            'Authenticated user role is missing.',
        });
    }


    // --------------------------------------------------
    // REQUEST BODY
    // --------------------------------------------------

    const {
      isActive,
    } = req.body ?? {};


    /*
     * Do not use Boolean(isActive).
     *
     * Boolean("false") === true
     *
     * We require a real JSON boolean.
     */
    if (
      typeof isActive !==
      'boolean'
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'isActive must be a boolean value.',
        });
    }


    // --------------------------------------------------
    // UPDATE STATUS
    // --------------------------------------------------

    const user =
      await clientUsersService
        .updateClientUserStatusService({
          clientId,

          actorUserId,

          actorRole,

          targetUserId,

          isActive,
        });


    return res
      .status(200)
      .json({
        success: true,

        message:
          isActive
            ? 'User activated successfully.'
            : 'User deactivated successfully.',

        data: {
          user,
        },
      });

  } catch (error) {
    if (
      handleBusinessError(
        error,
        res
      )
    ) {
      return;
    }

    return next(error);
  }
}
async function getClientUserDetails(
  req,
  res,
  next
) {
  try {
    const clientId =
      getPositiveInteger(
        req.clientId
      );

    if (!clientId) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            'Invalid or missing active client.',
        });
    }

    const userId =
      getPositiveInteger(
        req.params?.userId
      );

    if (!userId) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            'A valid user ID is required.',
        });
    }

    const result =
      await clientUsersService
        .getClientUserDetailsService({
          clientId,
          userId,
        });

    return res
      .status(200)
      .json({
        success: true,
        data:
          result,
      });

  } catch (error) {
    if (
      handleBusinessError(
        error,
        res
      )
    ) {
      return;
    }

    return next(error);
  }
}

// ======================================================
// UPDATE CLIENT USER PROFILE
// ======================================================
//
// PATCH /api/client/users/:userId/profile
//
// clientId comes only from requireActiveClient.
// Never accept clientId from req.body or URL.
//
// ======================================================

async function updateUserProfile(
  req,
  res,
  next
) {
  try {
    const clientId =
      getPositiveInteger(
        req.clientId
      );

    if (!clientId) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            'Invalid or missing active client.',
        });
    }


    const targetUserId =
      getPositiveInteger(
        req.params?.userId
      );

    if (!targetUserId) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            'A valid user ID is required.',
        });
    }


    const actorUserId =
      getPositiveInteger(
        req.user?.user_id ??
        req.user?.id
      );

    if (!actorUserId) {
      return res
        .status(401)
        .json({
          success: false,
          message:
            'Authenticated user information is invalid.',
        });
    }


    const actorRole =
      String(
        req.user?.role ??
        ''
      )
        .trim()
        .toUpperCase();

    if (!actorRole) {
      return res
        .status(401)
        .json({
          success: false,
          message:
            'Authenticated user role is missing.',
        });
    }


    const user =
      await clientUsersService
        .updateClientUserProfileService({
          clientId,
          actorUserId,
          actorRole,
          targetUserId,

          username:
            req.body?.username,

          fullName:
            req.body?.fullName,

          email:
            req.body?.email,
        });


    return res
      .status(200)
      .json({
        success: true,

        message:
          'Client user updated successfully.',

        data: {
          user,
        },
      });

  } catch (error) {
    if (
      handleBusinessError(
        error,
        res
      )
    ) {
      return;
    }

    return next(error);
  }
}
// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getClientUsers,
  getClientUserDetails,
  createUser,
  updateUserStatus,
  updateUserProfile,
};