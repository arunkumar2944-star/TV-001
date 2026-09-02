'use strict';

const { config, validate } = require('./config/env');
const { createApp } = require('./app');
const db = require('./database');
const storage = require('./services/storage');

async function start() {
  const { fatal } = validate();

  if (fatal.length > 0) {
    fatal.forEach((problem) => {
      console.error(`Configuration error: ${problem}`);
    });
    process.exit(1);
  }

  // Storage
  await storage.init();
  console.log('Storage ready');

  // Database
  try {
    await db.checkConnection();
    console.log('Database ready');
  } catch {
    console.error('Database connection failed');
    process.exit(1);
  }

  // Server
  const app = createApp();

  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
}

start();