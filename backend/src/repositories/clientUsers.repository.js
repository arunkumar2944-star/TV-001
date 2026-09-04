'use strict';

const {
  getPool,
} = require('../database/pool');


// ======================================================
// FIND CLIENT BY ID
// ======================================================

async function findClientById(
  clientId
) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        SELECT
          client_id,
          client_code,
          business_name,
          status,
          is_active
        FROM clients
        WHERE client_id = $1
        LIMIT 1
      `,
      [
        clientId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}


// ======================================================
// FIND ACTIVE CLIENT ADMIN
// ======================================================
//
// Repository only retrieves data.
//
// Business rules such as:
// - whether another admin may be activated
// - who is allowed to modify the admin
//
// remain inside the service layer.
//
// ======================================================

async function findActiveClientAdminByClientId(
  clientId
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
          created_by,
          created_at,
          updated_at
        FROM client_users
        WHERE client_id = $1
          AND role = 'CLIENT_ADMIN'
          AND is_active = TRUE
        ORDER BY
          created_at ASC,
          user_id ASC
        LIMIT 1
      `,
      [
        clientId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}


// ======================================================
// FIND USERS BY CLIENT ID
// ======================================================

async function findUsersByClientId(
  clientId
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
          must_change_password,
          email_verified_at,
          last_login_at,
          created_by,
          created_at,
          updated_at
        FROM client_users
        WHERE client_id = $1
        ORDER BY
          created_at DESC,
          user_id DESC
      `,
      [
        clientId,
      ]
    );

  return result.rows;
}


// ======================================================
// FIND ONE USER INSIDE A CLIENT
// ======================================================
//
// IMPORTANT SECURITY RULE:
//
// The query checks BOTH:
//
//   user_id
//   client_id
//
// This prevents one client from managing a user that
// belongs to another client.
//
// ======================================================

async function findUserByIdForClient({
  clientId,
  userId,
}) {
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
          must_change_password,
          email_verified_at,
          last_login_at,
          created_by,
          created_at,
          updated_at
        FROM client_users
        WHERE user_id = $1
          AND client_id = $2
        LIMIT 1
      `,
      [
        userId,
        clientId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}


// ======================================================
// CREATE CLIENT USER
// ======================================================
//
// Role permission checks are handled
// by the service layer.
//
// ======================================================

async function createClientUser({
  clientId,
  username,
  fullName,
  email,
  passwordHash,
  role,
  createdBy,
}) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        INSERT INTO client_users (
          client_id,
          username,
          full_name,
          email,
          password_hash,
          role,
          is_active,
          must_change_password,
          created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          TRUE,
          TRUE,
          $7
        )
        RETURNING
          user_id,
          client_id,
          username,
          full_name,
          email,
          role,
          is_active,
          must_change_password,
          email_verified_at,
          last_login_at,
          created_by,
          created_at,
          updated_at
      `,
      [
        clientId,
        username,
        fullName,
        email,
        passwordHash,
        role,
        createdBy,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}


// ======================================================
// UPDATE CLIENT USER STATUS
// ======================================================
//
// PATCH operation ultimately reaches this function.
//
// Security:
//
// We again include BOTH:
//
//   user_id
//   client_id
//
// in the WHERE clause.
//
// Even if a user ID from another client is supplied,
// PostgreSQL will update zero rows.
//
// Authorization rules are handled in the service:
//
// PLATFORM_ADMIN
//   -> CLIENT_ADMIN only
//
// CLIENT_ADMIN
//   -> CONTENT_CREATOR / APPROVER only
//
// ======================================================

async function updateClientUserStatus({
  clientId,
  userId,
  isActive,
}) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        UPDATE client_users
        SET
          is_active = $3,
          updated_at = NOW()
        WHERE user_id = $1
          AND client_id = $2
        RETURNING
          user_id,
          client_id,
          username,
          full_name,
          email,
          role,
          is_active,
          must_change_password,
          email_verified_at,
          last_login_at,
          created_by,
          created_at,
          updated_at
      `,
      [
        userId,
        clientId,
        isActive,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}
// ======================================================
// UPDATE CLIENT USER PROFILE
// ======================================================

async function updateClientUserProfile({
  clientId,
  userId,
  username,
  fullName,
  email,
}) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        UPDATE client_users
        SET
          username = $3,
          full_name = $4,
          email = $5,
          updated_at = NOW()
        WHERE user_id = $1
          AND client_id = $2
        RETURNING
          user_id,
          client_id,
          username,
          full_name,
          email,
          role,
          is_active,
          must_change_password,
          email_verified_at,
          last_login_at,
          created_by,
          created_at,
          updated_at
      `,
      [
        userId,
        clientId,
        username,
        fullName,
        email,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  findClientById,
  findActiveClientAdminByClientId,
  findUsersByClientId,
  findUserByIdForClient,
  createClientUser,
  updateClientUserStatus,
  updateClientUserProfile
};