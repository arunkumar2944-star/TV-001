'use strict';

/**
 * Data-access helpers.
 *
 * RULES enforced here:
 *  - every statement is parameterised ($1, $2, ...); nothing is concatenated
 *  - multi-table writes run inside withTransaction so they commit or roll back
 *    as a unit (create post + targets, approve, publish job + statuses, ...)
 */

const { getPool, closePool } = require('./pool');
const logger = require('../utils/logger');

const SLOW_QUERY_MS = 1000;

/**
 * @param {string} text parameterised SQL
 * @param {Array} params bound values
 * @param {object} [client] optional pg client (inside a transaction)
 */


async function query(text, params = [], client) {
  const executor = client || getPool();
  const startedAt = process.hrtime.bigint();
  try {
    const result = await executor.query(text, params);
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (elapsedMs > SLOW_QUERY_MS) {
      logger.warn('Slow query', { elapsedMs: Math.round(elapsedMs), sql: text.slice(0, 200) });
    }
    return result;
  } catch (error) {
    logger.error('Query failed', {
      sql: text.slice(0, 400),
      code: error.code,
      detail: error.detail,
      message: error.message,
    });
    throw error;
  }
}

/** Convenience: first row or null. */
async function queryOne(text, params = [], client) {
  const result = await query(text, params, client);
  return result.rows[0] || null;
}

/** Convenience: all rows. */
async function queryAll(text, params = [], client) {
  const result = await query(text, params, client);
  return result.rows;
}

/**
 * Runs `handler` inside a transaction. The handler receives a dedicated client;
 * pass it to query()/queryOne() so every statement joins the same transaction.
 */
async function withTransaction(handler) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Rollback failed', { error: rollbackError.message });
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Used by GET /api/health. */
async function checkConnection() {
  const result = await query('SELECT 1 AS ok');
  return result.rows[0].ok === 1;
}

/** True when a relation (table or view) exists in the current schema search path. */
async function relationExists(name) {
  const result = await query('SELECT to_regclass($1) AS oid', [name]);
  return Boolean(result.rows[0] && result.rows[0].oid);
}

module.exports = {
  query,
  queryOne,
  queryAll,
  withTransaction,
  checkConnection,
  relationExists,
  getPool,
  closePool,
};
