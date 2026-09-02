'use strict';

/**
 * End-to-end API tests against real PostgreSQL.
 *
 * These run ONLY when TEST_DATABASE_URL points at a disposable database:
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trichy_vision_test \
 *     npm run test:integration
 *
 * NEVER point TEST_DATABASE_URL at production Supabase - the suite writes and
 * then removes its own rows.
 *
 * Without the variable every test is skipped with a message, so `npm test`
 * still passes on a machine with no database.
 */

const { hasTestDatabase } = require('../helpers/env');

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const SKIP = !hasTestDatabase;
const suite = { skip: SKIP ? 'TEST_DATABASE_URL is not set' : false };

let app;
let db;
let userService;
const created = { users: [], news: [] };

const PASSWORD = 'TrichyVision#2026';
const stamp = Date.now();
const emails = {
  admin: `it-admin-${stamp}@trichyvision.test`,
  editorOne: `it-editor1-${stamp}@trichyvision.test`,
  editorTwo: `it-editor2-${stamp}@trichyvision.test`,
  inactive: `it-inactive-${stamp}@trichyvision.test`,
};

/** Signs in and returns an agent that keeps the session + CSRF cookies. */
async function signIn(email, password = PASSWORD) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Sign-in failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  agent.csrfToken = response.body.data.csrfToken;
  return agent;
}

function withCsrf(agent, req) {
  return req.set('X-CSRF-Token', agent.csrfToken);
}

test.before(async () => {
  if (SKIP) return;

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

  db = require('../../src/database');

  userService = require('../../src/services/userService');

  app = require('../../src/app').createApp();

  // Platforms must exist - seed them if the test database is fresh.
  const platformCount = await db.queryOne('SELECT COUNT(*)::int AS total FROM social_platforms');
  if (!platformCount || platformCount.total === 0) {

    const { PLATFORMS } = require('../../src/config/constants');
    for (const platform of PLATFORMS) {

      await db.query(
        'INSERT INTO social_platforms (code, name, is_active, sort_order) VALUES ($1, $2, TRUE, $3)',
        [platform.code, platform.name, platform.sortOrder]
      );
    }
  }

  const admin = await userService.create(
    { fullName: 'IT Admin', email: emails.admin, password: PASSWORD, role: 'ADMIN' },
    null
  );
  const editorOne = await userService.create(
    { fullName: 'IT Editor One', email: emails.editorOne, password: PASSWORD, role: 'EDITOR' },
    admin.id
  );
  const editorTwo = await userService.create(
    { fullName: 'IT Editor Two', email: emails.editorTwo, password: PASSWORD, role: 'EDITOR' },
    admin.id
  );
  const inactive = await userService.create(
    { fullName: 'IT Inactive', email: emails.inactive, password: PASSWORD, role: 'EDITOR' },
    admin.id
  );
  await db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [inactive.id]);

  created.users.push(admin.id, editorOne.id, editorTwo.id, inactive.id);
});

test.after(async () => {
  if (SKIP || !db) return;
  for (const newsId of created.news) {

    await db.query('DELETE FROM news WHERE id = $1', [newsId]).catch(() => {});
  }
  await db.query('DELETE FROM news_execution_audit WHERE actor_user_id = ANY($1::bigint[])', [created.users]).catch(() => {});
  await db.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [created.users]).catch(() => {});
  await db.closePool().catch(() => {});
});

// ------------------------------------------------------------------- health

test('GET /api/health reports ok', suite, async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.status, 'ok');
});

// --------------------------------------------------------------------- auth

test('valid credentials sign the user in', suite, async () => {
  const response = await request(app).post('/api/auth/login').send({ email: emails.admin, password: PASSWORD });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.user.email, emails.admin);
  assert.equal(response.body.data.user.password_hash, undefined, 'password hash must never be returned');
  assert.ok(response.headers['set-cookie'].some((cookie) => cookie.startsWith('tv_session=')));
  assert.ok(
    response.headers['set-cookie'].some((cookie) => /tv_session=.*HttpOnly/i.test(cookie)),
    'session cookie must be HttpOnly'
  );
});

test('invalid credentials are refused', suite, async () => {
  const response = await request(app).post('/api/auth/login').send({ email: emails.admin, password: 'wrong-password' });
  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});

