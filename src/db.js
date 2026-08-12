const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { compareArticles } = require('./articleSimilarity');
const { classifyArticle } = require('./articleClassifier');
const { assessArticleQuality } = require('./articleQuality');
const { applyFoundationSchema } = require('./schemaFoundation');
const { createTaxonomyRepository } = require('./taxonomyRepository');
const { SOURCES } = require('./config');

const databasePath = process.env.DATABASE_PATH
  || path.join(__dirname, '..', 'data', 'finskienovosti.db');

function createDatabase() {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.function('unicode_lower', { deterministic: true }, (value) => String(value || '').toLocaleLowerCase('ru-RU'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      original_url TEXT NOT NULL UNIQUE,
      external_guid TEXT,
      slug TEXT NOT NULL UNIQUE,
      category TEXT,
      title_fi TEXT,
      summary_fi TEXT,
      title_ru TEXT,
      summary_ru TEXT,
      translation_method TEXT,
      prompt_version INTEGER,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_articles_published_at
      ON articles (published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_category
      ON articles (category);
    CREATE INDEX IF NOT EXISTS idx_articles_source_id
      ON articles (source_id);

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY,
      article_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      telegram_chat_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_comments_article_status
      ON comments (article_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_status_created_at
      ON comments (status, created_at);

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('new', 'read', 'archived')) DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_contact_messages_status_created_at
      ON contact_messages (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS analytics_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_views (
      article_id INTEGER NOT NULL,
      visitor_hash TEXT NOT NULL,
      viewed_on TEXT NOT NULL,
      PRIMARY KEY (article_id, visitor_hash, viewed_on)
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_views_day_article
      ON analytics_views (viewed_on, article_id);

    CREATE TABLE IF NOT EXISTS telegram_publications (
      article_id INTEGER PRIMARY KEY,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      telegram_message_id TEXT NOT NULL,
      delivery_type TEXT NOT NULL CHECK (delivery_type = 'manual'),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS article_reactions (
      article_id INTEGER NOT NULL,
      visitor_hash TEXT NOT NULL,
      reacted_on TEXT NOT NULL,
      reaction TEXT NOT NULL CHECK (reaction IN ('like', 'important', 'sad')),
      PRIMARY KEY (article_id, visitor_hash, reacted_on),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS editorial_discussions (
      id INTEGER PRIMARY KEY,
      article_id INTEGER NOT NULL,
      note TEXT NOT NULL,
      question TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft','approved','published','deleted')) DEFAULT 'draft',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_editorial_discussions_article_status ON editorial_discussions(article_id,status);

    CREATE INDEX IF NOT EXISTS idx_article_reactions_article
      ON article_reactions (article_id, reaction);

    CREATE TABLE IF NOT EXISTS article_duplicate_log (
      id INTEGER PRIMARY KEY,
      original_url TEXT NOT NULL UNIQUE,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      title_fi TEXT NOT NULL,
      summary_fi TEXT,
      external_guid TEXT,
      category TEXT,
      published_at TEXT,
      matched_article_id INTEGER,
      similarity REAL NOT NULL,
      resolution TEXT NOT NULL DEFAULT 'skipped' CHECK (resolution IN ('skipped', 'published', 'dismissed')),
      resolved_at TEXT,
      resolved_by TEXT,
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      seen_count INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (matched_article_id) REFERENCES articles(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_article_duplicate_log_last_seen
      ON article_duplicate_log (last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_article_duplicate_log_match
      ON article_duplicate_log (matched_article_id);

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY,
      actor_username TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
      ON admin_audit_log (created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS admin_oauth_states (
      state_hash TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_oauth_states_expires_at
      ON admin_oauth_states (expires_at);

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      google_sub TEXT NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
      ON admin_sessions (expires_at);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_email
      ON admin_sessions (email);

    CREATE TABLE IF NOT EXISTS user_oauth_states (
      state_hash TEXT PRIMARY KEY, nonce TEXT NOT NULL, code_verifier TEXT NOT NULL,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY, google_sub TEXT NOT NULL, email TEXT NOT NULL,
      display_name TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS news_source_settings (
      source_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      google_sub TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT,
      registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE TABLE IF NOT EXISTS telegram_user_links (
      user_id TEXT PRIMARY KEY, telegram_chat_id TEXT UNIQUE, link_code_hash TEXT UNIQUE,
      code_expires_at TEXT, linked_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      user_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0,
      frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('instant','daily')),
      categories TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT 'finland' CHECK (scope IN ('finland','all')),
      importance TEXT NOT NULL DEFAULT 'all' CHECK (importance IN ('all','important')),
      source_ids TEXT NOT NULL DEFAULT '', max_posts_per_day INTEGER NOT NULL DEFAULT 5,
      include_original INTEGER NOT NULL DEFAULT 1,
      quiet_hours_enabled INTEGER NOT NULL DEFAULT 0,
      quiet_start TEXT NOT NULL DEFAULT '22:00',
      quiet_end TEXT NOT NULL DEFAULT '07:00',
      timezone TEXT NOT NULL DEFAULT 'Europe/Helsinki',
      content_types TEXT NOT NULL DEFAULT 'news',
      word_level TEXT NOT NULL DEFAULT 'A1-A2',
      word_levels TEXT NOT NULL DEFAULT 'A1-A2',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS telegram_user_deliveries (
      id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, article_id INTEGER NOT NULL,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, telegram_message_id TEXT,
      UNIQUE(user_id, article_id), FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_user_deliveries_user_day
      ON telegram_user_deliveries (user_id, sent_at DESC);
    CREATE TABLE IF NOT EXISTS telegram_content_deliveries (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL,
      content_key TEXT NOT NULL,
      content_type TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      telegram_message_id TEXT,
      UNIQUE(user_id, content_key)
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_content_deliveries_user_day
      ON telegram_content_deliveries (user_id, sent_at DESC);
    CREATE TABLE IF NOT EXISTS telegram_assistant_profiles (
      user_id TEXT PRIMARY KEY,
      city TEXT NOT NULL DEFAULT '',
      life_status TEXT NOT NULL DEFAULT '',
      has_children INTEGER NOT NULL DEFAULT 0,
      housing TEXT NOT NULL DEFAULT '',
      transport TEXT NOT NULL DEFAULT '',
      interests TEXT NOT NULL DEFAULT '',
      grocery_offers_enabled INTEGER NOT NULL DEFAULT 0,
      grocery_chains TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS telegram_conversations (
      chat_id TEXT PRIMARY KEY,
      user_id TEXT,
      article_id INTEGER,
      pending_action TEXT NOT NULL DEFAULT '',
      draft_text TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS telegram_topic_follows (
      user_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, topic)
    );
    CREATE TABLE IF NOT EXISTS telegram_saved_articles (
      user_id TEXT NOT NULL,
      article_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, article_id),
      FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS telegram_reminders (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      article_id INTEGER,
      reminder_text TEXT NOT NULL,
      remind_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT,
      FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_reminders_due ON telegram_reminders(status, remind_at);
    CREATE TABLE IF NOT EXISTS article_issue_reports (
      id INTEGER PRIMARY KEY,
      article_id INTEGER NOT NULL,
      user_id TEXT,
      report_type TEXT NOT NULL DEFAULT 'other',
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','closed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
  `);

  const articleColumns = new Set(db.prepare('PRAGMA table_info(articles)').all().map((column) => column.name));
  if (!articleColumns.has('editorial_status')) {
    db.exec("ALTER TABLE articles ADD COLUMN editorial_status TEXT NOT NULL DEFAULT 'normal' CHECK (editorial_status IN ('normal', 'important', 'urgent'))");
  }
  if (!articleColumns.has('pinned_until')) {
    db.exec('ALTER TABLE articles ADD COLUMN pinned_until TEXT');
  }
  if (!articleColumns.has('publication_status')) {
    db.exec("ALTER TABLE articles ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'published' CHECK (publication_status IN ('draft', 'published'))");
  }
  if (!articleColumns.has('imported_at')) {
    db.exec('ALTER TABLE articles ADD COLUMN imported_at TEXT');
  }
  if (!articleColumns.has('scheduled_publish_at')) {
    db.exec('ALTER TABLE articles ADD COLUMN scheduled_publish_at TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_articles_editorial_order ON articles (pinned_until, editorial_status, published_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_articles_scheduled_publish ON articles (publication_status, scheduled_publish_at)');

  const commentColumns = new Set(db.prepare('PRAGMA table_info(comments)').all().map((column) => column.name));
  if (!commentColumns.has('telegram_chat_id')) db.exec('ALTER TABLE comments ADD COLUMN telegram_chat_id TEXT');

  const assistantProfileColumns = new Set(db.prepare('PRAGMA table_info(telegram_assistant_profiles)').all().map((column) => column.name));
  if (!assistantProfileColumns.has('modes')) db.exec("ALTER TABLE telegram_assistant_profiles ADD COLUMN modes TEXT NOT NULL DEFAULT ''");
  if (!assistantProfileColumns.has('grocery_offers_enabled')) db.exec('ALTER TABLE telegram_assistant_profiles ADD COLUMN grocery_offers_enabled INTEGER NOT NULL DEFAULT 0');
  if (!assistantProfileColumns.has('grocery_chains')) db.exec("ALTER TABLE telegram_assistant_profiles ADD COLUMN grocery_chains TEXT NOT NULL DEFAULT ''");

  const duplicateColumns = new Set(db.prepare('PRAGMA table_info(article_duplicate_log)').all().map((column) => column.name));
  if (!duplicateColumns.has('summary_fi')) db.exec('ALTER TABLE article_duplicate_log ADD COLUMN summary_fi TEXT');
  if (!duplicateColumns.has('external_guid')) db.exec('ALTER TABLE article_duplicate_log ADD COLUMN external_guid TEXT');
  if (!duplicateColumns.has('category')) db.exec('ALTER TABLE article_duplicate_log ADD COLUMN category TEXT');
  if (!duplicateColumns.has('resolution')) db.exec("ALTER TABLE article_duplicate_log ADD COLUMN resolution TEXT NOT NULL DEFAULT 'skipped' CHECK (resolution IN ('skipped', 'published', 'dismissed'))");
  if (!duplicateColumns.has('resolved_at')) db.exec('ALTER TABLE article_duplicate_log ADD COLUMN resolved_at TEXT');
  if (!duplicateColumns.has('resolved_by')) db.exec('ALTER TABLE article_duplicate_log ADD COLUMN resolved_by TEXT');

  const adminSessionColumns = new Set(db.prepare('PRAGMA table_info(admin_sessions)').all().map((column) => column.name));
  if (!adminSessionColumns.has('last_seen_at')) db.exec('ALTER TABLE admin_sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');

  const userSessionColumns = new Set(db.prepare('PRAGMA table_info(user_sessions)').all().map((column) => column.name));
  if (!userSessionColumns.has('last_seen_at')) db.exec('ALTER TABLE user_sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');
  if (!userSessionColumns.has('display_name')) db.exec('ALTER TABLE user_sessions ADD COLUMN display_name TEXT');
  db.exec(`
    INSERT OR IGNORE INTO users (google_sub, email, display_name, registered_at, last_login_at)
    SELECT google_sub, MAX(email), MAX(display_name), MIN(created_at), MAX(last_seen_at)
    FROM user_sessions
    GROUP BY google_sub
  `);

  const userSubscriptionColumns = new Set(db.prepare('PRAGMA table_info(user_subscriptions)').all().map((column) => column.name));
  if (!userSubscriptionColumns.has('source_ids')) db.exec("ALTER TABLE user_subscriptions ADD COLUMN source_ids TEXT NOT NULL DEFAULT ''");
  if (!userSubscriptionColumns.has('max_posts_per_day')) db.exec("ALTER TABLE user_subscriptions ADD COLUMN max_posts_per_day INTEGER NOT NULL DEFAULT 5");
  if (!userSubscriptionColumns.has('include_original')) db.exec('ALTER TABLE user_subscriptions ADD COLUMN include_original INTEGER NOT NULL DEFAULT 1');
  if (!userSubscriptionColumns.has('quiet_hours_enabled')) db.exec('ALTER TABLE user_subscriptions ADD COLUMN quiet_hours_enabled INTEGER NOT NULL DEFAULT 0');
  if (!userSubscriptionColumns.has('quiet_start')) db.exec("ALTER TABLE user_subscriptions ADD COLUMN quiet_start TEXT NOT NULL DEFAULT '22:00'");
  if (!userSubscriptionColumns.has('quiet_end')) db.exec("ALTER TABLE user_subscriptions ADD COLUMN quiet_end TEXT NOT NULL DEFAULT '07:00'");
  if (!userSubscriptionColumns.has('timezone')) db.exec("ALTER TABLE user_subscriptions ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Helsinki'");
  if (!userSubscriptionColumns.has('content_types')) db.exec("ALTER TABLE user_subscriptions ADD COLUMN content_types TEXT NOT NULL DEFAULT 'news'");
  if (!userSubscriptionColumns.has('word_level')) db.exec("ALTER TABLE user_subscriptions ADD COLUMN word_level TEXT NOT NULL DEFAULT 'A1-A2'");
  if (!userSubscriptionColumns.has('word_levels')) {
    db.exec("ALTER TABLE user_subscriptions ADD COLUMN word_levels TEXT NOT NULL DEFAULT 'A1-A2'");
    db.exec("UPDATE user_subscriptions SET word_levels = word_level WHERE word_level IN ('A1-A2','B1-B2','C1-C2')");
  }
  if (!userSubscriptionColumns.has('importance_filter')) db.exec("ALTER TABLE user_subscriptions ADD COLUMN importance_filter TEXT NOT NULL DEFAULT 'all'");
  if (!userSubscriptionColumns.has('updated_at')) db.exec('ALTER TABLE user_subscriptions ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');

  const telegramUserLinkColumns = new Set(db.prepare('PRAGMA table_info(telegram_user_links)').all().map((column) => column.name));
  if (!telegramUserLinkColumns.has('linked_at')) db.exec('ALTER TABLE telegram_user_links ADD COLUMN linked_at TEXT');

  applyFoundationSchema(db);

  return db;
}

const db = createDatabase();
const taxonomyRepository = createTaxonomyRepository(db);

const findArticleByUrl = db.prepare('SELECT id FROM articles WHERE original_url = ?');
const insertArticleStatement = db.prepare(`
  INSERT INTO articles (
    source_id, source_name, original_url, external_guid, slug, category,
    title_fi, summary_fi, title_ru, summary_ru, translation_method,
    prompt_version, published_at
  ) VALUES (
    @sourceId, @sourceName, @originalUrl, @externalGuid, @slug, @category,
    @titleFi, @summaryFi, @titleRu, @summaryRu, @translationMethod,
    @promptVersion, @publishedAt
  ) ON CONFLICT(original_url) DO NOTHING
`);

function articleExists(originalUrl) {
  return Boolean(findArticleByUrl.get(originalUrl));
}

function getArticleClassification(articleId) {
  const article = db.prepare(`
    SELECT region_code, classification_confidence, importance_level,
      importance_reason, quality_confidence, quality_status, quality_reason,
      quality_reviewed_at, quality_reviewed_by, quality_publish_on_approval
    FROM articles WHERE id = ?
  `).get(articleId);
  if (!article) return null;
  const tags = db.prepare(`
    SELECT tags.id, tags.name, tags.slug, article_tags.confidence
    FROM article_tags
    JOIN managed_tags AS tags ON tags.id = article_tags.tag_id
    WHERE article_tags.article_id = ?
    ORDER BY tags.name COLLATE NOCASE
  `).all(articleId).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    confidence: row.confidence,
  }));
  const audiences = db.prepare(`
    SELECT audiences.id, audiences.code, audiences.name, article_audiences.confidence
    FROM article_audiences
    JOIN managed_audiences AS audiences ON audiences.id = article_audiences.audience_id
    WHERE article_audiences.article_id = ?
    ORDER BY audiences.sort_order, audiences.name COLLATE NOCASE
  `).all(articleId).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    confidence: row.confidence,
  }));
  const region = taxonomyRepository.list('regions')
    .find((item) => item.code === article.region_code) || null;
  const processing = db.prepare(`
    SELECT details
    FROM article_processing_log
    WHERE article_id = ? AND stage = 'classification'
    ORDER BY id DESC
    LIMIT 1
  `).get(articleId);
  let explanation = '';
  try {
    explanation = JSON.parse(processing?.details || '{}').explanation || '';
  } catch {
    explanation = '';
  }
  return {
    region,
    tags,
    audiences,
    confidence: article.classification_confidence,
    explanation,
    importanceLevel: article.importance_level || 1,
    importanceReason: article.importance_reason || '',
    qualityConfidence: article.quality_confidence,
    qualityStatus: article.quality_status || 'unchecked',
    qualityReason: article.quality_reason || '',
    qualityReviewedAt: article.quality_reviewed_at,
    qualityReviewedBy: article.quality_reviewed_by,
    qualityPublishOnApproval: Boolean(article.quality_publish_on_approval),
  };
}

const replaceArticleClassification = db.transaction((
  articleId,
  classification,
  quality,
  { preserveCategory = false, gatePublication = false } = {},
) => {
  const current = db.prepare(`
    SELECT category, publication_status, quality_status, quality_publish_on_approval
    FROM articles
    WHERE id = ?
  `).get(articleId);
  if (!current) return false;
  const publishOnApproval = gatePublication
    && quality.status === 'manual_review'
    && current.publication_status === 'published';
  db.prepare(`
    UPDATE articles
    SET category = ?, region_code = ?, classification_confidence = ?,
      importance_level = ?, importance_reason = ?,
      quality_confidence = ?, quality_status = ?, quality_reason = ?,
      quality_reviewed_at = NULL, quality_reviewed_by = NULL,
      quality_publish_on_approval = ?,
      publication_status = CASE
        WHEN ? = 1 AND ? = 'manual_review' THEN 'draft'
        ELSE publication_status
      END
    WHERE id = ?
  `).run(
    preserveCategory && current.category ? current.category : classification.category,
    classification.regionCode,
    classification.confidence,
    quality.importanceLevel,
    quality.importanceReason,
    quality.confidence,
    quality.status,
    quality.reason,
    publishOnApproval ? 1 : Number(current.quality_publish_on_approval || 0),
    gatePublication ? 1 : 0,
    quality.status,
    articleId,
  );
  db.prepare('DELETE FROM article_tags WHERE article_id = ?').run(articleId);
  db.prepare('DELETE FROM article_audiences WHERE article_id = ?').run(articleId);
  const insertTag = db.prepare(`
    INSERT INTO article_tags (article_id, tag_id, confidence)
    VALUES (?, ?, ?)
  `);
  classification.tagIds.forEach((tagId) => insertTag.run(articleId, tagId, classification.confidence));
  const insertAudience = db.prepare(`
    INSERT INTO article_audiences (article_id, audience_id, confidence)
    VALUES (?, ?, ?)
  `);
  classification.audienceIds.forEach((audienceId) => insertAudience.run(articleId, audienceId, classification.confidence));
  db.prepare(`
    INSERT INTO article_processing_log (
      article_id, original_url, status, stage, confidence, details
    )
    SELECT id, original_url, ?, 'classification', ?, ?
    FROM articles WHERE id = ?
  `).run(
    quality.status === 'manual_review' ? 'manual_review' : 'processing',
    classification.confidence,
    JSON.stringify({
      ...classification.evidence,
      explanation: classification.explanation,
      quality,
    }),
    articleId,
  );
  return true;
});

function classifyAndStoreArticle(articleId, { preserveCategory = false, gatePublication = false } = {}) {
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId);
  if (!row) return null;
  const classification = classifyArticle(toArticle(row), {
    categories: taxonomyRepository.list('categories', { includeHidden: false }),
    tags: taxonomyRepository.list('tags', { includeHidden: false }),
    regions: taxonomyRepository.list('regions', { includeHidden: false }),
    audiences: taxonomyRepository.list('audiences', { includeHidden: false }),
  });
  let quality = assessArticleQuality(toArticle(row), classification);
  if (!gatePublication
    && row.quality_status === 'manual_review'
    && row.quality_publish_on_approval
    && quality.status === 'passed') {
    quality = {
      ...quality,
      status: 'manual_review',
      reason: 'Повторная автоматическая проверка пройдена, но публикация всё ещё требует решения редактора.',
    };
  }
  replaceArticleClassification(articleId, classification, quality, { preserveCategory, gatePublication });
  return { ...classification, quality };
}

function classifyUnclassifiedArticles(limit = 500, { includeClassified = false } = {}) {
  const safeLimit = Math.min(1000, Math.max(1, Number.parseInt(limit, 10) || 500));
  const rows = db.prepare(`
    SELECT id
    FROM articles
    ${includeClassified ? '' : 'WHERE classification_confidence IS NULL'}
    ORDER BY id ASC
    LIMIT ?
  `).all(safeLimit);
  rows.forEach((row) => classifyAndStoreArticle(row.id));
  return rows.length;
}

function getQualityReviewQueue(limit = 100) {
  const safeLimit = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 100));
  return db.prepare(`
    SELECT *
    FROM articles
    WHERE quality_status = 'manual_review'
    ORDER BY importance_level DESC, COALESCE(published_at, created_at) DESC, id DESC
    LIMIT ?
  `).all(safeLimit).map((row) => {
    const article = toArticle(row);
    return { ...article, classification: getArticleClassification(article.id) };
  });
}

function countQualityReviewQueue() {
  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM articles
    WHERE quality_status = 'manual_review'
  `).get().count;
}

const reviewArticleQuality = db.transaction(({
  id,
  decision,
  category,
  importanceLevel,
  reviewedBy,
  note = '',
}) => {
  const article = db.prepare(`
    SELECT id, publication_status, quality_publish_on_approval
    FROM articles
    WHERE id = ? AND quality_status = 'manual_review'
  `).get(id);
  if (!article || !['approve', 'reject'].includes(decision)) return false;
  const level = Math.min(5, Math.max(1, Number.parseInt(importanceLevel, 10) || 1));
  const reviewerNote = String(note || '').trim();
  if (decision === 'approve') {
    db.prepare(`
      UPDATE articles
      SET category = ?, importance_level = ?, quality_status = 'passed',
        quality_confidence = 1, quality_reason = ?,
        quality_reviewed_at = CURRENT_TIMESTAMP, quality_reviewed_by = ?,
        publication_status = CASE WHEN quality_publish_on_approval = 1 THEN 'published' ELSE publication_status END,
        published_at = CASE
          WHEN quality_publish_on_approval = 1 THEN COALESCE(published_at, CURRENT_TIMESTAMP)
          ELSE published_at
        END,
        quality_publish_on_approval = 0
      WHERE id = ?
    `).run(
      category,
      level,
      reviewerNote
        ? `Проверено редактором: ${reviewerNote}`
        : 'Проверено и одобрено редактором.',
      reviewedBy,
      id,
    );
  } else {
    db.prepare(`
      UPDATE articles
      SET quality_status = 'rejected', publication_status = 'draft',
        quality_reason = ?, quality_reviewed_at = CURRENT_TIMESTAMP,
        quality_reviewed_by = ?, quality_publish_on_approval = 0
      WHERE id = ?
    `).run(
      reviewerNote
        ? `Скрыто редактором: ${reviewerNote}`
        : 'Скрыто редактором после проверки качества.',
      reviewedBy,
      id,
    );
  }
  db.prepare(`
    INSERT INTO article_processing_log (
      article_id, original_url, status, stage, confidence, details
    )
    SELECT id, original_url, ?, 'quality_review', 1, ?
    FROM articles WHERE id = ?
  `).run(
    decision === 'approve' ? 'published' : 'manual_review',
    JSON.stringify({ decision, category, importanceLevel: level, reviewedBy, note: reviewerNote }),
    id,
  );
  return {
    published: decision === 'approve' && Boolean(article.quality_publish_on_approval),
  };
});

function insertArticle(article) {
  const result = insertArticleStatement.run(article);
  if (result.changes !== 1) return 0;
  const articleId = Number(result.lastInsertRowid);
  classifyAndStoreArticle(articleId, { gatePublication: true });
  return articleId;
}

function articleDate(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function findSimilarArticle({ sourceId, titleFi, summaryFi, publishedAt }) {
  const candidates = db.prepare(`
    SELECT id, source_id, source_name, slug, title_fi, summary_fi, title_ru, summary_ru, published_at
    FROM articles
    WHERE publication_status = 'published'
      AND source_id <> ?
      AND date(COALESCE(published_at, created_at)) = date(?)
    ORDER BY COALESCE(published_at, created_at) DESC, id DESC
    LIMIT 300
  `).all(sourceId, articleDate(publishedAt));
  let best = null;
  for (const candidate of candidates) {
    const comparison = compareArticles(
      { title: titleFi, summary: summaryFi },
      { title: candidate.title_fi || candidate.title_ru, summary: candidate.summary_fi || candidate.summary_ru },
    );
    if (comparison.isDuplicate && (!best || comparison.score > best.similarity)) {
      best = {
        id: candidate.id,
        sourceId: candidate.source_id,
        sourceName: candidate.source_name,
        slug: candidate.slug,
        title: candidate.title_ru || candidate.title_fi,
        publishedAt: candidate.published_at,
        similarity: comparison.score,
      };
    }
  }
  return best;
}

function recordDuplicateArticle({ originalUrl, sourceId, sourceName, titleFi, summaryFi, externalGuid, category, publishedAt, matchedArticleId, similarity }) {
  return db.prepare(`
    INSERT INTO article_duplicate_log (
      original_url, source_id, source_name, title_fi, summary_fi, external_guid, category,
      published_at, matched_article_id, similarity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(original_url) DO UPDATE SET
      matched_article_id = excluded.matched_article_id,
      similarity = excluded.similarity,
      last_seen_at = CURRENT_TIMESTAMP,
      seen_count = article_duplicate_log.seen_count + 1
  `).run(
    originalUrl, sourceId, sourceName, titleFi, summaryFi || null, externalGuid || null,
    category || null, publishedAt || null, matchedArticleId, similarity,
  ).changes === 1;
}

function getRecentDuplicateArticles(limit = 20) {
  const parsedLimit = Number.parseInt(limit, 10);
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
  return db.prepare(`
    SELECT duplicate.id, duplicate.original_url, duplicate.source_name, duplicate.title_fi,
      duplicate.published_at, duplicate.similarity, duplicate.last_seen_at, duplicate.seen_count,
      duplicate.resolution, duplicate.resolved_at, duplicate.resolved_by,
      articles.slug AS matched_slug, articles.title_ru AS matched_title_ru,
      articles.title_fi AS matched_title_fi, articles.source_name AS matched_source_name
    FROM article_duplicate_log AS duplicate
    LEFT JOIN articles ON articles.id = duplicate.matched_article_id
    ORDER BY duplicate.last_seen_at DESC, duplicate.id DESC
    LIMIT ?
  `).all(safeLimit).map((row) => ({
    id: row.id,
    originalUrl: row.original_url,
    sourceName: row.source_name,
    titleFi: row.title_fi,
    publishedAt: row.published_at,
    similarity: row.similarity,
    lastSeenAt: row.last_seen_at,
    seenCount: row.seen_count,
    resolution: row.resolution,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    matchedSlug: row.matched_slug,
    matchedTitle: row.matched_title_ru || row.matched_title_fi,
    matchedSourceName: row.matched_source_name,
  }));
}

function getArticleRankingSignals(articleId) {
  const row = db.prepare(`
    SELECT articles.source_id,
      COUNT(DISTINCT CASE
        WHEN duplicate.source_id <> articles.source_id
          AND duplicate.resolution <> 'dismissed'
        THEN duplicate.source_id
      END) AS corroborating_sources,
      COALESCE(SUM(CASE
        WHEN duplicate.source_id <> articles.source_id
          AND duplicate.resolution <> 'dismissed'
        THEN duplicate.seen_count
        ELSE 0
      END), 0) AS corroborating_mentions
    FROM articles
    LEFT JOIN article_duplicate_log AS duplicate
      ON duplicate.matched_article_id = articles.id
    WHERE articles.id = ?
    GROUP BY articles.id, articles.source_id
  `).get(articleId);
  if (!row) return { independentSourceCount: 1, corroboratingMentions: 0 };
  return {
    independentSourceCount: 1 + Number(row.corroborating_sources || 0),
    corroboratingMentions: Number(row.corroborating_mentions || 0),
  };
}

function getDuplicateArticleById(id) {
  const row = db.prepare(`
    SELECT id, original_url, source_id, source_name, title_fi, summary_fi, external_guid,
      category, published_at, matched_article_id, similarity, resolution
    FROM article_duplicate_log
    WHERE id = ?
  `).get(id);
  return row ? {
    id: row.id,
    originalUrl: row.original_url,
    sourceId: row.source_id,
    sourceName: row.source_name,
    titleFi: row.title_fi,
    summaryFi: row.summary_fi || '',
    externalGuid: row.external_guid,
    category: row.category,
    publishedAt: row.published_at,
    matchedArticleId: row.matched_article_id,
    similarity: row.similarity,
    resolution: row.resolution,
  } : null;
}

function getArticleSourceMentions(articleId) {
  const article = db.prepare('SELECT source_name, original_url, title_ru, title_fi FROM articles WHERE id = ?').get(articleId);
  if (!article) return [];
  const duplicates = db.prepare(`
    SELECT source_name, original_url, title_fi, similarity
    FROM article_duplicate_log
    WHERE matched_article_id = ? AND resolution <> 'dismissed'
    ORDER BY similarity DESC, last_seen_at DESC
  `).all(articleId);
  return [{ sourceName: article.source_name, url: article.original_url, title: article.title_ru || article.title_fi, similarity: 1 },
    ...duplicates.map((row) => ({ sourceName: row.source_name, url: row.original_url, title: row.title_fi, similarity: row.similarity }))];
}

function resolveDuplicateArticle({ id, resolution, resolvedBy }) {
  return db.prepare(`
    UPDATE article_duplicate_log
    SET resolution = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
    WHERE id = ? AND resolution = 'skipped'
  `).run(resolution, resolvedBy, id).changes === 1;
}

function estimateReadMinutes(text = '') {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

function toApiArticle(row) {
  return {
    id: row.external_guid || row.original_url,
    source: row.source_id,
    sourceName: row.source_name,
    category: row.category,
    titleFi: row.title_fi,
    titleRu: row.title_ru,
    summaryFi: row.summary_fi,
    summaryRu: row.summary_ru,
    translationMethod: row.translation_method,
    link: row.original_url,
    pubDate: row.published_at,
    readMinutes: estimateReadMinutes(row.summary_fi || ''),
  };
}

function toArticle(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    originalUrl: row.original_url,
    externalGuid: row.external_guid,
    slug: row.slug,
    category: row.category,
    titleFi: row.title_fi,
    summaryFi: row.summary_fi,
    titleRu: row.title_ru,
    summaryRu: row.summary_ru,
    translationMethod: row.translation_method,
    promptVersion: row.prompt_version,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    editorialStatus: row.editorial_status || 'normal',
    pinnedUntil: row.pinned_until,
    publicationStatus: row.publication_status || 'published',
    importedAt: row.imported_at,
    scheduledPublishAt: row.scheduled_publish_at,
    importanceLevel: row.importance_level || 1,
    importanceReason: row.importance_reason || '',
    classificationConfidence: row.classification_confidence,
    qualityConfidence: row.quality_confidence,
    qualityStatus: row.quality_status || 'unchecked',
    qualityReason: row.quality_reason || '',
    qualityReviewedAt: row.quality_reviewed_at,
    qualityReviewedBy: row.quality_reviewed_by,
    qualityPublishOnApproval: Boolean(row.quality_publish_on_approval),
    regionCode: row.region_code || 'finland',
    isUrgent: Boolean(row.is_urgent),
  };
}

function normalizePagination(limit, offset) {
  const parsedLimit = Number.parseInt(limit, 10);
  const parsedOffset = Number.parseInt(offset, 10);
  return {
    limit: Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50,
    offset: Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0,
  };
}

function getArticles({ limit = 50, offset = 0 } = {}) {
  const pagination = normalizePagination(limit, offset);
  return db.prepare(`
    SELECT * FROM articles WHERE publication_status = 'published'
    ORDER BY published_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(pagination.limit, pagination.offset).map(toArticle);
}

function getHomeArticles({ limit = 50, offset = 0, source = '', sort = 'newest' } = {}) {
  const pagination = normalizePagination(limit, offset);
  const conditions = ["publication_status = 'published'"];
  const values = [];
  if (source) {
    conditions.push('source_id = ?');
    values.push(source);
  }
  const order = sort === 'oldest'
    ? 'published_at ASC, id ASC'
    : `CASE WHEN pinned_until IS NOT NULL AND datetime(pinned_until) > datetime('now') THEN 0 ELSE 1 END,
      CASE editorial_status WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
      published_at DESC, id DESC`;
  return db.prepare(`
    SELECT * FROM articles
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `).all(...values, pagination.limit, pagination.offset).map(toArticle);
}

function getArticleBySlug(slug) {
  const row = db.prepare("SELECT * FROM articles WHERE slug = ? AND publication_status = 'published'").get(slug);
  if (!row) return null;
  const article = toArticle(row);
  return { ...article, classification: getArticleClassification(article.id) };
}

function countArticles({ source = '' } = {}) {
  if (source) {
    return db.prepare("SELECT COUNT(*) AS count FROM articles WHERE publication_status = 'published' AND source_id = ?").get(source).count;
  }
  return db.prepare("SELECT COUNT(*) AS count FROM articles WHERE publication_status = 'published'").get().count;
}

function getArticlesByCategory(category, { limit = 50, offset = 0 } = {}) {
  const pagination = normalizePagination(limit, offset);
  return db.prepare(`
    SELECT * FROM articles
    WHERE category = ? AND publication_status = 'published'
    ORDER BY published_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(category, pagination.limit, pagination.offset).map(toArticle);
}

function countArticlesByCategory(category) {
  return db.prepare("SELECT COUNT(*) AS count FROM articles WHERE category = ? AND publication_status = 'published'").get(category).count;
}

function withClassification(article) {
  return article ? { ...article, classification: getArticleClassification(article.id) } : null;
}

function getArticlesByTagSlug(slug, { limit = 50, offset = 0 } = {}) {
  const pagination = normalizePagination(limit, offset);
  return db.prepare(`
    SELECT DISTINCT articles.*
    FROM articles
    JOIN article_tags ON article_tags.article_id = articles.id
    JOIN managed_tags ON managed_tags.id = article_tags.tag_id
    WHERE managed_tags.slug = ? AND managed_tags.is_visible = 1
      AND articles.publication_status = 'published'
    ORDER BY articles.published_at DESC, articles.id DESC
    LIMIT ? OFFSET ?
  `).all(slug, pagination.limit, pagination.offset).map(toArticle);
}

function countArticlesByTagSlug(slug) {
  return db.prepare(`
    SELECT COUNT(DISTINCT articles.id) AS count
    FROM articles
    JOIN article_tags ON article_tags.article_id = articles.id
    JOIN managed_tags ON managed_tags.id = article_tags.tag_id
    WHERE managed_tags.slug = ? AND managed_tags.is_visible = 1
      AND articles.publication_status = 'published'
  `).get(slug).count;
}

function getArticlesByRegionCode(code, { limit = 50, offset = 0 } = {}) {
  const pagination = normalizePagination(limit, offset);
  return db.prepare(`
    SELECT * FROM articles
    WHERE region_code = ? AND publication_status = 'published'
    ORDER BY published_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(code, pagination.limit, pagination.offset).map(toArticle);
}

function countArticlesByRegionCode(code) {
  return db.prepare(`
    SELECT COUNT(*) AS count FROM articles
    WHERE region_code = ? AND publication_status = 'published'
  `).get(code).count;
}

function getRelatedArticles(articleId, limit = 4) {
  const article = db.prepare('SELECT id, category, region_code FROM articles WHERE id = ?').get(articleId);
  if (!article) return [];
  const safeLimit = Math.min(12, Math.max(1, Number.parseInt(limit, 10) || 4));
  return db.prepare(`
    SELECT DISTINCT candidate.*,
      CASE WHEN candidate.category = @category THEN 2 ELSE 0 END
      + CASE WHEN candidate.region_code = @regionCode THEN 1 ELSE 0 END
      + COUNT(shared_tags.tag_id) AS relevance
    FROM articles AS candidate
    LEFT JOIN article_tags AS candidate_tags ON candidate_tags.article_id = candidate.id
    LEFT JOIN article_tags AS shared_tags
      ON shared_tags.article_id = @articleId AND shared_tags.tag_id = candidate_tags.tag_id
    WHERE candidate.id <> @articleId AND candidate.publication_status = 'published'
      AND (candidate.category = @category OR candidate.region_code = @regionCode OR shared_tags.tag_id IS NOT NULL)
    GROUP BY candidate.id
    ORDER BY relevance DESC, candidate.published_at DESC, candidate.id DESC
    LIMIT @limit
  `).all({
    articleId,
    category: article.category,
    regionCode: article.region_code,
    limit: safeLimit,
  }).map(toArticle);
}

function getAdjacentArticles(articleId) {
  const article = db.prepare('SELECT id, published_at FROM articles WHERE id = ?').get(articleId);
  if (!article) return { newer: null, older: null };
  const newer = db.prepare(`
    SELECT * FROM articles
    WHERE publication_status = 'published' AND id <> ?
      AND (datetime(published_at) > datetime(?) OR (published_at = ? AND id > ?))
    ORDER BY published_at ASC, id ASC LIMIT 1
  `).get(articleId, article.published_at, article.published_at, articleId);
  const older = db.prepare(`
    SELECT * FROM articles
    WHERE publication_status = 'published' AND id <> ?
      AND (datetime(published_at) < datetime(?) OR (published_at = ? AND id < ?))
    ORDER BY published_at DESC, id DESC LIMIT 1
  `).get(articleId, article.published_at, article.published_at, articleId);
  return { newer: newer ? toArticle(newer) : null, older: older ? toArticle(older) : null };
}

function getCategories() {
  return db.prepare(`
    SELECT DISTINCT category
    FROM articles
    WHERE category IS NOT NULL AND category <> '' AND publication_status = 'published'
    ORDER BY category
  `).all().map((row) => row.category);
}

function getSitemapArticles() {
  return db.prepare(`
    SELECT slug, published_at, created_at
    FROM articles
    WHERE slug IS NOT NULL AND slug <> ''
      AND publication_status = 'published'
    ORDER BY published_at DESC, id DESC
  `).all().map((row) => ({
    slug: row.slug,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  }));
}

function getNews({ category, source, limit } = {}) {
  const conditions = [];
  const values = [];

  if (category && category !== 'all') {
    conditions.push('category = ?');
    values.push(category);
  }
  if (source) {
    conditions.push('source_id = ?');
    values.push(source);
  }

  conditions.push("publication_status = 'published'");
  let query = 'SELECT * FROM articles';
  if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
  query += ' ORDER BY published_at DESC, id DESC';

  const parsedLimit = Number.parseInt(limit, 10);
  if (Number.isInteger(parsedLimit) && parsedLimit >= 0) {
    query += ' LIMIT ?';
    values.push(parsedLimit);
  }

  const items = db.prepare(query).all(...values).map(toApiArticle);
  const latest = db.prepare('SELECT MAX(created_at) AS updatedAt FROM articles').get().updatedAt;
  return { updatedAt: latest ? new Date(`${latest}Z`).toISOString() : null, items };
}

function getSourceCounts() {
  const rows = db.prepare(`
    SELECT source_id, COUNT(*) AS count
    FROM articles
    WHERE publication_status = 'published'
    GROUP BY source_id
  `).all();
  return Object.fromEntries(rows.map((row) => [row.source_id, row.count]));
}

function getAdminSources() {
  const counts = new Map(db.prepare(`
    SELECT source_id, MAX(source_name) AS source_name, COUNT(*) AS count
    FROM articles
    GROUP BY source_id
    ORDER BY source_name COLLATE NOCASE, source_id
  `).all().map((row) => [row.source_id, row]));
  const settings = new Map(db.prepare('SELECT source_id, enabled FROM news_source_settings').all().map((row) => [row.source_id, Boolean(row.enabled)]));
  const configured = SOURCES.map((source) => ({
    sourceId: source.id,
    sourceName: source.name,
    homepage: source.homepage,
    count: counts.get(source.id)?.count || 0,
    enabled: settings.get(source.id) !== false,
    configured: true,
  }));
  const configuredIds = new Set(SOURCES.map((source) => source.id));
  const historical = [...counts.values()].filter((row) => !configuredIds.has(row.source_id)).map((row) => ({
    sourceId: row.source_id, sourceName: row.source_name, count: row.count,
    enabled: settings.get(row.source_id) !== false, configured: false,
  }));
  return [...configured, ...historical].sort((a, b) => a.sourceName.localeCompare(b.sourceName, 'ru'));
}

function isNewsSourceEnabled(sourceId) {
  const row = db.prepare('SELECT enabled FROM news_source_settings WHERE source_id = ?').get(sourceId);
  return !row || Boolean(row.enabled);
}

function setNewsSourceEnabled(sourceId, enabled) {
  if (!SOURCES.some((source) => source.id === sourceId)) return false;
  db.prepare(`
    INSERT INTO news_source_settings (source_id, enabled, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source_id) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
  `).run(sourceId, enabled ? 1 : 0);
  return true;
}

function createManualArticle({ title, body, category, slug, originalUrl, publishedAt, editorialStatus, pinnedUntil, scheduledPublishAt, publicationStatus = 'published' }) {
  const articleId = Number(db.prepare(`
    INSERT INTO articles (
      source_id, source_name, original_url, external_guid, slug, category,
      title_fi, summary_fi, title_ru, summary_ru, translation_method,
      prompt_version, published_at, editorial_status, pinned_until,
      publication_status, scheduled_publish_at
    ) VALUES (
      'editorial', 'Редакция Финские Новости', @originalUrl, @externalGuid, @slug, @category,
      @title, @body, @title, @body, 'editorial', NULL, @publishedAt, @editorialStatus, @pinnedUntil,
      @publicationStatus, @scheduledPublishAt
    )
  `).run({
    title,
    body,
    category,
    slug,
    originalUrl,
    externalGuid: originalUrl,
    publishedAt,
    editorialStatus,
    pinnedUntil,
    publicationStatus,
    scheduledPublishAt: scheduledPublishAt || null,
  }).lastInsertRowid);
  classifyAndStoreArticle(articleId, { preserveCategory: true });
  return articleId;
}

function createImportedDraft({ sourceName, originalUrl, slug, titleFi, summaryFi, titleRu, summaryRu, translationMethod, promptVersion, importedAt }) {
  const articleId = Number(db.prepare(`
    INSERT INTO articles (
      source_id, source_name, original_url, external_guid, slug, category,
      title_fi, summary_fi, title_ru, summary_ru, translation_method,
      prompt_version, published_at, publication_status, imported_at
    ) VALUES (
      'imported', ?, ?, ?, ?, NULL,
      ?, ?, ?, ?, ?, ?, ?, 'draft', ?
    )
  `).run(
    sourceName, originalUrl, originalUrl, slug,
    titleFi, summaryFi, titleRu, summaryRu, translationMethod,
    promptVersion || null, importedAt, importedAt,
  ).lastInsertRowid);
  classifyAndStoreArticle(articleId);
  return articleId;
}

function publishArticle(articleId) {
  return db.prepare(`
    UPDATE articles
    SET publication_status = 'published', scheduled_publish_at = NULL, published_at = CURRENT_TIMESTAMP
    WHERE id = ? AND publication_status = 'draft'
  `).run(articleId).changes === 1;
}

function updateArticleEditorial({ id, title, body, category, editorialStatus, pinnedUntil, scheduledPublishAt }) {
  const updated = db.prepare(`
    UPDATE articles
    SET title_ru = ?, summary_ru = ?, category = ?, editorial_status = ?, pinned_until = ?,
      scheduled_publish_at = CASE WHEN publication_status = 'draft' THEN ? ELSE NULL END
    WHERE id = ?
  `).run(title, body, category, editorialStatus, pinnedUntil, scheduledPublishAt || null, id).changes === 1;
  if (updated) classifyAndStoreArticle(id, { preserveCategory: true });
  return updated;
}

function publishScheduledArticles(now = new Date().toISOString()) {
  const publish = db.transaction(() => {
    const due = db.prepare(`
      SELECT id, slug, title_ru, title_fi
      FROM articles
      WHERE publication_status = 'draft'
        AND scheduled_publish_at IS NOT NULL
        AND datetime(scheduled_publish_at) <= datetime(?)
      ORDER BY scheduled_publish_at ASC, id ASC
    `).all(now);
    if (!due.length) return [];
    const update = db.prepare(`
      UPDATE articles
      SET publication_status = 'published', published_at = scheduled_publish_at,
        scheduled_publish_at = NULL
      WHERE id = ? AND publication_status = 'draft'
    `);
    return due.filter((article) => update.run(article.id).changes === 1).map((article) => ({
      id: article.id,
      slug: article.slug,
      title: article.title_ru || article.title_fi,
    }));
  });
  return publish();
}

const deleteArticleStatement = db.transaction((articleId) => {
  db.prepare('DELETE FROM analytics_views WHERE article_id = ?').run(articleId);
  db.prepare('DELETE FROM comments WHERE article_id = ?').run(articleId);
  db.prepare('DELETE FROM telegram_publications WHERE article_id = ?').run(articleId);
  db.prepare('DELETE FROM article_reactions WHERE article_id = ?').run(articleId);
  return db.prepare('DELETE FROM articles WHERE id = ?').run(articleId).changes === 1;
});

function deleteArticle(articleId) {
  return deleteArticleStatement(articleId);
}

function countUntranslatedArticles() {
  return db.prepare("SELECT COUNT(*) AS count FROM articles WHERE publication_status = 'published' AND (title_ru IS NULL OR trim(title_ru) = '' OR summary_ru IS NULL OR trim(summary_ru) = '')").get().count;
}

function deleteUntranslatedArticles() {
  const rows = db.prepare("SELECT id FROM articles WHERE publication_status = 'published' AND (title_ru IS NULL OR trim(title_ru) = '' OR summary_ru IS NULL OR trim(summary_ru) = '')").all();
  const remove = db.transaction(() => rows.reduce((total, row) => total + (deleteArticleStatement(row.id) ? 1 : 0), 0));
  return remove();
}

function searchArticles({ query = '', limit = 50 } = {}) {
  const parsedLimit = Number.parseInt(limit, 10);
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;
  const normalizedQuery = String(query).trim();
  const values = [];
  let where = '';
  if (normalizedQuery) {
    const pattern = normalizedQuery.replace(/[\\%_]/g, '\\$&');
    where = "WHERE COALESCE(title_ru, title_fi, '') LIKE ? ESCAPE '\\'";
    values.push(`%${pattern}%`);
  }
  return db.prepare(`
    SELECT * FROM articles
    ${where}
    ORDER BY published_at DESC, id DESC
    LIMIT ?
  `).all(...values, safeLimit).map(toArticle);
}

function getPublishedSearchCondition(query) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('ru-RU');
  if (!normalizedQuery) return null;
  const escaped = normalizedQuery.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escaped}%`;
  return {
    sql: `(
      unicode_lower(COALESCE(title_ru, '')) LIKE ? ESCAPE '\\'
      OR unicode_lower(COALESCE(title_fi, '')) LIKE ? ESCAPE '\\'
      OR unicode_lower(COALESCE(summary_ru, '')) LIKE ? ESCAPE '\\'
      OR unicode_lower(COALESCE(summary_fi, '')) LIKE ? ESCAPE '\\'
      OR unicode_lower(COALESCE(category, '')) LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM article_tags
        JOIN managed_tags ON managed_tags.id = article_tags.tag_id
        WHERE article_tags.article_id = articles.id
          AND unicode_lower(managed_tags.name) LIKE ? ESCAPE '\\'
      )
      OR EXISTS (
        SELECT 1 FROM managed_regions
        WHERE managed_regions.code = articles.region_code
          AND unicode_lower(managed_regions.name) LIKE ? ESCAPE '\\'
      )
    )`,
    values: [pattern, pattern, pattern, pattern, pattern, pattern, pattern],
  };
}

function searchPublishedArticles({ query = '', limit = 50, offset = 0 } = {}) {
  const condition = getPublishedSearchCondition(query);
  if (!condition) return [];
  const pagination = normalizePagination(limit, offset);
  return db.prepare(`
    SELECT * FROM articles
    WHERE publication_status = 'published' AND ${condition.sql}
    ORDER BY published_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...condition.values, pagination.limit, pagination.offset).map(toArticle);
}

function countPublishedSearchResults(query = '') {
  const condition = getPublishedSearchCondition(query);
  if (!condition) return 0;
  return db.prepare(`
    SELECT COUNT(*) AS count FROM articles
    WHERE publication_status = 'published' AND ${condition.sql}
  `).get(...condition.values).count;
}

function getArticleById(id) {
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
  if (!row) return null;
  const article = toArticle(row);
  return { ...article, classification: getArticleClassification(article.id) };
}

function getTelegramPublication(articleId) {
  const row = db.prepare(`
    SELECT sent_at, telegram_message_id, delivery_type
    FROM telegram_publications
    WHERE article_id = ?
  `).get(articleId);
  return row ? {
    sentAt: row.sent_at,
    telegramMessageId: row.telegram_message_id,
    deliveryType: row.delivery_type,
  } : null;
}

function recordTelegramPublication({ articleId, telegramMessageId }) {
  return db.prepare(`
    INSERT INTO telegram_publications (article_id, telegram_message_id, delivery_type)
    VALUES (?, ?, 'manual')
    ON CONFLICT(article_id) DO NOTHING
  `).run(articleId, String(telegramMessageId)).changes === 1;
}

function recordArticleReaction({ articleId, visitorHash, reactedOn, reaction }) {
  return db.prepare(`
    INSERT INTO article_reactions (article_id, visitor_hash, reacted_on, reaction)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(article_id, visitor_hash, reacted_on) DO NOTHING
  `).run(articleId, visitorHash, reactedOn, reaction).changes === 1;
}

function getReactionTotals(articleIds) {
  const ids = [...new Set(articleIds.filter((id) => Number.isInteger(id) && id > 0))];
  const totals = Object.fromEntries(ids.map((id) => [id, { like: 0, important: 0, sad: 0, total: 0 }]));
  if (!ids.length) return totals;
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT article_id, reaction, COUNT(*) AS count
    FROM article_reactions
    WHERE article_id IN (${placeholders})
    GROUP BY article_id, reaction
  `).all(...ids);
  for (const row of rows) {
    totals[row.article_id][row.reaction] = row.count;
    totals[row.article_id].total += row.count;
  }
  return totals;
}

function getAnalyticsSecret() {
  const existing = db.prepare("SELECT value FROM analytics_settings WHERE key = 'visitor_hmac_key'").get();
  if (existing) return existing.value;
  const value = require('crypto').randomBytes(32).toString('hex');
  db.prepare("INSERT INTO analytics_settings (key, value) VALUES ('visitor_hmac_key', ?)").run(value);
  return value;
}

function recordView({ articleId, visitorHash, viewedOn }) {
  const insert = db.prepare(`
    INSERT INTO analytics_views (article_id, visitor_hash, viewed_on)
    VALUES (?, ?, ?)
    ON CONFLICT(article_id, visitor_hash, viewed_on) DO NOTHING
  `);
  const record = db.transaction(() => {
    const site = insert.run(0, visitorHash, viewedOn).changes === 1;
    const article = articleId ? insert.run(articleId, visitorHash, viewedOn).changes === 1 : false;
    return { site, article };
  });
  return record();
}

function cleanupAnalytics(retentionDays) {
  const safeDays = Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : 90;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - safeDays);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  const cleanup = db.transaction(() => ({
    views: db.prepare('DELETE FROM analytics_views WHERE viewed_on < ?').run(cutoffDay).changes,
    reactions: db.prepare('DELETE FROM article_reactions WHERE reacted_on < ?').run(cutoffDay).changes,
  }));
  return cleanup();
}

function normalizeStatisticsFilters({ from, to, category = '', sourceId = '' } = {}) {
  const today = new Date();
  const toDay = /^\d{4}-\d{2}-\d{2}$/.test(String(to || '')) ? String(to) : today.toISOString().slice(0, 10);
  const parsedTo = new Date(`${toDay}T00:00:00.000Z`);
  const safeTo = Number.isNaN(parsedTo.getTime()) ? today : parsedTo;
  const defaultFrom = new Date(safeTo);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 13);
  let fromDay = /^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) ? String(from) : defaultFrom.toISOString().slice(0, 10);
  let parsedFrom = new Date(`${fromDay}T00:00:00.000Z`);
  if (Number.isNaN(parsedFrom.getTime()) || parsedFrom > safeTo) {
    parsedFrom = defaultFrom;
    fromDay = defaultFrom.toISOString().slice(0, 10);
  }
  const earliest = new Date(safeTo);
  earliest.setUTCDate(earliest.getUTCDate() - 89);
  if (parsedFrom < earliest) fromDay = earliest.toISOString().slice(0, 10);
  return { from: fromDay, to: safeTo.toISOString().slice(0, 10), category: String(category || ''), sourceId: String(sourceId || '') };
}

function getAdminStatistics(filters = {}) {
  const normalized = normalizeStatisticsFilters(filters);
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM articles WHERE publication_status = 'published') AS articleCount,
      (SELECT COUNT(*) FROM articles WHERE publication_status = 'published' AND date(published_at) = date('now')) AS publishedToday,
      (SELECT COUNT(*) FROM comments WHERE status = 'pending') AS pendingComments,
      (SELECT COUNT(*) FROM comments WHERE date(created_at) = date('now')) AS commentsToday,
      (SELECT COUNT(*) FROM analytics_views WHERE article_id = 0 AND viewed_on = date('now')) AS siteViewsToday,
      (SELECT COUNT(DISTINCT visitor_hash) FROM analytics_views WHERE article_id = 0 AND viewed_on >= date('now', '-29 days')) AS siteVisitorsMonth,
      (SELECT COUNT(*) FROM article_reactions) AS reactionCount,
      (SELECT COUNT(*) FROM article_duplicate_log WHERE date(last_seen_at) = date('now')) AS duplicatesToday
  `).get();
  const topRead = db.prepare(`
    SELECT articles.slug, articles.title_ru, articles.title_fi, COUNT(*) AS count
    FROM analytics_views
    JOIN articles ON articles.id = analytics_views.article_id
    WHERE analytics_views.article_id <> 0
      AND analytics_views.viewed_on BETWEEN @from AND @to
      AND (@category = '' OR articles.category = @category)
      AND (@sourceId = '' OR articles.source_id = @sourceId)
    GROUP BY articles.id
    ORDER BY count DESC, articles.id DESC
    LIMIT 5
  `).all(normalized).map((row) => ({ slug: row.slug, title: row.title_ru || row.title_fi, count: row.count }));
  const topCommented = db.prepare(`
    SELECT articles.slug, articles.title_ru, articles.title_fi, COUNT(*) AS count
    FROM comments
    JOIN articles ON articles.id = comments.article_id
    WHERE comments.status = 'approved'
      AND date(comments.created_at) BETWEEN @from AND @to
      AND (@category = '' OR articles.category = @category)
      AND (@sourceId = '' OR articles.source_id = @sourceId)
    GROUP BY articles.id
    ORDER BY count DESC, articles.id DESC
    LIMIT 5
  `).all(normalized).map((row) => ({ slug: row.slug, title: row.title_ru || row.title_fi, count: row.count }));
  const daily = getDailyAdminStatistics(normalized);
  const report = daily.reduce((sum, day) => ({
    articles: sum.articles + day.articles,
    visitors: sum.visitors + day.visitors,
    articleViews: sum.articleViews + day.articleViews,
    comments: sum.comments + day.comments,
    reactions: sum.reactions + day.reactions,
    duplicates: sum.duplicates + day.duplicates,
  }), { articles: 0, visitors: 0, articleViews: 0, comments: 0, reactions: 0, duplicates: 0 });
  return { ...totals, topRead, topCommented, daily, report, filters: normalized };
}

function getDailyAdminStatistics(filters = {}) {
  const normalized = normalizeStatisticsFilters(filters);
  return db.prepare(`
    WITH RECURSIVE days(day) AS (
      SELECT date(@from)
      UNION ALL
      SELECT date(day, '+1 day') FROM days WHERE day < date(@to)
    )
    SELECT days.day,
      (SELECT COUNT(*) FROM articles
        WHERE publication_status = 'published' AND date(published_at) = days.day
          AND (@category = '' OR articles.category = @category)
          AND (@sourceId = '' OR articles.source_id = @sourceId)) AS articles,
      (SELECT COUNT(DISTINCT views.visitor_hash) FROM analytics_views AS views
        JOIN articles ON articles.id = views.article_id
        WHERE views.article_id <> 0 AND views.viewed_on = days.day
          AND (@category = '' OR articles.category = @category)
          AND (@sourceId = '' OR articles.source_id = @sourceId)) AS visitors,
      (SELECT COUNT(*) FROM analytics_views AS views
        JOIN articles ON articles.id = views.article_id
        WHERE views.article_id <> 0 AND views.viewed_on = days.day
          AND (@category = '' OR articles.category = @category)
          AND (@sourceId = '' OR articles.source_id = @sourceId)) AS articleViews,
      (SELECT COUNT(*) FROM comments
        JOIN articles ON articles.id = comments.article_id
        WHERE date(comments.created_at) = days.day
          AND (@category = '' OR articles.category = @category)
          AND (@sourceId = '' OR articles.source_id = @sourceId)) AS comments,
      (SELECT COUNT(*) FROM article_reactions AS reactions
        JOIN articles ON articles.id = reactions.article_id
        WHERE reactions.reacted_on = days.day
          AND (@category = '' OR articles.category = @category)
          AND (@sourceId = '' OR articles.source_id = @sourceId)) AS reactions,
      (SELECT COUNT(*) FROM article_duplicate_log AS duplicate
        LEFT JOIN articles ON articles.id = duplicate.matched_article_id
        WHERE date(duplicate.last_seen_at) = days.day
          AND (@category = '' OR COALESCE(duplicate.category, articles.category) = @category)
          AND (@sourceId = '' OR duplicate.source_id = @sourceId)) AS duplicates
    FROM days
    ORDER BY days.day DESC
  `).all(normalized);
}

function recordAdminAction({ actorUsername, actorRole, action, targetType, targetId = null, details = null }) {
  const serializedDetails = details && Object.keys(details).length ? JSON.stringify(details) : null;
  return db.prepare(`
    INSERT INTO admin_audit_log (
      actor_username, actor_role, action, target_type, target_id, details
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(actorUsername || 'system').slice(0, 80),
    String(actorRole || 'system').slice(0, 30),
    String(action || '').slice(0, 100),
    String(targetType || '').slice(0, 80),
    targetId === null || targetId === undefined ? null : String(targetId).slice(0, 200),
    serializedDetails,
  ).lastInsertRowid;
}

function getAdminAuditLog(limit = 100) {
  const parsedLimit = Number.parseInt(limit, 10);
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 100;
  return db.prepare(`
    SELECT id, actor_username, actor_role, action, target_type, target_id, details, created_at
    FROM admin_audit_log
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(safeLimit).map((row) => {
    let details = null;
    if (row.details) {
      try {
        details = JSON.parse(row.details);
      } catch {
        details = null;
      }
    }
    return {
      id: row.id,
      actorUsername: row.actor_username,
      actorRole: row.actor_role,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details,
      createdAt: row.created_at,
    };
  });
}

function createAdminOAuthState({ stateHash, nonce, codeVerifier, expiresAt }) {
  db.prepare(`
    INSERT INTO admin_oauth_states (state_hash, nonce, code_verifier, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(stateHash, nonce, codeVerifier, expiresAt);
}

function consumeAdminOAuthState(stateHash) {
  const consume = db.transaction(() => {
    const row = db.prepare(`
      SELECT state_hash, nonce, code_verifier, expires_at
      FROM admin_oauth_states
      WHERE state_hash = ?
    `).get(stateHash);
    if (row) db.prepare('DELETE FROM admin_oauth_states WHERE state_hash = ?').run(stateHash);
    return row ? {
      stateHash: row.state_hash,
      nonce: row.nonce,
      codeVerifier: row.code_verifier,
      expiresAt: row.expires_at,
    } : null;
  });
  return consume();
}

function createAdminSession({ tokenHash, googleSub, email, displayName, role, expiresAt }) {
  db.prepare(`
    INSERT INTO admin_sessions (
      token_hash, google_sub, email, display_name, role, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(tokenHash, googleSub, email, displayName || null, role, expiresAt);
}

function getAdminSession(tokenHash) {
  const row = db.prepare(`
    SELECT token_hash, google_sub, email, display_name, role, expires_at
    FROM admin_sessions
    WHERE token_hash = ? AND datetime(expires_at) > datetime('now')
  `).get(tokenHash);
  if (!row) return null;
  db.prepare('UPDATE admin_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(tokenHash);
  return {
    tokenHash: row.token_hash,
    googleSub: row.google_sub,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    expiresAt: row.expires_at,
  };
}

function deleteAdminSession(tokenHash) {
  return db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash).changes === 1;
}

function cleanupAdminAuthData(now = new Date().toISOString()) {
  const cleanup = db.transaction(() => ({
    oauthStates: db.prepare('DELETE FROM admin_oauth_states WHERE datetime(expires_at) <= datetime(?)').run(now).changes,
    sessions: db.prepare('DELETE FROM admin_sessions WHERE datetime(expires_at) <= datetime(?)').run(now).changes,
  }));
  return cleanup();
}

function createUserOAuthState({ stateHash, nonce, codeVerifier, expiresAt }) {
  db.prepare('INSERT INTO user_oauth_states (state_hash, nonce, code_verifier, expires_at) VALUES (?, ?, ?, ?)').run(stateHash, nonce, codeVerifier, expiresAt);
}
function consumeUserOAuthState(stateHash) {
  const row = db.prepare('SELECT * FROM user_oauth_states WHERE state_hash = ?').get(stateHash);
  if (row) db.prepare('DELETE FROM user_oauth_states WHERE state_hash = ?').run(stateHash);
  return row ? { stateHash: row.state_hash, nonce: row.nonce, codeVerifier: row.code_verifier, expiresAt: row.expires_at } : null;
}
function createUserSession({ tokenHash, googleSub, email, displayName, expiresAt }) {
  const isNew = db.prepare('SELECT 1 FROM users WHERE google_sub = ?').get(googleSub) === undefined;
  db.prepare(`
    INSERT INTO users (google_sub, email, display_name)
    VALUES (?, ?, ?)
    ON CONFLICT(google_sub) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      last_login_at = CURRENT_TIMESTAMP
  `).run(googleSub, email, displayName || null);
  db.prepare('INSERT INTO user_sessions (token_hash, google_sub, email, display_name, expires_at) VALUES (?, ?, ?, ?, ?)').run(tokenHash, googleSub, email, displayName || null, expiresAt);
  return { isNew };
}

function getUserStatistics() {
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS registered,
      (SELECT COUNT(*) FROM users WHERE datetime(registered_at) >= datetime('now', '-7 days')) AS registered7Days,
      (SELECT COUNT(*) FROM users WHERE datetime(registered_at) >= datetime('now', '-30 days')) AS registered30Days,
      (SELECT COUNT(*) FROM telegram_user_links WHERE telegram_chat_id IS NOT NULL) AS telegramLinked,
      (SELECT COUNT(*) FROM user_subscriptions WHERE enabled = 1) AS subscriptionsEnabled,
      (SELECT COUNT(*) FROM user_subscriptions WHERE enabled = 1 AND frequency = 'instant') AS instant,
      (SELECT COUNT(*) FROM user_subscriptions WHERE enabled = 1 AND frequency = 'daily') AS daily,
      (SELECT COUNT(*) FROM telegram_user_deliveries) + (SELECT COUNT(*) FROM telegram_content_deliveries) AS delivered
  `).get();
  const users = db.prepare(`
    SELECT u.google_sub, u.email, u.display_name, u.registered_at, u.last_login_at,
      l.telegram_chat_id, l.linked_at, s.enabled, s.frequency, s.categories,
      s.source_ids, s.tag_ids, s.region_codes, s.audience_codes, s.content_types,
      s.updated_at,
      (SELECT COUNT(*) FROM telegram_user_deliveries d WHERE d.user_id = u.google_sub) +
      (SELECT COUNT(*) FROM telegram_content_deliveries d WHERE d.user_id = u.google_sub) AS deliveries
    FROM users u
    LEFT JOIN telegram_user_links l ON l.user_id = u.google_sub
    LEFT JOIN user_subscriptions s ON s.user_id = u.google_sub
    ORDER BY datetime(u.registered_at) DESC
    LIMIT 500
  `).all().map((row) => ({
    userId: row.google_sub, email: row.email, displayName: row.display_name,
    registeredAt: row.registered_at, lastLoginAt: row.last_login_at,
    telegramLinked: Boolean(row.telegram_chat_id), linkedAt: row.linked_at,
    enabled: Boolean(row.enabled), frequency: row.frequency || '',
    categories: csvValues(row.categories), sourceIds: csvValues(row.source_ids),
    tagIds: csvValues(row.tag_ids), regionCodes: csvValues(row.region_codes),
    audienceCodes: csvValues(row.audience_codes), contentTypes: csvValues(row.content_types),
    updatedAt: row.updated_at, deliveries: row.deliveries || 0,
  }));
  const topicRows = db.prepare("SELECT categories FROM user_subscriptions WHERE enabled = 1 AND categories <> ''").all();
  const topicCounts = new Map();
  for (const row of topicRows) for (const topic of csvValues(row.categories)) topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
  return { totals, users, topics: [...topicCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru')) };
}

function getAdminTelegramNotificationSettings() {
  return {
    enabled: getSystemSetting('admin_telegram_notifications_enabled', '0') === '1',
    chatId: getSystemSetting('admin_telegram_notifications_chat_id', ''),
    userRegistered: getSystemSetting('admin_telegram_notify_user_registered', '1') === '1',
    telegramLinked: getSystemSetting('admin_telegram_notify_telegram_linked', '1') === '1',
    subscriptionChanged: getSystemSetting('admin_telegram_notify_subscription_changed', '1') === '1',
  };
}

function saveAdminTelegramNotificationSettings(settings) {
  setSystemSettings({
    admin_telegram_notifications_enabled: settings.enabled ? '1' : '0',
    admin_telegram_notifications_chat_id: settings.chatId,
    admin_telegram_notify_user_registered: settings.userRegistered ? '1' : '0',
    admin_telegram_notify_telegram_linked: settings.telegramLinked ? '1' : '0',
    admin_telegram_notify_subscription_changed: settings.subscriptionChanged ? '1' : '0',
  });
}
function getUserSession(tokenHash) {
  const row = db.prepare("SELECT * FROM user_sessions WHERE token_hash = ? AND datetime(expires_at) > datetime('now')").get(tokenHash);
  if (!row) return null;
  try {
    db.prepare('UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(tokenHash);
  } catch (error) {
    if (!String(error && error.message || '').includes('last_seen_at')) throw error;
  }
  return { tokenHash: row.token_hash, googleSub: row.google_sub, email: row.email, displayName: row.display_name, expiresAt: row.expires_at };
}
function deleteUserSession(tokenHash) { return db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(tokenHash).changes === 1; }
function csvValues(value, fallback = []) {
  return value ? String(value).split(',').map((item) => item.trim()).filter(Boolean) : fallback;
}

function normalizeSubscriptionImportance(value) {
  return ['all', 'important', 'urgent'].includes(value) ? value : 'all';
}

function getUserSubscription(userId) {
  const defaults = {
    userId,
    enabled: false,
    frequency: 'daily',
    categories: [],
    scope: 'finland',
    importance: 'all',
    sourceIds: [],
    maxPostsPerDay: 5,
    includeOriginal: true,
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00',
    timezone: 'Europe/Helsinki',
    contentTypes: ['news'],
    wordLevel: 'A1-A2',
    wordLevels: ['A1-A2'],
    excludedCategories: [],
    tagIds: [],
    regionCodes: [],
    audienceCodes: [],
    minimumImportance: 1,
    deliveryTimes: [],
    deliveryWeekdays: ['1', '2', '3', '4', '5', '6', '0'],
    quietWeekdays: ['1', '2', '3', '4', '5', '6', '0'],
    allowCriticalDuringQuiet: false,
    persisted: false,
  };
  try {
    const row = db.prepare('SELECT * FROM user_subscriptions WHERE user_id = ?').get(userId);
    if (!row) return defaults;
    return {
      ...defaults,
      persisted: true,
      enabled: Boolean(row.enabled),
      frequency: row.frequency,
      categories: csvValues(row.categories),
      scope: row.scope,
      importance: normalizeSubscriptionImportance(row.importance_filter || row.importance),
      sourceIds: csvValues(row.source_ids),
      maxPostsPerDay: row.max_posts_per_day,
      includeOriginal: Boolean(row.include_original),
      quietHoursEnabled: Boolean(row.quiet_hours_enabled),
      quietStart: row.quiet_start || defaults.quietStart,
      quietEnd: row.quiet_end || defaults.quietEnd,
      timezone: row.timezone || defaults.timezone,
      contentTypes: csvValues(row.content_types, defaults.contentTypes),
      wordLevels: csvValues(row.word_levels || row.word_level, defaults.wordLevels).filter((level) => ['A1-A2', 'B1-B2', 'C1-C2'].includes(level)),
      wordLevel: ['A1-A2', 'B1-B2', 'C1-C2'].includes(row.word_level) ? row.word_level : defaults.wordLevel,
      excludedCategories: csvValues(row.excluded_categories),
      tagIds: csvValues(row.tag_ids),
      regionCodes: csvValues(row.region_codes, defaults.regionCodes),
      audienceCodes: csvValues(row.audience_codes),
      minimumImportance: Math.min(5, Math.max(1, Number(row.minimum_importance) || 1)),
      deliveryTimes: csvValues(row.delivery_times),
      deliveryWeekdays: csvValues(row.delivery_weekdays, defaults.deliveryWeekdays),
      quietWeekdays: csvValues(row.quiet_weekdays, defaults.quietWeekdays),
      allowCriticalDuringQuiet: Boolean(row.allow_critical_during_quiet),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('[db] failed to load user subscription', error);
    return defaults;
  }
}
function getActiveUserSubscriptions() {
  return db.prepare(`
    SELECT subscriptions.user_id, subscriptions.enabled, subscriptions.frequency,
      subscriptions.categories, subscriptions.scope, subscriptions.importance,
      subscriptions.importance_filter,
      subscriptions.source_ids, subscriptions.max_posts_per_day, subscriptions.include_original,
      subscriptions.quiet_hours_enabled, subscriptions.quiet_start, subscriptions.quiet_end,
      subscriptions.timezone, subscriptions.content_types, subscriptions.excluded_categories,
      subscriptions.word_level, subscriptions.word_levels,
      subscriptions.tag_ids, subscriptions.region_codes, subscriptions.audience_codes,
      subscriptions.minimum_importance, subscriptions.delivery_times,
      subscriptions.delivery_weekdays, subscriptions.quiet_weekdays,
      subscriptions.allow_critical_during_quiet,
      links.telegram_chat_id, links.linked_at
    FROM user_subscriptions AS subscriptions
    JOIN telegram_user_links AS links ON links.user_id = subscriptions.user_id
    WHERE subscriptions.enabled = 1 AND links.telegram_chat_id IS NOT NULL
    ORDER BY subscriptions.updated_at DESC, subscriptions.user_id ASC
  `).all().map((row) => ({
    userId: row.user_id,
    enabled: Boolean(row.enabled),
    frequency: row.frequency,
    categories: csvValues(row.categories),
    scope: row.scope,
    importance: normalizeSubscriptionImportance(row.importance_filter || row.importance),
    sourceIds: csvValues(row.source_ids),
    maxPostsPerDay: row.max_posts_per_day,
    includeOriginal: Boolean(row.include_original),
    quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietStart: row.quiet_start || '22:00',
    quietEnd: row.quiet_end || '07:00',
    timezone: row.timezone || 'Europe/Helsinki',
    contentTypes: csvValues(row.content_types, ['news']),
    wordLevels: csvValues(row.word_levels || row.word_level, ['A1-A2']).filter((level) => ['A1-A2', 'B1-B2', 'C1-C2'].includes(level)),
    wordLevel: ['A1-A2', 'B1-B2', 'C1-C2'].includes(row.word_level) ? row.word_level : 'A1-A2',
    excludedCategories: csvValues(row.excluded_categories),
    tagIds: csvValues(row.tag_ids),
    regionCodes: csvValues(row.region_codes),
    audienceCodes: csvValues(row.audience_codes),
    minimumImportance: Math.min(5, Math.max(1, Number(row.minimum_importance) || 1)),
    deliveryTimes: csvValues(row.delivery_times),
    deliveryWeekdays: csvValues(row.delivery_weekdays, ['1', '2', '3', '4', '5', '6', '0']),
    quietWeekdays: csvValues(row.quiet_weekdays, ['1', '2', '3', '4', '5', '6', '0']),
    allowCriticalDuringQuiet: Boolean(row.allow_critical_during_quiet),
    telegramChatId: row.telegram_chat_id,
    linkedAt: row.linked_at,
  }));
}
function upsertUserSubscription({
  userId,
  enabled,
  frequency,
  categories,
  scope,
  importance,
  sourceIds,
  maxPostsPerDay,
  includeOriginal,
  quietHoursEnabled = false,
  quietStart = '22:00',
  quietEnd = '07:00',
  timezone = 'Europe/Helsinki',
  contentTypes = ['news'],
  wordLevel = 'A1-A2',
  wordLevels,
  excludedCategories = [],
  tagIds = [],
  regionCodes = [],
  audienceCodes = [],
  minimumImportance = 1,
  deliveryTimes = [],
  deliveryWeekdays = ['1', '2', '3', '4', '5', '6', '0'],
  quietWeekdays = ['1', '2', '3', '4', '5', '6', '0'],
  allowCriticalDuringQuiet = false,
}) {
  const settings = {
    enabled: Boolean(enabled),
    frequency,
    categories,
    scope,
    importance: normalizeSubscriptionImportance(importance),
    sourceIds,
    maxPostsPerDay,
    includeOriginal: Boolean(includeOriginal),
    quietHoursEnabled: Boolean(quietHoursEnabled),
    quietStart,
    quietEnd,
    timezone,
    contentTypes,
    wordLevels: [...new Set((Array.isArray(wordLevels) ? wordLevels : [wordLevel]).filter((level) => ['A1-A2', 'B1-B2', 'C1-C2'].includes(level)))],
    wordLevel: ['A1-A2', 'B1-B2', 'C1-C2'].includes(wordLevel) ? wordLevel : 'A1-A2',
    excludedCategories,
    tagIds,
    regionCodes,
    audienceCodes,
    minimumImportance: Math.min(5, Math.max(1, Number(minimumImportance) || 1)),
    deliveryTimes,
    deliveryWeekdays,
    quietWeekdays,
    allowCriticalDuringQuiet: Boolean(allowCriticalDuringQuiet),
  };
  if (!settings.wordLevels.length) settings.wordLevels = ['A1-A2'];
  const save = db.transaction(() => {
    db.prepare(`
      INSERT INTO user_subscriptions (
        user_id, enabled, frequency, categories, scope, importance, importance_filter, source_ids,
        max_posts_per_day, include_original, quiet_hours_enabled, quiet_start,
        quiet_end, timezone, content_types, word_level, word_levels, excluded_categories, tag_ids,
        region_codes, audience_codes, minimum_importance, delivery_times,
        delivery_weekdays, quiet_weekdays, allow_critical_during_quiet, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        enabled=excluded.enabled,
        frequency=excluded.frequency,
        categories=excluded.categories,
        scope=excluded.scope,
        importance=excluded.importance,
        importance_filter=excluded.importance_filter,
        source_ids=excluded.source_ids,
        max_posts_per_day=excluded.max_posts_per_day,
        include_original=excluded.include_original,
        quiet_hours_enabled=excluded.quiet_hours_enabled,
        quiet_start=excluded.quiet_start,
        quiet_end=excluded.quiet_end,
        timezone=excluded.timezone,
        content_types=excluded.content_types,
        word_level=excluded.word_level,
        word_levels=excluded.word_levels,
        excluded_categories=excluded.excluded_categories,
        tag_ids=excluded.tag_ids,
        region_codes=excluded.region_codes,
        audience_codes=excluded.audience_codes,
        minimum_importance=excluded.minimum_importance,
        delivery_times=excluded.delivery_times,
        delivery_weekdays=excluded.delivery_weekdays,
        quiet_weekdays=excluded.quiet_weekdays,
        allow_critical_during_quiet=excluded.allow_critical_during_quiet,
        updated_at=CURRENT_TIMESTAMP
    `).run(
      userId, settings.enabled ? 1 : 0, frequency, categories.join(','), scope,
      settings.importance === 'urgent' ? 'important' : settings.importance, settings.importance,
      sourceIds.join(','), maxPostsPerDay, settings.includeOriginal ? 1 : 0,
      settings.quietHoursEnabled ? 1 : 0, quietStart, quietEnd, timezone,
      contentTypes.join(','), settings.wordLevels[0] || settings.wordLevel, settings.wordLevels.join(','), excludedCategories.join(','), tagIds.join(','),
      regionCodes.join(','), audienceCodes.join(','), settings.minimumImportance,
      deliveryTimes.join(','), deliveryWeekdays.join(','), quietWeekdays.join(','),
      settings.allowCriticalDuringQuiet ? 1 : 0,
    );
    db.prepare(`
      INSERT INTO user_preference_history (user_id, settings_json)
      VALUES (?, ?)
    `).run(userId, JSON.stringify(settings));
  });
  save();
}
function createTelegramLinkCode({ userId, linkCodeHash, expiresAt }) { db.prepare('INSERT INTO telegram_user_links (user_id,link_code_hash,code_expires_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET link_code_hash=excluded.link_code_hash,code_expires_at=excluded.code_expires_at,telegram_chat_id=NULL,linked_at=NULL').run(userId, linkCodeHash, expiresAt); }
function linkTelegramUser({ linkCodeHash, telegramChatId }) {
  const link = db.prepare("SELECT user_id FROM telegram_user_links WHERE link_code_hash = ? AND datetime(code_expires_at) > datetime('now')").get(linkCodeHash);
  if (!link) return null;
  const result = db.prepare("UPDATE telegram_user_links SET telegram_chat_id = ?, linked_at = CURRENT_TIMESTAMP, link_code_hash = NULL, code_expires_at = NULL WHERE user_id = ? AND link_code_hash = ?").run(String(telegramChatId), link.user_id, linkCodeHash);
  return result.changes === 1 ? link.user_id : null;
}
function getTelegramUserLink(userId) {
  try {
    const row = db.prepare('SELECT telegram_chat_id, linked_at FROM telegram_user_links WHERE user_id = ?').get(userId);
    return row ? { telegramChatId: row.telegram_chat_id, linkedAt: row.linked_at } : null;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('[db] failed to load telegram user link', error);
    return null;
  }
}
function getTelegramUserByChatId(chatId) {
  const row = db.prepare(`
    SELECT links.user_id, users.email, users.display_name
    FROM telegram_user_links AS links
    LEFT JOIN users ON users.google_sub = links.user_id
    WHERE links.telegram_chat_id = ?
  `).get(String(chatId));
  return row ? { userId: row.user_id, email: row.email || '', displayName: row.display_name || '' } : null;
}

function getTelegramAssistantProfile(userId) {
  const row = db.prepare('SELECT * FROM telegram_assistant_profiles WHERE user_id = ?').get(userId);
  return row ? {
    city: row.city,
    lifeStatus: row.life_status,
    hasChildren: Boolean(row.has_children),
    housing: row.housing,
    transport: row.transport,
    interests: csvValues(row.interests),
    modes: csvValues(row.modes),
    groceryOffersEnabled: Boolean(row.grocery_offers_enabled),
    groceryChains: csvValues(row.grocery_chains),
  } : { city: '', lifeStatus: '', hasChildren: false, housing: '', transport: '', interests: [], modes: [], groceryOffersEnabled: false, groceryChains: [] };
}

function saveTelegramAssistantProfile(userId, profile = {}) {
  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  const modes = Array.isArray(profile.modes) ? profile.modes : [];
  const groceryChains = Array.isArray(profile.groceryChains) ? profile.groceryChains : [];
  return db.prepare(`
    INSERT INTO telegram_assistant_profiles
      (user_id, city, life_status, has_children, housing, transport, interests, modes,
       grocery_offers_enabled, grocery_chains, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET city=excluded.city, life_status=excluded.life_status,
      has_children=excluded.has_children, housing=excluded.housing, transport=excluded.transport,
      interests=excluded.interests, modes=excluded.modes,
      grocery_offers_enabled=excluded.grocery_offers_enabled, grocery_chains=excluded.grocery_chains,
      updated_at=CURRENT_TIMESTAMP
  `).run(userId, String(profile.city || '').slice(0, 80), String(profile.lifeStatus || '').slice(0, 80),
    profile.hasChildren ? 1 : 0, String(profile.housing || '').slice(0, 80),
    String(profile.transport || '').slice(0, 80), interests.join(','), modes.join(','),
    profile.groceryOffersEnabled ? 1 : 0, groceryChains.join(',')).changes > 0;
}

function getTelegramConversation(chatId) {
  const row = db.prepare('SELECT * FROM telegram_conversations WHERE chat_id = ?').get(String(chatId));
  return row ? { chatId: row.chat_id, userId: row.user_id, articleId: row.article_id, pendingAction: row.pending_action, draftText: row.draft_text } : null;
}

function saveTelegramConversation({ chatId, userId = null, articleId = null, pendingAction = '', draftText = '' }) {
  return db.prepare(`
    INSERT INTO telegram_conversations (chat_id, user_id, article_id, pending_action, draft_text, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chat_id) DO UPDATE SET user_id=excluded.user_id, article_id=excluded.article_id,
      pending_action=excluded.pending_action, draft_text=excluded.draft_text, updated_at=CURRENT_TIMESTAMP
  `).run(String(chatId), userId, articleId, pendingAction, String(draftText || '').slice(0, 3000)).changes > 0;
}

function clearTelegramConversation(chatId) {
  return db.prepare('DELETE FROM telegram_conversations WHERE chat_id = ?').run(String(chatId)).changes > 0;
}

function toggleTelegramTopicFollow(userId, topic) {
  const normalized = String(topic || '').trim().slice(0, 120);
  if (!normalized) return false;
  const existing = db.prepare('SELECT 1 FROM telegram_topic_follows WHERE user_id = ? AND topic = ?').get(userId, normalized);
  if (existing) {
    db.prepare('DELETE FROM telegram_topic_follows WHERE user_id = ? AND topic = ?').run(userId, normalized);
    return false;
  }
  db.prepare('INSERT INTO telegram_topic_follows (user_id, topic) VALUES (?, ?)').run(userId, normalized);
  return true;
}

function getTelegramTopicFollows(userId) {
  return db.prepare('SELECT topic FROM telegram_topic_follows WHERE user_id = ? ORDER BY created_at DESC').all(userId).map((row) => row.topic);
}

function toggleTelegramSavedArticle(userId, articleId) {
  const existing = db.prepare('SELECT 1 FROM telegram_saved_articles WHERE user_id = ? AND article_id = ?').get(userId, articleId);
  if (existing) {
    db.prepare('DELETE FROM telegram_saved_articles WHERE user_id = ? AND article_id = ?').run(userId, articleId);
    return false;
  }
  db.prepare('INSERT INTO telegram_saved_articles (user_id, article_id) VALUES (?, ?)').run(userId, articleId);
  return true;
}

function getTelegramSavedArticles(userId, limit = 20) {
  return db.prepare(`
    SELECT articles.* FROM telegram_saved_articles
    JOIN articles ON articles.id = telegram_saved_articles.article_id
    WHERE telegram_saved_articles.user_id = ? AND articles.publication_status = 'published'
    ORDER BY telegram_saved_articles.created_at DESC LIMIT ?
  `).all(userId, Math.min(50, Math.max(1, Number(limit) || 20))).map(toArticle);
}

function createTelegramReminder({ userId, chatId, articleId = null, reminderText, remindAt }) {
  return db.prepare(`
    INSERT INTO telegram_reminders (user_id, chat_id, article_id, reminder_text, remind_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, String(chatId), articleId, String(reminderText || '').slice(0, 500), remindAt).lastInsertRowid;
}

function getTelegramReminders(userId, { pendingOnly = true, limit = 30 } = {}) {
  return db.prepare(`
    SELECT reminders.*, articles.slug, articles.title_ru, articles.title_fi
    FROM telegram_reminders AS reminders
    LEFT JOIN articles ON articles.id = reminders.article_id
    WHERE reminders.user_id = ? ${pendingOnly ? "AND reminders.status = 'pending'" : ''}
    ORDER BY reminders.remind_at ASC LIMIT ?
  `).all(userId, Math.min(100, Math.max(1, Number(limit) || 30))).map((row) => ({
    id: row.id, userId: row.user_id, chatId: row.chat_id, articleId: row.article_id,
    reminderText: row.reminder_text, remindAt: row.remind_at, status: row.status,
    articleSlug: row.slug, articleTitle: row.title_ru || row.title_fi || '',
  }));
}

function getDueTelegramReminders(now = new Date().toISOString(), limit = 50) {
  return db.prepare(`
    SELECT reminders.*, articles.slug, articles.title_ru, articles.title_fi
    FROM telegram_reminders AS reminders
    LEFT JOIN articles ON articles.id = reminders.article_id
    WHERE reminders.status = 'pending' AND datetime(reminders.remind_at) <= datetime(?)
    ORDER BY reminders.remind_at ASC LIMIT ?
  `).all(now, Math.min(100, Math.max(1, Number(limit) || 50))).map((row) => ({
    id: row.id, userId: row.user_id, chatId: row.chat_id, articleId: row.article_id,
    reminderText: row.reminder_text, remindAt: row.remind_at,
    articleSlug: row.slug, articleTitle: row.title_ru || row.title_fi || '',
  }));
}

function markTelegramReminderSent(id) {
  return db.prepare("UPDATE telegram_reminders SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").run(id).changes === 1;
}

function cancelTelegramReminder(userId, id) {
  return db.prepare("UPDATE telegram_reminders SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'").run(id, userId).changes === 1;
}

function createArticleIssueReport({ articleId, userId = null, reportType = 'other', body }) {
  return db.prepare(`
    INSERT INTO article_issue_reports (article_id, user_id, report_type, body)
    VALUES (?, ?, ?, ?)
  `).run(articleId, userId, String(reportType || 'other').slice(0, 40), String(body || '').slice(0, 2000)).lastInsertRowid;
}
function countTelegramUserDeliveries({ userId, day }) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM telegram_user_deliveries
    WHERE user_id = ?
      AND date(sent_at) = date(?)
  `).get(userId, day);
  return row.count;
}
function recordTelegramUserDelivery({ userId, articleId, telegramMessageId = null }) {
  return db.prepare(`
    INSERT INTO telegram_user_deliveries (user_id, article_id, telegram_message_id)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, article_id) DO UPDATE SET
      telegram_message_id = COALESCE(excluded.telegram_message_id, telegram_user_deliveries.telegram_message_id)
  `).run(userId, articleId, telegramMessageId ? String(telegramMessageId) : null).changes > 0;
}
function hasTelegramUserDelivery({ userId, articleId }) {
  return Boolean(db.prepare('SELECT 1 FROM telegram_user_deliveries WHERE user_id = ? AND article_id = ?').get(userId, articleId));
}
function hasTelegramContentDelivery({ userId, contentKey }) {
  return Boolean(db.prepare('SELECT 1 FROM telegram_content_deliveries WHERE user_id = ? AND content_key = ?').get(userId, contentKey));
}
function recordTelegramContentDelivery({ userId, contentKey, contentType, telegramMessageId = null }) {
  return db.prepare(`
    INSERT OR IGNORE INTO telegram_content_deliveries (
      user_id, content_key, content_type, telegram_message_id
    ) VALUES (?, ?, ?, ?)
  `).run(userId, contentKey, contentType, telegramMessageId ? String(telegramMessageId) : null).changes === 1;
}
function getPublishedArticlesSince(sinceIso) {
  return db.prepare(`
    SELECT *
    FROM articles
    WHERE publication_status = 'published'
      AND datetime(published_at) >= datetime(?)
    ORDER BY published_at ASC, id ASC
  `).all(sinceIso).map(toArticle).map((article) => ({
    ...article,
    classification: getArticleClassification(article.id),
  }));
}

function enqueueTask({ taskType, payload, idempotencyKey, maxAttempts = 5, availableAt = null }) {
  return db.prepare(`
    INSERT INTO task_queue (task_type, payload_json, idempotency_key, max_attempts, available_at)
    VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    ON CONFLICT(idempotency_key) DO NOTHING
  `).run(taskType, JSON.stringify(payload || {}), idempotencyKey, maxAttempts, availableAt).changes === 1;
}

function claimDueTasks(taskType, limit = 10) {
  const safeLimit = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 10));
  return db.transaction(() => {
    const rows = db.prepare(`
      SELECT * FROM task_queue
      WHERE task_type = ? AND status IN ('queued','retry')
        AND datetime(available_at) <= datetime('now')
      ORDER BY available_at ASC, id ASC LIMIT ?
    `).all(taskType, safeLimit);
    const claim = db.prepare(`
      UPDATE task_queue SET status = 'running', locked_at = CURRENT_TIMESTAMP,
        attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('queued','retry')
    `);
    return rows.filter((row) => claim.run(row.id).changes === 1).map((row) => ({
      id: row.id,
      taskType: row.task_type,
      payload: JSON.parse(row.payload_json),
      idempotencyKey: row.idempotency_key,
      attempts: row.attempts + 1,
      maxAttempts: row.max_attempts,
    }));
  })();
}

function completeTask(id) {
  return db.prepare(`
    UPDATE task_queue SET status = 'done', locked_at = NULL,
      last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(id).changes === 1;
}

function failTask(id, errorMessage) {
  const row = db.prepare('SELECT attempts, max_attempts FROM task_queue WHERE id = ?').get(id);
  if (!row) return false;
  const dead = row.attempts >= row.max_attempts;
  const delayMinutes = Math.min(60, 2 ** Math.max(0, row.attempts - 1));
  return db.prepare(`
    UPDATE task_queue SET status = ?, locked_at = NULL, last_error = ?,
      available_at = datetime('now', ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(dead ? 'dead' : 'retry', String(errorMessage || 'unknown_error').slice(0, 500), `+${delayMinutes} minutes`, id).changes === 1;
}

function recordTelegramDeliveryAttempt({ userId = null, articleId = null, deliveryKind, status, telegramMessageId = null, errorCode = null }) {
  return db.prepare(`
    INSERT INTO telegram_delivery_log (
      user_id, article_id, delivery_kind, status, telegram_message_id, error_code
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, articleId, deliveryKind, status, telegramMessageId ? String(telegramMessageId) : null, errorCode).lastInsertRowid;
}

function recordSearchQuery(query, resultCount) {
  return db.prepare('INSERT INTO search_analytics (query, result_count) VALUES (?, ?)').run(String(query).slice(0, 120), Number(resultCount) || 0).lastInsertRowid;
}

function getOperationalMetrics() {
  const reduceCounts = (rows) => rows.reduce((result, row) => ({ ...result, [row.status]: row.count }), {});
  const queue = reduceCounts(db.prepare('SELECT status, COUNT(*) AS count FROM task_queue GROUP BY status').all());
  const delivery = reduceCounts(db.prepare(`
    SELECT status, COUNT(*) AS count FROM telegram_delivery_log
    WHERE attempted_at >= datetime('now', '-24 hours') GROUP BY status
  `).all());
  const searches = db.prepare(`
    SELECT query, COUNT(*) AS searches, MAX(result_count) AS resultCount
    FROM search_analytics WHERE searched_on >= date('now', '-6 days')
    GROUP BY unicode_lower(query) ORDER BY searches DESC, query ASC LIMIT 10
  `).all();
  return { queue, delivery, searches };
}

function createComment({ articleId, authorName, body, telegramChatId = null }) {
  return db.prepare(`
    INSERT INTO comments (article_id, author_name, body, telegram_chat_id, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(articleId, authorName, body, telegramChatId ? String(telegramChatId) : null).lastInsertRowid;
}

function getCommentById(commentId) {
  const row = db.prepare(`
    SELECT comments.id, comments.article_id, comments.author_name, comments.body,
      comments.status, comments.telegram_chat_id, articles.slug, articles.title_ru, articles.title_fi
    FROM comments JOIN articles ON articles.id = comments.article_id WHERE comments.id = ?
  `).get(commentId);
  return row ? { id: row.id, articleId: row.article_id, authorName: row.author_name, body: row.body,
    status: row.status, telegramChatId: row.telegram_chat_id, articleSlug: row.slug,
    articleTitle: row.title_ru || row.title_fi } : null;
}

function getApprovedComments(articleId) {
  return db.prepare(`
    SELECT id, author_name, body, created_at
    FROM comments
    WHERE article_id = ? AND status = 'approved'
    ORDER BY created_at ASC, id ASC
  `).all(articleId).map((row) => ({
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  }));
}

function getLatestApprovedComments(limit = 12) {
  const parsedLimit = Number.parseInt(limit, 10);
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 30) : 12;
  return db.prepare(`
    SELECT comments.id, comments.author_name, comments.body, comments.created_at,
      articles.slug, articles.title_ru, articles.title_fi
    FROM comments
    JOIN articles ON articles.id = comments.article_id
    WHERE comments.status = 'approved' AND articles.publication_status = 'published'
    ORDER BY comments.created_at DESC, comments.id DESC
    LIMIT ?
  `).all(safeLimit).map((row) => ({
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    articleSlug: row.slug,
    articleTitle: row.title_ru || row.title_fi,
  }));
}

function getPendingComments() {
  return db.prepare(`
    SELECT comments.id, comments.author_name, comments.body, comments.created_at,
      articles.slug, articles.title_ru, articles.title_fi
    FROM comments
    JOIN articles ON articles.id = comments.article_id
    WHERE comments.status = 'pending'
    ORDER BY comments.created_at ASC, comments.id ASC
  `).all().map((row) => ({
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    articleSlug: row.slug,
    articleTitle: row.title_ru || row.title_fi,
  }));
}

function getAdminComments(limit = 100) {
  const parsedLimit = Number.parseInt(limit, 10);
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 300) : 100;
  return db.prepare(`
    SELECT comments.id, comments.author_name, comments.body, comments.status, comments.created_at,
      articles.slug, articles.title_ru, articles.title_fi
    FROM comments
    JOIN articles ON articles.id = comments.article_id
    ORDER BY CASE comments.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      comments.created_at DESC, comments.id DESC
    LIMIT ?
  `).all(safeLimit).map((row) => ({
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    articleSlug: row.slug,
    articleTitle: row.title_ru || row.title_fi,
  }));
}

function updateComment({ id, authorName, body }) {
  return db.prepare(`
    UPDATE comments
    SET author_name = ?, body = ?
    WHERE id = ?
  `).run(authorName, body, id).changes === 1;
}

function updateCommentStatus(commentId, status) {
  return db.prepare(`
    UPDATE comments
    SET status = ?
    WHERE id = ?
  `).run(status, commentId).changes === 1;
}

function deleteComment(commentId) {
  return db.prepare('DELETE FROM comments WHERE id = ?').run(commentId).changes === 1;
}

function createContactMessage({ name, email, body }) {
  return db.prepare('INSERT INTO contact_messages (name, email, body) VALUES (?, ?, ?)').run(name, email, body).lastInsertRowid;
}

function hasRecentContactMessage({ email, body, windowHours = 24 }) {
  const safeWindowHours = Math.min(Math.max(Number.parseInt(windowHours, 10) || 24, 1), 720);
  return Boolean(db.prepare(`
    SELECT 1
    FROM contact_messages
    WHERE lower(email) = lower(?)
      AND body = ?
      AND created_at >= datetime('now', ?)
    LIMIT 1
  `).get(email, body, `-${safeWindowHours} hours`));
}

function createAdminNotification({ notificationKey, level = 'info', title, body }) {
  return db.prepare(`
    INSERT INTO admin_notifications (
      notification_key, level, title, body, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'new', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(notification_key) DO UPDATE SET
      level = excluded.level,
      title = excluded.title,
      body = excluded.body,
      updated_at = CURRENT_TIMESTAMP
  `).run(notificationKey, level, title, body).changes > 0;
}

function getAdminNotifications(limit = 50) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
  return db.prepare(`
    SELECT id, notification_key, level, title, body, status, created_at, updated_at
    FROM admin_notifications
    ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT ?
  `).all(safeLimit).map((row) => ({
    id: row.id,
    notificationKey: row.notification_key,
    level: row.level,
    title: row.title,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function markAdminNotificationRead(id) {
  return db.prepare("UPDATE admin_notifications SET status = 'read' WHERE id = ?").run(id).changes === 1;
}

function countUnreadAdminNotifications() {
  return db.prepare("SELECT COUNT(*) AS count FROM admin_notifications WHERE status = 'new'").get().count;
}

function getSystemSetting(key, fallback = '') {
  const row = db.prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?').get(key);
  return row ? row.setting_value : fallback;
}

function setSystemSettings(entries) {
  const statement = db.prepare(`
    INSERT INTO system_settings (setting_key, setting_value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_at = CURRENT_TIMESTAMP
  `);
  const save = db.transaction((pairs) => {
    for (const [key, value] of pairs) statement.run(key, String(value));
  });
  save(Object.entries(entries));
}

function getTelegramChannelSettings() {
  const parsedMinimumScore = Number.parseInt(getSystemSetting('telegram_channel_minimum_score', '65'), 10);
  return {
    enabled: getSystemSetting('telegram_channel_enabled', '0') === '1',
    enabledSince: getSystemSetting('telegram_channel_enabled_since', ''),
    chatId: getSystemSetting('telegram_channel_chat_id', '@finskienovosti'),
    categories: getSystemSetting('telegram_channel_categories', ''),
    importance: getSystemSetting('telegram_channel_importance', 'all'),
    minimumScore: Math.min(Math.max(Number.isInteger(parsedMinimumScore) ? parsedMinimumScore : 65, 0), 100),
    intervalMinutes: Math.min(Math.max(Number.parseInt(getSystemSetting('telegram_channel_interval_minutes', '0'), 10) || 0, 0), 1440),
    maxPostsPerDay: Math.min(Math.max(Number.parseInt(getSystemSetting('telegram_channel_max_posts_per_day', '20'), 10) || 20, 1), 100),
    quietHoursEnabled: getSystemSetting('telegram_channel_quiet_hours_enabled', '0') === '1',
    quietStart: getSystemSetting('telegram_channel_quiet_start', '22:00'),
    quietEnd: getSystemSetting('telegram_channel_quiet_end', '07:00'),
    includeOriginal: getSystemSetting('telegram_channel_include_original', '0') === '1',
    template: getSystemSetting('telegram_channel_template', '<b>🔥 {title}</b>\\n\\n{excerpt}\\n\\n📁 {source} || {category}\\n\\n👉 <a href="{article_url}">Читать далее</a>'),
  };
}

function saveTelegramChannelSettings(settings) {
  const wasEnabled = getSystemSetting('telegram_channel_enabled', '0') === '1';
  const currentEnabledSince = getSystemSetting('telegram_channel_enabled_since', '');
  const enabledSince = settings.enabled
    ? (wasEnabled && currentEnabledSince ? currentEnabledSince : new Date().toISOString())
    : '';
  setSystemSettings({
    telegram_channel_enabled: settings.enabled ? '1' : '0',
    telegram_channel_enabled_since: enabledSince,
    telegram_channel_chat_id: settings.chatId,
    telegram_channel_categories: settings.categories,
    telegram_channel_importance: settings.importance,
    telegram_channel_minimum_score: settings.minimumScore,
    telegram_channel_interval_minutes: settings.intervalMinutes,
    telegram_channel_max_posts_per_day: settings.maxPostsPerDay,
    telegram_channel_quiet_hours_enabled: settings.quietHoursEnabled ? '1' : '0',
    telegram_channel_quiet_start: settings.quietStart,
    telegram_channel_quiet_end: settings.quietEnd,
    telegram_channel_include_original: settings.includeOriginal ? '1' : '0',
    telegram_channel_template: settings.template,
  });
}

function getTelegramChannelPublication(articleId) {
  return db.prepare('SELECT * FROM telegram_channel_publications WHERE article_id = ?').get(articleId) || null;
}

function getLastTelegramChannelPublication(channelChatId) {
  return db.prepare(`
    SELECT * FROM telegram_channel_publications
    WHERE channel_chat_id = ?
    ORDER BY datetime(sent_at) DESC, article_id DESC
    LIMIT 1
  `).get(channelChatId) || null;
}

function recordTelegramChannelPublication({ articleId, channelChatId, telegramMessageId, deliveryType }) {
  return db.prepare(`
    INSERT INTO telegram_channel_publications (
      article_id, channel_chat_id, telegram_message_id, delivery_type
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(article_id) DO NOTHING
  `).run(articleId, channelChatId, String(telegramMessageId), deliveryType).changes === 1;
}

function countTelegramChannelPublicationsToday(channelChatId) {
  return db.prepare(`
    SELECT COUNT(*) AS count FROM telegram_channel_publications
    WHERE channel_chat_id = ? AND date(sent_at) = date('now')
  `).get(channelChatId).count;
}

function getContactMessages(limit = 100) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 300);
  return db.prepare('SELECT id, name, email, body, status, created_at FROM contact_messages ORDER BY CASE status WHEN \'new\' THEN 0 WHEN \'read\' THEN 1 ELSE 2 END, created_at DESC, id DESC LIMIT ?').all(safeLimit).map((row) => ({ id: row.id, name: row.name, email: row.email, body: row.body, status: row.status, createdAt: row.created_at }));
}

function updateContactMessageStatus(id, status) {
  return db.prepare('UPDATE contact_messages SET status = ? WHERE id = ?').run(status, id).changes === 1;
}

function createEditorialDiscussion({ articleId, note, question, createdBy }) {
  return db.prepare('INSERT INTO editorial_discussions (article_id,note,question,created_by) VALUES (?,?,?,?)').run(articleId, note, question, createdBy).lastInsertRowid;
}
function getEditorialDiscussions(articleId) {
  return db.prepare('SELECT * FROM editorial_discussions WHERE article_id = ? AND status != \'deleted\' ORDER BY id DESC').all(articleId).map((r) => ({ id:r.id, articleId:r.article_id, note:r.note, question:r.question, status:r.status, createdBy:r.created_by, createdAt:r.created_at }));
}
function updateEditorialDiscussion(id, fields) {
  const allowed = new Set(['draft','approved','published','deleted']);
  if (!allowed.has(fields.status)) return false;
  return db.prepare('UPDATE editorial_discussions SET note = ?, question = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(fields.note, fields.question, fields.status, id).changes === 1;
}

function getUnreadContactMessageCount() {
  return db.prepare("SELECT COUNT(*) AS count FROM contact_messages WHERE status = 'new'").get().count;
}

function getManagedTaxonomy() {
  const listWithUsage = (type) => taxonomyRepository.list(type).map((item) => ({
    ...item,
    usage: taxonomyRepository.usage(type, item.id),
  }));
  return {
    categories: listWithUsage('categories'),
    tags: listWithUsage('tags'),
    regions: listWithUsage('regions'),
    audiences: listWithUsage('audiences'),
  };
}

function getVisibleManagedCategories() {
  return taxonomyRepository.list('categories', { includeHidden: false });
}

function getManagedCategoryBySlug(slug) {
  return taxonomyRepository.categoryBySlug(slug);
}

function resolveManagedCategorySlug(slug) {
  return taxonomyRepository.categoryResolution(slug);
}

function getManagedCategoryByName(name) {
  return taxonomyRepository.categoryByName(name);
}

function createManagedTaxonomyItem(type, input) {
  return taxonomyRepository.create(type, input);
}

function updateManagedTaxonomyItem(type, id, input) {
  return taxonomyRepository.update(type, id, input);
}

function setManagedTaxonomyVisibility(type, id, isVisible) {
  return taxonomyRepository.setVisibility(type, id, isVisible);
}

function deleteManagedTaxonomyItem(type, id) {
  return taxonomyRepository.remove(type, id);
}

function mergeManagedCategories(sourceId, targetId, actor) {
  return taxonomyRepository.mergeCategories(sourceId, targetId, actor);
}

function getManagedTaxonomyUsage(type, id) {
  return taxonomyRepository.usage(type, id);
}

module.exports = {
  articleExists,
  claimDueTasks,
  cleanupAnalytics,
  completeTask,
  countArticles,
  countArticlesByCategory,
  countArticlesByRegionCode,
  countArticlesByTagSlug,
  countPublishedSearchResults,
  createComment,
  createAdminOAuthState,
  createAdminSession,
  createManualArticle,
  createImportedDraft,
  createDatabase,
  databasePath,
  deleteComment,
  deleteAdminSession,
  deleteArticle,
  countUntranslatedArticles,
  deleteUntranslatedArticles,
  enqueueTask,
  failTask,
  findSimilarArticle,
  getAdminAuditLog,
  getAdminSession,
  getArticleBySlug,
  getArticleById,
  getArticleClassification,
  getQualityReviewQueue,
  countQualityReviewQueue,
  reviewArticleQuality,
  getArticles,
  getArticlesByCategory,
  getArticlesByRegionCode,
  getArticlesByTagSlug,
  getAdjacentArticles,
  getRelatedArticles,
  getHomeArticles,
  getApprovedComments,
  getCommentById,
  getLatestApprovedComments,
  getCategories,
  getNews,
  getOperationalMetrics,
  getAnalyticsSecret,
  getAdminStatistics,
  getAdminSources,
  isNewsSourceEnabled,
  setNewsSourceEnabled,
  getAdminComments,
  getDailyAdminStatistics,
  getPendingComments,
  getRecentDuplicateArticles,
  getArticleRankingSignals,
  getDuplicateArticleById,
  getArticleSourceMentions,
  getSourceCounts,
  getSitemapArticles,
  getTelegramPublication,
  insertArticle,
  classifyAndStoreArticle,
  classifyUnclassifiedArticles,
  publishArticle,
  publishScheduledArticles,
  cleanupAdminAuthData,
  createUserOAuthState,
  consumeUserOAuthState,
  createUserSession,
  getUserStatistics,
  getUserSession,
  deleteUserSession,
  getUserSubscription,
  getActiveUserSubscriptions,
  upsertUserSubscription,
  createTelegramLinkCode,
  linkTelegramUser,
  getTelegramUserLink,
  getTelegramUserByChatId,
  getTelegramAssistantProfile,
  saveTelegramAssistantProfile,
  getTelegramConversation,
  saveTelegramConversation,
  clearTelegramConversation,
  toggleTelegramTopicFollow,
  getTelegramTopicFollows,
  toggleTelegramSavedArticle,
  getTelegramSavedArticles,
  createTelegramReminder,
  getTelegramReminders,
  getDueTelegramReminders,
  markTelegramReminderSent,
  cancelTelegramReminder,
  createArticleIssueReport,
  countTelegramUserDeliveries,
  recordTelegramUserDelivery,
  hasTelegramUserDelivery,
  hasTelegramContentDelivery,
  recordTelegramContentDelivery,
  getPublishedArticlesSince,
  consumeAdminOAuthState,
  recordAdminAction,
  recordView,
  recordDuplicateArticle,
  resolveDuplicateArticle,
  recordTelegramPublication,
  recordTelegramDeliveryAttempt,
  recordSearchQuery,
  recordArticleReaction,
  getReactionTotals,
  searchArticles,
  searchPublishedArticles,
  updateArticleEditorial,
  updateComment,
  updateCommentStatus,
  createContactMessage,
  hasRecentContactMessage,
  createAdminNotification,
  getAdminNotifications,
  markAdminNotificationRead,
  countUnreadAdminNotifications,
  getSystemSetting,
  setSystemSettings,
  getTelegramChannelSettings,
  saveTelegramChannelSettings,
  getAdminTelegramNotificationSettings,
  saveAdminTelegramNotificationSettings,
  getTelegramChannelPublication,
  getLastTelegramChannelPublication,
  recordTelegramChannelPublication,
  countTelegramChannelPublicationsToday,
  getContactMessages,
  getUnreadContactMessageCount,
  getManagedTaxonomy,
  getVisibleManagedCategories,
  getManagedCategoryBySlug,
  resolveManagedCategorySlug,
  getManagedCategoryByName,
  createManagedTaxonomyItem,
  updateManagedTaxonomyItem,
  setManagedTaxonomyVisibility,
  deleteManagedTaxonomyItem,
  mergeManagedCategories,
  getManagedTaxonomyUsage,
  updateContactMessageStatus,
  createEditorialDiscussion,
  getEditorialDiscussions,
  updateEditorialDiscussion,
};
