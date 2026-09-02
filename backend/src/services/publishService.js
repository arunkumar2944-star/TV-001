'use strict';

/**
 * Publishing.
 *
 * The database is the source of truth. Publishing always follows the same path:
 *
 *   React -> Express -> publish_jobs (+ social_publish_status) -> n8n
 *
 * The frontend never talks to a social network, and this service never pretends
 * a platform succeeded: a platform is PUBLISHED only when n8n says so.
 */

const db = require('../database');
const ApiError = require('../utils/ApiError');
const newsService = require('./newsService');
const platformService = require('./platformService');
const auditService = require('./auditService');
const stateMachine = require('./publishStateMachine');
const logger = require('../utils/logger');
const { checkMediaRequirements } = require('../config/publishRequirements');
const {
  NEWS_STATUS,
  JOB_STATUS,
  JOB_TYPE,
  PLATFORM_STATUS,
  AUDIT_STAGE,
  AUDIT_STATUS,
} = require('../config/constants');

const ACTIVE_JOB_STATUSES = [JOB_STATUS.QUEUED, JOB_STATUS.DISPATCHED, JOB_STATUS.IN_PROGRESS];

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Approved posts waiting for someone to press Publish. */
async function listReady({ page = 1, pageSize = 20, search = null }) {
  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const where = `
    WHERE n.status = $1
      AND ($2::text IS NULL OR n.headline ILIKE $2)
  `;
  const params = [NEWS_STATUS.APPROVED, search ? `%${String(search).trim()}%` : null];

  const [items, countRow] = await Promise.all([
    db.queryAll(
      `SELECT n.id, n.headline, n.summary, n.content, n.category, n.district,
              n.status, n.created_at, n.approved_at,
              n.created_by, cu.full_name AS created_by_name,
              n.approved_by, au.full_name AS approved_by_name,
              COALESCE(targets.platform_codes, ARRAY[]::text[]) AS platform_codes,
              COALESCE(media.media_count, 0) AS media_count
         FROM news n
         LEFT JOIN client_users cu ON cu.user_id = n.created_by
         LEFT JOIN client_users au ON au.user_id = n.approved_by
         LEFT JOIN LATERAL (
           SELECT array_agg(p.code ORDER BY p.sort_order) AS platform_codes
           FROM news_platform_targets npt
           JOIN social_platforms p ON p.id = npt.platform_id
           WHERE npt.news_id = n.id
         ) targets ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS media_count FROM news_media WHERE news_id = n.id
         ) media ON TRUE
         ${where}
         ORDER BY n.approved_at ASC NULLS LAST, n.id ASC
         LIMIT $3 OFFSET $4`,
      [...params, limit, offset]
    ),
    db.queryOne(`SELECT COUNT(*)::int AS total FROM news n ${where}`, params),
  ]);

  return { items, pagination: { page: Math.max(Number(page) || 1, 1), pageSize: limit, total: countRow ? countRow.total : 0 } };
}

/** Publishing history - every job, newest first, with its platform outcomes. */
async function listJobs({ page = 1, pageSize = 20, status = null, newsId = null }) {
  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const where = `
    WHERE ($1::text IS NULL OR j.status = $1)
      AND ($2::bigint IS NULL OR j.news_id = $2)
  `;
  const params = [status, newsId];

  const [jobs, countRow] = await Promise.all([
    db.queryAll(
      `SELECT j.id, j.news_id, j.job_type, j.status, j.attempt_count, j.parent_job_id,
              j.n8n_execution_id, j.workflow_name, j.error_message,
              j.dispatched_at, j.completed_at, j.created_at, j.updated_at,
              j.triggered_by, tu.full_name AS triggered_by_name,
              n.headline, n.status AS news_status, n.category,
              n.created_by, cu.full_name AS created_by_name,
              n.approved_by, au.full_name AS approved_by_name
         FROM publish_jobs j
         JOIN news n  ON n.id = j.news_id
         LEFT JOIN client_users tu ON tu.user_id = j.triggered_by
         LEFT JOIN client_users cu ON cu.user_id = n.created_by
         LEFT JOIN client_users au ON au.user_id = n.approved_by
         ${where}
         ORDER BY j.created_at DESC, j.id DESC
         LIMIT $3 OFFSET $4`,
      [...params, limit, offset]
    ),
    db.queryOne(`SELECT COUNT(*)::int AS total FROM publish_jobs j ${where}`, params),
  ]);

  const jobIds = jobs.map((job) => job.id);
  const statusRows = jobIds.length
    ? await db.queryAll(
        `SELECT s.*, p.code AS platform_code, p.name AS platform_name, p.sort_order
           FROM social_publish_status s
           JOIN social_platforms p ON p.id = s.platform_id
          WHERE s.publish_job_id = ANY($1::bigint[])
          ORDER BY p.sort_order ASC`,
        [jobIds]
      )
    : [];

  const grouped = new Map();
  for (const row of statusRows) {
    if (!grouped.has(row.publish_job_id)) grouped.set(row.publish_job_id, []);
    grouped.get(row.publish_job_id).push(row);
  }

  return {
    items: jobs.map((job) => ({ ...job, platforms: grouped.get(job.id) || [] })),
    pagination: { page: Math.max(Number(page) || 1, 1), pageSize: limit, total: countRow ? countRow.total : 0 },
  };
}

