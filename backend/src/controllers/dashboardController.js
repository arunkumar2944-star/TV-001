'use strict';

const dashboardService = require('../services/dashboardService');
const auditService = require('../services/auditService');
const { ok, paginated } = require('../utils/respond');

async function summary(req, res) {
  const data = await dashboardService.getSummary();
  return ok(res, data);
}

async function publishing(req, res) {
  const days = req.validatedQuery ? req.validatedQuery.days : undefined;
  const data = await dashboardService.getPublishingStats({ days: days || null });
  return ok(res, data);
}

async function activity(req, res) {
  const data = await dashboardService.getActivity({ limit: 8 });
  return ok(res, data);
}

/** Audit log - available to ADMIN and EDITOR (business rule 24). */
async function audit(req, res) {
  const { page, pageSize, newsId, publishJobId, stage, status } = req.validatedQuery;
  const result = await auditService.list({
    page,
    pageSize,
    newsId: newsId || null,
    publishJobId: publishJobId || null,
    stage: stage || null,
    status: status || null,
  });
  return paginated(res, result.items, result.pagination);
}

module.exports = { summary, publishing, activity, audit };
