// src/server.js
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { fetchAllNews } = require('./fetchNews');
const { getRussianVersion } = require('./russianVersion');
const { PROMPT_VERSION } = require('./aiRetell');
const { extractArticleContent, fetchExternalHtml, parseExternalUrl } = require('./importArticle');
const {
  countArticles,
  countArticlesByCategory,
  createComment,
  createManualArticle,
  createImportedDraft,
  deleteArticle,
  deleteComment,
  getAdminStatistics,
  getArticleBySlug,
  getArticleById,
  getArticles,
  getArticlesByCategory,
  getAnalyticsSecret,
  getApprovedComments,
  getCategories,
  getNews,
  getPendingComments,
  getHomeArticles,
  articleExists,
  recordView,
  searchArticles,
  getSourceCounts,
  getSitemapArticles,
  getTelegramPublication,
  getReactionTotals,
  recordArticleReaction,
  recordTelegramPublication,
  publishArticle,
  updateCommentStatus,
  updateArticleEditorial,
} = require('./db');
const { categories, categoryFromSlug, categoryToSlug } = require('./categories');
const { slugify } = require('./slugify');
const {
  renderArticlePage,
  renderAdminPage,
  renderAdminArticleDeletePage,
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
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const configuredCommentWindow = Number.parseInt(process.env.COMMENT_RATE_LIMIT_WINDOW_SECONDS || '600', 10);
const COMMENT_RATE_LIMIT_WINDOW_SECONDS = Number.isInteger(configuredCommentWindow) && configuredCommentWindow > 0
  ? configuredCommentWindow
  : 600;
const configuredCommentLimit = Number.parseInt(process.env.COMMENT_RATE_LIMIT_MAX || '3', 10);
const COMMENT_RATE_LIMIT_MAX = Number.isInteger(configuredCommentLimit) && configuredCommentLimit > 0
  ? configuredCommentLimit
  : 3;
const COMMENT_RATE_LIMIT_WINDOW_MS = COMMENT_RATE_LIMIT_WINDOW_SECONDS * 1000;
const COMMENT_NAME_MAX_LENGTH = 80;
const COMMENT_BODY_MAX_LENGTH = 1500;
const REACTION_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const REACTION_RATE_LIMIT_MAX = 10;
const REACTION_TYPES = new Set(['like', 'important', 'sad']);
const PAGE_SIZE = 50;
const ARTICLE_TITLE_MAX_LENGTH = 300;
const ARTICLE_BODY_MAX_LENGTH = 20000;
const EDITORIAL_STATUSES = new Set(['normal', 'important', 'urgent']);
const TELEGRAM_REQUEST_TIMEOUT_MS = 10000;
const RUSSIAN_PROVIDER = (process.env.RUSSIAN_PROVIDER || 'claude').toLowerCase();

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
const ANALYTICS_SECRET = getAnalyticsSecret();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function getTelegramApiBaseUrl() {
  try {
    const url = new URL(process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol');
    return url.origin + url.pathname.replace(/\/$/, '');
  } catch {
    return 'https://api.telegram.org';
  }
}

const TELEGRAM_API_BASE_URL = getTelegramApiBaseUrl();
const TELEGRAM_CONFIGURED = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);

function isImportProviderConfigured() {
  if (RUSSIAN_PROVIDER === 'mock') return true;
  if (RUSSIAN_PROVIDER === 'claude') return Boolean(process.env.ANTHROPIC_API_KEY);
  if (RUSSIAN_PROVIDER === 'deepl') return Boolean(process.env.DEEPL_API_KEY);
  if (RUSSIAN_PROVIDER === 'libretranslate') return Boolean(process.env.LIBRETRANSLATE_URL);
  return false;
}

const IMPORT_PROVIDER_CONFIGURED = isImportProviderConfigured();

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);
if (CORS_ORIGINS.length) app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.urlencoded({ extended: false }));

let isRefreshing = false;
let lastManualRefreshAt = 0;
const commentRequestsByIp = new Map();
const reactionRequestsByIp = new Map();
const telegramSendingArticleIds = new Set();

