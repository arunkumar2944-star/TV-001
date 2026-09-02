'use strict';

/**
 * Prints a bcrypt hash for a password supplied on stdin.
 *
 * Useful for an emergency manual password reset directly in SQL. The password
 * is read from stdin (never argv) so it does not end up in the shell history.
 *
 *   node scripts/hash-password.js
 *   <type the password, press Ctrl+D / Ctrl+Z>
 */

const passwordService = require('../src/services/passwordService');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  if (process.stdin.isTTY) {
    console.log('Type the password, then press Ctrl+D (Linux/macOS) or Ctrl+Z then Enter (Windows):');
  }
  const password = await readStdin();

  if (!password) {
    console.error('No password supplied.');
    process.exitCode = 1;
    return;
  }

  const problems = passwordService.validateStrength(password);
  if (problems.length > 0) {
    console.error('Password does not meet the policy:');
    problems.forEach((problem) => console.error(`  - ${problem}`));
    process.exitCode = 1;
    return;
  }

  const hash = await passwordService.hash(password);
  console.log('\nbcrypt hash (store this in client_users.password_hash):\n');
  console.log(hash);
  console.log('\nExample:');
  console.log("  UPDATE client_users SET password_hash = '<hash>' WHERE email = 'someone@trichyvision.local';\n");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
