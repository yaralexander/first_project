require('dotenv').config();

const Parser = require('rss-parser');
const { SOURCES, categorize } = require('./config');
const { getRussianVersion } = require('./russianVersion');
const { PROMPT_VERSION } = require('./aiRetell');
const {
  articleExists,
  findSimilarArticle,
  getArticleById,
  getNews,
  insertArticle,
  recordDuplicateArticle,
  isNewsSourceEnabled,
} = require('./db');
const { slugify } = require('./slugify');
const { compareArticles } = require('./articleSimilarity');

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
let pendingArticles = [];

function publicationDay(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function rememberPendingArticle({ sourceId, sourceName, titleFi, summaryFi, publishedAt }) {
  pendingArticles.push({
    id: null, sourceId, sourceName, titleFi, summaryFi,
    day: publicationDay(publishedAt),
  });
}

function resetPendingArticles() {
  pendingArticles = [];
}

function findPendingSimilarArticle({ sourceId, titleFi, summaryFi, publishedAt }) {
  const day = publicationDay(publishedAt);
  let best = null;
  for (const candidate of pendingArticles) {
    if (candidate.sourceId === sourceId || candidate.day !== day) continue;
    const comparison = compareArticles(
      { title: titleFi, summary: summaryFi },
      { title: candidate.titleFi, summary: candidate.summaryFi },
    );
    if (comparison.isDuplicate && (!best || comparison.score > best.similarity)) {
      best = { ...candidate, similarity: comparison.score };
    }
  }
  return best;
}

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
  const insertedArticles = [];
  try {
    const feed = await parser.parseURL(source.url);
    for (const entry of feed.items || []) {
      if (source.creator && String(entry.creator || '').trim().toLocaleLowerCase('fi-FI') !== source.creator) {
        continue;
      }
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
      }) || findPendingSimilarArticle({ sourceId: source.id, titleFi, summaryFi: summaryFi.slice(0, 800), publishedAt });
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
          matchedArticleId: similarArticle.id || null,
          similarity: similarArticle.similarity,
        });
        skipped += 1;
        console.log(`[fetchSource] похожая тема пропущена: ${source.name} → ${similarArticle.sourceName} (${Math.round(similarArticle.similarity * 100)}%)`);
        continue;
      }

      rememberPendingArticle({ sourceId: source.id, sourceName: source.name, titleFi, summaryFi: summaryFi.slice(0, 800), publishedAt });

      const result = await limitAiCalls(() => getRussianVersion({
        titleFi,
        summaryFi: summaryFi.slice(0, 800),
        sourceName: source.name,
      }));

      if (result.method === 'fallback-original') {
        skipped += 1;
        continue;
      }

      const article = {
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
        editorialStatus: 'normal',
      };

      const articleId = insertArticle(article);
      if (articleId) {
        inserted += 1;
        const storedArticle = getArticleById(articleId);
        if (storedArticle) insertedArticles.push(storedArticle);
      } else {
        skipped += 1;
      }
    }
  } catch (err) {
    console.error(`[fetchSource] ${source.name} (${source.url}) — ошибка:`, err.message);
  }
  return { inserted, skipped, insertedArticles };
}

async function fetchAllNews() {
  console.log('[fetchAllNews] старт обновления —', new Date().toISOString());
  resetPendingArticles();
  const results = await Promise.all(SOURCES.filter((source) => isNewsSourceEnabled(source.id)).map(fetchSource));
  const inserted = results.reduce((sum, result) => sum + result.inserted, 0);
  const skipped = results.reduce((sum, result) => sum + result.skipped, 0);
  const insertedArticles = results.flatMap((result) => result.insertedArticles || []);
  console.log(`[fetchAllNews] добавлено: ${inserted}, пропущено: ${skipped}`);
  return insertedArticles;
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

module.exports = { fetchAllNews, findPendingSimilarArticle, getCachedNews, rememberPendingArticle, resetPendingArticles };
