'use strict';

/**
 * Audit trail.
 *
 * Everything is written to the existing news_execution_audit table - no extra
 * audit table is introduced (specification section 41). Account level events
 * (LOGIN, CREATE_USER, ...) simply have a NULL news_id.
 *
 * Auditing must never break the operation it is describing, so a failure to
 * write an audit row is logged and swallowed.
 */

const db = require('../database');
const logger = require('../utils/logger');
const { AUDIT_STATUS } = require('../config/constants');

const INSERT_SQL = `
  INSERT INTO news_execution_audit (
    news_id, publish_job_id, platform_id, actor_user_id, stage, status,
    attempt_count, n8n_execution_id, workflow_name, message, error_type,
    retry_allowed, metadata
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  RETURNING id
`;

/**
 * @param {object} entry
 * @param {object} [client] pg client when the audit row must join a transaction
 */
async function record(entry, client) {
  const params = [
    entry.newsId ?? null,
    entry.publishJobId ?? null,
    entry.platformId ?? null,
    entry.actorUserId ?? null,
    entry.stage,
    entry.status || AUDIT_STATUS.INFO,
    entry.attemptCount ?? null,
    entry.n8nExecutionId ?? null,
    entry.workflowName ?? null,
    entry.message ?? null,
    entry.errorType ?? null,
    entry.retryAllowed ?? null,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
  ];

  try {
    const result = await db.query(INSERT_SQL, params, client);
    return result.rows[0].id;
  } catch (error) {
    logger.error('Audit write failed', {
      stage: entry.stage,
      newsId: entry.newsId,
      code: error.code,
      message: error.message,
    });
    if (client) {
      // Inside a transaction a failed statement aborts the whole transaction,
      // so the caller has to know rather than continue on a poisoned client.
      throw error;
    }
    return null;
  }
}

/** Fire-and-forget variant for non-critical paths (never joins a transaction). */
function recordSafe(entry) {
  record(entry).catch(() => {});
}

const LIST_SQL = `
  SELECT
    a.id, a.news_id, a.publish_job_id, a.platform_id, a.actor_user_id,
    a.stage, a.status, a.attempt_count, a.n8n_execution_id, a.workflow_name,
    a.message, a.error_type, a.retry_allowed, a.metadata, a.created_at,
    u.full_name AS actor_name,
    p.code      AS platform_code,
    p.name      AS platform_name,
    n.headline  AS news_headline
  FROM news_execution_audit a
  LEFT JOIN client_users u            ON u.user_id = a.actor_user_id
  LEFT JOIN social_platforms p ON p.id = a.platform_id
  LEFT JOIN news n             ON n.id = a.news_id
  WHERE ($1::bigint IS NULL OR a.news_id = $1)
    AND ($2::bigint IS NULL OR a.publish_job_id = $2)
    AND ($3::text   IS NULL OR a.stage = $3)
    AND ($4::text   IS NULL OR a.status = $4)
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT $5 OFFSET $6
`;

const COUNT_SQL = `
  SELECT COUNT(*)::int AS total
  FROM news_execution_audit a
  WHERE ($1::bigint IS NULL OR a.news_id = $1)
    AND ($2::bigint IS NULL OR a.publish_job_id = $2)
    AND ($3::text   IS NULL OR a.stage = $3)
    AND ($4::text   IS NULL OR a.status = $4)
`;

async function list({ newsId = null, publishJobId = null, stage = null, status = null, page = 1, pageSize = 50 }) {
  const limit = Math.min(Math.max(pageSize, 1), 200);
  const offset = (Math.max(page, 1) - 1) * limit;
  const filters = [newsId, publishJobId, stage, status];

  const [rows, countResult] = await Promise.all([
    db.queryAll(LIST_SQL, [...filters, limit, offset]),
    db.queryOne(COUNT_SQL, filters),
  ]);

  return {
    items: rows,
    pagination: {
      page: Math.max(page, 1),
      pageSize: limit,
      total: countResult ? countResult.total : rows.length,
    },
  };
}

module.exports = { record, recordSafe, list };