function hasValidRefreshToken(authorization) {
  const match = typeof authorization === 'string' && /^Bearer (.+)$/.exec(authorization);
  if (!match) return false;
  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(REFRESH_TOKEN);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function hasValidAdminCredentials(authorization) {
  const match = typeof authorization === 'string' && /^Basic (.+)$/.exec(authorization);
  if (!match) return false;
  let credentials;
  try {
    credentials = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return false;
  }
  const separator = credentials.indexOf(':');
  if (separator < 0) return false;
  const providedUser = Buffer.from(credentials.slice(0, separator));
  const providedPassword = Buffer.from(credentials.slice(separator + 1));
  const expectedUser = Buffer.from(ADMIN_USER);
  const expectedPassword = Buffer.from(ADMIN_PASSWORD);
  return providedUser.length === expectedUser.length
    && providedPassword.length === expectedPassword.length
    && crypto.timingSafeEqual(providedUser, expectedUser)
    && crypto.timingSafeEqual(providedPassword, expectedPassword);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_USER || !ADMIN_PASSWORD) {
    return res.status(503).type('text').send('Административная модерация отключена.');
  }
  if (!hasValidAdminCredentials(req.get('authorization'))) {
    res.set('WWW-Authenticate', 'Basic realm="Finskie Novosti Admin"');
    return res.status(401).type('text').send('Требуется авторизация.');
  }
  return next();
}

function requireAdminOrigin(req, res, next) {
  if (req.get('origin') !== SITE_URL) {
    return res.status(403).type('text').send('Недопустимый источник запроса.');
  }
  return next();
}

function parseArticleId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseEditorialInput(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const editorialStatus = typeof body.editorial_status === 'string' ? body.editorial_status : 'normal';
  const pinnedValue = typeof body.pinned_until === 'string' ? body.pinned_until.trim() : '';
  let pinnedUntil = null;
  if (pinnedValue) {
    const date = new Date(pinnedValue);
    if (Number.isNaN(date.getTime())) return null;
    pinnedUntil = date.toISOString();
  }
  if (!title || !text || !categories.includes(category)
    || title.length > ARTICLE_TITLE_MAX_LENGTH || text.length > ARTICLE_BODY_MAX_LENGTH
    || !EDITORIAL_STATUSES.has(editorialStatus)) return null;
  return { title, text, category, editorialStatus, pinnedUntil };
}

function recordPublicView(req, articleId = null) {
  const viewedOn = new Date().toISOString().slice(0, 10);
  const visitorHash = getAnonymousVisitorHash(req);
  recordView({ articleId, visitorHash, viewedOn });
}

function getAnonymousVisitorHash(req) {
  return crypto.createHmac('sha256', ANALYTICS_SECRET)
    .update(`${req.ip}\n${req.get('user-agent') || ''}`)
    .digest('hex');
}

function buildTelegramMessage(article) {
  const editorialLabel = article.editorialStatus === 'urgent'
    ? 'Срочно'
    : article.editorialStatus === 'important'
      ? 'Важно'
      : '';
  const title = article.titleRu || article.titleFi || '';
  const text = article.summaryRu || article.summaryFi || '';
  const url = `${SITE_URL}/news/${encodeURIComponent(article.slug)}`;
  return [editorialLabel, title, text, url].filter(Boolean).join('\n\n');
}

async function sendTelegramMessage(article) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: buildTelegramMessage(article) }),
      signal: controller.signal,
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok || !payload || payload.ok !== true || !payload.result || payload.result.message_id === undefined) {
      throw new Error('telegram request failed');
    }
    return payload.result.message_id;
  } finally {
    clearTimeout(timeout);
  }
}

function consumeCommentRateLimit(ip) {
  const now = Date.now();
  const previous = (commentRequestsByIp.get(ip) || [])
    .filter((timestamp) => now - timestamp < COMMENT_RATE_LIMIT_WINDOW_MS);
  if (previous.length >= COMMENT_RATE_LIMIT_MAX) {
    commentRequestsByIp.set(ip, previous);
    return false;
  }
  previous.push(now);
  commentRequestsByIp.set(ip, previous);
  return true;
}

