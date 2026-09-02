'use strict';

/**
 * Dashboard data.
 *
 * Every number comes from PostgreSQL. n8n is never queried, so publishing
 * history stays visible on the dashboard even while the automation layer is
 * down (specification section 8).
 */

const db = require('../database');
const logger = require('../utils/logger');
const { NEWS_STATUS_VALUES, PLATFORM_STATUS } = require('../config/constants');

const IN_FLIGHT = [PLATFORM_STATUS.PENDING, PLATFORM_STATUS.READY, PLATFORM_STATUS.PUBLISHING];

function emptyStatusCounts() {
  return NEWS_STATUS_VALUES.reduce((acc, status) => ({ ...acc, [status]: 0 }), {});
}

/**
 * Reads dashboard_news_summary when its shape is recognisable, otherwise
 * aggregates the base tables. The API never hard-depends on the view, so a
 * differently shaped existing view cannot break the dashboard.
 */
async function readSummaryView() {
  try {
    const exists = await db.relationExists('dashboard_news_summary');
    if (!exists) return null;

    const rows = await db.queryAll('SELECT * FROM dashboard_news_summary');
    if (rows.length === 0) return emptyStatusCounts();

    const sample = rows[0];
    const statusKey = ['status', 'news_status'].find((key) => key in sample);
    const countKey = ['total', 'count', 'total_count', 'news_count'].find((key) => key in sample);
    if (!statusKey || !countKey) return null;

    const counts = emptyStatusCounts();
    for (const row of rows) {
      const status = String(row[statusKey] || '').toUpperCase();
      if (status in counts) counts[status] = Number(row[countKey]) || 0;
    }
    return counts;
  } catch (error) {
    logger.warn('dashboard_news_summary unavailable, using base tables', { error: error.message });
    return null;
  }
}

async function readSummaryFromBaseTables() {
  const rows = await db.queryAll('SELECT status, COUNT(*)::int AS total FROM news GROUP BY status');
  const counts = emptyStatusCounts();
  for (const row of rows) {
    const status = String(row.status || '').toUpperCase();
    if (status in counts) counts[status] = row.total;
  }
  return counts;
}

