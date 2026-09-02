'use strict';

const bcrypt =
  require('bcrypt');

const clientAdminRepository =
  require(
    '../repositories/clientAdmin.repository'
  );

const ApiError =
  require('../utils/ApiError');


// ======================================================
// CONFIGURATION
// ======================================================

const PASSWORD_SALT_ROUNDS = 12;


// ======================================================
// HELPERS
// ======================================================

function parsePositiveInteger(
  value,
  fieldName
) {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw ApiError.badRequest(
      `${fieldName} is invalid.`
    );
  }

  return parsed;
}


function normalizeUsername(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase();
}


function normalizeFullName(
  value
) {
  return String(
    value || ''
  ).trim();
}


function normalizeEmail(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase();
}


// ======================================================
// VALIDATE USER INPUT
// ======================================================

function validateInput({
  username,
  fullName,
  email,
  password,
}) {
  if (!username) {
    throw ApiError.badRequest(
      'Username is required.'
    );
  }

  if (
    !/^[a-zA-Z0-9._-]{3,100}$/
      .test(username)
  ) {
    throw ApiError.badRequest(
      'Username must contain 3-100 letters, numbers, dots, underscores, or hyphens.'
    );
  }


  if (!fullName) {
    throw ApiError.badRequest(
      'Full name is required.'
    );
  }

  if (
    fullName.length > 150
  ) {
    throw ApiError.badRequest(
      'Full name must not exceed 150 characters.'
    );
  }


  if (!email) {
    throw ApiError.badRequest(
      'Email is required.'
    );
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(email)
  ) {
    throw ApiError.badRequest(
      'Enter a valid email address.'
    );
  }


  if (
    typeof password !== 'string' ||
    password.length < 8
  ) {
    throw ApiError.badRequest(
      'Password must contain at least 8 characters.'
    );
  }

  if (
    password.length > 128
  ) {
    throw ApiError.badRequest(
      'Password must not exceed 128 characters.'
    );
  }
}


// ======================================================
// CREATE FIRST CLIENT ADMIN
// ======================================================

async function createClientAdmin({
  clientId,
  createdBy,
  username,
  fullName,
  email,
  password,
}) {
  // ====================================================
  // 1. TRUSTED CONTEXT
  // ====================================================

  const parsedClientId =
    parsePositiveInteger(
      clientId,
      'Active client'
    );

  const parsedCreatedBy =
    parsePositiveInteger(
      createdBy,
      'Authenticated user'
    );


  // ====================================================
  // 2. NORMALIZE
  // ====================================================

  const normalizedUsername =
    normalizeUsername(
      username
    );

  const normalizedFullName =
    normalizeFullName(
      fullName
    );

  const normalizedEmail =
    normalizeEmail(
      email
    );


  // ====================================================
  // 3. VALIDATE INPUT
  // ====================================================

  validateInput({
    username:
      normalizedUsername,

    fullName:
      normalizedFullName,

    email:
      normalizedEmail,

    password,
  });


  // ====================================================
  // 4. VALIDATE CLIENT
  // ====================================================

  const client =
    await clientAdminRepository
      .findClientById(
        parsedClientId
      );

  if (!client) {
    throw ApiError.notFound(
      'Client not found.'
    );
  }

  if (
    client.is_active !== true
  ) {
    throw ApiError.conflict(
      'Client is inactive. Activate the client before creating its administrator.'
    );
  }


  // ====================================================
  // 5. ONLY FIRST CLIENT ADMIN
  // ====================================================

  const existingAdmin =
    await clientAdminRepository
      .findClientAdmin(
        parsedClientId
      );

  if (existingAdmin) {
    throw ApiError.conflict(
      'This client already has a Client Admin.'
    );
  }


  // ====================================================
  // 6. EMAIL DUPLICATE
  // ====================================================

  const existingEmail =
    await clientAdminRepository
      .findByEmail(
        normalizedEmail
      );

  if (existingEmail) {
    throw ApiError.conflict(
      'A user with this email already exists.'
    );
  }


  // ====================================================
  // 7. USERNAME DUPLICATE
  // ====================================================

  const existingUsername =
    await clientAdminRepository
      .findByUsername({
        clientId:
          parsedClientId,

        username:
          normalizedUsername,
      });

  if (existingUsername) {
    throw ApiError.conflict(
      'This username already exists for the client.'
    );
  }


  // ====================================================
  // 8. HASH PASSWORD
  // ====================================================

  const passwordHash =
    await bcrypt.hash(
      password,
      PASSWORD_SALT_ROUNDS
    );


  // ====================================================
  // 9. CREATE CLIENT ADMIN
  // ====================================================
  //
  // Role is NOT accepted from frontend.
  // Repository hardcodes CLIENT_ADMIN.
  //
  // ====================================================

  try {
    return await clientAdminRepository
      .createClientAdmin({
        clientId:
          parsedClientId,

        username:
          normalizedUsername,

        fullName:
          normalizedFullName,

        email:
          normalizedEmail,

        passwordHash,

        createdBy:
          parsedCreatedBy,
      });

  } catch (error) {

    if (
      error?.code === '23505'
    ) {
      throw ApiError.conflict(
        'Client Admin already exists or the username/email is already in use.'
      );
    }

    if (
      error?.code === '23503'
    ) {
      throw ApiError.badRequest(
        'Invalid client or creator user.'
      );
    }

    throw error;
  }
}


module.exports = {
  createClientAdmin,
};