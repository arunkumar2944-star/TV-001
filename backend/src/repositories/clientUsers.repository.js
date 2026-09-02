'use strict';

const {
  getPool,
} = require('../database/pool');

/**
 * --------------------------------------------------
 * FIND CLIENT BY ID
 * --------------------------------------------------
 */
async function findClientById(
  clientId
) {
  const pool = getPool();

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
      [clientId]
    );

  return result.rows[0] || null;
}

/**
 * --------------------------------------------------
 * FIND ACTIVE CLIENT ADMIN
 * --------------------------------------------------
 *
 * Only checks data.
 *
 * No business logic here.
 */
async function findActiveClientAdminByClientId(
  clientId
) {
  const pool = getPool();

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
        LIMIT 1
      `,
      [clientId]
    );

  return result.rows[0] || null;
}

/**
 * --------------------------------------------------
 * FIND USERS BY CLIENT ID
 * --------------------------------------------------
 */
async function findUsersByClientId(
  clientId
) {
  const pool = getPool();

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
      [clientId]
    );

  return result.rows;
}

/**
 * --------------------------------------------------
 * CREATE CLIENT USER
 * --------------------------------------------------
 *
 * Role permission checks are handled
 * by the service layer.
 */
async function createClientUser({
  clientId,
  username,
  fullName,
  email,
  passwordHash,
  role,
  createdBy,
}) {
  const pool = getPool();

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

  return result.rows[0];
}

module.exports = {
  findClientById,
  findActiveClientAdminByClientId,
  findUsersByClientId,
  createClientUser,
};