const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const databasePath = process.env.DATABASE_PATH
  || path.join(__dirname, '..', 'data', 'finskienovosti.db');

function createDatabase() {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
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
  `);

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
    SELECT * FROM articles
    ORDER BY published_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(pagination.limit, pagination.offset).map(toArticle);
}

function getArticleBySlug(slug) {
  const row = db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug);
  return row ? toArticle(row) : null;
}

function countArticles() {
  return db.prepare('SELECT COUNT(*) AS count FROM articles').get().count;
}

function getArticlesByCategory(category, { limit = 50, offset = 0 } = {}) {
  const pagination = normalizePagination(limit, offset);
  return db.prepare(`
    SELECT * FROM articles
    WHERE category = ?
    ORDER BY published_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(category, pagination.limit, pagination.offset).map(toArticle);
}

function countArticlesByCategory(category) {
  return db.prepare('SELECT COUNT(*) AS count FROM articles WHERE category = ?').get(category).count;
}

function getCategories() {
  return db.prepare(`
    SELECT DISTINCT category
    FROM articles
    WHERE category IS NOT NULL AND category <> ''
    ORDER BY category
  `).all().map((row) => row.category);
}

function getSitemapArticles() {
  return db.prepare(`
    SELECT slug, published_at
    FROM articles
    WHERE slug IS NOT NULL AND slug <> ''
      AND published_at IS NOT NULL AND published_at <> ''
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
    GROUP BY source_id
  `).all();
  return Object.fromEntries(rows.map((row) => [row.source_id, row.count]));
}

module.exports = {
  articleExists,
  countArticles,
  countArticlesByCategory,
  createDatabase,
  databasePath,
  getArticleBySlug,
  getArticles,
  getArticlesByCategory,
  getCategories,
  getNews,
  getSourceCounts,
  getSitemapArticles,
  insertArticle,
};
