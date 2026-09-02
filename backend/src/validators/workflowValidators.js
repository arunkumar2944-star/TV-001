'use strict';

const { z, pagination } = require('./common');
const { JOB_STATUS_VALUES, PLATFORM_STATUS_VALUES, AUDIT_STAGE } = require('../config/constants');

// ---- approval -------------------------------------------------------------

const approveSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
});

const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Please explain what needs to change (at least 5 characters)')
    .max(1000, 'Reason must be at most 1000 characters'),
});

const listApprovalsSchema = pagination.extend({
  includeOwn: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(200).optional(),
});

// ---- publishing -----------------------------------------------------------

const listPublishSchema = pagination.extend({
  view: z.enum(['ready', 'history']).optional().default('ready'),
  status: z.enum(JOB_STATUS_VALUES).optional(),
  newsId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(200).optional(),
});

const retrySchema = z.object({
  platforms: z.array(z.string().trim().toLowerCase().min(1).max(40)).optional(),
});

// ---- n8n callbacks --------------------------------------------------------

const platformResultSchema = z.object({
  jobId: z.coerce.number().int().positive('jobId is required'),
  newsId: z.coerce.number().int().positive().optional(),
  platform: z.string().trim().min(1, 'platform is required').max(40),
  status: z.enum(PLATFORM_STATUS_VALUES, 'status must be one of PENDING, READY, PUBLISHING, PUBLISHED, FAILED, CANCELLED'),
  externalPostId: z.string().trim().max(300).optional().nullable(),
  publishedUrl: z.string().trim().max(2000).optional().nullable(),
  errorType: z.string().trim().max(120).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  retryAllowed: z.boolean().optional(),
  executionId: z.string().trim().max(200).optional().nullable(),
  workflowName: z.string().trim().max(200).optional().nullable(),
});

/** Accepts a single result or a batch: { results: [...] }. */
const publishResultSchema = z.union([
  platformResultSchema,
  z.object({
    jobId: z.coerce.number().int().positive().optional(),
    newsId: z.coerce.number().int().positive().optional(),
    executionId: z.string().trim().max(200).optional().nullable(),
    workflowName: z.string().trim().max(200).optional().nullable(),
    results: z.array(platformResultSchema.partial({ jobId: true })).min(1, 'results must not be empty'),
  }),
]);

const jobProgressSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  platform: z.string().trim().min(1).max(40),
  executionId: z.string().trim().max(200).optional().nullable(),
  workflowName: z.string().trim().max(200).optional().nullable(),
});

// ---- audit ----------------------------------------------------------------

const listAuditSchema = pagination.extend({
  newsId: z.coerce.number().int().positive().optional(),
  publishJobId: z.coerce.number().int().positive().optional(),
  stage: z.enum(Object.values(AUDIT_STAGE)).optional(),
  status: z.enum(['INFO', 'SUCCESS', 'FAILED', 'WARNING']).optional(),
});

const dashboardStatsSchema = z.object({
  days: z.coerce.number().int().positive().max(3650).optional(),
});

module.exports = {
  approveSchema,
  rejectSchema,
  listApprovalsSchema,
  listPublishSchema,
  retrySchema,
  platformResultSchema,
  publishResultSchema,
  jobProgressSchema,
  listAuditSchema,
  dashboardStatsSchema,
};
