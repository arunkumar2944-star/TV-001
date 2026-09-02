'use strict';

/**
 * Single pg connection Pool for the whole API.
 *
 * The database is the EXISTING Supabase PostgreSQL instance - this module never
 * creates, drops or migrates anything. Credentials come from DATABASE_URL only.
 */

const fs = require('fs');
const { Pool, types } = require('pg');
const { config } = require('../config/env');
const logger = require('../utils/logger');

// BIGINT (int8, oid 20) arrives as a string by default because a 64-bit integer
// does not fit in a JS number. Our id space is far below Number.MAX_SAFE_INTEGER,
// and the frontend expects numeric ids, so parse it.
types.setTypeParser(20, (value) => (value === null ? null : Number.parseInt(value, 10)));
// NUMERIC (oid 1700) -> float, used for media duration.
types.setTypeParser(1700, (value) => (value === null ? null : Number.parseFloat(value)));

function buildSslOption() {
  if (!config.database.ssl) return false;
  if (config.database.caCertPath) {
    try {
      return {
        ca: fs.readFileSync(config.database.caCertPath, 'utf8'),
        rejectUnauthorized: true,
      };
    } catch (error) {
      logger.error('Could not read DATABASE_CA_CERT, falling back to permissive TLS', {
        path: config.database.caCertPath,
        error: error.message,
      });
    }
  }
  // Supabase terminates TLS with a chain Node does not bundle. Connections stay
  // encrypted; certificate pinning is available via DATABASE_CA_CERT above.
  return { rejectUnauthorized: config.database.sslRejectUnauthorized };
}

let pool = null;

function getPool() {
  if (pool) return pool;

  if (!config.database.url) {
    throw new Error('DATABASE_URL is not configured');
  }

  pool = new Pool({
    connectionString: config.database.url,
    ssl: buildSslOption(),
    max: config.database.poolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: config.database.statementTimeoutMs,
    application_name: 'trichy-vision-api',
  });

  pool.on('error', (error) => {
    // An idle client blew up (network drop, Supabase restart). pg removes it
    // from the pool automatically; we only need to avoid crashing the process.
    logger.error('Idle PostgreSQL client error', { error: error.message });
  });

  return pool;
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

module.exports = { getPool, closePool };