async function getJob(jobId) {
  const job = await db.queryOne(
    `SELECT j.*, n.headline, n.status AS news_status, n.content, n.summary,
            n.category, n.district, n.state, n.country, n.source,
            tu.full_name AS triggered_by_name,
            cu.full_name AS created_by_name,
            au.full_name AS approved_by_name
       FROM publish_jobs j
       JOIN news n ON n.id = j.news_id
       LEFT JOIN client_users tu ON tu.user_id = j.triggered_by
       LEFT JOIN client_users cu ON cu.user_id = n.created_by
       LEFT JOIN client_users au ON au.user_id = n.approved_by
      WHERE j.id = $1`,
    [jobId]
  );
  if (!job) throw ApiError.notFound('Publish job not found');

  const platforms = await db.queryAll(
    `SELECT s.*, p.code AS platform_code, p.name AS platform_name, p.sort_order
       FROM social_publish_status s
       JOIN social_platforms p ON p.id = s.platform_id
      WHERE s.publish_job_id = $1
      ORDER BY p.sort_order ASC`,
    [jobId]
  );

  const audit = await auditService.list({ publishJobId: jobId, pageSize: 100 });

  return { ...job, platforms, audit: audit.items };
}

async function getJobStatusRows(jobId, client) {
  return db.queryAll(
    `SELECT s.*, p.code AS platform_code
       FROM social_publish_status s
       JOIN social_platforms p ON p.id = s.platform_id
      WHERE s.publish_job_id = $1
      ORDER BY s.id ASC`,
    [jobId],
    client
  );
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Everything that must be true before a post may be handed to n8n. */
async function assertPublishable(news, client) {
  if (news.status !== NEWS_STATUS.APPROVED) {
    throw ApiError.conflict(
      news.status === NEWS_STATUS.PENDING_APPROVAL
        ? 'This post is still waiting for approval'
        : `Only APPROVED posts can be published (this one is ${news.status})`
    );
  }

  const targets = await platformService.getTargets(news.id, client);
  if (targets.length === 0) {
    throw ApiError.badRequest('This post has no social media platforms selected');
  }

  if (!news.content || news.content.trim().length === 0) {
    throw ApiError.badRequest('This post has no content to publish');
  }

  const media = await newsService.getMedia(news.id, client);
  const problems = checkMediaRequirements(targets, media);
  if (problems.length > 0) {
    throw ApiError.badRequest(problems[0], {
      code: 'MEDIA_REQUIRED',
      details: problems.map((message) => ({ field: 'media', message })),
    });
  }

  return { targets, media };
}

/**
 * Creates the publish job and one social_publish_status row per selected
 * platform, then moves the post to PUBLISHING - all in one transaction.
 * Dispatch to n8n happens after the commit (see publishController).
 */
async function createJob(newsId, actor) {
  return db.withTransaction(async (client) => {
    const news = await newsService.lockById(newsId, client);
    if (!news) throw ApiError.notFound('News post not found');

    const active = await db.queryOne(
      `SELECT id, status FROM publish_jobs
        WHERE news_id = $1 AND status = ANY($2::text[])
        ORDER BY id DESC LIMIT 1`,
      [newsId, ACTIVE_JOB_STATUSES],
      client
    );
    if (active) {
      throw ApiError.conflict(`Publishing is already in progress for this post (job #${active.id})`);
    }

    const { targets } = await assertPublishable(news, client);

    const job = await db.queryOne(
      `INSERT INTO publish_jobs (news_id, triggered_by, job_type, status, attempt_count)
       VALUES ($1, $2, $3, $4, 1)
       RETURNING *`,
      [newsId, actor.id, JOB_TYPE.PUBLISH, JOB_STATUS.QUEUED],
      client
    );

    await db.query(
      `INSERT INTO social_publish_status (news_id, publish_job_id, platform_id, status, attempt_count)
       SELECT $1, $2, unnest($3::bigint[]), $4, 0
       ON CONFLICT (publish_job_id, platform_id) DO NOTHING`,
      [newsId, job.id, targets.map((target) => target.platform_id), PLATFORM_STATUS.PENDING],
      client
    );

    const updatedNews = await newsService.setStatus(newsId, NEWS_STATUS.PUBLISHING, client);

    await auditService.record(
      {
        newsId,
        publishJobId: job.id,
        actorUserId: actor.id,
        stage: AUDIT_STAGE.PUBLISH_TRIGGER,
        status: AUDIT_STATUS.INFO,
        attemptCount: 1,
        message: `Publish job #${job.id} queued by ${actor.full_name}`,
        metadata: { platforms: targets.map((target) => target.code) },
      },
      client
    );

    return { job, news: updatedNews, targets };
  });
}

/**
 * Creates a RETRY job for the platforms that failed.
 * Successful platforms are never included, so they are never republished.
 */
async function createRetryJob(jobId, actor, requestedPlatformCodes = null) {
  return db.withTransaction(async (client) => {
    const parent = await db.queryOne('SELECT * FROM publish_jobs WHERE id = $1 FOR UPDATE', [jobId], client);
    if (!parent) throw ApiError.notFound('Publish job not found');

    const news = await newsService.lockById(parent.news_id, client);
    if (!news) throw ApiError.notFound('News post not found');

    const active = await db.queryOne(
      `SELECT id FROM publish_jobs
        WHERE news_id = $1 AND status = ANY($2::text[])
        ORDER BY id DESC LIMIT 1`,
      [parent.news_id, ACTIVE_JOB_STATUSES],
      client
    );
    if (active) {
      throw ApiError.conflict(`Publishing is already in progress for this post (job #${active.id})`);
    }

    const rows = await getJobStatusRows(jobId, client);
    let retryable = stateMachine.selectRetryablePlatforms(rows);

    if (requestedPlatformCodes && requestedPlatformCodes.length > 0) {
      const wanted = new Set(requestedPlatformCodes.map((code) => String(code).toLowerCase()));
      const unknown = requestedPlatformCodes.filter(
        (code) => !rows.some((row) => row.platform_code.toLowerCase() === String(code).toLowerCase())
      );
      if (unknown.length > 0) {
        throw ApiError.badRequest(`Platform not part of job #${jobId}: ${unknown.join(', ')}`);
      }
      const alreadyPublished = rows.filter(
        (row) => wanted.has(row.platform_code.toLowerCase()) && row.status === PLATFORM_STATUS.PUBLISHED
      );
      if (alreadyPublished.length > 0) {
        throw ApiError.conflict(
          `Already published successfully, retry refused: ${alreadyPublished
            .map((row) => row.platform_code)
            .join(', ')}`
        );
      }
      retryable = retryable.filter((row) => wanted.has(row.platform_code.toLowerCase()));
    }

    if (retryable.length === 0) {
      throw ApiError.conflict('There is nothing to retry on this job');
    }

    const retryJob = await db.queryOne(
      `INSERT INTO publish_jobs (news_id, triggered_by, job_type, status, attempt_count, parent_job_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        parent.news_id,
        actor.id,
        JOB_TYPE.RETRY,
        JOB_STATUS.QUEUED,
        (parent.attempt_count || 1) + 1,
        parent.id,
      ],
      client
    );

    for (const row of retryable) {

      await db.query(
        `INSERT INTO social_publish_status
           (news_id, publish_job_id, platform_id, status, attempt_count, retry_allowed)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (publish_job_id, platform_id) DO NOTHING`,
        [parent.news_id, retryJob.id, row.platform_id, PLATFORM_STATUS.PENDING, row.attempt_count || 0],
        client
      );
    }

    // FAILED / PARTIALLY_PUBLISHED -> PUBLISHING for the duration of the retry.
    const updatedNews = news.status === NEWS_STATUS.PUBLISHING
      ? news
      : await newsService.setStatus(parent.news_id, NEWS_STATUS.PUBLISHING, client);

    await auditService.record(
      {
        newsId: parent.news_id,
        publishJobId: retryJob.id,
        actorUserId: actor.id,
        stage: AUDIT_STAGE.PUBLISH_RETRY,
        status: AUDIT_STATUS.INFO,
        attemptCount: retryJob.attempt_count,
        message: `Retry job #${retryJob.id} queued by ${actor.full_name} for ${retryable
          .map((row) => row.platform_code)
          .join(', ')}`,
        metadata: { parentJobId: parent.id, platforms: retryable.map((row) => row.platform_code) },
      },
      client
    );

    return {
      job: retryJob,
      news: updatedNews,
      targets: retryable.map((row) => ({ platform_id: row.platform_id, code: row.platform_code })),
    };
  });
}

/** Marks a job as handed to n8n. */
async function markDispatched(jobId, { executionId = null, workflowName = null } = {}) {
  return db.queryOne(
    `UPDATE publish_jobs
        SET status = $2, dispatched_at = now(), updated_at = now(),
            n8n_execution_id = COALESCE($3, n8n_execution_id),
            workflow_name    = COALESCE($4, workflow_name),
            error_message    = NULL
      WHERE id = $1
      RETURNING *`,
    [jobId, JOB_STATUS.DISPATCHED, executionId, workflowName]
  );
}

/**
 * n8n could not be reached and we know the request never arrived.
 * Everything is marked FAILED with retry allowed so the newsroom can try again
 * once the automation layer is back - nothing is silently lost.
 */
async function markDispatchFailed(jobId, errorMessage, { ambiguous = false } = {}) {
  return db.withTransaction(async (client) => {
    const job = await db.queryOne('SELECT * FROM publish_jobs WHERE id = $1 FOR UPDATE', [jobId], client);
    if (!job) return null;

    if (ambiguous) {
      // The request may still have reached n8n (timeout). Leave the job open so
      // a late callback can complete it instead of risking a double publish.
      const updated = await db.queryOne(
        `UPDATE publish_jobs
            SET status = $2, dispatched_at = COALESCE(dispatched_at, now()),
                error_message = $3, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [jobId, JOB_STATUS.DISPATCHED, errorMessage],
        client
      );
      await auditService.record(
        {
          newsId: job.news_id,
          publishJobId: jobId,
          stage: AUDIT_STAGE.PUBLISH_DISPATCH_FAILED,
          status: AUDIT_STATUS.WARNING,
          message: `n8n did not answer in time: ${errorMessage}. Waiting for a callback.`,
          errorType: 'TIMEOUT',
          retryAllowed: true,
        },
        client
      );
      return updated;
    }

    await db.query(
      `UPDATE social_publish_status
          SET status = $2, error_type = 'DISPATCH_ERROR', error_message = $3,
              retry_allowed = TRUE, updated_at = now()
        WHERE publish_job_id = $1 AND status = ANY($4::text[])`,
      [jobId, PLATFORM_STATUS.FAILED, errorMessage, stateMachine.IN_FLIGHT],
      client
    );

    const updated = await db.queryOne(
      `UPDATE publish_jobs
          SET status = $2, error_message = $3, completed_at = now(), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [jobId, JOB_STATUS.FAILED, errorMessage],
      client
    );

    await refreshNewsStatus(job.news_id, client);

    await auditService.record(
      {
        newsId: job.news_id,
        publishJobId: jobId,
        stage: AUDIT_STAGE.PUBLISH_DISPATCH_FAILED,
        status: AUDIT_STATUS.FAILED,
        message: `n8n could not be reached: ${errorMessage}`,
        errorType: 'DISPATCH_ERROR',
        retryAllowed: true,
      },
      client
    );

    return updated;
  });
}

/** Recomputes news.status from the latest status of every targeted platform. */
async function refreshNewsStatus(newsId, client) {
  const rows = await db.queryAll(
    `SELECT DISTINCT ON (platform_id) platform_id, status
       FROM social_publish_status
      WHERE news_id = $1
      ORDER BY platform_id, publish_job_id DESC, id DESC`,
    [newsId],
    client
  );

  const nextStatus = stateMachine.deriveNewsStatus(rows.map((row) => row.status));
  if (!nextStatus) return null;

  const current = await db.queryOne('SELECT id, status FROM news WHERE id = $1 FOR UPDATE', [newsId], client);
  if (!current) return null;
  if (current.status === nextStatus) return current;

  if (!stateMachine.canTransition(current.status, nextStatus)) {
    logger.warn('Skipped news status update - transition not allowed', {
      newsId,
      from: current.status,
      to: nextStatus,
    });
    return current;
  }

  return db.queryOne(
    `UPDATE news
        SET status = $2,
            published_at = CASE WHEN $2 IN ('PUBLISHED', 'PARTIALLY_PUBLISHED')
                                THEN COALESCE(published_at, now()) ELSE published_at END,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [newsId, nextStatus],
    client
  );
}

/**
 * Applies one platform result coming back from n8n.
 *
 * Idempotent by (publish_job_id, platform_id):
 *   - a repeated PUBLISHED callback does not create a second success
 *   - a success is never downgraded by a late failure callback
 */
async function recordPlatformResult(result) {
  return db.withTransaction(async (client) => {
    const job = await db.queryOne('SELECT * FROM publish_jobs WHERE id = $1 FOR UPDATE', [result.jobId], client);
    if (!job) throw ApiError.notFound(`Publish job #${result.jobId} does not exist`);

    if (result.newsId && Number(result.newsId) !== Number(job.news_id)) {
      throw ApiError.badRequest('newsId does not belong to this publish job');
    }

    const platform = await db.queryOne(
      'SELECT id, code, name FROM social_platforms WHERE lower(code) = lower($1)',
      [result.platform],
      client
    );
    if (!platform) throw ApiError.badRequest(`Unknown platform "${result.platform}"`);

    const existing = await db.queryOne(
      'SELECT * FROM social_publish_status WHERE publish_job_id = $1 AND platform_id = $2 FOR UPDATE',
      [job.id, platform.id],
      client
    );
    if (!existing) {
      throw ApiError.badRequest(`Platform ${platform.code} is not part of job #${job.id}`);
    }

    const incoming = String(result.status || '').toUpperCase();

    // ---- idempotency ----------------------------------------------------
    const alreadyFinal = existing.status === PLATFORM_STATUS.PUBLISHED;
    if (alreadyFinal) {
      await auditService.record(
        {
          newsId: job.news_id,
          publishJobId: job.id,
          platformId: platform.id,
          stage: AUDIT_STAGE.PUBLISH_CALLBACK_DUPLICATE,
          status: AUDIT_STATUS.WARNING,
          n8nExecutionId: result.executionId || null,
          workflowName: result.workflowName || null,
          message: `Duplicate callback for ${platform.code} ignored (already PUBLISHED)`,
          metadata: { incomingStatus: incoming },
        },
        client
      );
      const rows = await getJobStatusRows(job.id, client);
      return {
        duplicate: true,
        platform: platform.code,
        status: existing.status,
        jobStatus: job.status,
        rows,
      };
    }
    // ---------------------------------------------------------------------

    const isSuccess = incoming === PLATFORM_STATUS.PUBLISHED;
    const publishedAt = isSuccess ? new Date() : null;

    const updated = await db.queryOne(
      `UPDATE social_publish_status
          SET status           = $3,
              attempt_count    = attempt_count + 1,
              external_post_id = COALESCE($4, external_post_id),
              published_url    = COALESCE($5, published_url),
              error_type       = $6,
              error_message    = $7,
              retry_allowed    = $8,
              published_at     = COALESCE($9, published_at),
              updated_at       = now()
        WHERE publish_job_id = $1 AND platform_id = $2
        RETURNING *`,
      [
        job.id,
        platform.id,
        incoming,
        result.externalPostId || null,
        result.publishedUrl || null,
        isSuccess ? null : result.errorType || 'UNKNOWN_ERROR',
        isSuccess ? null : (result.message || '').slice(0, 2000) || null,
        isSuccess ? false : result.retryAllowed !== false,
        publishedAt,
      ],
      client
    );

    await auditService.record(
      {
        newsId: job.news_id,
        publishJobId: job.id,
        platformId: platform.id,
        stage: isSuccess ? AUDIT_STAGE.PUBLISH_SUCCESS : AUDIT_STAGE.PUBLISH_FAILED,
        status: isSuccess ? AUDIT_STATUS.SUCCESS : AUDIT_STATUS.FAILED,
        attemptCount: updated.attempt_count,
        n8nExecutionId: result.executionId || null,
        workflowName: result.workflowName || null,
        message: isSuccess
          ? `${platform.name} published${result.publishedUrl ? `: ${result.publishedUrl}` : ''}`
          : `${platform.name} failed: ${result.message || result.errorType || 'no detail supplied'}`,
        errorType: isSuccess ? null : result.errorType || 'UNKNOWN_ERROR',
        retryAllowed: isSuccess ? null : result.retryAllowed !== false,
        metadata: { externalPostId: result.externalPostId || null },
      },
      client
    );

    // Roll the job and the post forward.
    const rows = await getJobStatusRows(job.id, client);
    const statuses = rows.map((row) => row.status);
    const jobStatus = stateMachine.deriveJobStatus(statuses);
    const finished = stateMachine.isJobFinished(statuses);

    const updatedJob = await db.queryOne(
      `UPDATE publish_jobs
          SET status = $2,
              n8n_execution_id = COALESCE($3, n8n_execution_id),
              workflow_name    = COALESCE($4, workflow_name),
              completed_at     = CASE WHEN $5 THEN COALESCE(completed_at, now()) ELSE completed_at END,
              updated_at       = now()
        WHERE id = $1
        RETURNING *`,
      [job.id, jobStatus, result.executionId || null, result.workflowName || null, finished],
      client
    );

    const updatedNews = await refreshNewsStatus(job.news_id, client);

    if (finished) {
      await auditService.record(
        {
          newsId: job.news_id,
          publishJobId: job.id,
          stage: AUDIT_STAGE.JOB_COMPLETED,
          status: jobStatus === JOB_STATUS.COMPLETED ? AUDIT_STATUS.SUCCESS : AUDIT_STATUS.WARNING,
          n8nExecutionId: result.executionId || null,
          workflowName: result.workflowName || null,
          message: `Job #${job.id} finished with status ${jobStatus}`,
          metadata: { newsStatus: updatedNews ? updatedNews.status : null },
        },
        client
      );
    }

    return {
      duplicate: false,
      platform: platform.code,
      status: updated.status,
      jobStatus: updatedJob.status,
      newsStatus: updatedNews ? updatedNews.status : null,
      rows,
    };
  });
}

/** Optional progress ping from n8n (platform started publishing). */
async function markPlatformPublishing(jobId, platformCode, { executionId, workflowName } = {}) {
  return db.withTransaction(async (client) => {
    const job = await db.queryOne('SELECT * FROM publish_jobs WHERE id = $1 FOR UPDATE', [jobId], client);
    if (!job) throw ApiError.notFound(`Publish job #${jobId} does not exist`);

    const platform = await db.queryOne(
      'SELECT id, code FROM social_platforms WHERE lower(code) = lower($1)',
      [platformCode],
      client
    );
    if (!platform) throw ApiError.badRequest(`Unknown platform "${platformCode}"`);

    const updated = await db.queryOne(
      `UPDATE social_publish_status
          SET status = $3, updated_at = now()
        WHERE publish_job_id = $1 AND platform_id = $2
          AND status = ANY($4::text[])
        RETURNING *`,
      [jobId, platform.id, PLATFORM_STATUS.PUBLISHING, [PLATFORM_STATUS.PENDING, PLATFORM_STATUS.READY]],
      client
    );

    await db.query(
      `UPDATE publish_jobs
          SET status = $2,
              n8n_execution_id = COALESCE($3, n8n_execution_id),
              workflow_name    = COALESCE($4, workflow_name),
              updated_at = now()
        WHERE id = $1 AND status = ANY($5::text[])`,
      [jobId, JOB_STATUS.IN_PROGRESS, executionId || null, workflowName || null, [JOB_STATUS.QUEUED, JOB_STATUS.DISPATCHED]],
      client
    );

    return updated;
  });
}

/** Payload n8n receives when it asks for the content of a job. */
async function getJobPayloadForAutomation(jobId) {
  const job = await db.queryOne('SELECT * FROM publish_jobs WHERE id = $1', [jobId]);
  if (!job) throw ApiError.notFound('Publish job not found');

  const news = await newsService.findById(job.news_id);
  const media = await newsService.getMedia(job.news_id);
  const platforms = await db.queryAll(
    `SELECT s.status, s.attempt_count, p.code, p.name, t.platform_content
       FROM social_publish_status s
       JOIN social_platforms p ON p.id = s.platform_id
       LEFT JOIN news_platform_targets t ON t.news_id = s.news_id AND t.platform_id = s.platform_id
      WHERE s.publish_job_id = $1
      ORDER BY p.sort_order ASC`,
    [jobId]
  );

  return { job, news, media, platforms };
}

module.exports = {
  listReady,
  listJobs,
  getJob,
  getJobStatusRows,
  createJob,
  createRetryJob,
  markDispatched,
  markDispatchFailed,
  markPlatformPublishing,
  recordPlatformResult,
  refreshNewsStatus,
  getJobPayloadForAutomation,
  assertPublishable,
  ACTIVE_JOB_STATUSES,
};