test('an unknown email gets the same generic error', suite, async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: `nobody-${stamp}@trichyvision.test`, password: PASSWORD });
  assert.equal(response.status, 401);
  assert.match(response.body.message, /invalid email or password/i);
});

test('a deactivated account cannot sign in', suite, async () => {
  const response = await request(app).post('/api/auth/login').send({ email: emails.inactive, password: PASSWORD });
  assert.equal(response.status, 403);
  assert.match(response.body.message, /deactivated/i);
});

test('protected endpoints require a session', suite, async () => {
  const response = await request(app).get('/api/dashboard/summary');
  assert.equal(response.status, 401);
});

test('GET /api/auth/me returns the signed-in user', suite, async () => {
  const agent = await signIn(emails.editorOne);
  const response = await agent.get('/api/auth/me');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.user.email, emails.editorOne);
  assert.equal(response.body.data.permissions.canManageUsers, false);
});

test('logout invalidates the session', suite, async () => {
  const agent = await signIn(emails.editorOne);
  const out = await withCsrf(agent, agent.post('/api/auth/logout'));
  assert.equal(out.status, 200);

  const after = await agent.get('/api/auth/me');
  assert.equal(after.status, 401);
});

test('a mutating request without the CSRF header is refused', suite, async () => {
  const agent = await signIn(emails.editorOne);
  const response = await agent.post('/api/news').send({ headline: 'x', content: 'y', category: 'Local' });
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'CSRF_TOKEN_INVALID');
});

// ------------------------------------------------------------ authorisation

test('EDITOR cannot list or create users', suite, async () => {
  const agent = await signIn(emails.editorOne);

  const list = await agent.get('/api/users');
  assert.equal(list.status, 403);

  const create = await withCsrf(
    agent,
    agent.post('/api/internal/users')
  ).send({ fullName: 'Sneaky', email: `sneaky-${stamp}@x.test`, password: PASSWORD, role: 'ADMIN' });
  assert.equal(create.status, 403);
});

test('ADMIN can list, create and deactivate users', suite, async () => {
  const agent = await signIn(emails.admin);

  const list = await agent.get('/api/users');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.data));
  assert.ok(list.body.data.every((user) => user.password_hash === undefined));

  const email = `it-created-${stamp}@trichyvision.test`;
  const create = await withCsrf(agent, agent.post('/api/internal/users')).send({
    fullName: 'Created By Admin',
    email,
    password: PASSWORD,
    role: 'EDITOR',
  });
  assert.equal(create.status, 201);
  created.users.push(create.body.data.id);

  const disable = await withCsrf(agent, agent.patch(`/api/users/${create.body.data.id}/status`)).send({
    isActive: false,
  });
  assert.equal(disable.status, 200);
  assert.equal(disable.body.data.is_active, false);
});

// ------------------------------------------------------------- news + flow

