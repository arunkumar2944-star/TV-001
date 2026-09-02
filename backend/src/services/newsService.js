'use strict';

/**
 * News posts.
 *
 * Creating or editing a post touches two tables (news + news_platform_targets),
 * so those operations run inside a transaction and either both land or neither
 * does.
 */

const db = require('../database');
const ApiError = require('../utils/ApiError');
const platformService = require('./platformService');
const { canTransition } = require('./publishStateMachine');
const auditService = require('./auditService');
const storage = require('./storage');
const logger = require('../utils/logger');
const {
  NEWS_STATUS,
  EDITABLE_STATUSES,
  ROLES,
  AUDIT_STAGE,
  AUDIT_STATUS,
  DEFAULT_STATE,
  DEFAULT_COUNTRY,
} = require('../config/constants');

const LIST_SELECT = `
  SELECT
    n.id, n.headline, n.summary, n.category, n.district, n.state, n.country,
    n.source, n.status, n.created_at, n.updated_at, n.approved_at, n.published_at,
    n.created_by, cu.full_name AS created_by_name,
    n.approved_by, au.full_name AS approved_by_name,
    COALESCE(media.media_count, 0)                   AS media_count,
    COALESCE(targets.platform_codes, ARRAY[]::text[]) AS platform_codes
  FROM news n
  LEFT JOIN client_users cu ON cu.user_id = n.created_by
  LEFT JOIN client_users au ON au.user_id = n.approved_by
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS media_count FROM news_media WHERE news_id = n.id
  ) media ON TRUE
  LEFT JOIN LATERAL (
    SELECT array_agg(p.code ORDER BY p.sort_order) AS platform_codes
    FROM news_platform_targets npt
    JOIN social_platforms p ON p.id = npt.platform_id
    WHERE npt.news_id = n.id
  ) targets ON TRUE
`;

const LIST_WHERE = `
  WHERE ($1::text[]  IS NULL OR n.status = ANY($1))
    AND ($2::text    IS NULL OR n.category = $2)
    AND ($3::text    IS NULL OR n.district = $3)
    AND ($4::bigint  IS NULL OR n.created_by = $4)
    AND ($5::text    IS NULL OR n.headline ILIKE $5 OR n.summary ILIKE $5 OR n.content ILIKE $5)
    AND ($6::timestamptz IS NULL OR n.created_at >= $6)
    AND ($7::timestamptz IS NULL OR n.created_at < ($7::timestamptz + INTERVAL '1 day'))
`;

const SORTABLE = {
  created_at: 'n.created_at',
  updated_at: 'n.updated_at',
  headline: 'n.headline',
  status: 'n.status',
  id: 'n.id',
};

function buildFilters({ status, category, district, createdBy, search, dateFrom, dateTo }) {
  const statuses = status
    ? (Array.isArray(status) ? status : [status]).map((value) => String(value).toUpperCase())
    : null;
  return [
    statuses && statuses.length > 0 ? statuses : null,
    category || null,
    district || null,
    createdBy || null,
    search ? `%${String(search).trim()}%` : null,
    dateFrom || null,
    dateTo || null,
  ];
}

