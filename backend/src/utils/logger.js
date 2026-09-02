'use strict';

/**
 * Tiny dependency-free structured logger.
 *
 * Server side we want detail; API responses stay generic (see errorHandler).
 * Anything that looks like a secret is redacted before it reaches the log.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const SENSITIVE_KEY = /(password|secret|token|authorization|cookie|signature|apikey|api_key)/i;

function currentLevel() {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[level] === undefined ? LEVELS.info : LEVELS[level];
}

function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[deep]';
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redact(item, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code, stack: value.stack };
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(val, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level, message, meta) {
  if (LEVELS[level] > currentLevel()) return;
  const entry = { time: new Date().toISOString(), level, msg: message };
  if (meta !== undefined) entry.meta = redact(meta);
  const line = JSON.stringify(entry) + '\n';
  if (level === 'error') process.stderr.write(line);
  else process.stdout.write(line);
}

module.exports = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
  redact,
};
