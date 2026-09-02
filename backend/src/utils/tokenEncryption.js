'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

const IV_LENGTH = 12;
const KEY_LENGTH = 32;


/**
 * ======================================================
 * GET ENCRYPTION KEY
 * ======================================================
 *
 * TOKEN_ENCRYPTION_KEY must be:
 *
 * 32 bytes
 * =
 * 64 hexadecimal characters
 *
 * Example generation:
 *
 * node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function getEncryptionKey() {
  const keyHex =
    process.env
      .TOKEN_ENCRYPTION_KEY
      ?.trim();

  if (!keyHex) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY environment variable is required'
    );
  }

  /**
   * Validate HEX before Buffer.from().
   *
   * Buffer.from(value, 'hex') can behave
   * unexpectedly with malformed hex strings.
   */
  if (
    !/^[a-fA-F0-9]{64}$/.test(
      keyHex
    )
  ) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters'
    );
  }

  const key =
    Buffer.from(
      keyHex,
      'hex'
    );

  if (
    key.length !==
    KEY_LENGTH
  ) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes'
    );
  }

  return key;
}


/**
 * ======================================================
 * ENCRYPT TOKEN
 * ======================================================
 *
 * Returns:
 *
 * {
 *   encryptedToken: "...",
 *   iv: "...",
 *   authTag: "..."
 * }
 *
 * All values are stored as HEX strings.
 */
function encryptToken(token) {
  if (
    typeof token !== 'string' ||
    !token.trim()
  ) {
    throw new Error(
      'Token is required for encryption'
    );
  }

  const key =
    getEncryptionKey();

  /**
   * Recommended IV length for AES-GCM:
   * 12 bytes / 96 bits.
   */
  const iv =
    crypto.randomBytes(
      IV_LENGTH
    );

  const cipher =
    crypto.createCipheriv(
      ALGORITHM,
      key,
      iv
    );

  const encryptedBuffer =
    Buffer.concat([
      cipher.update(
        token,
        'utf8'
      ),

      cipher.final(),
    ]);

  const authTag =
    cipher.getAuthTag();

  return {
    encryptedToken:
      encryptedBuffer
        .toString('hex'),

    iv:
      iv.toString('hex'),

    authTag:
      authTag.toString('hex'),
  };
}


/**
 * ======================================================
 * DECRYPT TOKEN
 * ======================================================
 */
function decryptToken({
  encryptedToken,
  iv,
  authTag,
}) {
  if (
    !encryptedToken ||
    !iv ||
    !authTag
  ) {
    throw new Error(
      'encryptedToken, iv and authTag are required for decryption'
    );
  }

  if (
    typeof encryptedToken !==
      'string' ||
    typeof iv !==
      'string' ||
    typeof authTag !==
      'string'
  ) {
    throw new Error(
      'Encrypted token values must be strings'
    );
  }

  const key =
    getEncryptionKey();

  const ivBuffer =
    Buffer.from(
      iv,
      'hex'
    );

  const authTagBuffer =
    Buffer.from(
      authTag,
      'hex'
    );

  const encryptedBuffer =
    Buffer.from(
      encryptedToken,
      'hex'
    );

  if (
    ivBuffer.length !==
    IV_LENGTH
  ) {
    throw new Error(
      'Invalid encryption IV'
    );
  }

  const decipher =
    crypto.createDecipheriv(
      ALGORITHM,
      key,
      ivBuffer
    );

  decipher.setAuthTag(
    authTagBuffer
  );

  const decryptedBuffer =
    Buffer.concat([
      decipher.update(
        encryptedBuffer
      ),

      decipher.final(),
    ]);

  return decryptedBuffer
    .toString('utf8');
}


module.exports = {
  encryptToken,
  decryptToken,
};