/** Status cards + today's activity. */
async function getSummary() {
  const [viewCounts, todayRow, totalRow, jobRows] = await Promise.all([
    readSummaryView(),
    db.queryOne(
      `SELECT
         COUNT(*)::int AS today_total,
         COUNT(*) FILTER (WHERE status = 'PUBLISHED')::int AS today_published
       FROM news
       WHERE created_at >= date_trunc('day', now())`
    ),
    db.queryOne('SELECT COUNT(*)::int AS total FROM news'),
    db.queryAll('SELECT status, COUNT(*)::int AS total FROM publish_jobs GROUP BY status'),
  ]);

  const byStatus = viewCounts || (await readSummaryFromBaseTables());

  const jobs = jobRows.reduce((acc, row) => ({ ...acc, [row.status]: row.total }), {});

  return {
    todayTotal: todayRow ? todayRow.today_total : 0,
    todayPublished: todayRow ? todayRow.today_published : 0,
    totalPosts: totalRow ? totalRow.total : 0,
    byStatus,
    cards: {
      draft: byStatus.DRAFT || 0,
      pendingApproval: byStatus.PENDING_APPROVAL || 0,
      rejected: byStatus.REJECTED || 0,
      approved: byStatus.APPROVED || 0,
      publishing: byStatus.PUBLISHING || 0,
      published: byStatus.PUBLISHED || 0,
      partiallyPublished: byStatus.PARTIALLY_PUBLISHED || 0,
      failed: byStatus.FAILED || 0,
      archived: byStatus.ARCHIVED || 0,
    },
    jobs: {
      queued: jobs.QUEUED || 0,
      dispatched: jobs.DISPATCHED || 0,
      inProgress: jobs.IN_PROGRESS || 0,
      completed: jobs.COMPLETED || 0,
      partial: jobs.PARTIAL || 0,
      failed: jobs.FAILED || 0,
      cancelled: jobs.CANCELLED || 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Per-platform publishing statistics.
 *
 * "Latest state per post per platform" - a post that failed and was then
 * retried successfully counts once, as a success.
 */
async function getPublishingStats({ days = null } = {}) {
  const rows = await db.queryAll(
    `WITH latest AS (
       SELECT DISTINCT ON (s.news_id, s.platform_id)
              s.news_id, s.platform_id, s.status, s.updated_at, s.published_at
         FROM social_publish_status s
        WHERE ($1::int IS NULL OR s.created_at >= now() - make_interval(days => $1))
        ORDER BY s.news_id, s.platform_id, s.publish_job_id DESC, s.id DESC
     )
     SELECT p.id, p.code, p.name, p.sort_order, p.is_active,
            COUNT(l.*) FILTER (WHERE l.status = 'PUBLISHED')::int AS success,
            COUNT(l.*) FILTER (WHERE l.status = 'FAILED')::int    AS failed,
            COUNT(l.*) FILTER (WHERE l.status = ANY($2::text[]))::int AS pending,
            COUNT(l.*) FILTER (WHERE l.status = 'CANCELLED')::int AS cancelled,
            COUNT(l.*)::int                                       AS total,
            MAX(l.published_at)                                   AS last_published_at
       FROM social_platforms p
       LEFT JOIN latest l ON l.platform_id = p.id
      GROUP BY p.id, p.code, p.name, p.sort_order, p.is_active
      ORDER BY p.sort_order ASC, p.name ASC`,
    [days, IN_FLIGHT]
  );

  const totals = rows.reduce(
    (acc, row) => ({
      success: acc.success + row.success,
      failed: acc.failed + row.failed,
      pending: acc.pending + row.pending,
      cancelled: acc.cancelled + row.cancelled,
      total: acc.total + row.total,
    }),
    { success: 0, failed: 0, pending: 0, cancelled: 0, total: 0 }
  );

  return { platforms: rows, totals, generatedAt: new Date().toISOString() };
}

/** Recent jobs + the failures that still need attention. */
async function getActivity({ limit = 8 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 8, 1), 50);

  const [recentJobs, failures, recentPosts] = await Promise.all([
    db.queryAll(
      `SELECT j.id, j.news_id, j.status, j.job_type, j.attempt_count, j.created_at,
              j.completed_at, n.headline, u.full_name AS triggered_by_name
         FROM publish_jobs j
         JOIN news n ON n.id = j.news_id
         LEFT JOIN client_users u ON u.user_id = j.triggered_by
        ORDER BY j.created_at DESC, j.id DESC
        LIMIT $1`,
      [capped]
    ),
    db.queryAll(
      `SELECT DISTINCT ON (s.news_id, s.platform_id)
              s.id, s.news_id, s.publish_job_id, s.status, s.error_type,
              s.error_message, s.retry_allowed, s.attempt_count, s.updated_at,
              p.code AS platform_code, p.name AS platform_name,
              n.headline
         FROM social_publish_status s
         JOIN social_platforms p ON p.id = s.platform_id
         JOIN news n ON n.id = s.news_id
        WHERE s.status = 'FAILED'
        ORDER BY s.news_id, s.platform_id, s.publish_job_id DESC, s.id DESC`
    ),
    db.queryAll(
      `SELECT n.id, n.headline, n.status, n.category, n.created_at,
              u.full_name AS created_by_name
         FROM news n
         LEFT JOIN client_users u ON u.user_id = n.created_by
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT $1`,
      [capped]
    ),
  ]);

  // Only surface failures that are still the current state for that platform.
  const openFailures = failures
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, capped);

  return { recentJobs, openFailures, recentPosts, generatedAt: new Date().toISOString() };
}

module.exports = { getSummary, getPublishingStats, getActivity, readSummaryView };
