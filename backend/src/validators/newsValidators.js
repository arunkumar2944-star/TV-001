'use strict';

const { z, text, pagination } = require('./common');
const {
  NEWS_STATUS_VALUES,
  MEDIA_TYPE_VALUES,
  DEFAULT_STATE,
  DEFAULT_COUNTRY,
} = require('../config/constants');

const platformCodes = z
  .array(z.string().trim().toLowerCase().min(1).max(40))
  .max(20, 'Too many platforms selected');

const createNewsSchema = z.object({
  headline: text(5, 300, 'Headline'),
  summary: z.string().trim().max(1000, 'Summary must be at most 1000 characters').optional().nullable(),
  content: text(1, 100000, 'Content'),
  source: z.string().trim().max(300, 'Source must be at most 300 characters').optional().nullable(),
  category: text(2, 80, 'Category'),
  district: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(120).optional().default(DEFAULT_STATE),
  country: z.string().trim().max(120).optional().default(DEFAULT_COUNTRY),
  platforms: platformCodes.optional().default([]),
});

const updateNewsSchema = z
  .object({
    headline: text(5, 300, 'Headline').optional(),
    summary: z.string().trim().max(1000).optional().nullable(),
    content: text(1, 100000, 'Content').optional(),
    source: z.string().trim().max(300).optional().nullable(),
    category: text(2, 80, 'Category').optional(),
    district: z.string().trim().max(120).optional().nullable(),
    state: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    platforms: platformCodes.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

const listNewsSchema = pagination.extend({
  status: z
    .union([z.enum(NEWS_STATUS_VALUES), z.array(z.enum(NEWS_STATUS_VALUES))])
    .optional(),
  category: z.string().trim().max(80).optional(),
  district: z.string().trim().max(120).optional(),
  createdBy: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(200).optional(),
  dateFrom: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  dateTo: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'headline', 'status', 'id']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  mine: z.enum(['true', 'false']).optional(),
});

/** multipart/form-data fields that accompany an upload. */
const uploadMetaSchema = z.object({
  mediaType: z.enum(MEDIA_TYPE_VALUES, 'Unknown media type'),
  width: z.coerce.number().int().positive().max(100000).optional(),
  height: z.coerce.number().int().positive().max(100000).optional(),
  durationSeconds: z.coerce.number().positive().max(86400).optional(),
});

const reorderMediaSchema = z.object({
  order: z.array(z.coerce.number().int().positive()).min(1, 'Provide the media ids in the new order'),
});

const platformContentSchema = z.object({
  platform: z.string().trim().toLowerCase().min(1).max(40),
  content: z.record(z.string(), z.any()).nullable(),
});

module.exports = {
  createNewsSchema,
  updateNewsSchema,
  listNewsSchema,
  uploadMetaSchema,
  reorderMediaSchema,
  platformContentSchema,
};
