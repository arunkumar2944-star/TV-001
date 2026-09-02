'use strict';

/**
 * Exercises the real Express application end to end - routing, CORS, CSRF,
 * authentication, the n8n secret boundary and the central error handler.
 *
 * The data layer is mocked, so this suite runs anywhere with no database.
 * tests/integration/api.test.js covers the same paths against real PostgreSQL.
 */

require('../helpers/env');

const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const request = require('supertest');

const db = require('../../src/database');
const { createApp } = require('../../src/app');

const app = createApp();
const SECRET = process.env.N8N_WEBHOOK_SECRET;

function stubDatabase({ queryOne = null, queryAll = [], checkConnection = true } = {}) {
  mock.method(db, 'query', async () => ({ rows: [], rowCount: 0 }));
  mock.method(db, 'queryOne', async () => queryOne);
  mock.method(db, 'queryAll', async () => queryAll);
  mock.method(db, 'checkConnection', async () => checkConnection);
  mock.method(db, 'relationExists', async () => false);
  mock.method(db, 'withTransaction', async (handler) => handler({ mockClient: true }));
}

test.afterEach(() => mock.restoreAll());

// ------------------------------------------------------------------ health

test('GET /api/health reports ok when the database answers', async () => {
  stubDatabase({ checkConnection: true });

  const response = await request(app).get('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.checks.database, 'up');
});

test('GET /api/health reports degraded when the database is unreachable', async () => {
  mock.method(db, 'checkConnection', async () => {
    throw new Error('connection refused');
  });

  const response = await request(app).get('/api/health');

  assert.equal(response.status, 503);
  assert.equal(response.body.status, 'degraded');
  // The client must never see the underlying database error.
  assert.equal(JSON.stringify(response.body).includes('connection refused'), false);
});

// -------------------------------------------------------------------- CSRF

test('GET /api/auth/csrf issues a readable CSRF cookie', async () => {
  const response = await request(app).get('/api/auth/csrf');

  assert.equal(response.status, 200);
  assert.ok(response.body.data.csrfToken);

  const cookies = response.headers['set-cookie'] || [];
  const csrfCookie = cookies.find((cookie) => cookie.startsWith('tv_csrf='));
  assert.ok(csrfCookie, 'tv_csrf cookie must be set');
  assert.equal(/httponly/i.test(csrfCookie), false, 'the SPA has to be able to read it');
});

test('a POST without the CSRF header is refused', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .set('Cookie', ['tv_csrf=abc123'])
    .send({ email: 'someone@trichyvision.local', password: 'whatever' });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'CSRF_TOKEN_INVALID');
});

test('a POST with a mismatched CSRF header is refused', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .set('Cookie', ['tv_csrf=abc123'])
    .set('X-CSRF-Token', 'not-the-same')
    .send({ email: 'someone@trichyvision.local', password: 'whatever' });

  assert.equal(response.status, 403);
});

// ------------------------------------------------------------ authentication

test('protected routes reject anonymous callers', async () => {
  const paths = [
    '/api/auth/me',
    '/api/dashboard/summary',
    '/api/dashboard/publishing',
    '/api/dashboard/audit',
    '/api/news',
    '/api/news/1',
    '/api/approvals',
    '/api/publish',
    '/api/platforms',
    '/api/users',
  ];

  for (const path of paths) {
    const response = await request(app).get(path);
    assert.equal(response.status, 401, `${path} should require authentication`);
    assert.equal(response.body.success, false);
  }
});

test('login validates its input before touching the database', async () => {
  stubDatabase();

  const response = await request(app)
    .post('/api/auth/login')
    .set('Cookie', ['tv_csrf=token'])
    .set('X-CSRF-Token', 'token')
    .send({ email: 'not-an-email', password: '' });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'VALIDATION_FAILED');
  assert.ok(Array.isArray(response.body.details));
});

