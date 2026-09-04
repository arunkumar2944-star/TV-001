'use strict';

const bcrypt =
  require('bcryptjs');

const {
  findClientById,
  findUsersByClientId,
  findActiveClientAdminByClientId,
  findUserByIdForClient,
  createClientUser,
  updateClientUserStatus,
  updateClientUserProfile,
} = require(
  '../repositories/clientUsers.repository'
);


// ======================================================
// ROLE RULES
// ======================================================

const ALLOWED_CLIENT_ROLES =
  new Set([
    'CLIENT_ADMIN',
    'CONTENT_CREATOR',
    'APPROVER',
  ]);


const CLIENT_ADMIN_ALLOWED_ROLES =
  new Set([
    'CONTENT_CREATOR',
    'APPROVER',
  ]);


// ======================================================
// HELPERS
// ======================================================

function normalizeText(
  value
) {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.trim();
}


function normalizeRole(
  value
) {
  return normalizeText(
    value
  ).toUpperCase();
}


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


function getUserId(
  user
) {
  return getPositiveInteger(
    user?.user_id ??
    user?.id
  );
}


function createServiceError(
  message,
  statusCode,
  appCode
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.appCode =
    appCode;

  return error;
}


// ======================================================
// GET CLIENT USERS
// ======================================================

async function getClientUsersService({
  clientId,
}) {
  const normalizedClientId =
    getPositiveInteger(
      clientId
    );

  if (!normalizedClientId) {
    throw createServiceError(
      'Invalid client.',
      400,
      'INVALID_CLIENT'
    );
  }


  const client =
    await findClientById(
      normalizedClientId
    );

  if (!client) {
    throw createServiceError(
      'Client not found.',
      404,
      'CLIENT_NOT_FOUND'
    );
  }


  const users =
    await findUsersByClientId(
      normalizedClientId
    );


  return {
    client: {
      client_id:
        client.client_id,

      client_code:
        client.client_code,

      business_name:
        client.business_name,
    },

    items:
      Array.isArray(users)
        ? users
        : [],

    total:
      Array.isArray(users)
        ? users.length
        : 0,
  };
}


// ======================================================
// RESOLVE ROLE TO CREATE
// ======================================================

function resolveRoleToCreate({
  actorRole,
  requestedRole,
}) {
  const normalizedActorRole =
    normalizeRole(
      actorRole
    );

  const normalizedRequestedRole =
    normalizeRole(
      requestedRole
    );


  // --------------------------------------------------
  // PLATFORM ADMIN
  // --------------------------------------------------
  //
  // Platform Admin creates the Client Admin.
  //
  // Your dedicated frontend endpoint is:
  //
  // POST /api/client/admin
  //
  // We keep this service rule because your existing
  // working backend may reuse this service.
  //
  // --------------------------------------------------

  if (
    normalizedActorRole ===
    'PLATFORM_ADMIN'
  ) {
    return 'CLIENT_ADMIN';
  }


  // --------------------------------------------------
  // CLIENT ADMIN
  // --------------------------------------------------

  if (
    normalizedActorRole ===
    'CLIENT_ADMIN'
  ) {
    if (
      !CLIENT_ADMIN_ALLOWED_ROLES.has(
        normalizedRequestedRole
      )
    ) {
      throw createServiceError(
        'Client Admin can only create Content Creator or Approver users.',
        403,
        'ROLE_CREATION_NOT_ALLOWED'
      );
    }

    return normalizedRequestedRole;
  }


  throw createServiceError(
    'You are not allowed to create client users.',
    403,
    'USER_CREATION_NOT_ALLOWED'
  );
}


// ======================================================
// CREATE CLIENT USER
// ======================================================

