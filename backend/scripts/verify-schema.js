'use strict';

/**
 * READ-ONLY schema check.
 *
 * Compares the live Supabase database against what the API expects and prints a
 * report. It never creates, alters, drops or truncates anything.
 *
 *   npm run verify:schema
 */

const db = require('../src/database');
const { config } = require('../src/config/env');

const EXPECTED = {
  client_users: ['user_id', 'client_id', 'username', 'full_name', 'email', 'password_hash', 'role', 'is_active', 'created_at', 'updated_at'],
  news: [
    'id', 'headline', 'summary', 'content', 'source', 'category', 'district', 'state',
    'country', 'status', 'created_by', 'updated_by', 'approved_by', 'approved_at',
    'published_at', 'created_at', 'updated_at',
  ],
  news_media: [
    'id', 'news_id', 'media_type', 'original_filename', 'storage_key', 'storage_driver',
    'mime_type', 'file_size', 'width', 'height', 'duration_seconds', 'sort_order',
    'uploaded_by', 'created_at',
  ],
  social_platforms: ['id', 'code', 'name', 'is_active', 'sort_order'],
  news_platform_targets: ['id', 'news_id', 'platform_id', 'platform_content'],
  news_approvals: [
    'id', 'news_id', 'submitted_by', 'submitted_at', 'reviewed_by', 'reviewed_at',
    'status', 'rejection_reason',
  ],
  publish_jobs: [
    'id', 'news_id', 'triggered_by', 'job_type', 'status', 'attempt_count',
    'parent_job_id', 'n8n_execution_id', 'workflow_name', 'error_message',
    'dispatched_at', 'completed_at', 'created_at', 'updated_at',
  ],
  social_publish_status: [
    'id', 'news_id', 'publish_job_id', 'platform_id', 'status', 'attempt_count',
    'external_post_id', 'published_url', 'error_type', 'error_message',
    'retry_allowed', 'published_at', 'created_at', 'updated_at',
  ],
  news_execution_audit: [
    'id', 'news_id', 'publish_job_id', 'platform_id', 'actor_user_id', 'stage',
    'status', 'attempt_count', 'n8n_execution_id', 'workflow_name', 'message',
    'error_type', 'retry_allowed', 'metadata', 'created_at',
  ],
  social_platform_connections: [
    'connection_id', 'platform', 'external_account_id', 'external_account_name',
    'access_token_encrypted', 'token_iv', 'token_auth_tag', 'token_expires_at', 'status',
    'token_type', 'permissions', 'metadata', 'connected_by', 'connected_at',
    'verified_at', 'last_verified_at', 'last_error_code', 'last_error_message',
    'reconnect_required', 'created_at', 'updated_at',
  ],
  client_social_connections: [
    'id', 'client_id', 'connection_id', 'is_active', 'created_at',
  ],
};

const EXPECTED_VIEWS = ['dashboard_news_summary'];

const CRITICAL_INDEXES = [
  { table: 'social_publish_status', columns: ['publish_job_id', 'platform_id'], why: 'idempotency of n8n callbacks' },
  { table: 'client_social_connections', columns: ['client_id', 'connection_id'], why: 'unique client-to-connection ownership' },
  { table: 'social_platform_connections', columns: ['platform', 'external_account_id'], why: 'one encrypted record per platform account' },
];

const ESC = String.fromCharCode(27);
const paint = (code) => (text) => `${ESC}[${code}m${text}${ESC}[0m`;
const green = paint(32);
const red = paint(31);
const yellow = paint(33);
const bold = paint(1);

