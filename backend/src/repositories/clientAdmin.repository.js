'use strict';

const db =
  require('../database');


const PUBLIC_USER_COLUMNS = `
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
`;


// ======================================================
// FIND CLIENT
// ======================================================

async function findClientById(
  clientId
) {
  return db.queryOne(
    `
    SELECT
      client_id,
      client_code,
      business_name,
      status,
      onboarding_status,
      is_active

    FROM clients

    WHERE client_id = $1

    LIMIT 1
    `,
    [clientId]
  );
}


// ======================================================
// FIND EXISTING CLIENT ADMIN
// ======================================================

async function findClientAdmin(
  clientId
) {
  return db.queryOne(
    `
    SELECT
      ${PUBLIC_USER_COLUMNS}

    FROM client_users

    WHERE client_id = $1
      AND role = 'CLIENT_ADMIN'

    LIMIT 1
    `,
    [clientId]
  );
}


// ======================================================
// FIND BY EMAIL
// ======================================================

async function findByEmail(
  email
) {
  return db.queryOne(
    `
    SELECT
      ${PUBLIC_USER_COLUMNS}

    FROM client_users

    WHERE LOWER(email) =
          LOWER($1)

    LIMIT 1
    `,
    [email]
  );
}


// ======================================================
// FIND USERNAME IN CLIENT
// ======================================================

async function findByUsername({
  clientId,
  username,
}) {
  return db.queryOne(
    `
    SELECT
      ${PUBLIC_USER_COLUMNS}

    FROM client_users

    WHERE client_id = $1
      AND LOWER(username) =
          LOWER($2)

    LIMIT 1
    `,
    [
      clientId,
      username,
    ]
  );
}


// ======================================================
// CREATE FIRST CLIENT ADMIN
// ======================================================

async function createClientAdmin({
  clientId,
  username,
  fullName,
  email,
  passwordHash,
  createdBy,
}) {
  return db.withTransaction(
    async (
      transactionClient
    ) => {

      const createdUser =
        await db.queryOne(
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
            created_by,
            created_at,
            updated_at
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            'CLIENT_ADMIN',
            TRUE,
            $6,
            NOW(),
            NOW()
          )

          RETURNING
            ${PUBLIC_USER_COLUMNS}
          `,
          [
            clientId,
            username,
            fullName,
            email,
            passwordHash,
            createdBy,
          ],
          transactionClient
        );


      await db.query(
        `
        UPDATE clients

        SET
          onboarding_status =
            'ADMIN_CREATED',

          updated_at =
            NOW()

        WHERE client_id = $1
        `,
        [clientId],
        transactionClient
      );


      return createdUser;
    }
  );
}


module.exports = {
  PUBLIC_USER_COLUMNS,

  findClientById,
  findClientAdmin,
  findByEmail,
  findByUsername,

  createClientAdmin,
};