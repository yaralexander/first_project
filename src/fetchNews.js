require('dotenv').config();

const Parser = require('rss-parser');
const { SOURCES, categorize } = require('./config');
const { getRussianVersion } = require('./russianVersion');
const { PROMPT_VERSION } = require('./aiRetell');
const {
  articleExists,
  findSimilarArticle,
  getNews,
  insertArticle,
  recordDuplicateArticle,
} = require('./db');
const { slugify } = require('./slugify');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'FinskieNovostiBot/1.0 (+https://finskienovosti.fi)' },
});

function createLimiter(concurrency) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= concurrency || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active -= 1; runNext(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); runNext(); });
}

const limitAiCalls = createLimiter(parseInt(process.env.AI_CONCURRENCY || '3', 10));

function stripHtml(html = '') {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchSource(source) {
  let inserted = 0;
  let skipped = 0;
  try {
    const feed = await parser.parseURL(source.url);
    for (const entry of feed.items || []) {
      const titleFi = (entry.title || '').trim();
      const summaryFi = stripHtml(entry.contentSnippet || entry.content || entry.summary || '');
      const originalUrl = entry.link || entry.guid;
      const publishedAt = entry.isoDate || entry.pubDate || null;
      const category = categorize(titleFi, summaryFi);
      if (!titleFi || !originalUrl) {
        skipped += 1;
        continue;
      }
      if (articleExists(originalUrl)) {
        skipped += 1;
        continue;
      }
      const similarArticle = findSimilarArticle({
        sourceId: source.id,
        titleFi,
        summaryFi: summaryFi.slice(0, 800),
        publishedAt,
      });
      if (similarArticle) {
        recordDuplicateArticle({
          originalUrl,
          sourceId: source.id,
          sourceName: source.name,
          titleFi,
          summaryFi: summaryFi.slice(0, 800),
          externalGuid: entry.guid || null,
          category,
          publishedAt,
          matchedArticleId: similarArticle.id,
          similarity: similarArticle.similarity,
        });
        skipped += 1;
        console.log(`[fetchSource] похожая тема пропущена: ${source.name} → ${similarArticle.sourceName} (${Math.round(similarArticle.similarity * 100)}%)`);
        continue;
      }

      const result = await limitAiCalls(() => getRussianVersion({
        titleFi,
        summaryFi: summaryFi.slice(0, 800),
        sourceName: source.name,
      }));

      if (result.method === 'fallback-original') {
        skipped += 1;
        continue;
      }

      if (insertArticle({
        sourceId: source.id,
        sourceName: source.name,
        originalUrl,
        externalGuid: entry.guid || null,
        slug: slugify(result.titleRu || titleFi, originalUrl || entry.guid),
        category,
        titleFi,
        summaryFi,
        titleRu: result.titleRu,
        summaryRu: result.summaryRu,
        translationMethod: result.method,
        promptVersion: PROMPT_VERSION,
        publishedAt,
      })) inserted += 1;
      else skipped += 1;
    }
  } catch (err) {
    console.error(`[fetchSource] ${source.name} (${source.url}) — ошибка:`, err.message);
  }
  return { inserted, skipped };
}

async function fetchAllNews() {
  console.log('[fetchAllNews] старт обновления —', new Date().toISOString());
  const results = await Promise.all(SOURCES.map(fetchSource));
  const inserted = results.reduce((sum, result) => sum + result.inserted, 0);
  const skipped = results.reduce((sum, result) => sum + result.skipped, 0);
  console.log(`[fetchAllNews] добавлено: ${inserted}, пропущено: ${skipped}`);
  return getNews().items;
}

function getCachedNews() {
  return getNews();
}

if (require.main === module) {
  fetchAllNews()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { fetchAllNews, getCachedNews };