async function listColumns(table) {
  const rows = await db.queryAll(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1`,
    [table]
  );
  return rows;
}

async function tableExists(table) {
  const row = await db.queryOne(
    `SELECT c.relkind
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = $1 AND n.nspname = current_schema()`,
    [table]
  );
  return row ? row.relkind : null;
}

async function hasUniqueIndex(table, columns) {
  const row = await db.queryOne(
    `SELECT i.indexrelid::regclass AS name
       FROM pg_index i
       JOIN pg_class t ON t.oid = i.indrelid
      WHERE t.relname = $1 AND i.indisunique
        AND (
          SELECT array_agg(a.attname ORDER BY a.attname)
            FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        ) @> $2::name[]`,
    [table, columns]
  );
  return Boolean(row);
}

async function main() {
  if (!config.database.url) {
    console.error(red('DATABASE_URL is not set. Copy .env.example to .env first.'));
    process.exitCode = 1;
    return;
  }

  console.log(bold('\nTrichy Vision - schema verification (read only)\n'));

  let problems = 0;
  let warnings = 0;

  for (const [table, columns] of Object.entries(EXPECTED)) {
    const kind = await tableExists(table);
    if (!kind) {
      console.log(`${red('MISSING')}  table ${bold(table)}`);
      problems += 1;
      continue;
    }

    const actual = await listColumns(table);
    const actualNames = new Set(actual.map((column) => column.column_name));
    const missing = columns.filter((column) => !actualNames.has(column));

    if (missing.length === 0) {
      console.log(`${green('OK')}       table ${bold(table)} (${actual.length} columns)`);
    } else {
      console.log(`${red('COLUMNS')}  table ${bold(table)} is missing: ${missing.join(', ')}`);
      problems += 1;
    }
  }

  for (const view of EXPECTED_VIEWS) {
    const kind = await tableExists(view);
    if (kind === 'v' || kind === 'm') {
      console.log(`${green('OK')}       view  ${bold(view)}`);
    } else if (kind) {
      console.log(`${yellow('NOTE')}     ${view} exists but is not a view (relkind=${kind})`);
      warnings += 1;
    } else {
      console.log(`${yellow('NOTE')}     view ${view} not found - the dashboard falls back to base tables`);
      warnings += 1;
    }
  }

  for (const index of CRITICAL_INDEXES) {
    const exists = await hasUniqueIndex(index.table, index.columns);
    if (exists) {
      console.log(`${green('OK')}       unique index on ${index.table}(${index.columns.join(', ')})`);
    } else {
      console.log(
        `${red('INDEX')}    ${index.table}(${index.columns.join(', ')}) has no unique index - required for ${index.why}`
      );
      problems += 1;
    }
  }

  // news_execution_audit.news_id must accept NULL for account level events.
  const auditNewsId = (await listColumns('news_execution_audit')).find(
    (column) => column.column_name === 'news_id'
  );
  if (auditNewsId && auditNewsId.is_nullable === 'NO') {
    console.log(
      `${yellow('NOTE')}     news_execution_audit.news_id is NOT NULL - LOGIN/CREATE_USER audit rows will be skipped.\n` +
        '           Fix with:  ALTER TABLE news_execution_audit ALTER COLUMN news_id DROP NOT NULL;'
    );
    warnings += 1;
  }

  const platformCount = await db.queryOne('SELECT COUNT(*)::int AS total FROM social_platforms').catch(() => null);
  if (platformCount) {
    if (platformCount.total === 0) {
      console.log(`${yellow('NOTE')}     social_platforms is empty - run: npm run seed:platforms`);
      warnings += 1;
    } else {
      console.log(`${green('OK')}       social_platforms has ${platformCount.total} rows`);
    }
  }

  const userCount = await db.queryOne('SELECT COUNT(*)::int AS total FROM client_users').catch(() => null);
  if (userCount && userCount.total === 0) {
    console.log(`${yellow('NOTE')}     client_users is empty - run the platform-admin bootstrap`);
    warnings += 1;
  }

  console.log('');
  if (problems > 0) {
    console.log(red(`${problems} problem(s) found.`));
    console.log('Review backend/sql/schema-reference.sql - it is additive and idempotent.');
    process.exitCode = 1;
  } else {
    console.log(green(`Schema looks good.${warnings > 0 ? ` (${warnings} note(s) above)` : ''}`));
  }
}

main()
  .catch((error) => {
    console.error(red(`\nVerification failed: ${error.message}`));
    process.exitCode = 1;
  })
  .finally(() => db.closePool().catch(() => {}));
