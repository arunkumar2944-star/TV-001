'use strict';

/**
 * Must be required FIRST by every test file: src/config/env.js reads
 * process.env at require time, so the values have to exist before it loads.
 */

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.AUTH_SECRET =
  process.env.AUTH_SECRET || 'test-secret-value-that-is-long-enough-for-the-validator-0123456789';
process.env.N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || 'test-n8n-shared-secret';
process.env.N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/unused-in-unit-tests';
process.env.DATABASE_SSL = process.env.DATABASE_SSL || 'false';
process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

module.exports = {
  hasTestDatabase: Boolean(process.env.TEST_DATABASE_URL),
};
