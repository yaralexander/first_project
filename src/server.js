// src/server.js
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { fetchAllNews } = require('./fetchNews');
const {
  countArticles,
  countArticlesByCategory,
  getArticleBySlug,
  getArticles,
  getArticlesByCategory,
  getCategories,
  getNews,
  getSourceCounts,
  getSitemapArticles,
} = require('./db');
const { categoryFromSlug, categoryToSlug } = require('./categories');
const {
  renderArticlePage,
  renderListPage,
  renderNotFound,
  renderRobots,
  renderSitemap,
} = require('./render');

const PORT = process.env.PORT || 3000;
const REFRESH_MIN = parseInt(process.env.REFRESH_INTERVAL_MINUTES || '15', 10);
const CORS_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const REFRESH_TOKEN = process.env.REFRESH_TOKEN || '';
const configuredCooldown = Number.parseInt(process.env.REFRESH_COOLDOWN_SECONDS || '60', 10);
const REFRESH_COOLDOWN_SECONDS = Number.isInteger(configuredCooldown) && configuredCooldown >= 0
  ? configuredCooldown
  : 60;
const REFRESH_COOLDOWN_MS = REFRESH_COOLDOWN_SECONDS * 1000;
const PAGE_SIZE = 50;

function getSiteUrl() {
  try {
    const url = new URL(process.env.SITE_URL || 'http://localhost:3000');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol');
    return url.origin;
  } catch {
    return 'http://localhost:3000';
  }
}

const SITE_URL = getSiteUrl();

const app = express();
if (CORS_ORIGINS.length) app.use(cors({ origin: CORS_ORIGINS }));

let isRefreshing = false;
let lastManualRefreshAt = 0;

function hasValidRefreshToken(authorization) {
  const match = typeof authorization === 'string' && /^Bearer (.+)$/.exec(authorization);
  if (!match) return false;
  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(REFRESH_TOKEN);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
async function safeRefresh() {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    await fetchAllNews();
  } catch (err) {
    console.error('[safeRefresh] ошибка обновления:', err);
  } finally {
    isRefreshing = false;
  }
}

// GET /api/news — вся лента, опционально ?category=Политика&source=yle&limit=50
app.get('/api/news', (req, res) => {
  const { category, source, limit } = req.query;
  const data = getNews({ category, source, limit });
  res.json({ updatedAt: data.updatedAt, count: data.items.length, items: data.items });
});

// GET /api/news/sources — список источников и сколько новостей от каждого сейчас в кэше
app.get('/api/news/sources', (req, res) => {
  res.json(getSourceCounts());
});

// POST /api/news/refresh — форсировать обновление вручную (например, из админки)
app.post('/api/news/refresh', async (req, res) => {
  if (!REFRESH_TOKEN) return res.status(503).json({ error: 'manual_refresh_disabled' });
  if (!hasValidRefreshToken(req.get('authorization'))) {
    return res.status(401).json({ error: 'invalid_refresh_token' });
  }
  if (isRefreshing) return res.status(202).json({ status: 'already_running' });
  const remainingCooldown = REFRESH_COOLDOWN_MS - (Date.now() - lastManualRefreshAt);
  if (remainingCooldown > 0) {
    res.set('Retry-After', String(Math.ceil(remainingCooldown / 1000)));
    return res.status(429).json({ error: 'refresh_cooldown' });
  }
  lastManualRefreshAt = Date.now();
  safeRefresh(); // не ждём — отвечаем сразу, обновление идёт в фоне
  res.json({ status: 'started' });
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/sitemap.xml', (req, res) => {
  const categorySlugs = getCategories().map(categoryToSlug).filter(Boolean);
  const sitemap = renderSitemap({
    siteUrl: SITE_URL,
    categorySlugs,
    articles: getSitemapArticles(),
  });
  res.type('application/xml').send(sitemap);
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(renderRobots({ siteUrl: SITE_URL }));
});

function renderArchive(req, res, page) {
  const total = countArticles();
  const articles = getArticles({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  if (page > 1 && articles.length === 0) {
    return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  }
  const title = page === 1 ? 'Финские Новости' : `Архив новостей — страница ${page}`;
  const description = page === 1
    ? 'Свежие новости Финляндии на русском языке.'
    : `Архив новостей Финляндии, страница ${page}.`;
  const canonicalPath = page === 1 ? '/' : `/page/${page}`;
  return res.type('html').send(renderListPage({
    title,
    description,
    canonicalPath,
    siteUrl: SITE_URL,
    articles,
    page,
    total,
    pagePath: (targetPage) => (targetPage === 1 ? '/' : `/page/${targetPage}`),
    categoryToSlug,
  }));
}

app.get('/', (req, res) => renderArchive(req, res, 1));

app.get('/page/:number', (req, res) => {
  const page = Number.parseInt(req.params.number, 10);
  if (!Number.isInteger(page) || page < 1) {
    return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  }
  return renderArchive(req, res, page);
});

app.get('/category/:slug', (req, res) => {
  const category = categoryFromSlug(req.params.slug);
  if (!category) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  const page = Number.parseInt(req.query.page, 10) || 1;
  if (page < 1) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  const total = countArticlesByCategory(category);
  const articles = getArticlesByCategory(category, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  if (page > 1 && articles.length === 0) {
    return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  }
  const pageSuffix = page === 1 ? '' : ` — страница ${page}`;
  const categoryPath = `/category/${encodeURIComponent(req.params.slug)}`;
  return res.type('html').send(renderListPage({
    title: `Новости: ${category}${pageSuffix}`,
    description: `Новости Финляндии в категории «${category}»${pageSuffix.toLowerCase()}.`,
    canonicalPath: page === 1 ? categoryPath : `${categoryPath}?page=${page}`,
    siteUrl: SITE_URL,
    articles,
    page,
    total,
    pagePath: (targetPage) => (targetPage === 1 ? categoryPath : `${categoryPath}?page=${targetPage}`),
    categoryToSlug,
  }));
});

app.get('/news/:slug', (req, res) => {
  const article = getArticleBySlug(req.params.slug);
  if (!article) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  return res.type('html').send(renderArticlePage({ article, siteUrl: SITE_URL, categoryToSlug }));
});

app.listen(PORT, () => {
  console.log(`Финские Новости — API запущен на http://localhost:${PORT}`);
  console.log(`Обновление RSS каждые ${REFRESH_MIN} мин.`);
  // Первое обновление сразу при старте, чтобы не ждать 15 минут до первых данных
  safeRefresh();
});

// Периодическое обновление по cron (например, "*/15 * * * *")
cron.schedule(`*/${REFRESH_MIN} * * * *`, safeRefresh);
