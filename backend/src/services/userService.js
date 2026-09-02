'use strict';

/**
 * User service for the multi-tenant client_users model.
 *
 * Canonical database key: user_id.
 * A temporary `id` alias is exposed on service results so the existing newsroom
 * modules can continue operating while they are migrated incrementally.
 */

const db = require('../database');
const ApiError = require('../utils/ApiError');
const passwordService = require('./passwordService');
const { ROLES, ROLE_VALUES, CLIENT_ROLE_VALUES } = require('../config/constants');

const PUBLIC_COLUMNS = `
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
`;

function withLegacyId(user) {
  if (!user) return null;
  return { ...user, id: user.user_id };
}

async function findById(userId) {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const user = await db.queryOne(
    `SELECT ${PUBLIC_COLUMNS} FROM client_users WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return withLegacyId(user);
}

/** Login path only. Never return this object directly to a client. */
async function findByEmailWithSecret(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const user = await db.queryOne(
    `SELECT ${PUBLIC_COLUMNS}, password_hash
       FROM client_users
      WHERE lower(email) = lower($1)
      LIMIT 1`,
    [normalized]
  );
  return withLegacyId(user);
}


async function emailExists(email, excludeUserId = null) {
  const row = await db.queryOne(
    `SELECT user_id
       FROM client_users
      WHERE lower(email) = lower($1)
        AND ($2::bigint IS NULL OR user_id <> $2)
      LIMIT 1`,
    [String(email || '').trim(), excludeUserId]
  );
  return Boolean(row);
}

async function usernameExists(username, excludeUserId = null) {
  const normalized = String(username || '').trim();
  if (!normalized) return false;
  const row = await db.queryOne(
    `SELECT user_id
       FROM client_users
      WHERE lower(username) = lower($1)
        AND ($2::bigint IS NULL OR user_id <> $2)
      LIMIT 1`,
    [normalized, excludeUserId]
  );
  return Boolean(row);
}

async function countPlatformAdmins() {
  const row = await db.queryOne(
    `SELECT COUNT(*)::int AS total
       FROM client_users
      WHERE role = $1`,
    [ROLES.PLATFORM_ADMIN]
  );
  return row ? row.total : 0;
}

/**
 * One-time bootstrap only. Once any PLATFORM_ADMIN exists this method refuses
 * another unauthenticated bootstrap creation.
 */
async function createPlatformAdmin({ username, fullName, email, password }) {
  if (await countPlatformAdmins() > 0) {
    throw ApiError.conflict('Platform administrator bootstrap is already complete');
  }

  const normalizedUsername = String(username || '').trim();
  const normalizedFullName = String(fullName || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedUsername) throw ApiError.badRequest('Username is required');
  if (!normalizedFullName) throw ApiError.badRequest('Full name is required');
  if (!normalizedEmail) throw ApiError.badRequest('Email is required');

  const problems = passwordService.validateStrength(password);
  if (problems.length > 0) throw ApiError.badRequest(problems[0]);
  if (await emailExists(normalizedEmail)) {
    throw ApiError.conflict('An account with that email already exists');
  }
  if (await usernameExists(normalizedUsername)) {
    throw ApiError.conflict('An account with that username already exists');
  }

  const passwordHash = await passwordService.hash(password);
  const user = await db.queryOne(
    `INSERT INTO client_users
       (client_id, username, full_name, email, password_hash, role, is_active, created_by)
     VALUES
       (NULL, $1, $2, $3, $4, $5, TRUE, NULL)
     RETURNING ${PUBLIC_COLUMNS}`,
    [normalizedUsername, normalizedFullName, normalizedEmail, passwordHash, ROLES.PLATFORM_ADMIN]
  );
  return withLegacyId(user);
}

async function recordLogin(userId) {
  await db.query(
    `UPDATE client_users
        SET last_login_at = now(), updated_at = now()
      WHERE user_id = $1`,
    [userId]
  );
}

async function resetPassword(userId, newPassword) {
  const problems = passwordService.validateStrength(newPassword);
  if (problems.length > 0) throw ApiError.badRequest(problems[0]);
  const passwordHash = await passwordService.hash(newPassword);
  const updated = await db.queryOne(
    `UPDATE client_users
        SET password_hash = $2, updated_at = now()
      WHERE user_id = $1
      RETURNING ${PUBLIC_COLUMNS}`,
    [userId, passwordHash]
  );
  if (!updated) throw ApiError.notFound('User not found');
  return withLegacyId(updated);
}

async function list({ role = null, isActive = null, search = null, clientId = null, page = 1, pageSize = 25 }) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  const params = [role, isActive, search ? `%${search}%` : null, clientId];
  const where = `
    WHERE ($1::text IS NULL OR role = $1)
      AND ($2::boolean IS NULL OR is_active = $2)
      AND ($3::text IS NULL OR full_name ILIKE $3 OR email ILIKE $3 OR username ILIKE $3)
      AND ($4::bigint IS NULL OR client_id = $4)
  `;
  const [items, countRow] = await Promise.all([
    db.queryAll(
      `SELECT ${PUBLIC_COLUMNS} FROM client_users ${where}
       ORDER BY role ASC, full_name ASC LIMIT $5 OFFSET $6`,
      [...params, limit, offset]
    ),
    db.queryOne(`SELECT COUNT(*)::int AS total FROM client_users ${where}`, params),
  ]);
  return {
    items: items.map(withLegacyId),
    pagination: { page: Math.max(page, 1), pageSize: limit, total: countRow ? countRow.total : 0 },
  };
}

/**
 * Transitional user creation API. PLATFORM_ADMIN may create client-scoped
 * users only when clientId is supplied. Client registration will receive its
 * own dedicated service/routes next.
 */
async function create({ clientId, fullName, email, username, password, role }, createdBy = null) {
  if (!CLIENT_ROLE_VALUES.includes(role)) {
    throw ApiError.badRequest('Role must be a client role');
  }
  const parsedClientId = Number(clientId);
  if (!Number.isInteger(parsedClientId) || parsedClientId <= 0) {
    throw ApiError.badRequest('clientId is required when creating a client user');
  }
  const problems = passwordService.validateStrength(password);
  if (problems.length > 0) throw ApiError.badRequest(problems[0]);
  if (await emailExists(email)) throw ApiError.conflict('An account with that email already exists');
  if (username && await usernameExists(username)) throw ApiError.conflict('An account with that username already exists');
  const passwordHash = await passwordService.hash(password);
  const user = await db.queryOne(
    `INSERT INTO client_users
       (client_id, full_name, email, username, password_hash, role, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
     RETURNING ${PUBLIC_COLUMNS}`,
    [parsedClientId, String(fullName).trim(), String(email).trim().toLowerCase(), String(username || '').trim(), passwordHash, role, createdBy]
  );
  return withLegacyId(user);
}

async function setActiveStatus(userId, isActive, actor) {
  const user = await findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (!isActive && actor && actor.user_id === user.user_id) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  if (!isActive && user.role === ROLES.PLATFORM_ADMIN) {
    const row = await db.queryOne(
      `SELECT COUNT(*)::int AS total FROM client_users
        WHERE role = $1 AND is_active = TRUE AND user_id <> $2`,
      [ROLES.PLATFORM_ADMIN, userId]
    );
    if (!row || row.total === 0) {
      throw ApiError.conflict('At least one active platform administrator must remain');
    }
  }
  const updated = await db.queryOne(
    `UPDATE client_users SET is_active = $2, updated_at = now()
      WHERE user_id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [userId, isActive]
  );
  return withLegacyId(updated);
}

async function updateProfile(userId, { fullName, username, role }, actor) {
  const user = await findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (role && role !== user.role && actor && actor.user_id === user.user_id) {
    throw ApiError.badRequest('You cannot change your own role');
  }
  if (role && !ROLE_VALUES.includes(role)) throw ApiError.badRequest('Invalid role');
  // Keep platform/global and client-scoped account semantics intact.
  if (user.client_id == null && role && role !== ROLES.PLATFORM_ADMIN) {
    throw ApiError.badRequest('A platform administrator cannot be converted to a client role');
  }
  if (user.client_id != null && role === ROLES.PLATFORM_ADMIN) {
    throw ApiError.badRequest('A client user cannot be converted to PLATFORM_ADMIN');
  }
  const updated = await db.queryOne(
    `UPDATE client_users
        SET full_name = COALESCE($2, full_name),
            username = COALESCE($3, username),
            role = COALESCE($4, role),
            updated_at = now()
      WHERE user_id = $1
      RETURNING ${PUBLIC_COLUMNS}`,
    [userId, fullName ?? null, username ?? null, role ?? null]
  );
  return withLegacyId(updated);
}

function toPublic(user) {
  if (!user) return null;
  const { password_hash: _ignored, ...safe } = user;
  // Preserve id temporarily for the existing newsroom UI; user_id is canonical.
  if (safe.user_id && safe.id == null) safe.id = safe.user_id;
  return safe;
}

async function changeOwnPassword({
  userId,
  newPassword,
}) {
  if (
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    throw ApiError.unauthorized(
      'Invalid authenticated user'
    );
  }

  const problems =
    passwordService.validateStrength(
      newPassword
    );

  if (problems.length > 0) {
    throw ApiError.badRequest(
      problems[0]
    );
  }

  const passwordHash =
    await passwordService.hash(
      newPassword
    );

  const updated =
    await db.queryOne(
      `
        UPDATE client_users
        SET
          password_hash = $2,
          must_change_password = FALSE,
          updated_at = now()
        WHERE user_id = $1
          AND is_active = TRUE
        RETURNING ${PUBLIC_COLUMNS}
      `,
      [
        userId,
        passwordHash,
      ]
    );

  if (!updated) {
    throw ApiError.notFound(
      'User not found or inactive'
    );
  }

  return withLegacyId(updated);
}

module.exports = {
  ROLES,
  ROLE_VALUES,
  CLIENT_ROLE_VALUES,
  PUBLIC_COLUMNS,
  findById,
  findByEmailWithSecret,
  emailExists,
  usernameExists,
  countPlatformAdmins,
  createPlatformAdmin,
  recordLogin,
  resetPassword,
  list,
  create,
  setActiveStatus,
  updateProfile,
  toPublic,
  changeOwnPassword,
};
