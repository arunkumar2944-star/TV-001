'use strict';

/**
 * Upload middleware (multer, disk based).
 *
 * Files are streamed to a temp directory - never buffered in memory - so a
 * 200 MB video does not blow up the API process. mediaService then verifies the
 * bytes and moves the file into the storage layer.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { config } = require('../config/env');
const fileTypes = require('../utils/fileTypes');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

function tempDir() {
  const configured = path.isAbsolute(config.storage.localDir)
    ? path.join(config.storage.localDir, '.tmp')
    : path.resolve(BACKEND_ROOT, config.storage.localDir, '.tmp');
  try {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  } catch {
    // Fall back to the OS temp directory if the storage path is not writable.
    const fallback = path.join(os.tmpdir(), 'trichy-vision-uploads');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      cb(null, tempDir());
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const extension = fileTypes.extensionOf(file.originalname);
    const safeExtension = /^\.[a-z0-9]{1,8}$/i.test(extension) ? extension.toLowerCase() : '';
    cb(null, `${Date.now()}-${crypto.randomBytes(10).toString('hex')}${safeExtension}`);
  },
});

const ALL_ALLOWED_MIME = new Set([
  ...Object.keys(fileTypes.IMAGE_TYPES),
  ...Object.keys(fileTypes.VIDEO_TYPES),
  ...Object.keys(fileTypes.AUDIO_TYPES),
]);

/**
 * First line of defence - runs before any byte is written.
 * mediaService performs the authoritative check (role + extension + magic bytes)
 * because multipart fields are not guaranteed to arrive before the file.
 */
function fileFilter(req, file, cb) {
  const extension = fileTypes.extensionOf(file.originalname);
  if (fileTypes.BLOCKED_EXTENSIONS.has(extension)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `${extension} files are not allowed`));
  }
  const mime = fileTypes.normaliseMime(file.mimetype);
  if (!ALL_ALLOWED_MIME.has(mime)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `${mime || 'unknown type'} is not accepted`));
  }
  const declaredType = req.body && req.body.mediaType;
  if (declaredType) {
    const check = fileTypes.validateDeclaredType(String(declaredType).toUpperCase(), file.originalname, mime);
    if (!check.ok) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', check.reason));
  }
  return cb(null, true);
}

function createUploader() {
  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: config.storage.maxUploadSizeMb * 1024 * 1024,
      files: config.storage.maxUploadFiles,
      fields: 20,
      fieldSize: 64 * 1024,
    },
  });
}

const uploader = createUploader();

/** Accepts `files` (repeatable) and, for convenience, a single `file` field. */
const mediaUpload = uploader.fields([
  { name: 'files', maxCount: config.storage.maxUploadFiles },
  { name: 'file', maxCount: 1 },
]);

/** Flattens multer's fields() output into one ordered array. */
function collectFiles(req) {
  if (!req.files) return [];
  if (Array.isArray(req.files)) return req.files;
  return [...(req.files.files || []), ...(req.files.file || [])];
}

module.exports = { mediaUpload, collectFiles, tempDir, createUploader };
