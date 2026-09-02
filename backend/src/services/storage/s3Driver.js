'use strict';

/**
 * S3-compatible storage driver (AWS S3, MinIO, Wasabi, Backblaze B2 ...).
 *
 * The AWS SDK is an OPTIONAL dependency: it is required lazily so a local-disk
 * deployment never has to install it. If STORAGE_DRIVER=s3 and the SDK is
 * missing, startup fails loudly with instructions instead of silently
 * pretending uploads worked.
 */

const fs = require('fs');
const { config } = require('../../config/env');

let client = null;
let sdk = null;
let presigner = null;

function loadSdk() {
  if (sdk) return sdk;
  try {
     
    sdk = require('@aws-sdk/client-s3');
  } catch {
    throw new Error(
      'STORAGE_DRIVER=s3 requires the optional dependency @aws-sdk/client-s3. ' +
        'Install it with:  npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner'
    );
  }
  return sdk;
}

function loadPresigner() {
  if (presigner) return presigner;
  try {
     
    presigner = require('@aws-sdk/s3-request-presigner');
  } catch {
    presigner = null;
  }
  return presigner;
}

function getClient() {
  if (client) return client;
  const { S3Client } = loadSdk();
  const options = {
    region: config.storage.s3.region,
    forcePathStyle: config.storage.s3.forcePathStyle,
  };
  if (config.storage.s3.endpoint) options.endpoint = config.storage.s3.endpoint;
  if (config.storage.s3.accessKeyId && config.storage.s3.secretAccessKey) {
    options.credentials = {
      accessKeyId: config.storage.s3.accessKeyId,
      secretAccessKey: config.storage.s3.secretAccessKey,
    };
  }
  client = new S3Client(options);
  return client;
}

function bucket() {
  if (!config.storage.s3.bucket) throw new Error('S3_BUCKET is not configured');
  return config.storage.s3.bucket;
}

async function put({ sourcePath, key, mimeType }) {
  const { PutObjectCommand } = loadSdk();
  const stats = await fs.promises.stat(sourcePath);
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: fs.createReadStream(sourcePath),
      ContentType: mimeType,
      ContentLength: stats.size,
    })
  );
  await fs.promises.unlink(sourcePath).catch(() => {});
  return { key, driver: 's3', size: stats.size };
}

async function putBuffer({ buffer, key, mimeType }) {
  const { PutObjectCommand } = loadSdk();
  await getClient().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: buffer, ContentType: mimeType })
  );
  return { key, driver: 's3', size: buffer.length };
}

async function stat(key) {
  const { HeadObjectCommand } = loadSdk();
  try {
    const result = await getClient().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { exists: true, size: result.ContentLength, lastModified: result.LastModified };
  } catch {
    return { exists: false, size: 0, lastModified: null };
  }
}

/** Returns a Node readable stream for the object (optionally a byte range). */
async function createReadStream(key, range) {
  const { GetObjectCommand } = loadSdk();
  const params = { Bucket: bucket(), Key: key };
  if (range && Number.isFinite(range.start)) {
    params.Range = `bytes=${range.start}-${Number.isFinite(range.end) ? range.end : ''}`;
  }
  const result = await getClient().send(new GetObjectCommand(params));
  return result.Body;
}

async function readHead(key, bytes = 32) {
  const stream = await createReadStream(key, { start: 0, end: bytes - 1 });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function remove(key) {
  const { DeleteObjectCommand } = loadSdk();
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  return true;
}

/** Short-lived signed URL so n8n can fetch media without our session cookie. */
async function getDownloadUrl(key, ttlSeconds) {
  const helper = loadPresigner();
  if (!helper) return null;
  const { GetObjectCommand } = loadSdk();
  return helper.getSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: ttlSeconds || config.storage.s3.signedUrlTtl,
  });
}

async function init() {
  loadSdk();
  bucket();
}

module.exports = {
  name: 's3',
  init,
  put,
  putBuffer,
  stat,
  createReadStream,
  readHead,
  remove,
  getDownloadUrl,
};
