'use strict';

/**
 * Pure publishing state machine.
 *
 * Kept free of database and HTTP concerns so the rules in specification
 * sections 11, 19, 20 and 39 can be unit tested directly.
 */

const {
  NEWS_STATUS,
  NEWS_STATUS_TRANSITIONS,
  JOB_STATUS,
  PLATFORM_STATUS,
} = require('../config/constants');

const IN_FLIGHT = [PLATFORM_STATUS.PENDING, PLATFORM_STATUS.READY, PLATFORM_STATUS.PUBLISHING];

/** Is `to` a legal next value for news.status? */
function canTransition(from, to) {
  if (from === to) return true;
  const allowed = NEWS_STATUS_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

function tally(statuses) {
  const counts = {
    total: statuses.length,
    inFlight: 0,
    published: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const status of statuses) {
    if (status === PLATFORM_STATUS.PUBLISHED) counts.published += 1;
    else if (status === PLATFORM_STATUS.FAILED) counts.failed += 1;
    else if (status === PLATFORM_STATUS.CANCELLED) counts.cancelled += 1;
    else if (IN_FLIGHT.includes(status)) counts.inFlight += 1;
  }
  return counts;
}

/**
 * Derives news.status from the latest status of every targeted platform.
 *
 * Partial success must never be reported as fully published (section 39):
 *   all published                  -> PUBLISHED
 *   some published + some failed   -> PARTIALLY_PUBLISHED
 *   all failed                     -> FAILED
 *   anything still running         -> PUBLISHING
 *
 * @param {string[]} statuses latest social_publish_status value per platform
 * @returns {string|null} the news status, or null when there is nothing to say
 */
function deriveNewsStatus(statuses) {
  const counts = tally(statuses);
  if (counts.total === 0) return null;
  if (counts.inFlight > 0) return NEWS_STATUS.PUBLISHING;
  if (counts.published > 0 && counts.failed > 0) return NEWS_STATUS.PARTIALLY_PUBLISHED;
  if (counts.published > 0) return NEWS_STATUS.PUBLISHED;
  if (counts.failed > 0) return NEWS_STATUS.FAILED;
  return null; // everything cancelled - leave the post where it is
}

/** Derives publish_jobs.status from the platform rows belonging to that job. */
function deriveJobStatus(statuses) {
  const counts = tally(statuses);
  if (counts.total === 0) return JOB_STATUS.QUEUED;
  if (counts.inFlight > 0) return JOB_STATUS.IN_PROGRESS;
  if (counts.published > 0 && counts.failed > 0) return JOB_STATUS.PARTIAL;
  if (counts.published > 0) return JOB_STATUS.COMPLETED;
  if (counts.failed > 0) return JOB_STATUS.FAILED;
  return JOB_STATUS.CANCELLED;
}

/** A job is finished when nothing is still in flight. */
function isJobFinished(statuses) {
  return tally(statuses).inFlight === 0;
}

/**
 * Which platforms a retry should touch.
 * Successful platforms are NEVER included (section 20 / business rule 14).
 */
function selectRetryablePlatforms(rows) {
  return rows.filter(
    (row) => row.status === PLATFORM_STATUS.FAILED && row.retry_allowed !== false
  );
}

module.exports = {
  canTransition,
  tally,
  deriveNewsStatus,
  deriveJobStatus,
  isJobFinished,
  selectRetryablePlatforms,
  IN_FLIGHT,
};
