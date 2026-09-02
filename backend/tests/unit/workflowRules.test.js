'use strict';

/**
 * Business-rule tests for the approval and publishing services.
 *
 * The data layer is mocked so these rules can be verified without a database.
 * The same rules are exercised end to end against real PostgreSQL in
 * tests/integration/api.test.js when TEST_DATABASE_URL is set.
 */

require('../helpers/env');

const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const db = require('../../src/database');
const newsService = require('../../src/services/newsService');
const platformService = require('../../src/services/platformService');
const auditService = require('../../src/services/auditService');
const approvalService = require('../../src/services/approvalService');
const publishService = require('../../src/services/publishService');

const CREATOR = { id: 11, role: 'EDITOR', full_name: 'Editor One', email: 'e1@tv.local' };
const OTHER_EDITOR = { id: 12, role: 'EDITOR', full_name: 'Editor Two', email: 'e2@tv.local' };
const ADMIN = { id: 1, role: 'PLATFORM_ADMIN', full_name: 'Admin', email: 'admin@tv.local' };

function newsRow(overrides = {}) {
  return {
    id: 100,
    headline: 'Trichy corporation approves new bus terminus',
    summary: null,
    content: 'x'.repeat(200),
    category: 'Local',
    status: 'PENDING_APPROVAL',
    created_by: CREATOR.id,
    ...overrides,
  };
}

/**
 * Installs mocks for the data layer.
 * @param {object} options
 * @param {Array<{match:string, value:any}>} options.queryOne routed by SQL text
 */
function installMocks({ news, queryOne = [], queryAll = [], captured = {} }) {
  mock.method(db, 'withTransaction', async (handler) => handler({ mockClient: true }));

  mock.method(db, 'queryOne', async (sql) => {
    const route = queryOne.find((entry) => sql.includes(entry.match));
    if (!route) return null;
    return typeof route.value === 'function' ? route.value(sql) : route.value;
  });

  mock.method(db, 'queryAll', async (sql) => {
    const route = queryAll.find((entry) => sql.includes(entry.match));
    return route ? route.value : [];
  });

  mock.method(db, 'query', async (sql, params) => {
    captured.queries = captured.queries || [];
    captured.queries.push({ sql, params });
    return { rows: [], rowCount: 0 };
  });

  mock.method(auditService, 'record', async (entry) => {
    captured.audit = captured.audit || [];
    captured.audit.push(entry);
    return 1;
  });

  if (news !== undefined) {
    mock.method(newsService, 'lockById', async () => news);
  }
}

test.afterEach(() => mock.restoreAll());

// ---------------------------------------------------------------- approval

test('a user cannot approve their own post', async () => {
  const captured = {};
  installMocks({ news: newsRow(), captured });

  await assert.rejects(
    () => approvalService.approve(100, CREATOR),
    (error) => {
      assert.equal(error.status, 403);
      assert.match(error.message, /cannot approve a post you created/i);
      return true;
    }
  );

  // The refusal itself is audited.
  assert.ok(captured.audit.some((entry) => entry.stage === 'APPROVE_POST' && entry.status === 'FAILED'));
});

test('another editor can approve the post', async () => {
  const news = newsRow();
  installMocks({
    news,
    queryOne: [
      { match: 'FROM news_approvals', value: { id: 55, news_id: 100, submitted_by: CREATOR.id, status: 'PENDING' } },
      { match: 'UPDATE news_approvals', value: { id: 55, status: 'APPROVED', reviewed_by: OTHER_EDITOR.id } },
    ],
  });
  mock.method(newsService, 'setStatus', async () => ({ ...news, status: 'APPROVED' }));

  const result = await approvalService.approve(100, OTHER_EDITOR);

  assert.equal(result.news.status, 'APPROVED');
  assert.equal(result.approval.reviewed_by, OTHER_EDITOR.id);
});

test('an admin can approve another user post', async () => {
  const news = newsRow();
  installMocks({
    news,
    queryOne: [
      { match: 'FROM news_approvals', value: { id: 56, news_id: 100, submitted_by: CREATOR.id, status: 'PENDING' } },
      { match: 'UPDATE news_approvals', value: { id: 56, status: 'APPROVED', reviewed_by: ADMIN.id } },
    ],
  });
  mock.method(newsService, 'setStatus', async () => ({ ...news, status: 'APPROVED' }));

  const result = await approvalService.approve(100, ADMIN);
  assert.equal(result.approval.reviewed_by, ADMIN.id);
});

test('an admin still cannot approve a post they created themselves', async () => {
  installMocks({ news: newsRow({ created_by: ADMIN.id }) });

  await assert.rejects(() => approvalService.approve(100, ADMIN), /cannot approve a post you created/i);
});

test('only a post awaiting approval can be approved', async () => {
  installMocks({ news: newsRow({ status: 'DRAFT' }) });
  await assert.rejects(() => approvalService.approve(100, OTHER_EDITOR), /awaiting approval/i);

  mock.restoreAll();
  installMocks({ news: newsRow({ status: 'APPROVED' }) });
  await assert.rejects(() => approvalService.approve(100, OTHER_EDITOR), /already been approved/i);
});

