'use strict';

/**
 * Upload safety.
 *
 * A file is accepted only when its media role, declared MIME type, extension
 * AND magic bytes all agree. Executables, scripts and SVG (which can carry
 * JavaScript) are rejected outright.
 */

const path = require('path');
const { MEDIA_TYPE } = require('../config/constants');

const IMAGE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
};

const VIDEO_TYPES = {
  'video/mp4': ['.mp4', '.m4v'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
  'video/x-matroska': ['.mkv'],
};

const AUDIO_TYPES = {
  'audio/mpeg': ['.mp3'],
  'audio/mp4': ['.m4a'],
  'audio/aac': ['.aac'],
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/ogg': ['.ogg', '.oga'],
  'audio/webm': ['.weba'],
};

/** Which MIME groups each media role accepts. */
const ROLE_TYPES = {
  [MEDIA_TYPE.MAIN_IMAGE]: IMAGE_TYPES,
  [MEDIA_TYPE.NEWS_POSTER]: IMAGE_TYPES,
  [MEDIA_TYPE.AD_POSTER]: IMAGE_TYPES,
  [MEDIA_TYPE.IMAGE]: IMAGE_TYPES,
  [MEDIA_TYPE.VIDEO]: VIDEO_TYPES,
  [MEDIA_TYPE.AUDIO]: AUDIO_TYPES,
};

const ALL_TYPES = { ...IMAGE_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES };

/** Never accepted, whatever the client claims the MIME type is. */
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.com', '.bat', '.cmd', '.msi', '.scr', '.ps1', '.vbs', '.jar',
  '.sh', '.bash', '.zsh', '.py', '.rb', '.pl', '.php', '.asp', '.aspx', '.jsp',
  '.js', '.mjs', '.cjs', '.html', '.htm', '.xhtml', '.svg', '.swf', '.apk',
  '.deb', '.rpm', '.app', '.dmg', '.lnk', '.reg', '.hta', '.wsf', '.pif',
]);

/** Leading magic bytes we can check without decoding the whole file. */
const SIGNATURES = [
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { mime: 'video/mp4', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  { mime: 'video/quicktime', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  { mime: 'audio/mp4', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  { mime: 'video/webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: 'video/x-matroska', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: 'audio/webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: 'audio/mpeg', offset: 0, bytes: [0x49, 0x44, 0x33] },
  { mime: 'audio/mpeg', offset: 0, bytes: [0xff, 0xfb] },
  { mime: 'audio/mpeg', offset: 0, bytes: [0xff, 0xf3] },
  { mime: 'audio/mpeg', offset: 0, bytes: [0xff, 0xf2] },
  { mime: 'audio/wav', offset: 8, bytes: [0x57, 0x41, 0x56, 0x45] },
  { mime: 'audio/x-wav', offset: 8, bytes: [0x57, 0x41, 0x56, 0x45] },
  { mime: 'audio/ogg', offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] },
  { mime: 'audio/aac', offset: 0, bytes: [0xff, 0xf1] },
  { mime: 'audio/aac', offset: 0, bytes: [0xff, 0xf9] },
];

function normaliseMime(mimeType) {
  return String(mimeType || '').split(';')[0].trim().toLowerCase();
}

function extensionOf(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

/**
 * Removes any directory component and unsafe characters from a client supplied
 * filename. The result is only used for display and for choosing an extension.
 */
function sanitizeFilename(filename) {
  const base = path.basename(String(filename || 'file')).replace(/\\/g, '/');
  const cleaned = base
    .split('/')
    .pop()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 180);
  return cleaned || 'file';
}

/**
 * Validates the declared type of an upload (runs in the multer fileFilter,
 * before any bytes are written to disk).
 * @returns {{ok:boolean, reason?:string}}
 */
function validateDeclaredType(mediaType, originalName, mimeType) {
  const allowed = ROLE_TYPES[mediaType];
  if (!allowed) return { ok: false, reason: `Unknown media type "${mediaType}"` };

  const extension = extensionOf(originalName);
  if (BLOCKED_EXTENSIONS.has(extension)) {
    return { ok: false, reason: `Files of type ${extension} are not allowed` };
  }

  const mime = normaliseMime(mimeType);
  const extensions = allowed[mime];
  if (!extensions) {
    return { ok: false, reason: `${mime || 'This file type'} is not accepted for ${mediaType}` };
  }
  if (!extensions.includes(extension)) {
    return { ok: false, reason: `Extension ${extension || '(none)'} does not match ${mime}` };
  }
  return { ok: true };
}

/**
 * Confirms the file really is what it claims by inspecting its leading bytes.
 * @param {Buffer} header first ~32 bytes of the file
 */
function verifyMagicBytes(mimeType, header) {
  const mime = normaliseMime(mimeType);
  const candidates = SIGNATURES.filter((signature) => signature.mime === mime);
  // Formats we cannot fingerprint cheaply are accepted on extension + MIME.
  if (candidates.length === 0) return { ok: true };
  if (!header || header.length < 4) return { ok: false, reason: 'File is empty or truncated' };

  const matches = candidates.some((signature) =>
    signature.bytes.every((byte, index) => header[signature.offset + index] === byte)
  );

  return matches
    ? { ok: true }
    : { ok: false, reason: `File content does not look like ${mime}` };
}

function preferredExtension(mimeType, originalName) {
  const fromName = extensionOf(originalName);
  if (fromName && !BLOCKED_EXTENSIONS.has(fromName)) return fromName;
  const list = ALL_TYPES[normaliseMime(mimeType)];
  return list ? list[0] : '';
}

function isImage(mimeType) {
  return Boolean(IMAGE_TYPES[normaliseMime(mimeType)]);
}

module.exports = {
  IMAGE_TYPES,
  VIDEO_TYPES,
  AUDIO_TYPES,
  ROLE_TYPES,
  BLOCKED_EXTENSIONS,
  normaliseMime,
  extensionOf,
  sanitizeFilename,
  validateDeclaredType,
  verifyMagicBytes,
  preferredExtension,
  isImage,
};
