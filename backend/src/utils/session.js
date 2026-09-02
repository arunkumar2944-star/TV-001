'use strict';

/**
 * Regenerate the Express session.
 *
 * Used after successful authentication
 * to prevent session fixation and to make
 * sure another user's active client cannot
 * carry into the new login.
 */
function regenerateSession(req) {
  return new Promise(
    (resolve, reject) => {
      req.session.regenerate(
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        }
      );
    }
  );
}


/**
 * Explicitly persist the current session.
 *
 * Most requests do not need this because
 * express-session saves automatically.
 *
 * Use it only when the next operation
 * depends on the session already being
 * persisted, for example before an OAuth
 * redirect.
 */
function saveSession(req) {
  return new Promise(
    (resolve, reject) => {
      req.session.save(
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        }
      );
    }
  );
}


/**
 * Destroy the current session.
 *
 * The persistent store will delete the
 * corresponding app_sessions row.
 */
function destroySession(req) {
  return new Promise(
    (resolve, reject) => {
      if (!req.session) {
        resolve();
        return;
      }

      req.session.destroy(
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        }
      );
    }
  );
}


module.exports = {
  regenerateSession,
  saveSession,
  destroySession,
};