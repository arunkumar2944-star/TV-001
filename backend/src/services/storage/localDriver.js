'use strict';

/**
 * Local filesystem storage driver.
 *
 * This is the default for the private office server: originals stay on Trichy
 * Vision hardware and PostgreSQL only holds the storage key and metadata.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { config } = require('../../config/env');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..');

function rootDir() {
  return path.isAbsolute(config.storage.localDir)
    ? config.storage.localDir
    : path.resolve(BACKEND_ROOT, config.storage.localDir);
}

/** Resolves a storage key to an absolute path, refusing to escape the root. */
function resolveKey(key) {
  const normalised = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalised || normalised.includes('..') || normalised.includes('\0')) {
    throw new Error('Invalid storage key');
  }
  const root = rootDir();
  const target = path.resolve(root, normalised);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Storage key escapes the storage root');
  }
  return target;
}

async function ensureDir(filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

/** Moves an uploaded temp file into permanent storage. */
async function put({ sourcePath, key }) {
  const target = resolveKey(key);
  await ensureDir(target);
  try {
    await fsp.rename(sourcePath, target);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    // Different volume (e.g. temp dir on another disk) - copy then remove.
    await fsp.copyFile(sourcePath, target);
    await fsp.unlink(sourcePath);
  }
  const stats = await fsp.stat(target);
  return { key, driver: 'local', size: stats.size };
}

async function putBuffer({ buffer, key }) {
  const target = resolveKey(key);
  await ensureDir(target);
  await fsp.writeFile(target, buffer);
  return { key, driver: 'local', size: buffer.length };
}

async function stat(key) {
  try {
    const stats = await fsp.stat(resolveKey(key));
    return { exists: true, size: stats.size, lastModified: stats.mtime };
  } catch {
    return { exists: false, size: 0, lastModified: null };
  }
}

function createReadStream(key, range) {
  const target = resolveKey(key);
  if (range && Number.isFinite(range.start)) {
    return fs.createReadStream(target, { start: range.start, end: range.end });
  }
  return fs.createReadStream(target);
}

async function readHead(key, bytes = 32) {
  const target = resolveKey(key);
  const handle = await fsp.open(target, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function remove(key) {
  try {
    await fsp.unlink(resolveKey(key));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Local files are streamed through the authenticated API, not a public URL. */
async function getDownloadUrl() {
  return null;
}

async function init() {
  await fsp.mkdir(rootDir(), { recursive: true });
}

module.exports = {
  name: 'local',
  init,
  put,
  putBuffer,
  stat,
  createReadStream,
  readHead,
  remove,
  getDownloadUrl,
  resolveKey,
  rootDir,
};
