'use strict';

const crypto = require('crypto');
const session = require('express-session');

const {
  config,
} = require('../config/env');

const {
  getPool,
} = require('../database/pool');

const logger =
  require('../utils/logger');


/**
 * =========================================================
 * SESSION ENCRYPTION
 * =========================================================
 */

const ALGORITHM =
  'aes-256-gcm';

const IV_LENGTH =
  12;

const AUTH_TAG_LENGTH =
  16;


/**
 * Singleton store instance.
 *
 * We want one store per Node process,
 * not a new cleanup timer for every request.
 */
let storeInstance = null;


/**
 * =========================================================
 * GET ENCRYPTION KEY
 * =========================================================
 */

function getEncryptionKey() {
  const keyHex = String(
    config.sessionStore
      ?.encryptionKey || ''
  ).trim();

  if (
    !/^[a-fA-F0-9]{64}$/.test(
      keyHex
    )
  ) {
    throw new Error(
      'SESSION_ENCRYPTION_KEY ' +
      '(or TOKEN_ENCRYPTION_KEY fallback) ' +
      'must be exactly 64 hexadecimal characters'
    );
  }

  return Buffer.from(
    keyHex,
    'hex'
  );
}


/**
 * =========================================================
 * ENCRYPT SESSION
 * =========================================================
 */

function encryptSession(
  sessionData
) {
  const key =
    getEncryptionKey();

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

  const plaintext =
    JSON.stringify(
      sessionData
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        plaintext,
        'utf8'
      ),

      cipher.final(),
    ]);

  const authTag =
    cipher.getAuthTag();

  return {
    payload:
      encrypted.toString(
        'base64'
      ),

    iv:
      iv.toString(
        'hex'
      ),

    authTag:
      authTag.toString(
        'hex'
      ),
  };
}


/**
 * =========================================================
 * DECRYPT SESSION
 * =========================================================
 */

function decryptSession(
  row
) {
  const key =
    getEncryptionKey();

  const iv =
    Buffer.from(
      row.session_iv,
      'hex'
    );

  const authTag =
    Buffer.from(
      row.session_auth_tag,
      'hex'
    );

  if (
    iv.length !==
    IV_LENGTH
  ) {
    throw new Error(
      'Stored session IV is invalid'
    );
  }

  if (
    authTag.length !==
    AUTH_TAG_LENGTH
  ) {
    throw new Error(
      'Stored session auth tag is invalid'
    );
  }

  const decipher =
    crypto.createDecipheriv(
      ALGORITHM,
      key,
      iv
    );

  decipher.setAuthTag(
    authTag
  );

  const decrypted =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          row.session_payload,
          'base64'
        )
      ),

      decipher.final(),
    ]);

  return JSON.parse(
    decrypted.toString(
      'utf8'
    )
  );
}


/**
 * =========================================================
 * SESSION EXPIRY
 * =========================================================
 */

function resolveExpiry(
  sessionData
) {
  const cookie =
    sessionData?.cookie || {};

  /*
   * First preference:
   * explicit cookie expiry.
   */
  if (cookie.expires) {
    const explicitExpiry =
      new Date(
        cookie.expires
      );

    if (
      !Number.isNaN(
        explicitExpiry
          .getTime()
      )
    ) {
      return explicitExpiry;
    }
  }

  /*
   * Second preference:
   * maxAge.
   */
  const maxAge =
    Number(
      cookie.maxAge
    );

  if (
    Number.isFinite(
      maxAge
    ) &&
    maxAge > 0
  ) {
    return new Date(
      Date.now() +
      maxAge
    );
  }

  /*
   * Fallback:
   * configured session TTL.
   */
  return new Date(
    Date.now() +
    config.sessionStore.ttlMs
  );
}


/**
 * =========================================================
 * POSTGRES SESSION STORE
 * =========================================================
 */

