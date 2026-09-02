'use strict';

const bcrypt =
  require('bcryptjs');

const {
  findClientById,
  findUsersByClientId,
  findActiveClientAdminByClientId,
  createClientUser,
} = require(
  '../repositories/clientUsers.repository'
);

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

/**
 * --------------------------------------------------
 * HELPERS
 * --------------------------------------------------
 */

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
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

/**
 * --------------------------------------------------
 * GET CLIENT USERS
 * --------------------------------------------------
 */

async function getClientUsersService({
  clientId,
}) {
  const client =
    await findClientById(
      clientId
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
      clientId
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

/**
 * --------------------------------------------------
 * RESOLVE ROLE TO CREATE
 * --------------------------------------------------
 */

function resolveRoleToCreate({
  actorRole,
  requestedRole,
}) {
  const normalizedActorRole =
    normalizeText(
      actorRole
    ).toUpperCase();

  const normalizedRequestedRole =
    normalizeText(
      requestedRole
    ).toUpperCase();

  /**
   * PLATFORM_ADMIN
   *
   * Platform Admin creates the
   * administrator for the selected client.
   */
  if (
    normalizedActorRole ===
    'PLATFORM_ADMIN'
  ) {
    return 'CLIENT_ADMIN';
  }

  /**
   * CLIENT_ADMIN
   *
   * Client Admin can create:
   *
   * - CONTENT_CREATOR
   * - APPROVER
   */
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

  /**
   * Other users cannot create
   * client users.
   */
  throw createServiceError(
    'You are not allowed to create client users.',
    403,
    'USER_CREATION_NOT_ALLOWED'
  );
}

/**
 * --------------------------------------------------
 * CREATE CLIENT USER
 * --------------------------------------------------
 */

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
  /**
   * -----------------------------------------------
   * CLIENT VALIDATION
   * -----------------------------------------------
   */

  const client =
    await findClientById(
      clientId
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

  /**
   * -----------------------------------------------
   * NORMALIZE INPUT
   * -----------------------------------------------
   */

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

  /**
   * -----------------------------------------------
   * FIELD VALIDATION
   * -----------------------------------------------
   */

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

  /**
   * -----------------------------------------------
   * ACTOR VALIDATION
   * -----------------------------------------------
   */

  if (
    !Number.isInteger(
      actorUserId
    ) ||
    actorUserId <= 0
  ) {
    throw createServiceError(
      'Authenticated user information is invalid.',
      401,
      'INVALID_AUTHENTICATED_USER'
    );
  }

  /**
   * -----------------------------------------------
   * RESOLVE ROLE
   * -----------------------------------------------
   */

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

  /**
   * -----------------------------------------------
   * ONE CLIENT ADMIN PER CLIENT
   * -----------------------------------------------
   */

  if (
    roleToCreate ===
    'CLIENT_ADMIN'
  ) {
    const existingAdmin =
      await findActiveClientAdminByClientId(
        clientId
      );

    if (existingAdmin) {
      throw createServiceError(
        'This client already has an active Client Admin.',
        409,
        'CLIENT_ADMIN_ALREADY_EXISTS'
      );
    }
  }

  /**
   * -----------------------------------------------
   * PASSWORD HASH
   * -----------------------------------------------
   */

  const passwordHash =
    await bcrypt.hash(
      password,
      12
    );

  /**
   * -----------------------------------------------
   * CREATE USER
   * -----------------------------------------------
   */

  try {
    const user =
      await createClientUser({
        clientId,

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
          actorUserId,
      });

    return user;

  } catch (error) {
    /**
     * PostgreSQL:
     *
     * 23505 = unique_violation
     */

    if (
      error.code === '23505'
    ) {
      /**
       * One active CLIENT_ADMIN
       * unique-index violation.
       */
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

      /**
       * Other duplicate constraints,
       * usually username/email.
       */
      throw createServiceError(
        'A user with this username or email already exists.',
        409,
        'USER_ALREADY_EXISTS'
      );
    }

    throw error;
  }
}

module.exports = {
  getClientUsersService,
  createClientUserService,
};