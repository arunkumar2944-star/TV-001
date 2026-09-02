'use strict';

/**
 * social_platforms master data and the news -> platform relationship.
 *
 * Selected platforms are stored as ROWS in news_platform_targets (never as a
 * JSON blob on news), so publishing, retrying and reporting can all join on
 * them - specification section 10.
 */

const db = require('../database');
const ApiError = require('../utils/ApiError');

const PLATFORM_COLUMNS = 'id, code, name, is_active, sort_order';

async function listPlatforms({ activeOnly = true } = {}) {
  return db.queryAll(
    `SELECT ${PLATFORM_COLUMNS}
       FROM social_platforms
      WHERE ($1::boolean IS FALSE OR is_active = TRUE)
      ORDER BY sort_order ASC, name ASC`,
    [activeOnly]
  );
}

async function findByCodes(codes, client) {
  if (!Array.isArray(codes) || codes.length === 0) return [];
  const normalised = codes.map((code) => String(code).trim().toLowerCase());
  return db.queryAll(
    `SELECT ${PLATFORM_COLUMNS} FROM social_platforms WHERE lower(code) = ANY($1::text[]) ORDER BY sort_order ASC`,
    [normalised],
    client
  );
}

/**
 * Resolves platform codes to ids, rejecting unknown or disabled destinations.
 * @returns {Promise<Array<{id:number, code:string, name:string}>>}
 */
async function resolveCodes(codes, client) {
  const unique = [...new Set((codes || []).map((code) => String(code).trim().toLowerCase()))];
  if (unique.length === 0) {
    throw ApiError.badRequest('Select at least one social media platform');
  }

  const rows = await findByCodes(unique, client);
  const foundCodes = new Set(rows.map((row) => row.code.toLowerCase()));
  const missing = unique.filter((code) => !foundCodes.has(code));

  if (missing.length > 0) {
    throw ApiError.badRequest(`Unknown social platform: ${missing.join(', ')}`);
  }

  const disabled = rows.filter((row) => row.is_active === false).map((row) => row.code);
  if (disabled.length > 0) {
    throw ApiError.badRequest(`Platform is currently disabled: ${disabled.join(', ')}`);
  }

  return rows;
}

async function getTargets(newsId, client) {
  return db.queryAll(
    `SELECT t.id, t.news_id, t.platform_id, t.platform_content,
            p.code, p.name, p.sort_order
       FROM news_platform_targets t
       JOIN social_platforms p ON p.id = t.platform_id
      WHERE t.news_id = $1
      ORDER BY p.sort_order ASC`,
    [newsId],
    client
  );
}

async function getTargetsForMany(newsIds) {
  if (!Array.isArray(newsIds) || newsIds.length === 0) return new Map();
  const rows = await db.queryAll(
    `SELECT t.news_id, p.id AS platform_id, p.code, p.name, p.sort_order
       FROM news_platform_targets t
       JOIN social_platforms p ON p.id = t.platform_id
      WHERE t.news_id = ANY($1::bigint[])
      ORDER BY p.sort_order ASC`,
    [newsIds]
  );

  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.news_id)) grouped.set(row.news_id, []);
    grouped.get(row.news_id).push({
      platformId: row.platform_id,
      code: row.code,
      name: row.name,
    });
  }
  return grouped;
}

/**
 * Replaces the platform selection for a post. Runs inside the caller's
 * transaction so a post never ends up half-targeted.
 */
async function replaceTargets(newsId, platformIds, client) {
  await db.query(
    'DELETE FROM news_platform_targets WHERE news_id = $1 AND platform_id <> ALL($2::bigint[])',
    [newsId, platformIds],
    client
  );

  if (platformIds.length > 0) {
    await db.query(
      `INSERT INTO news_platform_targets (news_id, platform_id)
       SELECT $1, unnest($2::bigint[])
       ON CONFLICT (news_id, platform_id) DO NOTHING`,
      [newsId, platformIds],
      client
    );
  }

  return getTargets(newsId, client);
}

/** Per-platform overrides for a future release (section 23) - stored as JSONB. */
async function setPlatformContent(newsId, platformId, content, client) {
  return db.queryOne(
    `UPDATE news_platform_targets
        SET platform_content = $3::jsonb
      WHERE news_id = $1 AND platform_id = $2
      RETURNING id, news_id, platform_id, platform_content`,
    [newsId, platformId, content ? JSON.stringify(content) : null],
    client
  );
}

module.exports = {
  listPlatforms,
  findByCodes,
  resolveCodes,
  getTargets,
  getTargetsForMany,
  replaceTargets,
  setPlatformContent,
};
