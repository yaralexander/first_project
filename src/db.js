const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { compareArticles } = require('./articleSimilarity');

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

  const duplicateColumns = new Set(db.prepare('PRAGMA table_info(article_duplicate_log)').all().map((column) => column.name));
  if (!duplicateColumns.has('summary_fi')) db.exec('ALTER TABLE article_duplicate_log ADD COLUMN summary_fi TEXT');
  if (!duplicateColumns.has('external_guid')) db.exec('ALTER TABLE article_duplicate_log ADD COLUMN external_guid TEXT');
  if (!duplicateColumns.has('category')) db.exec('ALTER TABLE article_duplicate_log ADD COLUMN category TEXT');
  if (!duplicateColumns.has('resolution')) db.exec("ALTER TABLE article_duplicate_log ADD COLUMN resolution TEXT NOT NULL DEFAULT 'skipped' CHECK (resolution IN ('skipped', 'published', 'dismissed'))");
  if (!duplicateColumns.has('resolved_at')) db.exec('ALTER TABLE article_duplicate_log ADD COLUMN resolved_at TEXT');
  if (!duplicateColumns.has('resolved_by')) db.exec('ALTER TABLE article_duplicate_log ADD COLUMN resolved_by TEXT');

  return db;
}

const db = createDatabase();

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

function insertArticle(article) {
  return insertArticleStatement.run(article).changes === 1;
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
  return row ? toArticle(row) : null;
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
    SELECT slug, published_at
    FROM articles
    WHERE slug IS NOT NULL AND slug <> ''
      AND publication_status = 'published'
    ORDER BY published_at DESC, id DESC
  `).all().map((row) => ({ slug: row.slug, publishedAt: row.published_at }));
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
  return db.prepare(`
    SELECT source_id, MAX(source_name) AS source_name, COUNT(*) AS count
    FROM articles
    GROUP BY source_id
    ORDER BY source_name COLLATE NOCASE, source_id
  `).all().map((row) => ({
    sourceId: row.source_id,
    sourceName: row.source_name,
    count: row.count,
  }));
}

function createManualArticle({ title, body, category, slug, originalUrl, publishedAt, editorialStatus, pinnedUntil, scheduledPublishAt, publicationStatus = 'published' }) {
  return db.prepare(`
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
  }).lastInsertRowid;
}

function createImportedDraft({ sourceName, originalUrl, slug, titleFi, summaryFi, titleRu, summaryRu, translationMethod, promptVersion, importedAt }) {
  return db.prepare(`
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
  ).lastInsertRowid;
}

function publishArticle(articleId) {
  return db.prepare(`
    UPDATE articles
    SET publication_status = 'published', scheduled_publish_at = NULL, published_at = CURRENT_TIMESTAMP
    WHERE id = ? AND publication_status = 'draft'
  `).run(articleId).changes === 1;
}

function updateArticleEditorial({ id, title, body, category, editorialStatus, pinnedUntil, scheduledPublishAt }) {
  return db.prepare(`
    UPDATE articles
    SET title_ru = ?, summary_ru = ?, category = ?, editorial_status = ?, pinned_until = ?,
      scheduled_publish_at = CASE WHEN publication_status = 'draft' THEN ? ELSE NULL END
    WHERE id = ?
  `).run(title, body, category, editorialStatus, pinnedUntil, scheduledPublishAt || null, id).changes === 1;
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
    )`,
    values: [pattern, pattern, pattern, pattern],
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
  return row ? toArticle(row) : null;
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

function createComment({ articleId, authorName, body }) {
  return db.prepare(`
    INSERT INTO comments (article_id, author_name, body, status)
    VALUES (?, ?, ?, 'pending')
  `).run(articleId, authorName, body).lastInsertRowid;
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

function getContactMessages(limit = 100) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 300);
  return db.prepare('SELECT id, name, email, body, status, created_at FROM contact_messages ORDER BY CASE status WHEN \'new\' THEN 0 WHEN \'read\' THEN 1 ELSE 2 END, created_at DESC, id DESC LIMIT ?').all(safeLimit).map((row) => ({ id: row.id, name: row.name, email: row.email, body: row.body, status: row.status, createdAt: row.created_at }));
}

function updateContactMessageStatus(id, status) {
  return db.prepare('UPDATE contact_messages SET status = ? WHERE id = ?').run(status, id).changes === 1;
}

function getUnreadContactMessageCount() {
  return db.prepare("SELECT COUNT(*) AS count FROM contact_messages WHERE status = 'new'").get().count;
}

module.exports = {
  articleExists,
  cleanupAnalytics,
  countArticles,
  countArticlesByCategory,
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
  findSimilarArticle,
  getAdminAuditLog,
  getAdminSession,
  getArticleBySlug,
  getArticleById,
  getArticles,
  getArticlesByCategory,
  getHomeArticles,
  getApprovedComments,
  getLatestApprovedComments,
  getCategories,
  getNews,
  getAnalyticsSecret,
  getAdminStatistics,
  getAdminSources,
  getAdminComments,
  getDailyAdminStatistics,
  getPendingComments,
  getRecentDuplicateArticles,
  getDuplicateArticleById,
  getSourceCounts,
  getSitemapArticles,
  getTelegramPublication,
  insertArticle,
  publishArticle,
  publishScheduledArticles,
  cleanupAdminAuthData,
  consumeAdminOAuthState,
  recordAdminAction,
  recordView,
  recordDuplicateArticle,
  resolveDuplicateArticle,
  recordTelegramPublication,
  recordArticleReaction,
  getReactionTotals,
  searchArticles,
  searchPublishedArticles,
  updateArticleEditorial,
  updateComment,
  updateCommentStatus,
  createContactMessage,
  getContactMessages,
  getUnreadContactMessageCount,
  updateContactMessageStatus,
};
