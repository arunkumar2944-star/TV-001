'use strict';

const newsService = require('../services/newsService');
const platformService = require('../services/platformService');
const approvalService = require('../services/approvalService');
const { ok, created, paginated } = require('../utils/respond');
const {
  NEWS_CATEGORIES,
  DISTRICTS,
  NEWS_STATUS_VALUES,
  MEDIA_TYPE_VALUES,
  DEFAULT_STATE,
  DEFAULT_COUNTRY,
} = require('../config/constants');

async function listNews(req, res) {
  const query = { ...req.validatedQuery };
  if (query.mine === 'true') query.createdBy = req.user.id;
  delete query.mine;

  const result = await newsService.list(query);
  return paginated(res, result.items, result.pagination);
}

async function getNews(req, res) {
  const detail = await newsService.getDetail(req.validatedParams.id);
  return ok(res, {
    ...detail,
    canEdit: ['DRAFT', 'REJECTED', 'PENDING_APPROVAL'].includes(detail.status),
    // The creator can never approve their own post - shown here for the UI,
    // enforced again in approvalService.
    canApprove: detail.status === 'PENDING_APPROVAL' && Number(detail.created_by) !== Number(req.user.id),
  });
}

async function createNews(req, res) {
  const news = await newsService.create(req.body, req.user);
  const detail = await newsService.getDetail(news.id);
  return created(res, detail);
}

async function updateNews(req, res) {
  await newsService.update(req.validatedParams.id, req.body, req.user);
  const detail = await newsService.getDetail(req.validatedParams.id);
  return ok(res, detail);
}

async function deleteNews(req, res) {
  const result = await newsService.remove(req.validatedParams.id, req.user);
  return ok(res, result);
}

async function archiveNews(req, res) {
  const news = await newsService.archive(req.validatedParams.id, req.user);
  return ok(res, news);
}

/** Everything the post form needs to render: platforms, categories, defaults. */
async function getFormOptions(req, res) {
  const platforms = await platformService.listPlatforms({ activeOnly: true });
  return ok(res, {
    platforms,
    categories: NEWS_CATEGORIES,
    districts: DISTRICTS,
    statuses: NEWS_STATUS_VALUES,
    mediaTypes: MEDIA_TYPE_VALUES,
    defaults: { state: DEFAULT_STATE, country: DEFAULT_COUNTRY },
  });
}

/** Read-only "is this post ready to submit?" check used by the post editor. */
async function readiness(req, res) {
  const result = await approvalService.checkReadiness(req.validatedParams.id);
  return ok(res, result);
}

async function setPlatformContent(req, res) {
  const { id } = req.validatedParams;
  const [platform] = await platformService.findByCodes([req.body.platform]);
  if (!platform) {
    return res.status(400).json({ success: false, message: `Unknown platform "${req.body.platform}"` });
  }
  const row = await platformService.setPlatformContent(id, platform.id, req.body.content);
  return ok(res, row);
}

module.exports = {
  listNews,
  getNews,
  createNews,
  updateNews,
  deleteNews,
  archiveNews,
  getFormOptions,
  readiness,
  setPlatformContent,
};
