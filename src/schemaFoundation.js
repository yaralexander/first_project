const FOUNDATION_MIGRATION = '2026-07-28-master-plan-foundation-v1';
const CATEGORY_ALIASES_MIGRATION = '2026-07-28-category-aliases-v1';

const DEFAULT_CATEGORIES = [
  { code: 'politics', name: 'Политика', slug: 'politika', emoji: '🏛', color: '#d97706', sortOrder: 10 },
  { code: 'economy', name: 'Экономика', slug: 'ekonomika', emoji: '💶', color: '#ca8a04', sortOrder: 20 },
  { code: 'immigration', name: 'Иммиграция', slug: 'immigratsiya', emoji: '✈️', color: '#0284c7', sortOrder: 30 },
  { code: 'work', name: 'Работа', slug: 'rabota', emoji: '💼', color: '#7c3aed', sortOrder: 40 },
  { code: 'incidents', name: 'Происшествия', slug: 'proisshestviya', emoji: '🚨', color: '#dc2626', sortOrder: 45 },
  { code: 'society', name: 'Общество', slug: 'obshchestvo', emoji: '👥', color: '#059669', sortOrder: 50 },
  { code: 'education', name: 'Образование', slug: 'obrazovanie', emoji: '🎓', color: '#4f46e5', sortOrder: 60 },
  { code: 'russia', name: 'Россия', slug: 'rossiya', emoji: '🇷🇺', color: '#dc2626', sortOrder: 70 },
  { code: 'world', name: 'Мир', slug: 'mir', emoji: '🌍', color: '#2563eb', sortOrder: 80 },
];

const DEFAULT_REGIONS = [
  { code: 'finland', name: 'Вся Финляндия', type: 'country', sortOrder: 10 },
  { code: 'international', name: 'Международные новости', type: 'international', sortOrder: 20 },
];

const DEFAULT_AUDIENCES = [
  { code: 'all', name: 'Все читатели', sortOrder: 10 },
  { code: 'families', name: 'Семьи с детьми', sortOrder: 20 },
  { code: 'students', name: 'Студенты', sortOrder: 30 },
  { code: 'workers', name: 'Работающие', sortOrder: 40 },
  { code: 'entrepreneurs', name: 'Предприниматели', sortOrder: 50 },
  { code: 'immigrants', name: 'Новые жители Финляндии', sortOrder: 60 },
];

function columnNames(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
}