function consumeReactionRateLimit(ip) {
  const now = Date.now();
  const previous = (reactionRequestsByIp.get(ip) || [])
    .filter((timestamp) => now - timestamp < REACTION_RATE_LIMIT_WINDOW_MS);
  if (previous.length >= REACTION_RATE_LIMIT_MAX) {
    reactionRequestsByIp.set(ip, previous);
    return false;
  }
  previous.push(now);
  reactionRequestsByIp.set(ip, previous);
  return true;
}

function withReactionTotals(article) {
  return { ...article, reactionTotals: getReactionTotals([article.id])[article.id] };
}

function withReactionTotalsForList(articles) {
  const totals = getReactionTotals(articles.map((article) => article.id));
  return articles.map((article) => ({ ...article, reactionTotals: totals[article.id] }));
}

function commentMessage(value) {
  return value === 'submitted'
    ? 'Комментарий отправлен на модерацию.'
    : '';
}

function sendCommentPage(res, article, status, message) {
  return res.status(status).type('html').send(renderArticlePage({
    article: withReactionTotals(article),
    siteUrl: SITE_URL,
    categoryToSlug,
    comments: getApprovedComments(article.id),
    commentMessage: message,
  }));
}

function sendReactionPage(res, article, status, message) {
  return res.status(status).type('html').send(renderArticlePage({
    article: withReactionTotals(article),
    siteUrl: SITE_URL,
    categoryToSlug,
    comments: getApprovedComments(article.id),
    reactionMessage: message,
  }));
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
  recordPublicView(req);
  const total = countArticles();
  const articles = withReactionTotalsForList(getArticles({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }));
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

app.get('/', (req, res) => {
  recordPublicView(req);
  const total = countArticles();
  const articles = withReactionTotalsForList(getHomeArticles({ limit: PAGE_SIZE }));
  return res.type('html').send(renderListPage({
    title: 'Финские Новости',
    description: 'Свежие новости Финляндии на русском языке.',
    canonicalPath: '/',
    siteUrl: SITE_URL,
    articles,
    page: 1,
    total,
    pagePath: (targetPage) => (targetPage === 1 ? '/' : `/page/${targetPage}`),
    categoryToSlug,
  }));
});

app.get('/page/:number', (req, res) => {
  const page = Number.parseInt(req.params.number, 10);
  if (!Number.isInteger(page) || page < 1) {
    return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  }
  return renderArchive(req, res, page);
});

app.get('/category/:slug', (req, res) => {
  recordPublicView(req);
  const category = categoryFromSlug(req.params.slug);
  if (!category) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  const page = Number.parseInt(req.query.page, 10) || 1;
  if (page < 1) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  const total = countArticlesByCategory(category);
  const articles = withReactionTotalsForList(getArticlesByCategory(category, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }));
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
  recordPublicView(req, article.id);
  return res.type('html').send(renderArticlePage({
    article: withReactionTotals(article),
    siteUrl: SITE_URL,
    categoryToSlug,
    comments: getApprovedComments(article.id),
    commentMessage: commentMessage(req.query.comment),
    reactionMessage: req.query.reaction === 'submitted' ? 'Реакция учтена.' : '',
  }));
});

app.post('/news/:slug/comments', (req, res) => {
  const article = getArticleBySlug(req.params.slug);
  if (!article) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  const authorName = typeof req.body.author_name === 'string' ? req.body.author_name.trim() : '';
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  const honeypot = typeof req.body.website === 'string' ? req.body.website.trim() : '';
  if (honeypot) return sendCommentPage(res, article, 400, 'Не удалось отправить комментарий.');
  if (!authorName || !body || authorName.length > COMMENT_NAME_MAX_LENGTH || body.length > COMMENT_BODY_MAX_LENGTH) {
    return sendCommentPage(res, article, 400, 'Проверьте имя и текст комментария.');
  }
  if (!consumeCommentRateLimit(req.ip)) {
    return sendCommentPage(res, article, 429, 'Слишком много комментариев. Попробуйте позже.');
  }
  createComment({ articleId: article.id, authorName, body });
  return res.redirect(303, `/news/${encodeURIComponent(article.slug)}?comment=submitted`);
});

