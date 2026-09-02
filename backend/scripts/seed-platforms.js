'use strict';

/**
 * Seeds the seven publishing destinations into social_platforms.
 *
 * Safe to run repeatedly: it inserts what is missing and leaves existing rows
 * (including is_active) alone. Nothing is deleted.
 *
 *   npm run seed:platforms
 */

const db = require('../src/database');
const { PLATFORMS } = require('../src/config/constants');
const { config } = require('../src/config/env');

async function main() {
  if (!config.database.url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
    process.exitCode = 1;
    return;
  }

  const existing = await db.queryAll('SELECT id, code, name FROM social_platforms');
  const known = new Set(existing.map((row) => String(row.code).toLowerCase()));

  let inserted = 0;
  for (const platform of PLATFORMS) {
    if (known.has(platform.code)) {
      console.log(`= ${platform.name.padEnd(10)} already present`);
      continue;
    }

    await db.query(
      `INSERT INTO social_platforms (code, name, is_active, sort_order)
       VALUES ($1, $2, TRUE, $3)`,
      [platform.code, platform.name, platform.sortOrder]
    );
    inserted += 1;
    console.log(`+ ${platform.name.padEnd(10)} added`);
  }

  console.log(`\nDone. ${inserted} platform(s) inserted, ${existing.length} already existed.`);
}

main()
  .catch((error) => {
    console.error(`Seeding platforms failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.closePool().catch(() => {}));
