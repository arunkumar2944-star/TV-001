'use strict';

/**
 * Storage abstraction.
 *
 * Nothing outside this folder knows where media physically lives. Switching
 * between the office server's disk and MinIO/S3 is a change of STORAGE_DRIVER,
 * not a change of application code.
 *
 * PostgreSQL only ever stores: original filename, storage key, driver, MIME
 * type, size and dimensions - never the bytes.
 */

const crypto = require('crypto');
const path = require('path');
const { config } = require('../../config/env');
const localDriver = require('./localDriver');
const s3Driver = require('./s3Driver');

const DRIVERS = { local: localDriver, s3: s3Driver };

function getDriver(name) {
  const driver = DRIVERS[name || config.storage.driver];
  if (!driver) throw new Error(`Unknown storage driver "${name || config.storage.driver}"`);
  return driver;
}

/**
 * Builds a collision-proof storage key.
 * Shape: news/<newsId>/<MEDIA_TYPE>/<timestamp>-<random><ext>
 */
function buildKey({ newsId, mediaType, extension }) {
  const safeExtension = extension && /^\.[a-z0-9]{1,8}$/i.test(extension) ? extension.toLowerCase() : '';
  const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  return path.posix.join('news', String(newsId), String(mediaType).toLowerCase(), `${unique}${safeExtension}`);
}

/** Moves a completed upload from the temp directory into permanent storage. */
async function put(options) {
  const driver = getDriver(options.driver);
  const result = await driver.put(options);
  return { ...result, driver: driver.name };
}

async function putBuffer(options) {
  const driver = getDriver(options.driver);
  const result = await driver.putBuffer(options);
  return { ...result, driver: driver.name };
}

function createReadStream(key, range, driverName) {
  return getDriver(driverName).createReadStream(key, range);
}

function stat(key, driverName) {
  return getDriver(driverName).stat(key);
}

function readHead(key, bytes, driverName) {
  return getDriver(driverName).readHead(key, bytes);
}

function remove(key, driverName) {
  return getDriver(driverName).remove(key);
}

function getDownloadUrl(key, ttlSeconds, driverName) {
  return getDriver(driverName).getDownloadUrl(key, ttlSeconds);
}

async function init() {
  await getDriver().init();
}

function currentDriverName() {
  return getDriver().name;
}

module.exports = {
  init,
  buildKey,
  put,
  putBuffer,
  createReadStream,
  stat,
  readHead,
  remove,
  getDownloadUrl,
  currentDriverName,
  getDriver,
};