test('full workflow: create -> submit -> approve -> publish job', suite, async () => {
  const author = await signIn(emails.editorOne);
  const reviewer = await signIn(emails.editorTwo);

  // create
  const createResponse = await withCsrf(author, author.post('/api/news')).send({
    headline: 'Integration test: Trichy district road works begin',
    summary: 'Automated test post',
    content: 'The corporation began road works across the district this week. '.repeat(3),
    category: 'Local',
    district: 'Tiruchirappalli',
    platforms: ['facebook', 'telegram'],
  });
  assert.equal(createResponse.status, 201);
  const newsId = createResponse.body.data.id;
  created.news.push(newsId);
  assert.equal(createResponse.body.data.status, 'DRAFT');
  assert.deepEqual(
    createResponse.body.data.platforms.map((platform) => platform.code).sort(),
    ['facebook', 'telegram']
  );

  // a draft cannot be published
  const earlyPublish = await withCsrf(author, author.post(`/api/news/${newsId}/publish`));
  assert.equal(earlyPublish.status, 409);

  // submit for approval
  const submit = await withCsrf(author, author.post(`/api/news/${newsId}/submit-approval`));
  assert.equal(submit.status, 200);
  assert.equal(submit.body.data.status, 'PENDING_APPROVAL');

  // creator cannot approve their own post
  const selfApprove = await withCsrf(author, author.post(`/api/news/${newsId}/approve`)).send({});
  assert.equal(selfApprove.status, 403);
  assert.match(selfApprove.body.message, /cannot approve a post you created/i);

  // still PENDING_APPROVAL after the refused attempt
  const stillPending = await author.get(`/api/news/${newsId}`);
  assert.equal(stillPending.body.data.status, 'PENDING_APPROVAL');

  // the approval queue marks the author's own post as not approvable
  const queue = await author.get('/api/approvals');
  assert.equal(queue.status, 200);
  const own = queue.body.data.find((item) => item.id === newsId);
  assert.ok(own);
  assert.equal(own.can_approve, false);

  const reviewerQueue = await reviewer.get('/api/approvals');
  const forReview = reviewerQueue.body.data.find((item) => item.id === newsId);
  assert.equal(forReview.can_approve, true);

  // another editor approves
  const approve = await withCsrf(reviewer, reviewer.post(`/api/news/${newsId}/approve`)).send({});
  assert.equal(approve.status, 200);
  assert.equal(approve.body.data.status, 'APPROVED');
  assert.equal(Number(approve.body.data.approved_by), Number(approve.body.data.approvals[0].reviewed_by));

  // the approved post appears in Publish
  const publishList = await reviewer.get('/api/publish?view=ready&pageSize=100');
  assert.ok(publishList.body.data.some((item) => item.id === newsId));

  // publishing creates a job and platform rows (n8n is not configured in tests,
  // so the dispatch is reported as failed - the database record still exists)
  const publish = await withCsrf(reviewer, reviewer.post(`/api/news/${newsId}/publish`));
  assert.equal(publish.status, 201);
  const jobId = publish.body.data.job.id;
  assert.equal(publish.body.data.job.platforms.length, 2);

  const jobRow = await db.queryOne('SELECT * FROM publish_jobs WHERE id = $1', [jobId]);
  assert.ok(jobRow);
  assert.equal(Number(jobRow.news_id), Number(newsId));

  const statusRows = await db.queryAll(
    'SELECT * FROM social_publish_status WHERE publish_job_id = $1',
    [jobId]
  );
  assert.equal(statusRows.length, 2);
});