async function createClientUserService({
  clientId,
  actorUserId,
  actorRole,
  username,
  fullName,
  email,
  password,
  requestedRole,
}) {

  // --------------------------------------------------
  // CLIENT VALIDATION
  // --------------------------------------------------

  const normalizedClientId =
    getPositiveInteger(
      clientId
    );

  if (!normalizedClientId) {
    throw createServiceError(
      'Invalid client.',
      400,
      'INVALID_CLIENT'
    );
  }


  const client =
    await findClientById(
      normalizedClientId
    );

  if (!client) {
    throw createServiceError(
      'Client not found.',
      404,
      'CLIENT_NOT_FOUND'
    );
  }


  if (
    client.is_active !== true
  ) {
    throw createServiceError(
      'Users cannot be added to an inactive client.',
      409,
      'CLIENT_INACTIVE'
    );
  }


  // --------------------------------------------------
  // NORMALIZE INPUT
  // --------------------------------------------------

  const normalizedUsername =
    normalizeText(
      username
    ).toLowerCase();

  const normalizedFullName =
    normalizeText(
      fullName
    );

  const normalizedEmail =
    normalizeText(
      email
    ).toLowerCase();


  // --------------------------------------------------
  // FIELD VALIDATION
  // --------------------------------------------------

  if (!normalizedUsername) {
    throw createServiceError(
      'Username is required.',
      400,
      'USERNAME_REQUIRED'
    );
  }


  if (
    !/^[a-zA-Z0-9._-]{3,100}$/.test(
      normalizedUsername
    )
  ) {
    throw createServiceError(
      'Username must contain 3-100 letters, numbers, dots, underscores, or hyphens.',
      400,
      'INVALID_USERNAME'
    );
  }


  if (!normalizedFullName) {
    throw createServiceError(
      'Full name is required.',
      400,
      'FULL_NAME_REQUIRED'
    );
  }


  if (!normalizedEmail) {
    throw createServiceError(
      'Email is required.',
      400,
      'EMAIL_REQUIRED'
    );
  }


  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizedEmail
    )
  ) {
    throw createServiceError(
      'Enter a valid email address.',
      400,
      'INVALID_EMAIL'
    );
  }


  if (
    typeof password !==
      'string' ||
    password.length < 8
  ) {
    throw createServiceError(
      'Password must contain at least 8 characters.',
      400,
      'INVALID_PASSWORD'
    );
  }


  // --------------------------------------------------
  // ACTOR VALIDATION
  // --------------------------------------------------

  const normalizedActorUserId =
    getPositiveInteger(
      actorUserId
    );

  if (!normalizedActorUserId) {
    throw createServiceError(
      'Authenticated user information is invalid.',
      401,
      'INVALID_AUTHENTICATED_USER'
    );
  }


  // --------------------------------------------------
  // RESOLVE ROLE
  // --------------------------------------------------

  const roleToCreate =
    resolveRoleToCreate({
      actorRole,
      requestedRole,
    });


  if (
    !ALLOWED_CLIENT_ROLES.has(
      roleToCreate
    )
  ) {
    throw createServiceError(
      'Invalid client user role.',
      400,
      'INVALID_CLIENT_ROLE'
    );
  }


  // --------------------------------------------------
  // ONE ACTIVE CLIENT ADMIN PER CLIENT
  // --------------------------------------------------

  if (
    roleToCreate ===
    'CLIENT_ADMIN'
  ) {
    const existingAdmin =
      await findActiveClientAdminByClientId(
        normalizedClientId
      );

    if (existingAdmin) {
      throw createServiceError(
        'This client already has an active Client Admin.',
        409,
        'CLIENT_ADMIN_ALREADY_EXISTS'
      );
    }
  }


  // --------------------------------------------------
  // PASSWORD HASH
  // --------------------------------------------------

  const passwordHash =
    await bcrypt.hash(
      password,
      12
    );


  // --------------------------------------------------
  // CREATE USER
  // --------------------------------------------------

  try {
    const user =
      await createClientUser({
        clientId:
          normalizedClientId,

        username:
          normalizedUsername,

        fullName:
          normalizedFullName,

        email:
          normalizedEmail,

        passwordHash,

        role:
          roleToCreate,

        createdBy:
          normalizedActorUserId,
      });

    return user;

  } catch (error) {

    // PostgreSQL:
    //
    // 23505 = unique_violation

    if (
      error.code ===
      '23505'
    ) {

      if (
        error.constraint ===
        'uq_one_active_client_admin_per_client'
      ) {
        throw createServiceError(
          'This client already has an active Client Admin.',
          409,
          'CLIENT_ADMIN_ALREADY_EXISTS'
        );
      }


      throw createServiceError(
        'A user with this username or email already exists.',
        409,
        'USER_ALREADY_EXISTS'
      );
    }

    throw error;
  }
}


// ======================================================
// UPDATE CLIENT USER STATUS
// ======================================================
//
// PLATFORM_ADMIN:
//   can manage CLIENT_ADMIN only.
//
// CLIENT_ADMIN:
//   can manage CONTENT_CREATOR / APPROVER only.
//
// The target user must always belong to clientId.
//
// ======================================================

