const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const databasePath = process.env.DATABASE_PATH
  || path.join(__dirname, '..', 'data', 'finskienovosti.db');

function createDatabase() {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
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
  db.exec('CREATE INDEX IF NOT EXISTS idx_articles_editorial_order ON articles (pinned_until, editorial_status, published_at DESC)');

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

function getHomeArticles({ limit = 50, offset = 0 } = {}) {
  const pagination = normalizePagination(limit, offset);
  return db.prepare(`
    SELECT * FROM articles WHERE publication_status = 'published'
    ORDER BY
      CASE WHEN pinned_until IS NOT NULL AND datetime(pinned_until) > datetime('now') THEN 0 ELSE 1 END,
      CASE editorial_status WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
      published_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(pagination.limit, pagination.offset).map(toArticle);
}

function getArticleBySlug(slug) {
  const row = db.prepare("SELECT * FROM articles WHERE slug = ? AND publication_status = 'published'").get(slug);
  return row ? toArticle(row) : null;
}

function countArticles() {
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
      AND published_at IS NOT NULL AND published_at <> '' AND publication_status = 'published'
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

function createManualArticle({ title, body, category, slug, originalUrl, publishedAt, editorialStatus, pinnedUntil }) {
  return db.prepare(`
    INSERT INTO articles (
      source_id, source_name, original_url, external_guid, slug, category,
      title_fi, summary_fi, title_ru, summary_ru, translation_method,
      prompt_version, published_at, editorial_status, pinned_until
    ) VALUES (
      'editorial', 'Редакция Финские Новости', @originalUrl, @externalGuid, @slug, @category,
      @title, @body, @title, @body, 'editorial', NULL, @publishedAt, @editorialStatus, @pinnedUntil
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
    SET publication_status = 'published'
    WHERE id = ? AND publication_status = 'draft'
  `).run(articleId).changes === 1;
}

function updateArticleEditorial({ id, title, body, category, editorialStatus, pinnedUntil }) {
  return db.prepare(`
    UPDATE articles
    SET title_ru = ?, summary_ru = ?, category = ?, editorial_status = ?, pinned_until = ?
    WHERE id = ?
  `).run(title, body, category, editorialStatus, pinnedUntil, id).changes === 1;
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

function getAdminStatistics() {
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM articles WHERE publication_status = 'published') AS articleCount,
      (SELECT COUNT(*) FROM articles WHERE publication_status = 'published' AND date(published_at) = date('now')) AS publishedToday,
      (SELECT COUNT(*) FROM comments WHERE status = 'pending') AS pendingComments,
      (SELECT COUNT(*) FROM analytics_views WHERE article_id = 0 AND viewed_on = date('now')) AS siteViewsToday,
      (SELECT COUNT(*) FROM article_reactions) AS reactionCount
  `).get();
  const topRead = db.prepare(`
    SELECT articles.slug, articles.title_ru, articles.title_fi, COUNT(*) AS count
    FROM analytics_views
    JOIN articles ON articles.id = analytics_views.article_id
    WHERE analytics_views.article_id <> 0 AND analytics_views.viewed_on = date('now')
    GROUP BY articles.id
    ORDER BY count DESC, articles.id DESC
    LIMIT 5
  `).all().map((row) => ({ slug: row.slug, title: row.title_ru || row.title_fi, count: row.count }));
  const topCommented = db.prepare(`
    SELECT articles.slug, articles.title_ru, articles.title_fi, COUNT(*) AS count
    FROM comments
    JOIN articles ON articles.id = comments.article_id
    GROUP BY articles.id
    ORDER BY count DESC, articles.id DESC
    LIMIT 5
  `).all().map((row) => ({ slug: row.slug, title: row.title_ru || row.title_fi, count: row.count }));
  return { ...totals, topRead, topCommented };
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

function updateCommentStatus(commentId, status) {
  return db.prepare(`
    UPDATE comments
    SET status = ?
    WHERE id = ? AND status = 'pending'
  `).run(status, commentId).changes === 1;
}

function deleteComment(commentId) {
  return db.prepare('DELETE FROM comments WHERE id = ?').run(commentId).changes === 1;
}

module.exports = {
  articleExists,
  cleanupAnalytics,
  countArticles,
  countArticlesByCategory,
  createComment,
  createManualArticle,
  createImportedDraft,
  createDatabase,
  databasePath,
  deleteComment,
  deleteArticle,
  getArticleBySlug,
  getArticleById,
  getArticles,
  getArticlesByCategory,
  getHomeArticles,
  getApprovedComments,
  getCategories,
  getNews,
  getAnalyticsSecret,
  getAdminStatistics,
  getPendingComments,
  getSourceCounts,
  getSitemapArticles,
  getTelegramPublication,
  insertArticle,
  publishArticle,
  recordView,
  recordTelegramPublication,
  recordArticleReaction,
  getReactionTotals,
  searchArticles,
  updateArticleEditorial,
  updateCommentStatus,
};