function ensureColumn(db, table, name, definition) {
  if (!columnNames(db, table).has(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function seedManagedTaxonomy(db) {
  const insertCategory = db.prepare(`
    INSERT INTO managed_categories (
      code, name, slug, emoji, color, sort_order, is_visible, is_system
    ) VALUES (
      @code, @name, @slug, @emoji, @color, @sortOrder, 1, 1
    ) ON CONFLICT(code) DO NOTHING
  `);
  const insertRegion = db.prepare(`
    INSERT INTO managed_regions (code, name, region_type, sort_order, is_visible)
    VALUES (@code, @name, @type, @sortOrder, 1)
    ON CONFLICT(code) DO NOTHING
  `);
  const insertAudience = db.prepare(`
    INSERT INTO managed_audiences (code, name, sort_order, is_visible)
    VALUES (@code, @name, @sortOrder, 1)
    ON CONFLICT(code) DO NOTHING
  `);

  const seed = db.transaction(() => {
    DEFAULT_CATEGORIES.forEach((category) => insertCategory.run(category));
    DEFAULT_REGIONS.forEach((region) => insertRegion.run(region));
    DEFAULT_AUDIENCES.forEach((audience) => insertAudience.run(audience));
  });
  seed();
}

function applyFoundationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS managed_categories (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      emoji TEXT,
      color TEXT,
      description TEXT,
      synonyms TEXT NOT NULL DEFAULT '',
      keywords TEXT NOT NULL DEFAULT '',
      classification_rules TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_visible INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS category_slug_aliases (
      id INTEGER PRIMARY KEY,
      old_slug TEXT NOT NULL UNIQUE,
      category_id INTEGER NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES managed_categories(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_category_slug_aliases_category
      ON category_slug_aliases (category_id);

    CREATE TABLE IF NOT EXISTS managed_tags (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      aliases TEXT NOT NULL DEFAULT '',
      is_visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS managed_regions (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      region_type TEXT NOT NULL DEFAULT 'region',
      parent_code TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS managed_audiences (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS article_tags (
      article_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      confidence REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (article_id, tag_id),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES managed_tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS article_audiences (
      article_id INTEGER NOT NULL,
      audience_id INTEGER NOT NULL,
      confidence REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (article_id, audience_id),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
      FOREIGN KEY (audience_id) REFERENCES managed_audiences(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS article_processing_log (
      id INTEGER PRIMARY KEY,
      article_id INTEGER,
      original_url TEXT,
      status TEXT NOT NULL CHECK (
        status IN ('received','processing','duplicate','published','error','manual_review')
      ),
      stage TEXT,
      confidence REAL,
      error_code TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_article_processing_status_created
      ON article_processing_log (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_preference_history (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_user_preference_history_user_changed
      ON user_preference_history (user_id, changed_at DESC);

    CREATE TABLE IF NOT EXISTS task_queue (
      id INTEGER PRIMARY KEY,
      task_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','running','retry','done','dead')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      locked_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_task_queue_due
      ON task_queue (status, available_at, id);

    CREATE TABLE IF NOT EXISTS telegram_delivery_log (
      id INTEGER PRIMARY KEY,
      user_id TEXT,
      article_id INTEGER,
      delivery_kind TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
      telegram_message_id TEXT,
      error_code TEXT,
      attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_delivery_log_attempted
      ON telegram_delivery_log (attempted_at DESC);

    CREATE TABLE IF NOT EXISTS search_analytics (
      id INTEGER PRIMARY KEY,
      query TEXT NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 0,
      searched_on TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_search_analytics_day
      ON search_analytics (searched_on, query);

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_notifications (
      id INTEGER PRIMARY KEY,
      notification_key TEXT NOT NULL UNIQUE,
      level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')) DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('new', 'read')) DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_admin_notifications_status_updated
      ON admin_notifications (status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS telegram_channel_publications (
      article_id INTEGER PRIMARY KEY,
      channel_chat_id TEXT NOT NULL,
      telegram_message_id TEXT NOT NULL,
      delivery_type TEXT NOT NULL CHECK (delivery_type IN ('manual', 'auto', 'test')),
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS telegram_templates (
      template_key TEXT PRIMARY KEY,
      template_body TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO telegram_templates (template_key, template_body)
    VALUES
      ('instant', '{label}\\n{category}\\n{title}\\n\\n{excerpt}\\n\\nЧитать далее: {article_url}'),
      ('daily', '📰 Ежедневная подборка «Финских Новостей»\\n\\n{articles}');
  `);

  ensureColumn(db, 'articles', 'importance_level', 'INTEGER NOT NULL DEFAULT 1 CHECK (importance_level BETWEEN 1 AND 5)');
  ensureColumn(db, 'articles', 'importance_reason', 'TEXT');
  ensureColumn(db, 'articles', 'classification_confidence', 'REAL');
  ensureColumn(db, 'articles', 'quality_confidence', 'REAL');
  ensureColumn(db, 'articles', 'quality_status', "TEXT NOT NULL DEFAULT 'unchecked' CHECK (quality_status IN ('unchecked','passed','manual_review','rejected'))");
  ensureColumn(db, 'articles', 'quality_reason', 'TEXT');
  ensureColumn(db, 'articles', 'quality_reviewed_at', 'TEXT');
  ensureColumn(db, 'articles', 'quality_reviewed_by', 'TEXT');
  ensureColumn(db, 'articles', 'quality_publish_on_approval', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'articles', 'region_code', "TEXT NOT NULL DEFAULT 'finland'");
  ensureColumn(db, 'articles', 'is_urgent', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'articles', 'seo_title', 'TEXT');
  ensureColumn(db, 'articles', 'seo_description', 'TEXT');

  ensureColumn(db, 'user_subscriptions', 'excluded_categories', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'user_subscriptions', 'tag_ids', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'user_subscriptions', 'region_codes', "TEXT NOT NULL DEFAULT 'finland'");
  ensureColumn(db, 'user_subscriptions', 'audience_codes', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'user_subscriptions', 'minimum_importance', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'user_subscriptions', 'importance_filter', "TEXT NOT NULL DEFAULT 'all'");
  ensureColumn(db, 'user_subscriptions', 'delivery_times', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'user_subscriptions', 'delivery_weekdays', "TEXT NOT NULL DEFAULT '1,2,3,4,5,6,0'");
  ensureColumn(db, 'user_subscriptions', 'quiet_weekdays', "TEXT NOT NULL DEFAULT '1,2,3,4,5,6,0'");
  ensureColumn(db, 'user_subscriptions', 'allow_critical_during_quiet', 'INTEGER NOT NULL DEFAULT 0');

  seedManagedTaxonomy(db);
  db.prepare(`
    INSERT INTO schema_migrations (migration_id)
    VALUES (?)
    ON CONFLICT(migration_id) DO NOTHING
  `).run(FOUNDATION_MIGRATION);
  db.prepare(`
    INSERT INTO schema_migrations (migration_id)
    VALUES (?)
    ON CONFLICT(migration_id) DO NOTHING
  `).run(CATEGORY_ALIASES_MIGRATION);
}

module.exports = {
  CATEGORY_ALIASES_MIGRATION,
  DEFAULT_AUDIENCES,
  DEFAULT_CATEGORIES,
  DEFAULT_REGIONS,
  FOUNDATION_MIGRATION,
  applyFoundationSchema,
};