async function updateClientUserStatusService({
  clientId,
  actorUserId,
  actorRole,
  targetUserId,
  isActive,
}) {

  // --------------------------------------------------
  // BASIC VALIDATION
  // --------------------------------------------------

  const normalizedClientId =
    getPositiveInteger(
      clientId
    );

  if (!normalizedClientId) {
    throw createServiceError(
      'Invalid client.',
      400,
      'INVALID_CLIENT'
    );
  }


  const normalizedActorUserId =
    getPositiveInteger(
      actorUserId
    );

  if (!normalizedActorUserId) {
    throw createServiceError(
      'Authenticated user information is invalid.',
      401,
      'INVALID_AUTHENTICATED_USER'
    );
  }


  const normalizedTargetUserId =
    getPositiveInteger(
      targetUserId
    );

  if (!normalizedTargetUserId) {
    throw createServiceError(
      'Invalid user.',
      400,
      'INVALID_USER'
    );
  }


  if (
    typeof isActive !==
    'boolean'
  ) {
    throw createServiceError(
      'isActive must be a boolean value.',
      400,
      'INVALID_USER_STATUS'
    );
  }


  const normalizedActorRole =
    normalizeRole(
      actorRole
    );


  if (
    ![
      'PLATFORM_ADMIN',
      'CLIENT_ADMIN',
    ].includes(
      normalizedActorRole
    )
  ) {
    throw createServiceError(
      'You are not allowed to manage client users.',
      403,
      'USER_MANAGEMENT_NOT_ALLOWED'
    );
  }


  // --------------------------------------------------
  // CLIENT VALIDATION
  // --------------------------------------------------

  const client =
    await findClientById(
      normalizedClientId
    );

  if (!client) {
    throw createServiceError(
      'Client not found.',
      404,
      'CLIENT_NOT_FOUND'
    );
  }


  /*
   * Deactivation is still allowed when the client
   * itself is inactive.
   *
   * Activation is blocked because an inactive client
   * should not gain active users.
   */
  if (
    isActive === true &&
    client.is_active !== true
  ) {
    throw createServiceError(
      'A user cannot be activated while the client is inactive.',
      409,
      'CLIENT_INACTIVE'
    );
  }


  // --------------------------------------------------
  // LOAD TARGET USER INSIDE CLIENT
  // --------------------------------------------------
  //
  // IMPORTANT:
  //
  // Repository query must include BOTH:
  //
  // user_id = targetUserId
  // client_id = clientId
  //
  // This prevents cross-client user management.
  //
  // --------------------------------------------------

  const targetUser =
    await findUserByIdForClient({
      clientId:
        normalizedClientId,

      userId:
        normalizedTargetUserId,
    });


  if (!targetUser) {
    throw createServiceError(
      'Client user not found.',
      404,
      'CLIENT_USER_NOT_FOUND'
    );
  }


  const targetRole =
    normalizeRole(
      targetUser.role
    );


  // --------------------------------------------------
  // PLATFORM ADMIN USERS MUST NEVER BE MANAGED HERE
  // --------------------------------------------------

  if (
    targetRole ===
    'PLATFORM_ADMIN'
  ) {
    throw createServiceError(
      'Platform Admin users cannot be managed through client user management.',
      403,
      'PLATFORM_ADMIN_MANAGEMENT_NOT_ALLOWED'
    );
  }


  // --------------------------------------------------
  // SELF-DEACTIVATION PROTECTION
  // --------------------------------------------------

  const targetId =
    getUserId(
      targetUser
    );


  if (
    isActive === false &&
    targetId ===
      normalizedActorUserId
  ) {
    throw createServiceError(
      'You cannot deactivate your own account.',
      409,
      'SELF_DEACTIVATION_NOT_ALLOWED'
    );
  }


  // --------------------------------------------------
  // PLATFORM ADMIN PERMISSION
  // --------------------------------------------------

  if (
    normalizedActorRole ===
    'PLATFORM_ADMIN'
  ) {
    if (
      targetRole !==
      'CLIENT_ADMIN'
    ) {
      throw createServiceError(
        'Platform Admin can only manage Client Admin users through this operation.',
        403,
        'TARGET_ROLE_NOT_ALLOWED'
      );
    }
  }


  // --------------------------------------------------
  // CLIENT ADMIN PERMISSION
  // --------------------------------------------------

  if (
    normalizedActorRole ===
    'CLIENT_ADMIN'
  ) {
    if (
      !CLIENT_ADMIN_ALLOWED_ROLES.has(
        targetRole
      )
    ) {
      throw createServiceError(
        'Client Admin can only manage Content Creator or Approver users.',
        403,
        'TARGET_ROLE_NOT_ALLOWED'
      );
    }
  }


  // --------------------------------------------------
  // IDEMPOTENT STATUS UPDATE
  // --------------------------------------------------
  //
  // If status is already correct there is nothing
  // to update.
  //
  // --------------------------------------------------

  if (
    targetUser.is_active ===
    isActive
  ) {
    return targetUser;
  }


  // --------------------------------------------------
  // CLIENT ADMIN ACTIVATION RULE
  // --------------------------------------------------
  //
  // Only one active CLIENT_ADMIN may exist for client.
  //
  // This check is done here for a friendly response.
  // The PostgreSQL unique index is still the final
  // concurrency-safe protection.
  //
  // --------------------------------------------------

  if (
    targetRole ===
      'CLIENT_ADMIN' &&
    isActive === true
  ) {
    const existingAdmin =
      await findActiveClientAdminByClientId(
        normalizedClientId
      );


    if (
      existingAdmin &&
      getUserId(
        existingAdmin
      ) !==
        normalizedTargetUserId
    ) {
      throw createServiceError(
        'This client already has an active Client Admin.',
        409,
        'CLIENT_ADMIN_ALREADY_EXISTS'
      );
    }
  }


  // --------------------------------------------------
  // UPDATE DATABASE
  // --------------------------------------------------

  try {
    const updatedUser =
      await updateClientUserStatus({
        clientId:
          normalizedClientId,

        userId:
          normalizedTargetUserId,

        isActive,
      });


    if (!updatedUser) {
      throw createServiceError(
        'Client user not found.',
        404,
        'CLIENT_USER_NOT_FOUND'
      );
    }


    return updatedUser;

  } catch (error) {

    /*
     * Concurrent Client Admin activation may still
     * reach the database unique constraint.
     */
    if (
      error.code ===
        '23505' &&
      error.constraint ===
        'uq_one_active_client_admin_per_client'
    ) {
      throw createServiceError(
        'This client already has an active Client Admin.',
        409,
        'CLIENT_ADMIN_ALREADY_EXISTS'
      );
    }


    throw error;
  }
}
async function getClientUserDetailsService({
  clientId,
  userId,
}) {
  const normalizedClientId =
    getPositiveInteger(
      clientId
    );

  if (!normalizedClientId) {
    throw createServiceError(
      'Invalid client.',
      400,
      'INVALID_CLIENT'
    );
  }

  const normalizedUserId =
    getPositiveInteger(
      userId
    );

  if (!normalizedUserId) {
    throw createServiceError(
      'Invalid user.',
      400,
      'INVALID_USER'
    );
  }

  const client =
    await findClientById(
      normalizedClientId
    );

  if (!client) {
    throw createServiceError(
      'Client not found.',
      404,
      'CLIENT_NOT_FOUND'
    );
  }

  const user =
    await findUserByIdForClient({
      clientId:
        normalizedClientId,

      userId:
        normalizedUserId,
    });

  if (!user) {
    throw createServiceError(
      'Client user not found.',
      404,
      'CLIENT_USER_NOT_FOUND'
    );
  }

  return {
    client: {
      client_id:
        client.client_id,

      client_code:
        client.client_code,

      business_name:
        client.business_name,
    },

    user,
  };
}