async function list(options = {}) {
  const page = Math.max(Number(options.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(options.pageSize) || 20, 1), 100);
  const offset = (page - 1) * pageSize;

  const sortColumn = SORTABLE[options.sortBy] || SORTABLE.created_at;
  const sortDirection = String(options.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const filters = buildFilters(options);

  const [items, countRow] = await Promise.all([
    db.queryAll(
      `${LIST_SELECT} ${LIST_WHERE} ORDER BY ${sortColumn} ${sortDirection}, n.id DESC LIMIT $8 OFFSET $9`,
      [...filters, pageSize, offset]
    ),
    db.queryOne(`SELECT COUNT(*)::int AS total FROM news n ${LIST_WHERE}`, filters),
  ]);

  return { items, pagination: { page, pageSize, total: countRow ? countRow.total : 0 } };
}

async function findById(id, client) {
  return db.queryOne(
    `SELECT n.*, cu.full_name AS created_by_name, cu.email AS created_by_email,
            au.full_name AS approved_by_name, uu.full_name AS updated_by_name
       FROM news n
       LEFT JOIN client_users cu ON cu.user_id = n.created_by
       LEFT JOIN client_users au ON au.user_id = n.approved_by
       LEFT JOIN client_users uu ON uu.user_id = n.updated_by
      WHERE n.id = $1`,
    [id],
    client
  );
}

/** Row lock used before any status change so two clicks cannot race. */
async function lockById(id, client) {
  return db.queryOne('SELECT * FROM news WHERE id = $1 FOR UPDATE', [id], client);
}

async function getMedia(newsId, client) {
  return db.queryAll(
    `SELECT id, news_id, media_type, original_filename, storage_key, storage_driver,
            mime_type, file_size, width, height, duration_seconds, sort_order,
            uploaded_by, created_at
       FROM news_media
      WHERE news_id = $1
      ORDER BY sort_order ASC, id ASC`,
    [newsId],
    client
  );
}

/** Latest publishing status per platform, newest job wins. */
async function getPlatformStatuses(newsId, client) {
  return db.queryAll(
    `SELECT DISTINCT ON (s.platform_id)
            s.id, s.platform_id, s.publish_job_id, s.status, s.attempt_count,
            s.external_post_id, s.published_url, s.error_type, s.error_message,
            s.retry_allowed, s.published_at, s.updated_at,
            p.code AS platform_code, p.name AS platform_name, p.sort_order
       FROM social_publish_status s
       JOIN social_platforms p ON p.id = s.platform_id
      WHERE s.news_id = $1
      ORDER BY s.platform_id, s.publish_job_id DESC, s.id DESC`,
    [newsId],
    client
  );
}

async function getApprovals(newsId, client) {
  return db.queryAll(
    `SELECT a.id, a.news_id, a.status, a.rejection_reason,
            a.submitted_by, sb.full_name AS submitted_by_name, a.submitted_at,
            a.reviewed_by, rb.full_name AS reviewed_by_name, a.reviewed_at,
            a.created_at, a.updated_at
       FROM news_approvals a
       LEFT JOIN client_users sb ON sb.user_id = a.submitted_by
       LEFT JOIN client_users rb ON rb.user_id = a.reviewed_by
      WHERE a.news_id = $1
      ORDER BY a.created_at DESC, a.id DESC`,
    [newsId],
    client
  );
}

async function getJobs(newsId, client) {
  return db.queryAll(
    `SELECT j.id, j.news_id, j.job_type, j.status, j.attempt_count, j.parent_job_id,
            j.n8n_execution_id, j.workflow_name, j.error_message,
            j.dispatched_at, j.completed_at, j.created_at, j.updated_at,
            j.triggered_by, tu.full_name AS triggered_by_name
       FROM publish_jobs j
       LEFT JOIN client_users tu ON tu.user_id = j.triggered_by
      WHERE j.news_id = $1
      ORDER BY j.created_at DESC, j.id DESC`,
    [newsId],
    client
  );
}

/** Full detail used by the post, approval and publish screens. */
async function getDetail(id) {
  const news = await findById(id);
  if (!news) throw ApiError.notFound('News post not found');

  const [media, targets, platformStatuses, approvals, jobs] = await Promise.all([
    getMedia(id),
    platformService.getTargets(id),
    getPlatformStatuses(id),
    getApprovals(id),
    getJobs(id),
  ]);

  return {
    ...news,
    media,
    platforms: targets.map((target) => ({
      platformId: target.platform_id,
      code: target.code,
      name: target.name,
      platformContent: target.platform_content || null,
    })),
    platformStatuses,
    approvals,
    currentApproval: approvals.find((approval) => approval.status === 'PENDING') || approvals[0] || null,
    publishJobs: jobs,
  };
}

async function create(payload, actor) {
  return db.withTransaction(async (client) => {
    const platforms = payload.platforms && payload.platforms.length > 0
      ? await platformService.resolveCodes(payload.platforms, client)
      : [];

    const news = await db.queryOne(
      `INSERT INTO news (headline, summary, content, source, category, district, state, country,
                         status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
       RETURNING *`,
      [
        payload.headline.trim(),
        payload.summary ? payload.summary.trim() : null,
        payload.content,
        payload.source ? payload.source.trim() : null,
        payload.category,
        payload.district || null,
        payload.state || DEFAULT_STATE,
        payload.country || DEFAULT_COUNTRY,
        NEWS_STATUS.DRAFT,
        actor.id,
      ],
      client
    );

    if (platforms.length > 0) {
      await platformService.replaceTargets(news.id, platforms.map((p) => p.id), client);
    }

    await auditService.record(
      {
        newsId: news.id,
        actorUserId: actor.id,
        stage: AUDIT_STAGE.CREATE_POST,
        status: AUDIT_STATUS.SUCCESS,
        message: `Post created: ${news.headline}`,
        metadata: { platforms: platforms.map((p) => p.code) },
      },
      client
    );

    return news;
  });
}

function assertEditable(news, actor) {
  if (!EDITABLE_STATUSES.includes(news.status)) {
    throw ApiError.conflict(
      `A post with status ${news.status} can no longer be edited. Archive it or create a new post.`
    );
  }
  // ADMIN and EDITOR share the newsroom workflow, so any staff member may fix a
  // post that is still in an editable state. Ownership only matters for
  // approval (creator may never approve their own post) and for deletion.
  if (!actor) throw ApiError.unauthorized('Authentication required');
}

async function update(id, payload, actor) {
  return db.withTransaction(async (client) => {
    const existing = await lockById(id, client);
    if (!existing) throw ApiError.notFound('News post not found');
    assertEditable(existing, actor);

    let platformIds = null;
    if (payload.platforms) {
      const platforms = await platformService.resolveCodes(payload.platforms, client);
      platformIds = platforms.map((platform) => platform.id);
    }

    const updated = await db.queryOne(
      `UPDATE news
          SET headline   = COALESCE($2, headline),
              summary    = COALESCE($3, summary),
              content    = COALESCE($4, content),
              source     = COALESCE($5, source),
              category   = COALESCE($6, category),
              district   = COALESCE($7, district),
              state      = COALESCE($8, state),
              country    = COALESCE($9, country),
              updated_by = $10,
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [
        id,
        payload.headline !== undefined ? payload.headline.trim() : null,
        payload.summary !== undefined ? (payload.summary ? payload.summary.trim() : '') : null,
        payload.content !== undefined ? payload.content : null,
        payload.source !== undefined ? (payload.source ? payload.source.trim() : '') : null,
        payload.category !== undefined ? payload.category : null,
        payload.district !== undefined ? payload.district : null,
        payload.state !== undefined ? payload.state : null,
        payload.country !== undefined ? payload.country : null,
        actor.id,
      ],
      client
    );

    if (platformIds) {
      await platformService.replaceTargets(id, platformIds, client);
    }

    await auditService.record(
      {
        newsId: id,
        actorUserId: actor.id,
        stage: AUDIT_STAGE.UPDATE_POST,
        status: AUDIT_STATUS.SUCCESS,
        message: `Post updated: ${updated.headline}`,
        metadata: { fields: Object.keys(payload) },
      },
      client
    );

    return updated;
  });
}

/**
 * Changes news.status inside an existing transaction.
 * Refuses transitions the workflow does not allow (section 11).
 */
async function setStatus(id, nextStatus, client, extra = {}) {
  const current = await db.queryOne('SELECT id, status FROM news WHERE id = $1 FOR UPDATE', [id], client);
  if (!current) throw ApiError.notFound('News post not found');

  if (!canTransition(current.status, nextStatus)) {
    throw ApiError.conflict(`Cannot move a post from ${current.status} to ${nextStatus}`);
  }

  return db.queryOne(
    `UPDATE news
        SET status       = $2,
            approved_by  = COALESCE($3, approved_by),
            approved_at  = COALESCE($4, approved_at),
            published_at = COALESCE($5, published_at),
            updated_at   = now()
      WHERE id = $1
      RETURNING *`,
    [id, nextStatus, extra.approvedBy ?? null, extra.approvedAt ?? null, extra.publishedAt ?? null],
    client
  );
}

/**
 * Deletes a post that never went live. Published history is preserved: an
 * APPROVED/PUBLISHING/PUBLISHED post must be ARCHIVED instead.
 */
async function remove(id, actor) {
  const news = await findById(id);
  if (!news) throw ApiError.notFound('News post not found');

  const deletable = [NEWS_STATUS.DRAFT, NEWS_STATUS.REJECTED];
  if (!deletable.includes(news.status)) {
    throw ApiError.conflict(
      `Only DRAFT or REJECTED posts can be deleted. Archive this ${news.status} post instead.`
    );
  }
  if (actor.role !== ROLES.PLATFORM_ADMIN && news.created_by !== actor.id) {
    throw ApiError.forbidden('Only the author or an administrator can delete this post');
  }

  const media = await getMedia(id);

  await db.withTransaction(async (client) => {
    await auditService.record(
      {
        newsId: id,
        actorUserId: actor.id,
        stage: AUDIT_STAGE.DELETE_POST,
        status: AUDIT_STATUS.SUCCESS,
        message: `Post deleted: ${news.headline}`,
        metadata: { status: news.status, mediaCount: media.length },
      },
      client
    );
    // news_execution_audit.news_id is ON DELETE SET NULL, so the audit row
    // survives the post it describes.
    await db.query('DELETE FROM news WHERE id = $1', [id], client);
  });

  // Remove the binaries only after the database change committed.
  for (const item of media) {
    try {
      await storage.remove(item.storage_key, item.storage_driver);
    } catch (error) {
      logger.error('Orphaned media file could not be deleted', {
        mediaId: item.id,
        key: item.storage_key,
        error: error.message,
      });
    }
  }

  return { id, deleted: true };
}

async function archive(id, actor) {
  return db.withTransaction(async (client) => {
    const updated = await setStatus(id, NEWS_STATUS.ARCHIVED, client);
    await auditService.record(
      {
        newsId: id,
        actorUserId: actor.id,
        stage: AUDIT_STAGE.UPDATE_POST,
        status: AUDIT_STATUS.INFO,
        message: 'Post archived',
      },
      client
    );
    return updated;
  });
}

module.exports = {
  list,
  findById,
  lockById,
  getDetail,
  getMedia,
  getPlatformStatuses,
  getApprovals,
  getJobs,
  create,
  update,
  setStatus,
  remove,
  archive,
  assertEditable,
};
