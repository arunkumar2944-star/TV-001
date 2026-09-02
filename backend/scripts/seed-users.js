'use strict';

/**
 * Legacy command retained for compatibility.
 * The multi-tenant model bootstraps exactly one PLATFORM_ADMIN; client users are
 * created only after a client exists. This script therefore creates the first
 * platform administrator only when none exists.
 */

const crypto = require('crypto');
const db = require('../src/database');
const userService = require('../src/services/userService');
const { config } = require('../src/config/env');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const SPECIALS = '!@#$%^&*-_=+';

function generatePassword() {
  const bytes = crypto.randomBytes(32);
  let password = '';
  for (let index = 0; index < 15; index += 1) {
    password += ALPHABET[bytes[index] % ALPHABET.length];
  }
  password += SPECIALS[bytes[31] % SPECIALS.length];
  return `Tv${password}9`;
}

async function main() {
  if (!config.database.url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
    process.exitCode = 1;
    return;
  }

  const count = await userService.countPlatformAdmins();
  if (count > 0) {
    console.log('Platform administrator already exists - nothing to seed.');
    return;
  }

  const password = process.env.SEED_PLATFORM_ADMIN_PASSWORD || generatePassword();
  const generated = !process.env.SEED_PLATFORM_ADMIN_PASSWORD;
  const user = await userService.createPlatformAdmin({
    username: process.env.SEED_PLATFORM_ADMIN_USERNAME || 'platformadmin',
    fullName: process.env.SEED_PLATFORM_ADMIN_NAME || 'Platform Administrator',
    email: process.env.SEED_PLATFORM_ADMIN_EMAIL || 'admin@trichyvision.local',
    password,
  });

  console.log(`Created PLATFORM_ADMIN ${user.email} (user_id ${user.user_id}).`);
  if (generated) {
    console.log(`Generated password (shown once): ${password}`);
  }
}

main()
  .catch((error) => {
    console.error(`Seeding platform admin failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.closePool().catch(() => {}));
