'use strict';

/**
 * Publish page + publish job lifecycle.
 *
 * Order of operations matters: the database row is committed FIRST, then n8n is
 * triggered. If the trigger fails we already have a durable record of what was
 * meant to happen, so nothing is lost and the operation can be retried.
 */

const publishService = require('../services/publishService');
const newsService = require('../services/newsService');
const n8nService = require('../services/n8nService');
const auditService = require('../services/auditService');
const logger = require('../utils/logger');
const { config } = require('../config/env');
const { ok, created, paginated } = require('../utils/respond');
const { AUDIT_STAGE, AUDIT_STATUS } = require('../config/constants');

/** Sends the trigger to n8n and records the outcome against the job. */
async function dispatchToN8n({ job, news, targets, actor, req }) {
  const payload = n8nService.buildPayload(
    { job, news, platforms: targets.map((target) => ({ code: target.code })) },
    req
  );

  const result = await n8nService.dispatch(payload);

  if (result.delivered) {
    await publishService.markDispatched(job.id, {
      executionId: result.executionId,
      workflowName: result.workflowName,
    });
    auditService.recordSafe({
      newsId: job.news_id,
      publishJobId: job.id,
      actorUserId: actor.id,
      stage: AUDIT_STAGE.PUBLISH_DISPATCH,
      status: AUDIT_STATUS.SUCCESS,
      n8nExecutionId: result.executionId || null,
      workflowName: result.workflowName || null,
      message: `Job #${job.id} handed to n8n`,
      metadata: { platforms: payload.platforms, httpStatus: result.status },
    });
    return { dispatched: true, ambiguous: false, message: 'Publishing started' };
  }

  await publishService.markDispatchFailed(job.id, result.error || 'n8n dispatch failed', {
    ambiguous: result.ambiguous,
  });

  logger.error('Publish dispatch problem', {
    jobId: job.id,
    ambiguous: result.ambiguous,
    error: result.error,
  });

  return {
    dispatched: false,
    ambiguous: Boolean(result.ambiguous),
    message: result.ambiguous
      ? 'n8n did not answer in time. The job is still open - do not press publish again until the status updates.'
      : `Publishing could not be started: ${result.error}. You can retry once n8n is reachable.`,
  };
}

async function listPublish(req, res) {
  const { view, page, pageSize, status, newsId, search } = req.validatedQuery;

  if (view === 'history') {
    const result = await publishService.listJobs({ page, pageSize, status, newsId });
    return paginated(res, result.items, result.pagination, { view: 'history' });
  }

  const result = await publishService.listReady({ page, pageSize, search });
  return paginated(res, result.items, result.pagination, { view: 'ready' });
}

async function getPublishJob(req, res) {
  const job = await publishService.getJob(req.validatedParams.jobId);
  return ok(res, job);
}

/** Publish view of one post: approval details, media, platforms, live status. */
async function getPublishDetail(req, res) {
  const detail = await newsService.getDetail(req.validatedParams.id);
  return ok(res, detail);
}

async function publish(req, res) {
  const { job, news, targets } = await publishService.createJob(req.validatedParams.id, req.user);

  const dispatch = await dispatchToN8n({ job, news, targets, actor: req.user, req });
  const detail = await publishService.getJob(job.id);

  return created(res, { job: detail, dispatch }, { message: dispatch.message });
}

async function retry(req, res) {
  const platforms = req.body && Array.isArray(req.body.platforms) ? req.body.platforms : null;
  const { job, news, targets } = await publishService.createRetryJob(
    req.validatedParams.jobId,
    req.user,
    platforms
  );

  const dispatch = await dispatchToN8n({ job, news, targets, actor: req.user, req });
  const detail = await publishService.getJob(job.id);

  return created(res, { job: detail, dispatch }, { message: dispatch.message });
}

/** Integration health for the Publish screen - never blocks publishing. */
async function integrationStatus(req, res) {
  return ok(res, {
    n8nConfigured: n8nService.isConfigured(),
    callbackSecretConfigured: Boolean(config.n8n.webhookSecret),
  });
}

module.exports = {
  listPublish,
  getPublishJob,
  getPublishDetail,
  publish,
  retry,
  integrationStatus,
  dispatchToN8n,
};
