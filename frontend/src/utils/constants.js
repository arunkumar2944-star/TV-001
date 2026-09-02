/** Mirrors backend/src/config/constants.js for presentation purposes only. */

export const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  CLIENT_ADMIN: 'CLIENT_ADMIN',
  CONTENT_CREATOR: 'CONTENT_CREATOR',
  EDITOR: 'EDITOR',
  APPROVER: 'APPROVER',
};

export const NEWS_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
  PUBLISHING: 'PUBLISHING',
  PUBLISHED: 'PUBLISHED',
  PARTIALLY_PUBLISHED: 'PARTIALLY_PUBLISHED',
  FAILED: 'FAILED',
  ARCHIVED: 'ARCHIVED',
};

export const NEWS_STATUS_LIST = Object.values(NEWS_STATUS);

/** badge tone + label for each news status */
export const STATUS_META = {
  DRAFT: { tone: 'neutral', label: 'Draft' },
  PENDING_APPROVAL: { tone: 'warning', label: 'Pending approval' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  APPROVED: { tone: 'primary', label: 'Approved' },
  PUBLISHING: { tone: 'purple', label: 'Publishing' },
  PUBLISHED: { tone: 'success', label: 'Published' },
  PARTIALLY_PUBLISHED: { tone: 'orange', label: 'Partially published' },
  FAILED: { tone: 'danger', label: 'Failed' },
  ARCHIVED: { tone: 'neutral', label: 'Archived' },
};

export const PLATFORM_STATUS_META = {
  PENDING: { tone: 'warning', label: 'Pending', glyph: '○' },
  READY: { tone: 'warning', label: 'Ready', glyph: '○' },
  PUBLISHING: { tone: 'warning', label: 'Publishing', glyph: '◔' },
  PUBLISHED: { tone: 'success', label: 'Published', glyph: '✓' },
  FAILED: { tone: 'danger', label: 'Failed', glyph: '✗' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled', glyph: '—' },
};

export const JOB_STATUS_META = {
  QUEUED: { tone: 'neutral', label: 'Queued' },
  DISPATCHED: { tone: 'info', label: 'Sent to n8n' },
  IN_PROGRESS: { tone: 'purple', label: 'In progress' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  PARTIAL: { tone: 'orange', label: 'Partial' },
  FAILED: { tone: 'danger', label: 'Failed' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
};

export const MEDIA_TYPES = [
  { value: 'MAIN_IMAGE', label: 'Main image', glyph: '\u{1F5BC}', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: false },
  { value: 'NEWS_POSTER', label: 'News poster', glyph: '\u{1F4F0}', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: false },
  { value: 'AD_POSTER', label: 'Advertisement poster', glyph: '\u{1F4E2}', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: false },
  { value: 'IMAGE', label: 'Additional images', glyph: '\u{1F4F7}', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true },
  { value: 'VIDEO', label: 'Video', glyph: '\u{1F3AC}', accept: 'video/mp4,video/quicktime,video/webm,video/x-matroska', multiple: true },
  { value: 'AUDIO', label: 'Audio', glyph: '\u{1F3A7}', accept: 'audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg', multiple: true },
];

export const MEDIA_TYPE_LABEL = MEDIA_TYPES.reduce(
  (acc, item) => ({ ...acc, [item.value]: item.label }),
  {}
);

/** Display metadata for the seven destinations. */
export const PLATFORM_META = {
  facebook: { name: 'Facebook', glyph: 'f' },
  instagram: { name: 'Instagram', glyph: '◉' },
  whatsapp: { name: 'WhatsApp', glyph: '✆' },
  youtube: { name: 'YouTube', glyph: '▶' },
  telegram: { name: 'Telegram', glyph: '➤' },
  x: { name: 'X', glyph: '✕' },
  threads: { name: 'Threads', glyph: '@' },
};

export const AUDIT_STAGE_TONE = {
  LOGIN: 'info',
  LOGIN_FAILED: 'danger',
  LOGOUT: 'neutral',
  CREATE_USER: 'info',
  DISABLE_USER: 'warning',
  ENABLE_USER: 'info',
  UPDATE_USER: 'info',
  CREATE_POST: 'info',
  UPDATE_POST: 'info',
  DELETE_POST: 'danger',
  UPLOAD_MEDIA: 'neutral',
  DELETE_MEDIA: 'warning',
  SUBMIT_APPROVAL: 'warning',
  APPROVE_POST: 'success',
  REJECT_POST: 'danger',
  PUBLISH_TRIGGER: 'purple',
  PUBLISH_DISPATCH: 'purple',
  PUBLISH_DISPATCH_FAILED: 'danger',
  PUBLISH_SUCCESS: 'success',
  PUBLISH_FAILED: 'danger',
  PUBLISH_RETRY: 'orange',
  PUBLISH_CALLBACK: 'info',
  PUBLISH_CALLBACK_DUPLICATE: 'warning',
  JOB_COMPLETED: 'success',
};

export const PAGE_SIZES = [10, 20, 50, 100];