class PostgresSessionStore
  extends session.Store {

  constructor() {
    super();

    /*
     * Periodically delete
     * expired sessions.
     */
    this.cleanupTimer =
      setInterval(
        () => {
          this
            .pruneExpiredSessions()
            .catch(
              (error) => {
                logger.warn(
                  'Expired session cleanup failed',
                  {
                    error:
                      error.message,
                  }
                );
              }
            );
        },

        config
          .sessionStore
          .cleanupIntervalMs
      );

    /*
     * Do not keep Node alive
     * only because this timer exists.
     */
    this.cleanupTimer
      .unref?.();
  }


  /**
   * -------------------------------------------------------
   * GET
   * -------------------------------------------------------
   *
   * Express calls this when a browser
   * sends an existing session cookie.
   */

  get(
    sid,
    callback
  ) {
    this
      .getSession(
        sid
      )
      .then(
        (value) =>
          callback(
            null,
            value
          )
      )
      .catch(
        (error) =>
          callback(
            error
          )
      );
  }


  async getSession(
    sid
  ) {
    const result =
      await getPool()
        .query(
          `
          SELECT
            session_payload,
            session_iv,
            session_auth_tag
          FROM app_sessions
          WHERE sid = $1
            AND expires_at > NOW()
          `,
          [
            sid,
          ]
        );

    const row =
      result.rows[0];

    /*
     * Session does not exist
     * or has expired.
     */
    if (!row) {
      return null;
    }

    try {
      return decryptSession(
        row
      );
    } catch (error) {
      /*
       * If data cannot be decrypted,
       * invalidate only this session.
       *
       * Do not crash the API.
       */
      await getPool()
        .query(
          `
          DELETE FROM app_sessions
          WHERE sid = $1
          `,
          [
            sid,
          ]
        )
        .catch(
          () => {}
        );

      logger.warn(
        'Discarded unreadable persisted session',
        {
          error:
            error.message,
        }
      );

      return null;
    }
  }


  /**
   * -------------------------------------------------------
   * SET
   * -------------------------------------------------------
   *
   * Express calls this when:
   *
   * - a session is created
   * - activeClientId changes
   * - OAuth state changes
   * - session data changes
   */

  set(
    sid,
    sessionData,
    callback = () => {}
  ) {
    this
      .setSession(
        sid,
        sessionData
      )
      .then(
        () =>
          callback(null)
      )
      .catch(
        (error) =>
          callback(error)
      );
  }


  async setSession(
    sid,
    sessionData
  ) {
    const encrypted =
      encryptSession(
        sessionData
      );

    const expiresAt =
      resolveExpiry(
        sessionData
      );

    await getPool()
      .query(
        `
        INSERT INTO app_sessions (
          sid,
          session_payload,
          session_iv,
          session_auth_tag,
          expires_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          NOW(),
          NOW()
        )

        ON CONFLICT (sid)

        DO UPDATE SET
          session_payload =
            EXCLUDED.session_payload,

          session_iv =
            EXCLUDED.session_iv,

          session_auth_tag =
            EXCLUDED.session_auth_tag,

          expires_at =
            EXCLUDED.expires_at,

          updated_at =
            NOW()
        `,
        [
          sid,
          encrypted.payload,
          encrypted.iv,
          encrypted.authTag,
          expiresAt,
        ]
      );
  }


  /**
   * -------------------------------------------------------
   * DESTROY
   * -------------------------------------------------------
   *
   * Used when logout destroys
   * the Express session.
   */

  destroy(
    sid,
    callback = () => {}
  ) {
    getPool()
      .query(
        `
        DELETE FROM app_sessions
        WHERE sid = $1
        `,
        [
          sid,
        ]
      )
      .then(
        () =>
          callback(null)
      )
      .catch(
        (error) =>
          callback(error)
      );
  }


  /**
   * -------------------------------------------------------
   * TOUCH
   * -------------------------------------------------------
   *
   * Refreshes session expiry
   * without rewriting everything.
   */

  touch(
    sid,
    sessionData,
    callback = () => {}
  ) {
    this
      .touchSession(
        sid,
        sessionData
      )
      .then(
        () =>
          callback(null)
      )
      .catch(
        (error) =>
          callback(error)
      );
  }


  async touchSession(
    sid,
    sessionData
  ) {
    const expiresAt =
      resolveExpiry(
        sessionData
      );

    const result =
      await getPool()
        .query(
          `
          UPDATE app_sessions

          SET
            expires_at = $2,
            updated_at = NOW()

          WHERE sid = $1
          `,
          [
            sid,
            expiresAt,
          ]
        );

    /*
     * If the session row does not
     * exist, recreate it.
     */
    if (
      result.rowCount === 0
    ) {
      await this.setSession(
        sid,
        sessionData
      );
    }
  }


  /**
   * -------------------------------------------------------
   * CLEANUP
   * -------------------------------------------------------
   */

  async pruneExpiredSessions() {
    await getPool()
      .query(
        `
        DELETE FROM app_sessions
        WHERE expires_at <= NOW()
        `
      );
  }


  /**
   * -------------------------------------------------------
   * CLOSE
   * -------------------------------------------------------
   */

  close() {
    if (
      this.cleanupTimer
    ) {
      clearInterval(
        this.cleanupTimer
      );

      this.cleanupTimer =
        null;
    }
  }
}


/**
 * =========================================================
 * SINGLETON
 * =========================================================
 */

function getPostgresSessionStore() {
  if (!storeInstance) {
    storeInstance =
      new PostgresSessionStore();
  }

  return storeInstance;
}


module.exports = {
  PostgresSessionStore,
  getPostgresSessionStore,
};