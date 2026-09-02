'use strict';

/**
 * Endpoints n8n talks to.
 *
 * Authentication is the shared N8N_WEBHOOK_SECRET (header or HMAC signature) -
 * see middleware/n8nAuth.js. An unauthenticated caller can never change a
 * publishing status.
 */

const publishService = require('../services/publishService');
const n8nService = require('../services/n8nService');
const storage = require('../services/storage');
const auditService = require('../services/auditService');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { ok } = require('../utils/respond');
const { config } = require('../config/env');
const { AUDIT_STAGE, AUDIT_STATUS } = require('../config/constants');

/** POST /api/n8n/publish-result - one platform outcome, or a batch. */
async function publishResult(req, res) {
  const body = req.body;
  const isBatch = Array.isArray(body.results);

  const entries = isBatch
    ? body.results.map((entry) => ({
        ...entry,
        jobId: entry.jobId || body.jobId,
        newsId: entry.newsId || body.newsId,
        executionId: entry.executionId || body.executionId,
        workflowName: entry.workflowName || body.workflowName,
      }))
    : [body];

  if (entries.some((entry) => !entry.jobId)) {
    throw ApiError.badRequest('jobId is required for every result');
  }

  const outcomes = [];
  for (const entry of entries) {

    const outcome = await publishService.recordPlatformResult(entry);
    outcomes.push(outcome);
  }

  const last = outcomes[outcomes.length - 1];

  return ok(res, {
    accepted: outcomes.length,
    duplicates: outcomes.filter((outcome) => outcome.duplicate).length,
    jobStatus: last ? last.jobStatus : null,
    newsStatus: last ? last.newsStatus : null,
    platforms: outcomes.map((outcome) => ({
      platform: outcome.platform,
      status: outcome.status,
      duplicate: outcome.duplicate,
    })),
  });
}

/** POST /api/n8n/job-progress - optional "started publishing" ping. */
async function jobProgress(req, res) {
  const { jobId, platform, executionId, workflowName } = req.body;
  const row = await publishService.markPlatformPublishing(jobId, platform, { executionId, workflowName });

  auditService.recordSafe({
    publishJobId: jobId,
    stage: AUDIT_STAGE.PUBLISH_CALLBACK,
    status: AUDIT_STATUS.INFO,
    n8nExecutionId: executionId || null,
    workflowName: workflowName || null,
    message: `n8n started publishing to ${platform}`,
  });

  return ok(res, { updated: Boolean(row), status: row ? row.status : null });
}

/**
 * GET /api/n8n/jobs/:jobId - the full content package for a job.
 * This is how n8n gets the post: the trigger payload itself stays small.
 */
async function getJobContent(req, res) {
  const { jobId } = req.validatedParams;
  const { job, news, media, platforms } = await publishService.getJobPayloadForAutomation(jobId);

  const base = n8nService.apiBaseUrl(req);

  const mediaItems = await Promise.all(
    media.map(async (item) => {
      let signedUrl = null;
      try {
        signedUrl = await storage.getDownloadUrl(item.storage_key, undefined, item.storage_driver);
      } catch (error) {
        logger.warn('Could not sign media URL', { mediaId: item.id, error: error.message });
      }
      return {
        id: item.id,
        mediaType: item.media_type,
        originalFilename: item.original_filename,
        mimeType: item.mime_type,
        fileSize: item.file_size,
        width: item.width,
        height: item.height,
        durationSeconds: item.duration_seconds,
        // Authenticated download for n8n (send the same secret header).
        downloadUrl: `${base}/api/n8n/media/${item.id}/file`,
        // Direct object-storage URL when the driver can sign one.
        signedUrl,
      };
    })
  );

  return ok(res, {
    job: {
      id: job.id,
      newsId: job.news_id,
      jobType: job.job_type,
      status: job.status,
      attempt: job.attempt_count,
      createdAt: job.created_at,
    },
    news: {
      id: news.id,
      headline: news.headline,
      summary: news.summary,
      content: news.content,
      source: news.source,
      category: news.category,
      district: news.district,
      state: news.state,
      country: news.country,
      status: news.status,
      createdAt: news.created_at,
      approvedAt: news.approved_at,
    },
    // Only the platforms this job is responsible for - never the ones that
    // already succeeded in an earlier attempt.
    platforms: platforms.map((platform) => ({
      code: platform.code,
      name: platform.name,
      status: platform.status,
      attempt: platform.attempt_count,
      platformContent: platform.platform_content || null,
    })),
    media: mediaItems,
    callbackUrl: `${base}/api/n8n/publish-result`,
  });
}

/** GET /api/n8n/health - lets the colleague verify credentials from n8n. */
async function health(req, res) {
  return ok(res, {
    status: 'ok',
    authenticatedAs: 'n8n',
    method: req.n8nAuthMethod,
    storageDriver: storage.currentDriverName(),
    webhookConfigured: Boolean(config.n8n.webhookUrl),
  });
}

module.exports = { publishResult, jobProgress, getJobContent, health };