test('rejection requires a reason', async () => {
  installMocks({ news: newsRow() });
  await assert.rejects(() => approvalService.reject(100, OTHER_EDITOR, ''), /reason is required/i);
  await assert.rejects(() => approvalService.reject(100, OTHER_EDITOR, '  x '), /reason is required/i);
});

test('rejection stores the reason and moves the post to REJECTED', async () => {
  const news = newsRow();
  const captured = {};
  installMocks({
    news,
    captured,
    queryOne: [
      { match: 'FROM news_approvals', value: { id: 57, news_id: 100, status: 'PENDING' } },
      {
        match: 'UPDATE news_approvals',
        value: { id: 57, status: 'REJECTED', rejection_reason: 'Poster needs correction.' },
      },
    ],
  });
  mock.method(newsService, 'setStatus', async () => ({ ...news, status: 'REJECTED' }));

  const result = await approvalService.reject(100, OTHER_EDITOR, 'Poster needs correction.');

  assert.equal(result.news.status, 'REJECTED');
  assert.equal(result.approval.rejection_reason, 'Poster needs correction.');
  assert.ok(captured.audit.some((entry) => entry.stage === 'REJECT_POST'));
});

test('a creator cannot reject their own post either', async () => {
  installMocks({ news: newsRow() });
  await assert.rejects(
    () => approvalService.reject(100, CREATOR, 'Changed my mind about this'),
    /cannot review your own post/i
  );
});

// -------------------------------------------------------------- publishing

test('a DRAFT post cannot be published', async () => {
  installMocks({ news: newsRow({ status: 'DRAFT' }) });
  await assert.rejects(() => publishService.createJob(100, ADMIN), /Only APPROVED posts can be published/i);
});

test('a post still awaiting approval cannot be published', async () => {
  installMocks({ news: newsRow({ status: 'PENDING_APPROVAL' }) });
  await assert.rejects(() => publishService.createJob(100, ADMIN), /still waiting for approval/i);
});

test('a REJECTED post cannot be published', async () => {
  installMocks({ news: newsRow({ status: 'REJECTED' }) });
  await assert.rejects(() => publishService.createJob(100, ADMIN), /Only APPROVED posts can be published/i);
});

test('a duplicate publish is refused while a job is already running', async () => {
  installMocks({
    news: newsRow({ status: 'APPROVED' }),
    queryOne: [{ match: 'FROM publish_jobs', value: { id: 900, status: 'QUEUED' } }],
  });

  await assert.rejects(() => publishService.createJob(100, ADMIN), /already in progress/i);
});

test('an approved post creates a job and one status row per selected platform', async () => {
  const news = newsRow({ status: 'APPROVED' });
  const captured = {};
  installMocks({
    news,
    captured,
    queryOne: [
      { match: 'INSERT INTO publish_jobs', value: { id: 1001, news_id: 100, job_type: 'PUBLISH', status: 'QUEUED', attempt_count: 1 } },
      { match: 'FROM publish_jobs', value: null },
    ],
  });
  mock.method(platformService, 'getTargets', async () => [
    { platform_id: 1, code: 'facebook', name: 'Facebook' },
    { platform_id: 5, code: 'telegram', name: 'Telegram' },
  ]);
  mock.method(newsService, 'getMedia', async () => []);
  mock.method(newsService, 'setStatus', async () => ({ ...news, status: 'PUBLISHING' }));

  const result = await publishService.createJob(100, ADMIN);

  assert.equal(result.job.id, 1001);
  assert.equal(result.news.status, 'PUBLISHING');

  const insert = captured.queries.find((entry) => entry.sql.includes('INSERT INTO social_publish_status'));
  assert.ok(insert, 'expected social_publish_status rows to be created');
  assert.deepEqual(insert.params[2], [1, 5]);
  assert.equal(insert.params[3], 'PENDING');
});

test('publishing is blocked when YouTube is selected without a video', async () => {
  const news = newsRow({ status: 'APPROVED' });
  installMocks({ news, queryOne: [{ match: 'FROM publish_jobs', value: null }] });
  mock.method(platformService, 'getTargets', async () => [{ platform_id: 4, code: 'youtube', name: 'YouTube' }]);
  mock.method(newsService, 'getMedia', async () => [{ media_type: 'MAIN_IMAGE' }]);

  await assert.rejects(() => publishService.createJob(100, ADMIN), /YouTube needs a video/i);
});

// ------------------------------------------------------------------- retry