app.post('/news/:slug/reactions', (req, res) => {
  const article = getArticleBySlug(req.params.slug);
  if (!article) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  const reaction = typeof req.body.reaction === 'string' ? req.body.reaction : '';
  if (!REACTION_TYPES.has(reaction)) {
    return sendReactionPage(res, article, 400, 'Неизвестная реакция.');
  }
  if (!consumeReactionRateLimit(req.ip)) {
    return sendReactionPage(res, article, 429, 'Слишком много реакций. Попробуйте позже.');
  }
  recordArticleReaction({
    articleId: article.id,
    visitorHash: getAnonymousVisitorHash(req),
    reactedOn: new Date().toISOString().slice(0, 10),
    reaction,
  });
  return res.redirect(303, `/news/${encodeURIComponent(article.slug)}?reaction=submitted`);
});

app.use('/admin', requireAdmin);

app.get('/admin', (req, res) => {
  const articles = withReactionTotalsForList(searchArticles({ query: req.query.q, limit: 50 }))
    .map((article) => ({ ...article, telegramPublication: getTelegramPublication(article.id) }));
  res.set('Cache-Control', 'no-store');
  res.type('html').send(renderAdminPage({
    pendingComments: getPendingComments(),
    articles,
    query: typeof req.query.q === 'string' ? req.query.q : '',
    statistics: getAdminStatistics(),
    categories,
    telegramConfigured: TELEGRAM_CONFIGURED,
    telegramStatus: typeof req.query.telegram === 'string' ? req.query.telegram : '',
    importProviderConfigured: IMPORT_PROVIDER_CONFIGURED,
    importStatus: typeof req.query.import === 'string' ? req.query.import : '',
    siteUrl: SITE_URL,
  }));
});

function parseCommentId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

app.post('/admin/articles', requireAdminOrigin, (req, res) => {
  const input = parseEditorialInput(req.body);
  if (!input) return res.status(400).type('text').send('Проверьте заголовок, текст, категорию и редакционные метки.');
  const stableKey = crypto.randomUUID();
  const slug = slugify(input.title, stableKey);
  createManualArticle({
    title: input.title,
    body: input.text,
    category: input.category,
    editorialStatus: input.editorialStatus,
    pinnedUntil: input.pinnedUntil,
    slug,
    originalUrl: `manual:${stableKey}`,
    publishedAt: new Date().toISOString(),
  });
  return res.redirect(303, `/news/${encodeURIComponent(slug)}`);
});

app.post('/admin/import', requireAdminOrigin, async (req, res) => {
  if (!IMPORT_PROVIDER_CONFIGURED) {
    return res.status(503).type('text').send('Импорт недоступен: настройте провайдер пересказа.');
  }
  let originalUrl;
  try {
    originalUrl = parseExternalUrl(typeof req.body.url === 'string' ? req.body.url.trim() : '').href;
  } catch {
    return res.status(400).type('text').send('Укажите допустимый внешний HTTPS-адрес.');
  }
  if (articleExists(originalUrl)) return res.redirect(303, '/admin?import=duplicate');
  try {
    const fetched = await fetchExternalHtml(originalUrl);
    if (articleExists(fetched.url)) return res.redirect(303, '/admin?import=duplicate');
    const extracted = extractArticleContent(fetched.html);
    const result = await getRussianVersion({
      titleFi: extracted.title,
      summaryFi: extracted.text.slice(0, 5000),
      sourceName: new URL(fetched.url).hostname,
    });
    if (result.method === 'fallback-original' || !result.titleRu || !result.summaryRu) {
      return res.redirect(303, '/admin?import=error');
    }
    createImportedDraft({
      sourceName: new URL(fetched.url).hostname,
      originalUrl: fetched.url,
      slug: slugify(result.titleRu, fetched.url),
      titleFi: extracted.title,
      summaryFi: extracted.text.slice(0, 5000),
      titleRu: result.titleRu.slice(0, ARTICLE_TITLE_MAX_LENGTH),
      summaryRu: result.summaryRu.slice(0, 1500),
      translationMethod: result.method,
      promptVersion: result.promptVersion || PROMPT_VERSION,
      importedAt: new Date().toISOString(),
    });
    return res.redirect(303, '/admin?import=draft-created');
  } catch {
    return res.redirect(303, '/admin?import=error');
  }
});

