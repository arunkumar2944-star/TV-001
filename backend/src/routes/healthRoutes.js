'use strict';

const express = require('express');
const db = require('../database');
const storage = require('../services/storage');
const n8nService = require('../services/n8nService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/health
 * Public, unauthenticated liveness probe for the reverse proxy / Docker.
 * Reports the shape the specification asks for and nothing sensitive.
 */
router.get('/', async (req, res) => {
  let database = 'down';
  try {
    database = (await db.checkConnection()) ? 'up' : 'down';
  } catch (error) {
    logger.error('Health check could not reach the database', { error: error.message });
  }

  const healthy = database === 'up';

  return res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'ok' : 'degraded',
    checks: {
      database,
      storage: storage.currentDriverName(),
      n8nWebhookConfigured: n8nService.isConfigured(),
    },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
