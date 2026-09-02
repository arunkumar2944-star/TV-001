'use strict';

/**
 * Password hashing (bcrypt).
 *
 * bcryptjs is a pure-JavaScript implementation of the bcrypt algorithm and
 * produces standard $2a$/$2b$ hashes, so no native toolchain is required on the
 * office server. Plain text passwords are never stored or logged.
 */

const bcrypt = require('bcryptjs');
const { config } = require('../config/env');

const MIN_LENGTH = 10;
const MAX_LENGTH = 128; // bcrypt only considers the first 72 bytes

async function hash(plainPassword) {
  return bcrypt.hash(plainPassword, config.auth.bcryptRounds);
}

async function compare(plainPassword, passwordHash) {
  if (!passwordHash) {
    // Still burn time so a missing hash is not distinguishable by timing.
    await bcrypt.compare(plainPassword, '$2b$12$invalidsaltinvalidsaltinvalidsaltinvalidsaltinvalidsaltuO');
    return false;
  }
  return bcrypt.compare(plainPassword, passwordHash);
}

/**
 * Password policy for internally created accounts.
 * @returns {string[]} list of problems (empty when acceptable)
 */
function validateStrength(plainPassword) {
  const problems = [];
  const value = String(plainPassword || '');

  if (value.length < MIN_LENGTH) problems.push(`Password must be at least ${MIN_LENGTH} characters`);
  if (value.length > MAX_LENGTH) problems.push(`Password must be at most ${MAX_LENGTH} characters`);
  if (!/[a-z]/.test(value)) problems.push('Password must contain a lowercase letter');
  if (!/[A-Z]/.test(value)) problems.push('Password must contain an uppercase letter');
  if (!/[0-9]/.test(value)) problems.push('Password must contain a number');
  if (/^\s|\s$/.test(value)) problems.push('Password must not start or end with a space');

  return problems;
}

module.exports = { hash, compare, validateStrength, MIN_LENGTH, MAX_LENGTH };
