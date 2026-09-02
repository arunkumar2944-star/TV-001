'use strict';

require('../helpers/env');

const test = require('node:test');
const assert = require('node:assert/strict');

const passwordService = require('../../src/services/passwordService');
const tokenService = require('../../src/services/tokenService');
const { authorize, adminOnly, staffOnly } = require('../../src/middleware/authorize');
const { csrfProtection } = require('../../src/middleware/csrf');
const { ROLES } = require('../../src/config/constants');
const { config } = require('../../src/config/env');

// ---------------------------------------------------------------- passwords

test('passwords are bcrypt hashed and verify correctly', async () => {
  const hash = await passwordService.hash('Trichy#Vision2026');
  assert.notEqual(hash, 'Trichy#Vision2026');
  assert.match(hash, /^\$2[aby]\$/);
  assert.equal(await passwordService.compare('Trichy#Vision2026', hash), true);
  assert.equal(await passwordService.compare('wrong-password', hash), false);
});

test('compare against a missing hash returns false instead of throwing', async () => {
  assert.equal(await passwordService.compare('anything', null), false);
});

test('password policy rejects weak values', () => {
  assert.ok(passwordService.validateStrength('short').length > 0);
  assert.ok(passwordService.validateStrength('alllowercase123').length > 0);
  assert.ok(passwordService.validateStrength('ALLUPPERCASE123').length > 0);
  assert.ok(passwordService.validateStrength('NoDigitsHereAtAll').length > 0);
  assert.equal(passwordService.validateStrength('Trichy#Vision2026').length, 0);
});

// ------------------------------------------------------------------- tokens

test('session tokens round trip and carry the role', () => {
  tokenService._reset();
  const token = tokenService.sign({ id: 7, role: ROLES.EDITOR, email: 'e@x.local', full_name: 'Ed' });
  const claims = tokenService.verify(token);
  assert.equal(claims.sub, '7');
  assert.equal(claims.role, ROLES.EDITOR);
});

test('a tampered token is rejected', () => {
  tokenService._reset();
  const token = tokenService.sign({ id: 1, role: ROLES.PLATFORM_ADMIN, email: 'a@x.local', full_name: 'A' });
  const [header, payload] = token.split('.');
  const forged = `${header}.${payload}.bogussignature`;
  assert.throws(() => tokenService.verify(forged));
});

test('logout revokes the token id', () => {
  tokenService._reset();
  const token = tokenService.sign({ id: 3, role: ROLES.EDITOR, email: 'x@x.local', full_name: 'X' });
  assert.ok(tokenService.verify(token));
  tokenService.revoke(token);
  assert.throws(() => tokenService.verify(token), /revoked/i);
});

// ------------------------------------------------------------ authorisation

function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error));
  });
}

test('PLATFORM_ADMIN passes the user-management guard, EDITOR does not', async () => {
  assert.equal(await runMiddleware(adminOnly, { user: { id: 1, role: ROLES.PLATFORM_ADMIN } }), undefined);

  const denied = await runMiddleware(adminOnly, { user: { id: 2, role: ROLES.EDITOR } });
  assert.ok(denied);
  assert.equal(denied.status, 403);
});

test('both roles pass the shared newsroom guard', async () => {
  assert.equal(await runMiddleware(staffOnly, { user: { id: 1, role: ROLES.PLATFORM_ADMIN } }), undefined);
  assert.equal(await runMiddleware(staffOnly, { user: { id: 2, role: ROLES.EDITOR } }), undefined);
});

test('an unauthenticated request is rejected with 401', async () => {
  const error = await runMiddleware(authorize(ROLES.PLATFORM_ADMIN, ROLES.EDITOR), {});
  assert.ok(error);
  assert.equal(error.status, 401);
});

// --------------------------------------------------------------------- CSRF

function csrfRequest({ method, cookieToken, headerToken, authHeader }) {
  return {
    method,
    cookies: cookieToken ? { [config.auth.csrfCookieName]: cookieToken } : {},
    get(name) {
      const key = String(name).toLowerCase();
      if (key === 'x-csrf-token') return headerToken;
      if (key === 'authorization') return authHeader;
      return undefined;
    },
  };
}

test('CSRF: safe methods pass without a token', async () => {
  const error = await runMiddleware(csrfProtection, csrfRequest({ method: 'GET' }));
  assert.equal(error, undefined);
});

test('CSRF: a mutating request without a matching token is refused', async () => {
  const error = await runMiddleware(
    csrfProtection,
    csrfRequest({ method: 'POST', cookieToken: 'abc123', headerToken: 'different' })
  );
  assert.ok(error);
  assert.equal(error.status, 403);
  assert.equal(error.code, 'CSRF_TOKEN_INVALID');
});

test('CSRF: matching cookie and header are accepted', async () => {
  const token = 'a'.repeat(64);
  const error = await runMiddleware(
    csrfProtection,
    csrfRequest({ method: 'POST', cookieToken: token, headerToken: token })
  );
  assert.equal(error, undefined);
});

test('CSRF: bearer-authenticated calls are exempt (no ambient cookie)', async () => {
  const error = await runMiddleware(
    csrfProtection,
    csrfRequest({ method: 'POST', authHeader: 'Bearer sometoken' })
  );
  assert.equal(error, undefined);
});
