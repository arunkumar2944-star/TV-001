'use strict';

/**
 * Domain constants shared by services, validators and the state machine.
 * These mirror the values stored in the existing Supabase database.
 */

const ROLES = Object.freeze({
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  CLIENT_ADMIN: 'CLIENT_ADMIN',
  CONTENT_CREATOR: 'CONTENT_CREATOR',
  EDITOR: 'EDITOR',
  APPROVER: 'APPROVER',
});
const ROLE_VALUES = Object.freeze(Object.values(ROLES));
const CLIENT_ROLE_VALUES = Object.freeze([
  ROLES.CLIENT_ADMIN,
  ROLES.CONTENT_CREATOR,
  ROLES.EDITOR,
  ROLES.APPROVER,
]);

const NEWS_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
  PUBLISHING: 'PUBLISHING',
  PUBLISHED: 'PUBLISHED',
  PARTIALLY_PUBLISHED: 'PARTIALLY_PUBLISHED',
  FAILED: 'FAILED',
  ARCHIVED: 'ARCHIVED',
});
const NEWS_STATUS_VALUES = Object.freeze(Object.values(NEWS_STATUS));

/**
 * Allowed news.status transitions. The API refuses anything not listed here,
 * which keeps the workflow (section 11 of the specification) enforceable at the
 * database boundary rather than in the UI.
 */
