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
  getSystemSetting,
  countRssArticlesImportedOn,
} = require('./db');
const { slugify } = require('./slugify');
const { compareArticles } = require('./articleSimilarity');
const { extractArticleContent, fetchExternalHtml } = require('./importArticle');
const { balancedEntries, dailyRssLimit, helsinkiDay, isRssEntryFromDay, rssDailyAllowance } = require('./rssDailyLimit');

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

async function fetchArticleText(originalUrl, {
  fetcher = fetchExternalHtml,
  extractor = extractArticleContent,
} = {}) {
  try {
    const { html } = await fetcher(originalUrl);
    const { text } = extractor(html);
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    return normalized.length >= 300 ? normalized.slice(0, 12000) : '';
  } catch (error) {
    console.warn(`[fetchSource] полный текст недоступен (${originalUrl}): ${error.message}`);
    return '';
  }
}

async function importFeedEntry(source, entry) {
  const titleFi = (entry.title || '').trim();
  const summaryFi = stripHtml(entry.contentSnippet || entry.content || entry.summary || '');
  const originalUrl = entry.link || entry.guid;
  const publishedAt = entry.isoDate || entry.pubDate || null;
  const category = categorize(titleFi, summaryFi);
  if (!titleFi || !originalUrl || articleExists(originalUrl)) return null;
  const similarArticle = findSimilarArticle({
    sourceId: source.id, titleFi, summaryFi: summaryFi.slice(0, 800), publishedAt,
  }) || findPendingSimilarArticle({ sourceId: source.id, titleFi, summaryFi: summaryFi.slice(0, 800), publishedAt });
  if (similarArticle) {
    recordDuplicateArticle({
      originalUrl, sourceId: source.id, sourceName: source.name, titleFi,
      summaryFi: summaryFi.slice(0, 800), externalGuid: entry.guid || null,
      category, publishedAt, matchedArticleId: similarArticle.id || null,
      similarity: similarArticle.similarity,
    });
    console.log(`[fetchSource] похожая тема пропущена: ${source.name} → ${similarArticle.sourceName} (${Math.round(similarArticle.similarity * 100)}%)`);
    return null;
  }

  rememberPendingArticle({ sourceId: source.id, sourceName: source.name, titleFi, summaryFi: summaryFi.slice(0, 800), publishedAt });

  const articleTextFi = await fetchArticleText(originalUrl);
  const translationSourceFi = articleTextFi.length > summaryFi.length ? articleTextFi : summaryFi;
  const result = await limitAiCalls(() => getRussianVersion({
    titleFi, summaryFi: translationSourceFi, sourceName: source.name,
    hasFullArticle: translationSourceFi === articleTextFi && Boolean(articleTextFi),
  }));
  if (result.method === 'fallback-original') return null;

  const articleId = insertArticle({
    sourceId: source.id, sourceName: source.name, originalUrl,
    externalGuid: entry.guid || null,
    slug: slugify(result.titleRu || titleFi, originalUrl || entry.guid),
    category, titleFi,
    // The source page text is used transiently for retelling, not republished.
    summaryFi, titleRu: result.titleRu, summaryRu: result.summaryRu,
    translationMethod: result.method, promptVersion: PROMPT_VERSION,
    publishedAt, editorialStatus: 'normal',
  });
  return articleId ? getArticleById(articleId) : null;
}

async function fetchAllNews({ sources = SOURCES, loadFeed = (source) => parser.parseURL(source.url), importEntry = importFeedEntry, now = () => new Date() } = {}) {
  const limit = dailyRssLimit(getSystemSetting('rss_daily_limit', '50'));
  const startedAt = now();
  const day = helsinkiDay(startedAt);
  let used = countRssArticlesImportedOn(day);
  const allowance = rssDailyAllowance(limit, startedAt);
  console.log(`[fetchAllNews] обновление RSS: ${used}/${limit} за ${day} (Хельсинки), сейчас доступно ${allowance}`);
  if (used >= allowance) return [];

  resetPendingArticles();
  const enabled = sources.filter((source) => isNewsSourceEnabled(source.id));
  const feeds = (await Promise.all(enabled.map(async (source) => {
    try {
      const feed = await loadFeed(source);
      const entries = (feed.items || [])
        .filter((entry) => !source.creator || String(entry.creator || '').trim().toLocaleLowerCase('fi-FI') === source.creator)
        .filter((entry) => isRssEntryFromDay(entry, day))
        .sort((a, b) => new Date(b.isoDate || b.pubDate || 0) - new Date(a.isoDate || a.pubDate || 0));
      return { source, entries };
    } catch (error) {
      console.error(`[fetchSource] ${source.name} (${source.url}) — ошибка:`, error.message);
      return { source, entries: [] };
    }
  })));

  const insertedArticles = [];
  let skipped = 0;
  // A delayed refresh must not release the entire accumulated daily quota at once.
  const maxForThisRefresh = Math.max(1, Math.ceil(limit / 12));
  for (const { source, entry } of balancedEntries(feeds)) {
    const currentTime = now();
    if (helsinkiDay(currentTime) !== day) break;
    const currentLimit = dailyRssLimit(getSystemSetting('rss_daily_limit', '50'));
    if (used >= rssDailyAllowance(currentLimit, currentTime)) break;
    if (insertedArticles.length >= maxForThisRefresh) break;
    if (!isNewsSourceEnabled(source.id)) continue;
    try {
      const article = await importEntry(source, entry);
      if (article) {
        insertedArticles.push(article);
        used += 1;
      } else skipped += 1;
    } catch (error) {
      skipped += 1;
      console.error(`[fetchSource] ${source.name}:`, error.message);
    }
  }
  console.log(`[fetchAllNews] добавлено: ${insertedArticles.length}, пропущено: ${skipped}; сегодня ${used}/${dailyRssLimit(getSystemSetting('rss_daily_limit', '50'))}`);
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

module.exports = { fetchAllNews, fetchArticleText, findPendingSimilarArticle, getCachedNews, rememberPendingArticle, resetPendingArticles };
