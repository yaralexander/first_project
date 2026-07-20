require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createDatabase, databasePath } = require('./db');
const { slugify } = require('./slugify');

const JSON_CACHE_PATH = path.join(__dirname, '..', 'data', 'latestNews.json');

function readArticles() {
  const cachedNews = JSON.parse(fs.readFileSync(JSON_CACHE_PATH, 'utf8'));
  if (!Array.isArray(cachedNews.items)) {
    throw new Error('data/latestNews.json должен содержать массив items');
  }
  return cachedNews.items;
}

function migrate() {
  const articles = readArticles();
  const db = createDatabase();
  const insertArticle = db.prepare(`
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

  let inserted = 0;
  let skipped = 0;
  const importAll = db.transaction(() => {
    for (const article of articles) {
      const originalUrl = article.link || article.id;
      if (!originalUrl) {
        skipped += 1;
        continue;
      }

      const result = insertArticle.run({
        sourceId: article.source || '',
        sourceName: article.sourceName || '',
        originalUrl,
        externalGuid: article.id || null,
        slug: slugify(article.titleRu || article.titleFi || 'article', originalUrl || article.id),
        category: article.category || null,
        titleFi: article.titleFi || null,
        summaryFi: article.summaryFi || null,
        titleRu: article.titleRu || null,
        summaryRu: article.summaryRu || null,
        translationMethod: article.translationMethod || null,
        promptVersion: article.promptVersion ?? null,
        publishedAt: article.pubDate || null,
      });
      if (result.changes === 1) inserted += 1;
      else skipped += 1;
    }
  });

  try {
    importAll();
    const rowCount = db.prepare('SELECT COUNT(*) AS count FROM articles').get().count;
    return { databasePath, sourceItems: articles.length, inserted, skipped, rowCount };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(migrate(), null, 2));
  } catch (error) {
    console.error('[db:migrate-json]', error.message);
    process.exitCode = 1;
  }
}

module.exports = { migrate };