test('an unknown account gets a generic failure, not an enumeration hint', async () => {
  stubDatabase({ queryOne: null });

  const response = await request(app)
    .post('/api/auth/login')
    .set('Cookie', ['tv_csrf=token'])
    .set('X-CSRF-Token', 'token')
    .send({ email: 'ghost@trichyvision.local', password: 'Whatever#2026' });

  assert.equal(response.status, 401);
  assert.match(response.body.message, /invalid email or password/i);
});

// --------------------------------------------------------------------- n8n

test('the n8n callback rejects requests with no credentials', async () => {
  const response = await request(app)
    .post('/api/n8n/publish-result')
    .send({ jobId: 1, platform: 'facebook', status: 'PUBLISHED' });

  assert.equal(response.status, 401);
  assert.match(response.body.message, /automation credentials/i);
});

test('the n8n callback rejects a wrong secret', async () => {
  const response = await request(app)
    .post('/api/n8n/publish-result')
    .set('X-N8N-Secret', 'not-the-secret')
    .send({ jobId: 1, platform: 'facebook', status: 'PUBLISHED' });

  assert.equal(response.status, 401);
});

test('the n8n boundary accepts the shared secret and skips CSRF', async () => {
  stubDatabase();

  const response = await request(app).get('/api/n8n/health').set('X-N8N-Secret', SECRET);

  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'ok');
  assert.equal(response.body.data.method, 'secret');
});

test('the n8n callback accepts an HMAC signature over the raw body', async () => {
  stubDatabase();
  const crypto = require('crypto');
  const body = JSON.stringify({ jobId: 999999, platform: 'facebook', status: 'PUBLISHED' });
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('hex');

  const response = await request(app)
    .post('/api/n8n/publish-result')
    .set('Content-Type', 'application/json')
    .set('X-TrichyVision-Signature', signature)
    .send(body);

  // Authenticated (not 401) - the job simply does not exist in this stub.
  assert.notEqual(response.status, 401);
  assert.equal(response.status, 404);
  assert.match(response.body.message, /does not exist/i);
});

test('a signature over different content is rejected', async () => {
  const crypto = require('crypto');
  const signature = crypto.createHmac('sha256', SECRET).update('{"jobId":1}').digest('hex');

  const response = await request(app)
    .post('/api/n8n/publish-result')
    .set('Content-Type', 'application/json')
    .set('X-TrichyVision-Signature', signature)
    .send(JSON.stringify({ jobId: 2, platform: 'facebook', status: 'PUBLISHED' }));

  assert.equal(response.status, 401);
});

test('the n8n callback validates its payload', async () => {
  stubDatabase();

  const response = await request(app)
    .post('/api/n8n/publish-result')
    .set('X-N8N-Secret', SECRET)
    .send({ jobId: 1, platform: 'facebook', status: 'NOT_A_REAL_STATUS' });

  assert.equal(response.status, 400);
});

// ---------------------------------------------------------- errors and CORS

test('unknown routes return the standard error envelope', async () => {
  const response = await request(app).get('/api/does-not-exist');

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.ok(response.body.message);
  assert.equal(response.body.stack, undefined);
});

test('malformed JSON is reported without a stack trace', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .set('Cookie', ['tv_csrf=token'])
    .set('X-CSRF-Token', 'token')
    .set('Content-Type', 'application/json')
    .send('{"email": ');

  assert.equal(response.status, 400);
  assert.match(response.body.message, /not valid JSON/i);
});

test('the configured frontend origin is allowed and credentials are enabled', async () => {
  stubDatabase();
  const response = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');

  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.equal(response.headers['access-control-allow-credentials'], 'true');
});

test('an unknown origin is refused by CORS', async () => {
  stubDatabase();
  const response = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');

  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

test('security headers are present and the framework is not advertised', async () => {
  stubDatabase();
  const response = await request(app).get('/api/health');

  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.ok(response.headers['content-security-policy']);
  assert.ok(response.headers['x-request-id']);
});