test('rejection requires a reason and sends the post back to the author', suite, async () => {
  const author = await signIn(emails.editorOne);
  const reviewer = await signIn(emails.editorTwo);

  const createResponse = await withCsrf(author, author.post('/api/news')).send({
    headline: 'Integration test: rejection path',
    content: 'Content that is long enough to pass validation for the approval workflow test.',
    category: 'Local',
    platforms: ['telegram'],
  });
  const newsId = createResponse.body.data.id;
  created.news.push(newsId);

  await withCsrf(author, author.post(`/api/news/${newsId}/submit-approval`));

  const noReason = await withCsrf(reviewer, reviewer.post(`/api/news/${newsId}/reject`)).send({ reason: '' });
  assert.equal(noReason.status, 400);

  const rejected = await withCsrf(reviewer, reviewer.post(`/api/news/${newsId}/reject`)).send({
    reason: 'Poster needs correction.',
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.data.status, 'REJECTED');
  assert.equal(rejected.body.data.approvals[0].rejection_reason, 'Poster needs correction.');

  // a rejected post cannot be published
  const publish = await withCsrf(reviewer, reviewer.post(`/api/news/${newsId}/publish`));
  assert.equal(publish.status, 409);

  // the author edits and resubmits
  const edit = await withCsrf(author, author.patch(`/api/news/${newsId}`)).send({
    content: 'Corrected content that is long enough to satisfy the approval validation rules.',
  });
  assert.equal(edit.status, 200);

  const resubmit = await withCsrf(author, author.post(`/api/news/${newsId}/submit-approval`));
  assert.equal(resubmit.status, 200);
  assert.equal(resubmit.body.data.status, 'PENDING_APPROVAL');
});

// ------------------------------------------------------------- n8n callback

test('n8n callbacks are rejected without the shared secret', suite, async () => {
  const response = await request(app)
    .post('/api/n8n/publish-result')
    .send({ jobId: 1, platform: 'facebook', status: 'PUBLISHED' });
  assert.equal(response.status, 401);
});

test('partial success, idempotency and independent retry', suite, async () => {
  const author = await signIn(emails.editorOne);
  const reviewer = await signIn(emails.editorTwo);
  const secret = process.env.N8N_WEBHOOK_SECRET;

  const createResponse = await withCsrf(author, author.post('/api/news')).send({
    headline: 'Integration test: partial publish and retry',
    content: 'A long enough body for the publishing workflow integration test to proceed.',
    category: 'Local',
    platforms: ['facebook', 'telegram'],
  });
  const newsId = createResponse.body.data.id;
  created.news.push(newsId);

  await withCsrf(author, author.post(`/api/news/${newsId}/submit-approval`));
  await withCsrf(reviewer, reviewer.post(`/api/news/${newsId}/approve`)).send({});
  const publish = await withCsrf(reviewer, reviewer.post(`/api/news/${newsId}/publish`));
  const jobId = publish.body.data.job.id;

  // facebook succeeds
  const success = await request(app)
    .post('/api/n8n/publish-result')
    .set('X-N8N-Secret', secret)
    .send({
      jobId,
      newsId,
      platform: 'facebook',
      status: 'PUBLISHED',
      externalPostId: 'fb_123',
      publishedUrl: 'https://facebook.com/post/123',
      executionId: 'exec-1',
      workflowName: 'Trichy Vision Publisher',
    });
  assert.equal(success.status, 200);

  // telegram fails
  const failure = await request(app)
    .post('/api/n8n/publish-result')
    .set('X-N8N-Secret', secret)
    .send({
      jobId,
      newsId,
      platform: 'telegram',
      status: 'FAILED',
      errorType: 'API_ERROR',
      message: 'Publishing failed',
      retryAllowed: true,
      executionId: 'exec-1',
    });
  assert.equal(failure.status, 200);
  assert.equal(failure.body.data.newsStatus, 'PARTIALLY_PUBLISHED');

  // a duplicate success callback changes nothing
  const duplicate = await request(app)
    .post('/api/n8n/publish-result')
    .set('X-N8N-Secret', secret)
    .send({ jobId, newsId, platform: 'facebook', status: 'PUBLISHED', externalPostId: 'fb_123' });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.data.duplicates, 1);

  const facebookRows = await db.queryAll(
    `SELECT s.* FROM social_publish_status s
       JOIN social_platforms p ON p.id = s.platform_id
      WHERE s.publish_job_id = $1 AND p.code = 'facebook'`,
    [jobId]
  );
  assert.equal(facebookRows.length, 1, 'a duplicate callback must not create a second row');
  assert.equal(facebookRows[0].attempt_count, 1, 'a duplicate callback must not count as another attempt');

  // retry only touches the failed platform
  const retry = await withCsrf(reviewer, reviewer.post(`/api/publish/${jobId}/retry`)).send({});
  assert.equal(retry.status, 201);
  const retryJobId = retry.body.data.job.id;
  assert.notEqual(retryJobId, jobId);
  assert.equal(retry.body.data.job.platforms.length, 1);
  assert.equal(retry.body.data.job.platforms[0].platform_code, 'telegram');

  // retrying a successful platform explicitly is refused
  const badRetry = await withCsrf(reviewer, reviewer.post(`/api/publish/${jobId}/retry`)).send({
    platforms: ['facebook'],
  });
  assert.ok([409, 400].includes(badRetry.status));

  // the retry succeeds -> the post becomes fully PUBLISHED
  await request(app)
    .post('/api/n8n/publish-result')
    .set('X-N8N-Secret', secret)
    .send({ jobId: retryJobId, newsId, platform: 'telegram', status: 'PUBLISHED', externalPostId: 'tg_9' });

  const finalNews = await db.queryOne('SELECT status FROM news WHERE id = $1', [newsId]);
  assert.equal(finalNews.status, 'PUBLISHED');
});

// ---------------------------------------------------------------- dashboard

test('dashboard reads from the database, not from n8n', suite, async () => {
  const agent = await signIn(emails.admin);

  const summary = await agent.get('/api/dashboard/summary');
  assert.equal(summary.status, 200);
  assert.equal(typeof summary.body.data.cards.published, 'number');

  const publishing = await agent.get('/api/dashboard/publishing');
  assert.equal(publishing.status, 200);
  assert.ok(Array.isArray(publishing.body.data.platforms));
  const facebook = publishing.body.data.platforms.find((platform) => platform.code === 'facebook');
  assert.ok(facebook);
  assert.equal(typeof facebook.success, 'number');
  assert.equal(typeof facebook.failed, 'number');
  assert.equal(typeof facebook.pending, 'number');

  const audit = await agent.get('/api/dashboard/audit?pageSize=5');
  assert.equal(audit.status, 200);
  assert.ok(Array.isArray(audit.body.data));
});