// ======================================================
// UPDATE CLIENT USER PROFILE
// ======================================================

async function updateClientUserProfileService({
  clientId,
  actorUserId,
  actorRole,
  targetUserId,
  username,
  fullName,
  email,
}) {
  const normalizedClientId =
    getPositiveInteger(
      clientId
    );

  if (!normalizedClientId) {
    throw createServiceError(
      'Invalid client.',
      400,
      'INVALID_CLIENT'
    );
  }


  const normalizedActorUserId =
    getPositiveInteger(
      actorUserId
    );

  if (!normalizedActorUserId) {
    throw createServiceError(
      'Authenticated user information is invalid.',
      401,
      'INVALID_AUTHENTICATED_USER'
    );
  }


  const normalizedTargetUserId =
    getPositiveInteger(
      targetUserId
    );

  if (!normalizedTargetUserId) {
    throw createServiceError(
      'Invalid user.',
      400,
      'INVALID_USER'
    );
  }


  const normalizedActorRole =
    normalizeRole(
      actorRole
    );


  if (
    ![
      'PLATFORM_ADMIN',
      'CLIENT_ADMIN',
    ].includes(
      normalizedActorRole
    )
  ) {
    throw createServiceError(
      'You are not allowed to edit client users.',
      403,
      'USER_EDIT_NOT_ALLOWED'
    );
  }


  // --------------------------------------------------
  // CLIENT
  // --------------------------------------------------

  const client =
    await findClientById(
      normalizedClientId
    );

  if (!client) {
    throw createServiceError(
      'Client not found.',
      404,
      'CLIENT_NOT_FOUND'
    );
  }


  // --------------------------------------------------
  // TARGET USER
  // --------------------------------------------------

  const targetUser =
    await findUserByIdForClient({
      clientId:
        normalizedClientId,

      userId:
        normalizedTargetUserId,
    });


  if (!targetUser) {
    throw createServiceError(
      'Client user not found.',
      404,
      'CLIENT_USER_NOT_FOUND'
    );
  }


  const targetRole =
    normalizeRole(
      targetUser.role
    );


  // --------------------------------------------------
  // PERMISSIONS
  // --------------------------------------------------

  if (
    normalizedActorRole ===
    'PLATFORM_ADMIN' &&
    targetRole !==
    'CLIENT_ADMIN'
  ) {
    throw createServiceError(
      'Platform Admin can only edit Client Admin users.',
      403,
      'TARGET_ROLE_NOT_ALLOWED'
    );
  }


  if (
    normalizedActorRole ===
    'CLIENT_ADMIN' &&
    !CLIENT_ADMIN_ALLOWED_ROLES.has(
      targetRole
    )
  ) {
    throw createServiceError(
      'Client Admin can only edit Content Creator or Approver users.',
      403,
      'TARGET_ROLE_NOT_ALLOWED'
    );
  }


  // --------------------------------------------------
  // NORMALIZE INPUT
  // --------------------------------------------------

  const normalizedUsername =
    normalizeText(
      username
    ).toLowerCase();

  const normalizedFullName =
    normalizeText(
      fullName
    );

  const normalizedEmail =
    normalizeText(
      email
    ).toLowerCase();


  // --------------------------------------------------
  // VALIDATION
  // --------------------------------------------------

  if (!normalizedUsername) {
    throw createServiceError(
      'Username is required.',
      400,
      'USERNAME_REQUIRED'
    );
  }


  if (
    !/^[a-zA-Z0-9._-]{3,100}$/.test(
      normalizedUsername
    )
  ) {
    throw createServiceError(
      'Username must contain 3-100 letters, numbers, dots, underscores, or hyphens.',
      400,
      'INVALID_USERNAME'
    );
  }


  if (!normalizedFullName) {
    throw createServiceError(
      'Full name is required.',
      400,
      'FULL_NAME_REQUIRED'
    );
  }


  if (!normalizedEmail) {
    throw createServiceError(
      'Email is required.',
      400,
      'EMAIL_REQUIRED'
    );
  }


  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizedEmail
    )
  ) {
    throw createServiceError(
      'Enter a valid email address.',
      400,
      'INVALID_EMAIL'
    );
  }


  // --------------------------------------------------
  // UPDATE
  // --------------------------------------------------

  try {
    const updatedUser =
      await updateClientUserProfile({
        clientId:
          normalizedClientId,

        userId:
          normalizedTargetUserId,

        username:
          normalizedUsername,

        fullName:
          normalizedFullName,

        email:
          normalizedEmail,
      });


    if (!updatedUser) {
      throw createServiceError(
        'Client user not found.',
        404,
        'CLIENT_USER_NOT_FOUND'
      );
    }


    return updatedUser;

  } catch (error) {

    /*
     * Username/email unique constraint.
     */
    if (
      error.code ===
      '23505'
    ) {
      throw createServiceError(
        'A user with this username or email already exists.',
        409,
        'USER_ALREADY_EXISTS'
      );
    }


    throw error;
  }
}
// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getClientUsersService,
  getClientUserDetailsService,
  createClientUserService,
  updateClientUserStatusService,
  updateClientUserProfileService,
};