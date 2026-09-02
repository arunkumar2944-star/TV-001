'use strict';

/**
 * Media handling.
 *
 * PostgreSQL stores metadata only - original filename, storage key, driver,
 * MIME type, size, dimensions and duration. The bytes go to the storage layer
 * (office disk today, MinIO/S3 later) and stay on Trichy Vision infrastructure.
 */

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const db = require('../database');
const ApiError = require('../utils/ApiError');
const storage = require('./storage');
const auditService = require('./auditService');
const logger = require('../utils/logger');
const fileTypes = require('../utils/fileTypes');
const imageDimensions = require('../utils/imageDimensions');
const {
  MEDIA_TYPE_VALUES,
  SINGLETON_MEDIA_TYPES,
  EDITABLE_STATUSES,
  ROLES,
  AUDIT_STAGE,
  AUDIT_STATUS,
} = require('../config/constants');

const HEADER_BYTES = 64 * 1024; // enough for image headers and magic bytes

async function readHeader(filePath) {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function discardTempFile(filePath) {
  if (!filePath) return;
  await fsp.unlink(filePath).catch(() => {});
}

/** A post only accepts media while it is still editable. */
async function assertPostAcceptsMedia(newsId, client) {
  const news = await db.queryOne('SELECT id, status, created_by, headline FROM news WHERE id = $1', [newsId], client);
  if (!news) throw ApiError.notFound('News post not found');
  if (!EDITABLE_STATUSES.includes(news.status)) {
    throw ApiError.conflict(`Media cannot be changed while the post is ${news.status}`);
  }
  return news;
}

/**
 * Stores one uploaded file.
 * @param {object} file multer file (disk storage - `path` points at the temp file)
 */
async function storeUpload({ newsId, file, mediaType, actor, hints = {} }) {
  const type = String(mediaType || '').toUpperCase();
  if (!MEDIA_TYPE_VALUES.includes(type)) {
    await discardTempFile(file.path);
    throw ApiError.badRequest(`Unknown media type "${mediaType}"`);
  }

  const declared = fileTypes.validateDeclaredType(type, file.originalname, file.mimetype);
  if (!declared.ok) {
    await discardTempFile(file.path);
    throw ApiError.badRequest(declared.reason);
  }

  const header = await readHeader(file.path);
  const magic = fileTypes.verifyMagicBytes(file.mimetype, header);
  if (!magic.ok) {
    await discardTempFile(file.path);
    throw ApiError.badRequest(magic.reason);
  }

  if (!file.size || file.size <= 0) {
    await discardTempFile(file.path);
    throw ApiError.badRequest('The uploaded file is empty');
  }

  const dimensions = fileTypes.isImage(file.mimetype) ? imageDimensions.read(header) : null;
  const checksum = await sha256(file.path);
  const originalFilename = fileTypes.sanitizeFilename(file.originalname);
  const extension = fileTypes.preferredExtension(file.mimetype, originalFilename);
  const key = storage.buildKey({ newsId, mediaType: type, extension });

  let stored;
  try {
    stored = await storage.put({ sourcePath: file.path, key, mimeType: file.mimetype });
  } catch (error) {
    await discardTempFile(file.path);
    logger.error('Storage write failed', { key, error: error.message });
    throw ApiError.internal('The file could not be saved to storage');
  }

  try {
    return await db.withTransaction(async (client) => {
      await assertPostAcceptsMedia(newsId, client);

      // Only one main image / news poster / advertisement poster per post -
      // uploading a replacement retires the previous one.
      let replaced = [];
      if (SINGLETON_MEDIA_TYPES.includes(type)) {
        replaced = await db.queryAll(
          'DELETE FROM news_media WHERE news_id = $1 AND media_type = $2 RETURNING id, storage_key, storage_driver',
          [newsId, type],
          client
        );
      }

      const sortRow = await db.queryOne(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM news_media WHERE news_id = $1',
        [newsId],
        client
      );

      const row = await db.queryOne(
        `INSERT INTO news_media (
           news_id, media_type, original_filename, storage_key, storage_driver,
           mime_type, file_size, width, height, duration_seconds, checksum,
           sort_order, uploaded_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          newsId,
          type,
          originalFilename,
          stored.key,
          stored.driver,
          fileTypes.normaliseMime(file.mimetype),
          stored.size ?? file.size,
          dimensions ? dimensions.width : toIntOrNull(hints.width),
          dimensions ? dimensions.height : toIntOrNull(hints.height),
          toFloatOrNull(hints.durationSeconds),
          checksum,
          sortRow ? sortRow.next : 0,
          actor.id,
        ],
        client
      );

      await auditService.record(
        {
          newsId,
          actorUserId: actor.id,
          stage: AUDIT_STAGE.UPLOAD_MEDIA,
          status: AUDIT_STATUS.SUCCESS,
          message: `${type} uploaded: ${originalFilename}`,
          metadata: { mediaId: row.id, size: row.file_size, mime: row.mime_type },
        },
        client
      );

      return { row, replaced };
    });
  } catch (error) {
    // The database rejected the upload - do not leave an orphan in storage.
    await storage.remove(key, stored.driver).catch(() => {});
    throw error;
  }
}

function toIntOrNull(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toFloatOrNull(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(3)) : null;
}

/** Uploads several files, cleaning up storage for the ones that fail. */
async function storeUploads({ newsId, files, mediaTypes, actor, hints }) {
  const saved = [];
  const removedKeys = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const mediaType = Array.isArray(mediaTypes) ? mediaTypes[index] || mediaTypes[0] : mediaTypes;

    const result = await storeUpload({ newsId, file, mediaType, actor, hints });
    saved.push(result.row);
    removedKeys.push(...result.replaced);
  }

  for (const old of removedKeys) {
    await storage.remove(old.storage_key, old.storage_driver).catch((error) => {
      logger.error('Replaced media file could not be deleted', { key: old.storage_key, error: error.message });
    });
  }

  return saved;
}

async function findById(mediaId) {
  return db.queryOne(
    `SELECT m.*, n.status AS news_status, n.created_by AS news_created_by, n.headline
       FROM news_media m
       JOIN news n ON n.id = m.news_id
      WHERE m.id = $1`,
    [mediaId]
  );
}

async function listForNews(newsId) {
  const news = await db.queryOne('SELECT id FROM news WHERE id = $1', [newsId]);
  if (!news) throw ApiError.notFound('News post not found');
  return db.queryAll(
    `SELECT id, news_id, media_type, original_filename, storage_key, storage_driver,
            mime_type, file_size, width, height, duration_seconds, sort_order,
            uploaded_by, created_at
       FROM news_media
      WHERE news_id = $1
      ORDER BY sort_order ASC, id ASC`,
    [newsId]
  );
}

async function remove(mediaId, actor) {
  const media = await findById(mediaId);
  if (!media) throw ApiError.notFound('Media not found');

  if (!EDITABLE_STATUSES.includes(media.news_status)) {
    throw ApiError.conflict(`Media cannot be removed while the post is ${media.news_status}`);
  }
  if (actor.role !== ROLES.PLATFORM_ADMIN && media.news_created_by !== actor.id && media.uploaded_by !== actor.id) {
    throw ApiError.forbidden('Only the author or an administrator can remove this file');
  }

  await db.withTransaction(async (client) => {
    await db.query('DELETE FROM news_media WHERE id = $1', [mediaId], client);
    await auditService.record(
      {
        newsId: media.news_id,
        actorUserId: actor.id,
        stage: AUDIT_STAGE.DELETE_MEDIA,
        status: AUDIT_STATUS.SUCCESS,
        message: `${media.media_type} removed: ${media.original_filename}`,
        metadata: { mediaId },
      },
      client
    );
  });

  await storage.remove(media.storage_key, media.storage_driver).catch((error) => {
    logger.error('Media file could not be deleted from storage', {
      mediaId,
      key: media.storage_key,
      error: error.message,
    });
  });

  return { id: mediaId, deleted: true };
}

async function reorder(newsId, orderedIds, actor) {
  return db.withTransaction(async (client) => {
    await assertPostAcceptsMedia(newsId, client);
    for (let index = 0; index < orderedIds.length; index += 1) {

      await db.query('UPDATE news_media SET sort_order = $3 WHERE id = $1 AND news_id = $2', [
        orderedIds[index],
        newsId,
        index,
      ], client);
    }
    await auditService.record(
      {
        newsId,
        actorUserId: actor.id,
        stage: AUDIT_STAGE.UPDATE_POST,
        status: AUDIT_STATUS.INFO,
        message: 'Media order changed',
      },
      client
    );
    // Read back on the transaction's own client so the new order is visible.
    return db.queryAll(
      `SELECT id, news_id, media_type, original_filename, storage_key, storage_driver,
              mime_type, file_size, width, height, duration_seconds, sort_order,
              uploaded_by, created_at
         FROM news_media
        WHERE news_id = $1
        ORDER BY sort_order ASC, id ASC`,
      [newsId],
      client
    );
  });
}

module.exports = {
  storeUpload,
  storeUploads,
  findById,
  listForNews,
  remove,
  reorder,
  discardTempFile,
};