const NEWS_STATUS_TRANSITIONS = Object.freeze({
  DRAFT: ['PENDING_APPROVAL', 'ARCHIVED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'DRAFT', 'ARCHIVED'],
  REJECTED: ['DRAFT', 'PENDING_APPROVAL', 'ARCHIVED'],
  APPROVED: ['PUBLISHING', 'DRAFT', 'ARCHIVED'],
  PUBLISHING: ['PUBLISHED', 'PARTIALLY_PUBLISHED', 'FAILED'],
  PARTIALLY_PUBLISHED: ['PUBLISHING', 'PUBLISHED', 'ARCHIVED'],
  FAILED: ['PUBLISHING', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
});

/** Statuses in which the creator may still edit the post content. */
const EDITABLE_STATUSES = Object.freeze([
  NEWS_STATUS.DRAFT,
  NEWS_STATUS.REJECTED,
  NEWS_STATUS.PENDING_APPROVAL,
]);

const APPROVAL_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

const JOB_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  DISPATCHED: 'DISPATCHED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});
const JOB_STATUS_VALUES = Object.freeze(Object.values(JOB_STATUS));

/** Terminal job states - a job in one of these no longer accepts callbacks. */
const JOB_TERMINAL_STATUSES = Object.freeze([
  JOB_STATUS.COMPLETED,
  JOB_STATUS.PARTIAL,
  JOB_STATUS.FAILED,
  JOB_STATUS.CANCELLED,
]);

const PLATFORM_STATUS = Object.freeze({
  PENDING: 'PENDING',
  READY: 'READY',
  PUBLISHING: 'PUBLISHING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});
const PLATFORM_STATUS_VALUES = Object.freeze(Object.values(PLATFORM_STATUS));

const JOB_TYPE = Object.freeze({
  PUBLISH: 'PUBLISH',
  RETRY: 'RETRY',
});

const MEDIA_TYPE = Object.freeze({
  MAIN_IMAGE: 'MAIN_IMAGE',
  NEWS_POSTER: 'NEWS_POSTER',
  AD_POSTER: 'AD_POSTER',
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
});
const MEDIA_TYPE_VALUES = Object.freeze(Object.values(MEDIA_TYPE));

/** Media roles that may only exist once per news post. */
const SINGLETON_MEDIA_TYPES = Object.freeze([
  MEDIA_TYPE.MAIN_IMAGE,
  MEDIA_TYPE.NEWS_POSTER,
  MEDIA_TYPE.AD_POSTER,
]);

/**
 * The seven destinations the newsroom publishes to. `code` is the stable key
 * shared with n8n; it is what n8n receives and echoes back in its result
 * payload. No platform API logic lives in this application - n8n owns that.
 */
const PLATFORMS = Object.freeze([
  { code: 'facebook', name: 'Facebook', sortOrder: 1 },
  { code: 'instagram', name: 'Instagram', sortOrder: 2 },
  { code: 'whatsapp', name: 'WhatsApp', sortOrder: 3 },
  { code: 'youtube', name: 'YouTube', sortOrder: 4 },
  { code: 'telegram', name: 'Telegram', sortOrder: 5 },
  { code: 'x', name: 'X', sortOrder: 6 },
  { code: 'threads', name: 'Threads', sortOrder: 7 },
]);
const PLATFORM_CODES = Object.freeze(PLATFORMS.map((platform) => platform.code));

/** Audit stages recorded in news_execution_audit (specification section 41). */
const AUDIT_STAGE = Object.freeze({
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  CREATE_USER: 'CREATE_USER',
  DISABLE_USER: 'DISABLE_USER',
  ENABLE_USER: 'ENABLE_USER',
  UPDATE_USER: 'UPDATE_USER',
  CREATE_POST: 'CREATE_POST',
  UPDATE_POST: 'UPDATE_POST',
  DELETE_POST: 'DELETE_POST',
  UPLOAD_MEDIA: 'UPLOAD_MEDIA',
  DELETE_MEDIA: 'DELETE_MEDIA',
  SUBMIT_APPROVAL: 'SUBMIT_APPROVAL',
  APPROVE_POST: 'APPROVE_POST',
  REJECT_POST: 'REJECT_POST',
  PUBLISH_TRIGGER: 'PUBLISH_TRIGGER',
  PUBLISH_DISPATCH: 'PUBLISH_DISPATCH',
  PUBLISH_DISPATCH_FAILED: 'PUBLISH_DISPATCH_FAILED',
  PUBLISH_SUCCESS: 'PUBLISH_SUCCESS',
  PUBLISH_FAILED: 'PUBLISH_FAILED',
  PUBLISH_RETRY: 'PUBLISH_RETRY',
  PUBLISH_CALLBACK: 'PUBLISH_CALLBACK',
  PUBLISH_CALLBACK_DUPLICATE: 'PUBLISH_CALLBACK_DUPLICATE',
  JOB_COMPLETED: 'JOB_COMPLETED',
});

const AUDIT_STATUS = Object.freeze({
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  WARNING: 'WARNING',
});

const NEWS_CATEGORIES = Object.freeze([
  'Breaking News',
  'Local',
  'Politics',
  'Crime',
  'Education',
  'Health',
  'Sports',
  'Business',
  'Agriculture',
  'Weather',
  'Culture',
  'Entertainment',
  'Technology',
  'Obituary',
  'Advertisement',
  'Other',
]);

/** Districts covered by the newsroom - Trichy first, then nearby districts. */
const DISTRICTS = Object.freeze([
  'Tiruchirappalli',
  'Ariyalur',
  'Perambalur',
  'Karur',
  'Thanjavur',
  'Pudukkottai',
  'Namakkal',
  'Salem',
  'Dindigul',
  'Madurai',
  'Cuddalore',
  'Nagapattinam',
  'Tiruvarur',
  'Other',
]);

const DEFAULT_STATE = 'Tamil Nadu';
const DEFAULT_COUNTRY = 'India';

module.exports = {
  ROLES,
  ROLE_VALUES,
  CLIENT_ROLE_VALUES,
  NEWS_STATUS,
  NEWS_STATUS_VALUES,
  NEWS_STATUS_TRANSITIONS,
  EDITABLE_STATUSES,
  APPROVAL_STATUS,
  JOB_STATUS,
  JOB_STATUS_VALUES,
  JOB_TERMINAL_STATUSES,
  JOB_TYPE,
  PLATFORM_STATUS,
  PLATFORM_STATUS_VALUES,
  MEDIA_TYPE,
  MEDIA_TYPE_VALUES,
  SINGLETON_MEDIA_TYPES,
  PLATFORMS,
  PLATFORM_CODES,
  AUDIT_STAGE,
  AUDIT_STATUS,
  NEWS_CATEGORIES,
  DISTRICTS,
  DEFAULT_STATE,
  DEFAULT_COUNTRY,
};
