'use strict';

require('../helpers/env');

const test = require('node:test');
const assert = require('node:assert/strict');

const machine = require('../../src/services/publishStateMachine');
const { NEWS_STATUS, JOB_STATUS, PLATFORM_STATUS } = require('../../src/config/constants');

test('deriveNewsStatus: every platform published -> PUBLISHED', () => {
  const statuses = ['PUBLISHED', 'PUBLISHED', 'PUBLISHED'];
  assert.equal(machine.deriveNewsStatus(statuses), NEWS_STATUS.PUBLISHED);
});

test('deriveNewsStatus: partial success is never reported as PUBLISHED', () => {
  const statuses = ['PUBLISHED', 'PUBLISHED', 'FAILED', 'PUBLISHED'];
  assert.equal(machine.deriveNewsStatus(statuses), NEWS_STATUS.PARTIALLY_PUBLISHED);
});

test('deriveNewsStatus: all platforms failed -> FAILED', () => {
  assert.equal(machine.deriveNewsStatus(['FAILED', 'FAILED']), NEWS_STATUS.FAILED);
});

test('deriveNewsStatus: anything still running -> PUBLISHING', () => {
  assert.equal(machine.deriveNewsStatus(['PUBLISHED', 'PENDING']), NEWS_STATUS.PUBLISHING);
  assert.equal(machine.deriveNewsStatus(['FAILED', 'PUBLISHING']), NEWS_STATUS.PUBLISHING);
  assert.equal(machine.deriveNewsStatus(['READY']), NEWS_STATUS.PUBLISHING);
});

test('deriveNewsStatus: no platforms at all -> null (nothing to say)', () => {
  assert.equal(machine.deriveNewsStatus([]), null);
  assert.equal(machine.deriveNewsStatus(['CANCELLED']), null);
});

test('deriveJobStatus mirrors the platform outcome of one job', () => {
  assert.equal(machine.deriveJobStatus(['PUBLISHED']), JOB_STATUS.COMPLETED);
  assert.equal(machine.deriveJobStatus(['PUBLISHED', 'FAILED']), JOB_STATUS.PARTIAL);
  assert.equal(machine.deriveJobStatus(['FAILED']), JOB_STATUS.FAILED);
  assert.equal(machine.deriveJobStatus(['PENDING', 'PUBLISHED']), JOB_STATUS.IN_PROGRESS);
  assert.equal(machine.deriveJobStatus([]), JOB_STATUS.QUEUED);
});

test('isJobFinished is false while any platform is still in flight', () => {
  assert.equal(machine.isJobFinished(['PUBLISHED', 'FAILED']), true);
  assert.equal(machine.isJobFinished(['PUBLISHED', 'PUBLISHING']), false);
});

test('retry never selects platforms that already published', () => {
  const rows = [
    { platform_code: 'facebook', status: PLATFORM_STATUS.PUBLISHED, retry_allowed: true },
    { platform_code: 'instagram', status: PLATFORM_STATUS.PUBLISHED, retry_allowed: true },
    { platform_code: 'youtube', status: PLATFORM_STATUS.FAILED, retry_allowed: true },
    { platform_code: 'telegram', status: PLATFORM_STATUS.PUBLISHED, retry_allowed: true },
  ];

  const retryable = machine.selectRetryablePlatforms(rows);

  assert.equal(retryable.length, 1);
  assert.equal(retryable[0].platform_code, 'youtube');
});

test('retry skips failures the automation layer marked as not retryable', () => {
  const rows = [
    { platform_code: 'x', status: PLATFORM_STATUS.FAILED, retry_allowed: false },
    { platform_code: 'threads', status: PLATFORM_STATUS.FAILED, retry_allowed: true },
  ];
  const retryable = machine.selectRetryablePlatforms(rows);
  assert.deepEqual(retryable.map((row) => row.platform_code), ['threads']);
});

test('news status transitions follow the specified workflow', () => {
  assert.ok(machine.canTransition('DRAFT', 'PENDING_APPROVAL'));
  assert.ok(machine.canTransition('PENDING_APPROVAL', 'APPROVED'));
  assert.ok(machine.canTransition('PENDING_APPROVAL', 'REJECTED'));
  assert.ok(machine.canTransition('REJECTED', 'PENDING_APPROVAL'));
  assert.ok(machine.canTransition('APPROVED', 'PUBLISHING'));
  assert.ok(machine.canTransition('PUBLISHING', 'PARTIALLY_PUBLISHED'));
  assert.ok(machine.canTransition('FAILED', 'PUBLISHING'));

  // A draft can never jump straight to published.
  assert.equal(machine.canTransition('DRAFT', 'PUBLISHED'), false);
  // A rejected post can never publish.
  assert.equal(machine.canTransition('REJECTED', 'PUBLISHING'), false);
  assert.equal(machine.canTransition('PENDING_APPROVAL', 'PUBLISHING'), false);
  // Archived is terminal.
  assert.equal(machine.canTransition('ARCHIVED', 'DRAFT'), false);
});
