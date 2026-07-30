const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const Database = require('better-sqlite3');
const {
  CATEGORY_ALIASES_MIGRATION,
  DEFAULT_CATEGORIES,
  FOUNDATION_MIGRATION,
  applyFoundationSchema,
} = require('../src/schemaFoundation');

test('foundation migration is idempotent and preserves existing data', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finskienovosti-schema-'));
  const databasePath = path.join(directory, 'test.db');
  const db = new Database(databasePath);
  try {
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE articles (
        id INTEGER PRIMARY KEY,
        title_ru TEXT
      );
      INSERT INTO articles (title_ru) VALUES ('Существующая статья');
      CREATE TABLE user_subscriptions (
        user_id TEXT PRIMARY KEY
      );
      INSERT INTO user_subscriptions (user_id) VALUES ('existing-user');
    `);

    applyFoundationSchema(db);
    applyFoundationSchema(db);

    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM articles').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user_subscriptions').get().count, 1);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE migration_id = ?')
        .get(FOUNDATION_MIGRATION).count,
      1,
    );
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE migration_id = ?')
        .get(CATEGORY_ALIASES_MIGRATION).count,
      1,
    );
    assert.ok(db.prepare(`
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'category_slug_aliases'
    `).get());
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM managed_categories').get().count,
      DEFAULT_CATEGORIES.length,
    );

    const articleColumns = new Set(
      db.prepare('PRAGMA table_info(articles)').all().map((column) => column.name),
    );
    assert.ok(articleColumns.has('importance_level'));
    assert.ok(articleColumns.has('quality_status'));
    assert.ok(articleColumns.has('quality_reason'));
    assert.ok(articleColumns.has('quality_reviewed_at'));
    assert.ok(articleColumns.has('quality_reviewed_by'));
    assert.ok(articleColumns.has('quality_publish_on_approval'));
    assert.ok(articleColumns.has('seo_title'));

    const subscriptionColumns = new Set(
      db.prepare('PRAGMA table_info(user_subscriptions)').all().map((column) => column.name),
    );
    assert.ok(subscriptionColumns.has('minimum_importance'));
    assert.ok(subscriptionColumns.has('importance_filter'));
    assert.ok(subscriptionColumns.has('quiet_weekdays'));
    assert.ok(subscriptionColumns.has('audience_codes'));

    for (const table of [
      'task_queue',
      'telegram_delivery_log',
      'search_analytics',
      'system_settings',
      'telegram_templates',
      'admin_notifications',
      'telegram_channel_publications',
    ]) {
      assert.ok(db.prepare(`
        SELECT 1 FROM sqlite_master
        WHERE type = 'table' AND name = ?
      `).get(table), `table ${table} should exist`);
    }
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM telegram_templates').get().count,
      2,
    );
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
