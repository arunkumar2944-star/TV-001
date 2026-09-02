'use strict';

const { z } = require('zod');

// Deliberately regex based rather than z.email() so the schema behaves the same
// across zod minor versions.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

const email = z
  .string()
  .trim()
  .min(5, 'Email is required')
  .max(254, 'Email is too long')
  .regex(EMAIL_PATTERN, 'Enter a valid email address')
  .transform((value) => value.toLowerCase());

const id = z.coerce.number().int('Must be a whole number').positive('Must be greater than zero');

const idParam = z.object({ id });

const jobIdParam = z.object({ jobId: id });

const pagination = z.object({
  page: z.coerce.number().int().positive().max(100000).optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});

/** Trimmed, non-empty string with a maximum length. */
function text(min, max, label) {
  return z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);
}

/** Optional text that may be sent as an empty string to clear the field. */
function optionalText(max, label) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .nullable();
}

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

module.exports = { z, email, id, idParam, jobIdParam, pagination, text, optionalText, booleanish, EMAIL_PATTERN };