app.post('/admin/articles/:id', requireAdminOrigin, (req, res) => {
  const id = parseArticleId(req.params.id);
  const input = parseEditorialInput(req.body);
  if (!id || !input || !getArticleById(id)) {
    return res.status(400).type('text').send('Проверьте данные статьи.');
  }
  updateArticleEditorial({
    id,
    title: input.title,
    body: input.text,
    category: input.category,
    editorialStatus: input.editorialStatus,
    pinnedUntil: input.pinnedUntil,
  });
  return res.redirect(303, `/admin?q=${encodeURIComponent(typeof req.query.q === 'string' ? req.query.q : '')}`);
});

app.post('/admin/articles/:id/publish', requireAdminOrigin, (req, res) => {
  const id = parseArticleId(req.params.id);
  const article = id ? getArticleById(id) : null;
  if (!article || !categories.includes(article.category) || !publishArticle(id)) {
    return res.status(400).type('text').send('Заполните категорию и сохраните черновик перед публикацией.');
  }
  return res.redirect(303, '/admin?import=published');
});

app.get('/admin/articles/:id/delete', (req, res) => {
  const article = getArticleById(parseArticleId(req.params.id));
  if (!article) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  return res.type('html').send(renderAdminArticleDeletePage({ article, siteUrl: SITE_URL }));
});

app.post('/admin/articles/:id/delete', requireAdminOrigin, (req, res) => {
  const id = parseArticleId(req.params.id);
  if (!id || req.body.confirm_delete !== 'delete') {
    return res.status(400).type('text').send('Удаление статьи не подтверждено.');
  }
  deleteArticle(id);
  return res.redirect(303, '/admin');
});

app.post('/admin/articles/:id/telegram', requireAdminOrigin, async (req, res) => {
  if (!TELEGRAM_CONFIGURED) {
    return res.status(503).type('text').send('Отправка в Telegram не настроена.');
  }
  const id = parseArticleId(req.params.id);
  const article = id ? getArticleById(id) : null;
  if (!article) return res.status(404).type('text').send('Статья не найдена.');
  if (getTelegramPublication(id)) return res.redirect(303, '/admin?telegram=already-sent');
  if (telegramSendingArticleIds.has(id)) return res.status(409).type('text').send('Отправка этой статьи уже выполняется.');
  telegramSendingArticleIds.add(id);
  try {
    const telegramMessageId = await sendTelegramMessage(article);
    if (!recordTelegramPublication({ articleId: id, telegramMessageId })) {
      return res.redirect(303, '/admin?telegram=already-sent');
    }
    return res.redirect(303, '/admin?telegram=sent');
  } catch {
    return res.redirect(303, '/admin?telegram=error');
  } finally {
    telegramSendingArticleIds.delete(id);
  }
});

app.post('/admin/comments/:id/approve', requireAdminOrigin, (req, res) => {
  const id = parseCommentId(req.params.id);
  if (id) updateCommentStatus(id, 'approved');
  res.redirect(303, '/admin');
});

app.post('/admin/comments/:id/reject', requireAdminOrigin, (req, res) => {
  const id = parseCommentId(req.params.id);
  if (id) updateCommentStatus(id, 'rejected');
  res.redirect(303, '/admin');
});

app.post('/admin/comments/:id/delete', requireAdminOrigin, (req, res) => {
  const id = parseCommentId(req.params.id);
  if (id) deleteComment(id);
  res.redirect(303, '/admin');
});

app.listen(PORT, () => {
  console.log(`Финские Новости — API запущен на http://localhost:${PORT}`);
  console.log(`Обновление RSS каждые ${REFRESH_MIN} мин.`);
  // Первое обновление сразу при старте, чтобы не ждать 15 минут до первых данных
  safeRefresh();
});

// Периодическое обновление по cron (например, "*/15 * * * *")
cron.schedule(`*/${REFRESH_MIN} * * * *`, safeRefresh);