test('retry creates a job for the failed platform only', async () => {
  const news = newsRow({ status: 'PARTIALLY_PUBLISHED' });
  const captured = {};
  installMocks({
    news,
    captured,
    queryOne: [
      { match: 'INSERT INTO publish_jobs', value: { id: 1002, news_id: 100, job_type: 'RETRY', status: 'QUEUED', attempt_count: 2 } },
      { match: 'SELECT * FROM publish_jobs WHERE id', value: { id: 1001, news_id: 100, attempt_count: 1, status: 'PARTIAL' } },
      { match: 'FROM publish_jobs\n        WHERE news_id', value: null },
      { match: 'FROM publish_jobs', value: null },
    ],
    queryAll: [
      {
        match: 'FROM social_publish_status',
        value: [
          { platform_id: 1, platform_code: 'facebook', status: 'PUBLISHED', retry_allowed: false, attempt_count: 1 },
          { platform_id: 2, platform_code: 'instagram', status: 'PUBLISHED', retry_allowed: false, attempt_count: 1 },
          { platform_id: 4, platform_code: 'youtube', status: 'FAILED', retry_allowed: true, attempt_count: 1 },
          { platform_id: 5, platform_code: 'telegram', status: 'PUBLISHED', retry_allowed: false, attempt_count: 1 },
        ],
      },
    ],
  });
  mock.method(newsService, 'setStatus', async () => ({ ...news, status: 'PUBLISHING' }));

  const result = await publishService.createRetryJob(1001, ADMIN);

  assert.equal(result.job.job_type, 'RETRY');
  assert.deepEqual(result.targets.map((target) => target.code), ['youtube']);

  const inserts = captured.queries.filter((entry) => entry.sql.includes('INSERT INTO social_publish_status'));
  assert.equal(inserts.length, 1, 'only the failed platform gets a new status row');
  assert.equal(inserts[0].params[2], 4);
});

test('retrying an already published platform is refused', async () => {
  const news = newsRow({ status: 'PARTIALLY_PUBLISHED' });
  installMocks({
    news,
    queryOne: [
      { match: 'SELECT * FROM publish_jobs WHERE id', value: { id: 1001, news_id: 100, attempt_count: 1 } },
      { match: 'FROM publish_jobs', value: null },
    ],
    queryAll: [
      {
        match: 'FROM social_publish_status',
        value: [
          { platform_id: 1, platform_code: 'facebook', status: 'PUBLISHED', retry_allowed: false, attempt_count: 1 },
          { platform_id: 4, platform_code: 'youtube', status: 'FAILED', retry_allowed: true, attempt_count: 1 },
        ],
      },
    ],
  });

  await assert.rejects(
    () => publishService.createRetryJob(1001, ADMIN, ['facebook']),
    /Already published successfully/i
  );
});

test('retry with nothing failed is refused', async () => {
  const news = newsRow({ status: 'PUBLISHED' });
  installMocks({
    news,
    queryOne: [
      { match: 'SELECT * FROM publish_jobs WHERE id', value: { id: 1001, news_id: 100, attempt_count: 1 } },
      { match: 'FROM publish_jobs', value: null },
    ],
    queryAll: [
      {
        match: 'FROM social_publish_status',
        value: [{ platform_id: 1, platform_code: 'facebook', status: 'PUBLISHED', retry_allowed: false, attempt_count: 1 }],
      },
    ],
  });

  await assert.rejects(() => publishService.createRetryJob(1001, ADMIN), /nothing to retry/i);
});

// ------------------------------------------------------- n8n result handling

test('a duplicate PUBLISHED callback does not create a second success', async () => {
  const captured = {};
  installMocks({
    captured,
    queryOne: [
      { match: 'FROM publish_jobs WHERE id', value: { id: 1001, news_id: 100, status: 'IN_PROGRESS' } },
      { match: 'FROM social_platforms', value: { id: 4, code: 'youtube', name: 'YouTube' } },
      {
        match: 'FROM social_publish_status WHERE publish_job_id',
        value: { id: 77, status: 'PUBLISHED', attempt_count: 1 },
      },
    ],
    queryAll: [{ match: 'FROM social_publish_status', value: [{ status: 'PUBLISHED' }] }],
  });

  const outcome = await publishService.recordPlatformResult({
    jobId: 1001,
    platform: 'youtube',
    status: 'PUBLISHED',
    externalPostId: 'abc123',
  });

  assert.equal(outcome.duplicate, true);
  assert.equal(outcome.status, 'PUBLISHED');
  assert.ok(captured.audit.some((entry) => entry.stage === 'PUBLISH_CALLBACK_DUPLICATE'));
  // No UPDATE was issued against the already successful row.
  assert.equal(
    (captured.queries || []).filter((entry) => entry.sql.includes('UPDATE social_publish_status')).length,
    0
  );
});

test('a callback for a platform that is not part of the job is rejected', async () => {
  installMocks({
    queryOne: [
      { match: 'FROM publish_jobs WHERE id', value: { id: 1001, news_id: 100, status: 'IN_PROGRESS' } },
      { match: 'FROM social_platforms', value: { id: 6, code: 'x', name: 'X' } },
      { match: 'FROM social_publish_status WHERE publish_job_id', value: null },
    ],
  });

  await assert.rejects(
    () => publishService.recordPlatformResult({ jobId: 1001, platform: 'x', status: 'PUBLISHED' }),
    /not part of job/i
  );
});

test('a callback for an unknown job is rejected', async () => {
  installMocks({ queryOne: [] });
  await assert.rejects(
    () => publishService.recordPlatformResult({ jobId: 424242, platform: 'facebook', status: 'PUBLISHED' }),
    /does not exist/i
  );
});
