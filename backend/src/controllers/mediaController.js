'use strict';

const mediaService = require('../services/mediaService');
const storage = require('../services/storage');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { ok, created } = require('../utils/respond');
const { collectFiles } = require('../middleware/upload');
const { uploadMetaSchema } = require('../validators/newsValidators');
const { runSchema } = require('../middleware/validate');

async function uploadMedia(req, res) {
  const files = collectFiles(req);
  if (files.length === 0) {
    throw ApiError.badRequest('No file was uploaded');
  }

  let meta;
  try {
    meta = runSchema(uploadMetaSchema, req.body, 'upload');
  } catch (error) {
    // Validation failed after multer already wrote the temp files.
    await Promise.all(files.map((file) => mediaService.discardTempFile(file.path)));
    throw error;
  }

  const saved = await mediaService.storeUploads({
    newsId: req.validatedParams.id,
    files,
    mediaTypes: meta.mediaType,
    actor: req.user,
    hints: { width: meta.width, height: meta.height, durationSeconds: meta.durationSeconds },
  });

  return created(res, saved);
}

async function listMedia(req, res) {
  const media = await mediaService.listForNews(req.validatedParams.id);
  return ok(res, media);
}

async function deleteMedia(req, res) {
  const result = await mediaService.remove(req.validatedParams.id, req.user);
  return ok(res, result);
}

async function reorderMedia(req, res) {
  const media = await mediaService.reorder(req.validatedParams.id, req.body.order, req.user);
  return ok(res, media);
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  let start = rawStart === '' ? null : Number.parseInt(rawStart, 10);
  let end = rawEnd === '' ? null : Number.parseInt(rawEnd, 10);

  if (start === null && end === null) return null;
  if (start === null) {
    start = Math.max(size - end, 0);
    end = size - 1;
  } else if (end === null || end >= size) {
    end = size - 1;
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return { invalid: true };
  return { start, end };
}

/**
 * Streams a media file to an authenticated staff member.
 * Range requests are honoured so video and audio can be scrubbed in the browser.
 */
async function streamStoredMedia(req, res, disposition = 'inline') {
  const media = await mediaService.findById(req.validatedParams.id);
  if (!media) throw ApiError.notFound('Media not found');

  const info = await storage.stat(media.storage_key, media.storage_driver);
  if (!info.exists) {
    logger.error('Media row has no file in storage', { mediaId: media.id, key: media.storage_key });
    throw ApiError.notFound('The stored file is missing');
  }

  const size = info.size || media.file_size || 0;
  res.setHeader('Content-Type', media.mime_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${encodeURIComponent(media.original_filename || `media-${media.id}`)}"`
  );

  const range = req.get('range') ? parseRange(req.get('range'), size) : null;

  if (range && range.invalid) {
    res.setHeader('Content-Range', `bytes */${size}`);
    return res.status(416).end();
  }

  let stream;
  if (range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader('Content-Length', range.end - range.start + 1);
    stream = await storage.createReadStream(media.storage_key, range, media.storage_driver);
  } else {
    if (size) res.setHeader('Content-Length', size);
    stream = await storage.createReadStream(media.storage_key, null, media.storage_driver);
  }

  stream.on('error', (error) => {
    logger.error('Media stream failed', { mediaId: media.id, error: error.message });
    if (!res.headersSent) res.status(500).json({ success: false, message: 'The file could not be read' });
    else res.destroy(error);
  });

  return stream.pipe(res);
}

async function streamMedia(req, res) {
  return streamStoredMedia(req, res, 'inline');
}

async function downloadMedia(req, res) {
  return streamStoredMedia(req, res, 'attachment');
}

module.exports = {
  uploadMedia,
  listMedia,
  deleteMedia,
  reorderMedia,
  streamMedia,
  downloadMedia,
};
