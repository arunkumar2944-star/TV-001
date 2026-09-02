'use strict';

const approvalService = require('../services/approvalService');
const newsService = require('../services/newsService');
const { ok, paginated } = require('../utils/respond');

async function listApprovals(req, res) {
  const { page, pageSize, includeOwn, search } = req.validatedQuery;
  const result = await approvalService.listPending({
    page,
    pageSize,
    viewerId: req.user.id,
    includeOwn: includeOwn === undefined ? true : includeOwn === 'true',
    search,
  });
  return paginated(res, result.items, result.pagination, { viewerId: req.user.id });
}

async function submitForApproval(req, res) {
  const { news } = await approvalService.submitForApproval(req.validatedParams.id, req.user);
  const detail = await newsService.getDetail(news.id);
  return ok(res, detail);
}

async function approve(req, res) {
  const { news } = await approvalService.approve(
    req.validatedParams.id,
    req.user,
    req.body ? req.body.note : null
  );
  const detail = await newsService.getDetail(news.id);
  return ok(res, detail);
}

async function reject(req, res) {
  const { news } = await approvalService.reject(req.validatedParams.id, req.user, req.body.reason);
  const detail = await newsService.getDetail(news.id);
  return ok(res, detail);
}

async function history(req, res) {
  const items = await approvalService.history(req.validatedParams.id);
  return ok(res, items);
}

module.exports = { listApprovals, submitForApproval, approve, reject, history };
