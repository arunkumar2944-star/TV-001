'use strict';

const {
  getPool,
} = require('../database/pool');


// ======================================================
// FIND USER BY EMAIL
// ======================================================

async function findByEmail(
  email
) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
      SELECT
        user_id,
        client_id,
        username,
        full_name,
        email,
        password_hash,
        role,
        is_active,
        email_verified_at,
        last_login_at,
        created_by,
        created_at,
        updated_at
      FROM client_users
      WHERE LOWER(email) =
            LOWER($1)
      LIMIT 1
      `,
      [email]
    );

  return result.rows[0] ?? null;
}


// ======================================================
// FIND USER BY USERNAME
// ======================================================

async function findByUsername(
  username
) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
      SELECT
        user_id,
        client_id,
        username,
        full_name,
        email,
        role,
        is_active,
        email_verified_at,
        last_login_at,
        created_by,
        created_at,
        updated_at
      FROM client_users
      WHERE LOWER(username) =
            LOWER($1)
      LIMIT 1
      `,
      [username]
    );

  return result.rows[0] ?? null;
}


// ======================================================
// FIND USER BY ID
// ======================================================

async function findById(
  userId
) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
      SELECT
        user_id,
        client_id,
        username,
        full_name,
        email,
        password_hash,
        role,
        is_active,
        email_verified_at,
        last_login_at,
        created_by,
        created_at,
        updated_at
      FROM client_users
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

  return result.rows[0] ?? null;
}


// ======================================================
// CREATE FIRST / PLATFORM ADMIN
// ======================================================

async function createPlatformAdmin({
  username,
  fullName,
  email,
  passwordHash,
}) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
      INSERT INTO client_users
      (
        client_id,
        username,
        full_name,
        email,
        password_hash,
        role,
        is_active,
        email_verified_at,
        last_login_at,
        created_by,
        created_at,
        updated_at
      )
      VALUES
      (
        NULL,
        $1,
        $2,
        $3,
        $4,
        'PLATFORM_ADMIN',
        TRUE,
        NULL,
        NULL,
        NULL,
        NOW(),
        NOW()
      )
      RETURNING
        user_id,
        client_id,
        username,
        full_name,
        email,
        role,
        is_active,
        email_verified_at,
        last_login_at,
        created_by,
        created_at,
        updated_at
      `,
      [
        username,
        fullName,
        email,
        passwordHash,
      ]
    );

  return result.rows[0];
}


// ======================================================
// UPDATE LAST LOGIN
// ======================================================

async function updateLastLogin(
  userId
) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
      UPDATE client_users
      SET
        last_login_at = NOW(),
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING
        user_id,
        last_login_at,
        updated_at
      `,
      [userId]
    );

  return result.rows[0] ?? null;
}

async function updateUserPassword({
  userId,
  passwordHash,
}) {
  const pool = getPool();

  const result =
    await pool.query(
      `
        UPDATE client_users
        SET
          password_hash = $1,
          must_change_password = FALSE,
          updated_at = NOW()
        WHERE user_id = $2
          AND is_active = TRUE
        RETURNING
          user_id,
          client_id,
          username,
          full_name,
          email,
          role,
          is_active,
          must_change_password,
          updated_at
      `,
      [
        passwordHash,
        userId,
      ]
    );

  return result.rows[0] || null;
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  findByEmail,
  findByUsername,
  findById,
  createPlatformAdmin,
  updateLastLogin,
  updateUserPassword,
};