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
const { parseAdminAccounts, verifyAdminAuthorization } = require('./adminAccounts');
const {
  createGoogleAuthProvider,
  createPkcePair,
  findGoogleAdminAccount,
  parseGoogleAdminAccounts,
  randomBase64Url,
  sha256,
} = require('./googleAdminAuth');
const { categorize } = require('./config');
const {
  countArticles,
  countArticlesByCategory,
  countPublishedSearchResults,
  createComment,
  createContactMessage,
  createManualArticle,
  createImportedDraft,
  deleteArticle,
  deleteComment,
  findSimilarArticle,
  getAdminAuditLog,
  getAdminComments,
  getContactMessages,
  getAdminSources,
  getAdminStatistics,
  getArticleBySlug,
  getArticleById,
  getArticles,
  getArticlesByCategory,
  getAnalyticsSecret,
  getApprovedComments,
  getLatestApprovedComments,
  getCategories,
  getNews,
  getRecentDuplicateArticles,
  getDuplicateArticleById,
  getHomeArticles,
  articleExists,
  cleanupAnalytics,
  cleanupAdminAuthData,
  consumeAdminOAuthState,
  createAdminOAuthState,
  createAdminSession,
  deleteAdminSession,
  getAdminSession,
  recordView,
  recordDuplicateArticle,
  searchArticles,
  searchPublishedArticles,
  getSourceCounts,
  getSitemapArticles,
  getTelegramPublication,
  insertArticle,
  getReactionTotals,
  recordArticleReaction,
  recordAdminAction,
  recordTelegramPublication,
  publishArticle,
  publishScheduledArticles,
  resolveDuplicateArticle,
  updateCommentStatus,
  updateComment,
  updateContactMessageStatus,
  updateArticleEditorial,
} = require('./db');
const { categories, categoryFromSlug, categoryToSlug } = require('./categories');
const { slugify } = require('./slugify');
const {
  renderArticlePage,
  renderAdminPage,
  renderAdminLoginPage,
  renderAdminArticleDeletePage,
  renderListPage,
  renderNotFound,
  renderAboutPage,
  renderRobots,
  renderSitemap,
} = require('./render');

const PORT = process.env.PORT || 3000;
const configuredRefreshMinutes = Number.parseInt(process.env.REFRESH_INTERVAL_MINUTES || '15', 10);
const REFRESH_MIN = Number.isInteger(configuredRefreshMinutes)
  && configuredRefreshMinutes >= 1 && configuredRefreshMinutes <= 59
  ? configuredRefreshMinutes
  : 15;
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
const ADMIN_ACCOUNTS = parseAdminAccounts({
  accountsJson: process.env.ADMIN_ACCOUNTS_JSON || '',
  legacyUser: ADMIN_USER,
  legacyPassword: ADMIN_PASSWORD,
});
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const GOOGLE_ADMIN_ACCOUNTS = parseGoogleAdminAccounts({
  accountsJson: process.env.ADMIN_GOOGLE_ACCOUNTS_JSON || '',
  allowedEmails: process.env.ADMIN_GOOGLE_EMAILS || '',
});
const configuredAdminSessionHours = Number.parseInt(process.env.ADMIN_SESSION_HOURS || '12', 10);
const ADMIN_SESSION_HOURS = Number.isInteger(configuredAdminSessionHours)
  ? Math.min(Math.max(configuredAdminSessionHours, 1), 168)
  : 12;
const ADMIN_SESSION_COOKIE = 'fn_admin_session';
const ADMIN_OAUTH_STATE_COOKIE = 'fn_admin_oauth_state';
const ADMIN_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
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
const configuredAnalyticsRetention = Number.parseInt(process.env.ANALYTICS_RETENTION_DAYS || '90', 10);
const ANALYTICS_RETENTION_DAYS = Number.isInteger(configuredAnalyticsRetention) && configuredAnalyticsRetention > 0
  ? configuredAnalyticsRetention
  : 90;

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
const GOOGLE_OAUTH_REDIRECT_URI = `${SITE_URL}/admin/auth/google/callback`;
const GOOGLE_AUTH_ENABLED = Boolean(
  GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET && GOOGLE_ADMIN_ACCOUNTS.length,
);
const GOOGLE_AUTH_PROVIDER = GOOGLE_AUTH_ENABLED
  ? createGoogleAuthProvider({
    clientId: GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: GOOGLE_OAUTH_REDIRECT_URI,
  })
  : null;
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
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  });
  next();
});
if (CORS_ORIGINS.length) app.use(cors({ origin: CORS_ORIGINS }));
app.use('/assets', express.static('public/assets', { fallthrough: false, maxAge: '7d' }));
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

function getCookie(req, name) {
  const header = req.get('cookie') || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

function getGoogleAdminSession(req) {
  if (!GOOGLE_AUTH_ENABLED) return null;
  const token = getCookie(req, ADMIN_SESSION_COOKIE);
  if (!token || token.length > 300) return null;
  const tokenHash = sha256(token);
  const session = getAdminSession(tokenHash);
  if (!session) return null;
  const configuredAccount = findGoogleAdminAccount(GOOGLE_ADMIN_ACCOUNTS, session.email);
  if (!configuredAccount) {
    deleteAdminSession(tokenHash);
    return null;
  }
  return {
    session: { ...session, role: configuredAccount.role },
    tokenHash,
  };
}

function setAdminSessionCookie(res, token) {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/admin',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ADMIN_SESSION_HOURS * 60 * 60}`,
  ];
  if (SITE_URL.startsWith('https://')) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearAdminSessionCookie(res) {
  const parts = [`${ADMIN_SESSION_COOKIE}=`, 'Path=/admin', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (SITE_URL.startsWith('https://')) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function setAdminOAuthStateCookie(res, state) {
  const parts = [
    `${ADMIN_OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}`,
    'Path=/admin/auth/google/callback',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(ADMIN_OAUTH_STATE_TTL_MS / 1000)}`,
  ];
  if (SITE_URL.startsWith('https://')) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearAdminOAuthStateCookie(res) {
  const parts = [
    `${ADMIN_OAUTH_STATE_COOKIE}=`,
    'Path=/admin/auth/google/callback',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (SITE_URL.startsWith('https://')) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function safelyMatches(value, expected) {
  const providedBuffer = Buffer.from(value || '');
  const expectedBuffer = Buffer.from(expected || '');
  return providedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function requireAdmin(req, res, next) {
  const googleSession = getGoogleAdminSession(req);
  if (googleSession) {
    req.adminSessionTokenHash = googleSession.tokenHash;
    req.adminAccount = {
      username: googleSession.session.email,
      displayName: googleSession.session.displayName,
      role: googleSession.session.role,
      authMethod: 'google',
    };
    return next();
  }
  if (!ADMIN_ACCOUNTS.length && !GOOGLE_AUTH_ENABLED) {
    return res.status(503).type('text').send('Административная модерация отключена.');
  }
  const account = verifyAdminAuthorization(req.get('authorization'), ADMIN_ACCOUNTS);
  if (!account) {
    if (req.method === 'GET' && (req.get('accept') || '').includes('text/html')) {
      return res.redirect(303, '/admin/login');
    }
    if (ADMIN_ACCOUNTS.length) res.set('WWW-Authenticate', 'Basic realm="Finskie Novosti Admin"');
    return res.status(401).type('text').send('Требуется авторизация.');
  }
  req.adminAccount = { ...account, authMethod: 'basic' };
  return next();
}

function auditAdminAction(req, action, targetType, targetId, details = null) {
  const account = req.adminAccount || { username: 'system', role: 'system' };
  return recordAdminAction({
    actorUsername: account.username,
    actorRole: account.role,
    action,
    targetType,
    targetId,
    details,
  });
}

function requireAdminOrigin(req, res, next) {
  if (req.get('origin') !== SITE_URL) {
    return res.status(403).type('text').send('Недопустимый источник запроса.');
  }
  return next();
}

function requireAdministrator(req, res, next) {
  if (req.adminAccount && req.adminAccount.role === 'admin') return next();
  auditAdminAction(req, 'authorization.denied', 'route', req.path, {
    method: req.method,
    requiredRole: 'admin',
  });
  return res.status(403).type('text').send('Это действие доступно только администратору.');
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
  const scheduledValue = typeof body.scheduled_publish_at === 'string' ? body.scheduled_publish_at.trim() : '';
  let pinnedUntil = null;
  let scheduledPublishAt = null;
  if (pinnedValue) {
    const date = new Date(pinnedValue);
    if (Number.isNaN(date.getTime())) return null;
    pinnedUntil = date.toISOString();
  }
  if (scheduledValue) {
    const date = new Date(scheduledValue);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return null;
    scheduledPublishAt = date.toISOString();
  }
  if (!title || !text || !categories.includes(category)
    || title.length > ARTICLE_TITLE_MAX_LENGTH || text.length > ARTICLE_BODY_MAX_LENGTH
    || !EDITORIAL_STATUSES.has(editorialStatus)) return null;
  return { title, text, category, editorialStatus, pinnedUntil, scheduledPublishAt };
}

function parseStatisticsFilters(query = {}) {
  const category = categories.includes(query.category) ? query.category : '';
  const sourceId = typeof query.source === 'string' && /^[\w:-]{1,100}$/.test(query.source)
    ? query.source
    : '';
  return {
    from: typeof query.from === 'string' ? query.from : '',
    to: typeof query.to === 'string' ? query.to : '',
    category,
    sourceId,
  };
}

function csvCell(value) {
  const text = String(value === null || value === undefined ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function renderStatisticsCsv(statistics) {
  const rows = [
    ['Дата', 'Опубликовано статей', 'Уникальные читатели', 'Чтения статей', 'Комментарии', 'Реакции', 'Повторы'],
    ...statistics.daily.slice().reverse().map((day) => [
      day.day, day.articles, day.visitors, day.articleViews, day.comments, day.reactions, day.duplicates,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function recordPublicView(req, articleId = null) {
  const viewedOn = new Date().toISOString().slice(0, 10);
  const visitorHash = getAnonymousVisitorHash(req, viewedOn);
  recordView({ articleId, visitorHash, viewedOn });
}

function getAnonymousVisitorHash(req, day) {
  return crypto.createHmac('sha256', ANALYTICS_SECRET)
    .update(`${day}\n${req.ip}\n${req.get('user-agent') || ''}`)
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

function runScheduledPublishing() {
  const published = publishScheduledArticles(new Date().toISOString());
  for (const article of published) {
    recordAdminAction({
      actorUsername: 'system',
      actorRole: 'system',
      action: 'article.scheduled_publish',
      targetType: 'article',
      targetId: article.id,
      details: { slug: article.slug, title: article.title },
    });
  }
  return published;
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

app.get('/about', (req, res) => {
  res.type('html').send(renderAboutPage({ siteUrl: SITE_URL }));
});

app.get('/sitemap.xml', (req, res) => {
  const categorySlugs = getCategories().map(categoryToSlug).filter(Boolean);
  const sitemap = renderSitemap({
    siteUrl: SITE_URL,
    categorySlugs,
    articles: getSitemapArticles(),
    archivePageCount: Math.max(1, Math.ceil(countArticles() / PAGE_SIZE)),
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
  const allowedSources = new Set(['yle', 'hs', 'il', 'is']);
  const source = allowedSources.has(req.query.source) ? req.query.source : '';
  const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const isDefaultView = !source && sort === 'newest';
  if (isDefaultView && page > 1) return res.redirect(301, `/page/${page}`);
  const total = countArticles({ source });
  const articles = withReactionTotalsForList(getHomeArticles({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    source,
    sort,
  }));
  if (page > 1 && articles.length === 0) {
    return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  }
  const feedQuery = (targetPage) => {
    if (isDefaultView) return targetPage === 1 ? '/' : `/page/${targetPage}`;
    const params = new URLSearchParams();
    if (source) params.set('source', source);
    if (sort !== 'newest') params.set('sort', sort);
    if (targetPage > 1) params.set('page', String(targetPage));
    const query = params.toString();
    return query ? `/?${query}#feed-heading` : '/';
  };
  return res.type('html').send(renderListPage({
    title: 'Финские Новости',
    description: 'Свежие новости Финляндии на русском языке.',
    canonicalPath: '/',
    siteUrl: SITE_URL,
    articles,
    page,
    total,
    pagePath: feedQuery,
    categoryToSlug,
    selectedSource: source,
    sort,
    recentComments: getLatestApprovedComments(12),
  }));
});

app.get('/search', (req, res) => {
  recordPublicView(req);
  const query = (typeof req.query.q === 'string' ? req.query.q : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const searchable = query.length >= 2;
  const total = searchable ? countPublishedSearchResults(query) : 0;
  const articles = searchable
    ? withReactionTotalsForList(searchPublishedArticles({ query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }))
    : [];
  if (page > 1 && articles.length === 0) {
    return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  }
  const searchPath = (targetPage) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (targetPage > 1) params.set('page', String(targetPage));
    const suffix = params.toString();
    return suffix ? `/search?${suffix}` : '/search';
  };
  return res.type('html').send(renderListPage({
    title: query ? `Поиск: ${query}` : 'Поиск по статьям',
    description: query ? `Результаты поиска по опубликованным статьям: ${query}.` : 'Поиск по архиву Финских Новостей.',
    canonicalPath: searchPath(page),
    siteUrl: SITE_URL,
    articles,
    page,
    total,
    pagePath: searchPath,
    categoryToSlug,
    searchQuery: query,
    robots: 'noindex,follow',
  }));
});

app.get('/page/:number', (req, res) => {
  const page = Number.parseInt(req.params.number, 10);
  if (!Number.isInteger(page) || page < 1) {
    return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  }
  if (page === 1) return res.redirect(301, '/');
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
  const reactedOn = new Date().toISOString().slice(0, 10);
  recordArticleReaction({
    articleId: article.id,
    visitorHash: getAnonymousVisitorHash(req, reactedOn),
    reactedOn,
    reaction,
  });
  return res.redirect(303, `/news/${encodeURIComponent(article.slug)}?reaction=submitted`);
});

app.get('/admin/login', (req, res) => {
  if (getGoogleAdminSession(req)) return res.redirect(303, '/admin');
  res.set('Cache-Control', 'no-store');
  return res.type('html').send(renderAdminLoginPage({
    siteUrl: SITE_URL,
    googleEnabled: GOOGLE_AUTH_ENABLED,
    basicEnabled: ADMIN_ACCOUNTS.length > 0,
    error: typeof req.query.error === 'string' ? req.query.error : '',
  }));
});

app.post('/contact', (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!name || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !body || body.length > 3000) return res.status(400).redirect('/?contact=invalid#contact');
  createContactMessage({ name, email, body });
  return res.redirect(303, '/?contact=sent#contact');
});

app.get('/admin/basic', (req, res) => {
  const account = verifyAdminAuthorization(req.get('authorization'), ADMIN_ACCOUNTS);
  if (!account) {
    if (ADMIN_ACCOUNTS.length) res.set('WWW-Authenticate', 'Basic realm="Finskie Novosti Admin"');
    return res.status(401).type('text').send('Введите аварийные учётные данные администратора.');
  }
  return res.redirect(303, '/admin');
});

app.get('/admin/auth/google', (req, res) => {
  if (!GOOGLE_AUTH_ENABLED) return res.redirect(303, '/admin/login?error=not-configured');
  cleanupAdminAuthData();
  const state = randomBase64Url(32);
  const nonce = randomBase64Url(32);
  const pkce = createPkcePair();
  createAdminOAuthState({
    stateHash: sha256(state),
    nonce,
    codeVerifier: pkce.verifier,
    expiresAt: new Date(Date.now() + ADMIN_OAUTH_STATE_TTL_MS).toISOString(),
  });
  setAdminOAuthStateCookie(res, state);
  const authorizationUrl = GOOGLE_AUTH_PROVIDER.createAuthorizationUrl({
    state,
    nonce,
    codeChallenge: pkce.challenge,
  });
  res.set('Cache-Control', 'no-store');
  return res.redirect(303, authorizationUrl);
});

app.get('/admin/auth/google/callback', async (req, res) => {
  if (!GOOGLE_AUTH_ENABLED) return res.redirect(303, '/admin/login?error=not-configured');
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const stateCookie = getCookie(req, ADMIN_OAUTH_STATE_COOKIE);
  const savedState = state && safelyMatches(state, stateCookie)
    ? consumeAdminOAuthState(sha256(state))
    : null;
  clearAdminOAuthStateCookie(res);
  if (!savedState || !code || Date.parse(savedState.expiresAt) <= Date.now()) {
    return res.redirect(303, '/admin/login?error=invalid-state');
  }
  try {
    const identity = await GOOGLE_AUTH_PROVIDER.exchangeAndVerify({
      code,
      codeVerifier: savedState.codeVerifier,
      nonce: savedState.nonce,
    });
    const account = findGoogleAdminAccount(GOOGLE_ADMIN_ACCOUNTS, identity.email);
    if (!account) {
      recordAdminAction({
        actorUsername: identity.email || 'unknown-google-account',
        actorRole: 'denied',
        action: 'auth.google_denied',
        targetType: 'account',
        targetId: identity.googleSub,
      });
      return res.redirect(303, '/admin/login?error=not-allowed');
    }
    const sessionToken = randomBase64Url(48);
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000).toISOString();
    createAdminSession({
      tokenHash: sha256(sessionToken),
      googleSub: identity.googleSub,
      email: account.email,
      displayName: identity.displayName,
      role: account.role,
      expiresAt,
    });
    recordAdminAction({
      actorUsername: account.email,
      actorRole: account.role,
      action: 'auth.google_login',
      targetType: 'session',
      targetId: identity.googleSub,
    });
    setAdminSessionCookie(res, sessionToken);
    return res.redirect(303, '/admin');
  } catch (error) {
    console.error('[google-admin-auth] вход отклонён:', error.message);
    return res.redirect(303, '/admin/login?error=google-failed');
  }
});

app.use('/admin', requireAdmin);

app.post('/admin/logout', requireAdminOrigin, (req, res) => {
  if (req.adminSessionTokenHash) deleteAdminSession(req.adminSessionTokenHash);
  auditAdminAction(req, 'auth.logout', 'session', req.adminSessionTokenHash || 'basic');
  clearAdminSessionCookie(res);
  return res.redirect(303, '/admin/login');
});

app.get('/admin', (req, res) => {
  const statisticsFilters = parseStatisticsFilters(req.query);
  const articles = withReactionTotalsForList(searchArticles({ query: req.query.q, limit: 50 }))
    .map((article) => ({ ...article, telegramPublication: getTelegramPublication(article.id) }));
  res.set('Cache-Control', 'no-store');
  res.type('html').send(renderAdminPage({
    comments: getAdminComments(100),
    articles,
    query: typeof req.query.q === 'string' ? req.query.q : '',
    statistics: getAdminStatistics(statisticsFilters),
    statisticsSources: getAdminSources(),
    duplicateArticles: getRecentDuplicateArticles(20),
    auditLog: getAdminAuditLog(100),
    currentAccount: req.adminAccount,
    categories,
    telegramConfigured: TELEGRAM_CONFIGURED,
    telegramStatus: typeof req.query.telegram === 'string' ? req.query.telegram : '',
    importProviderConfigured: IMPORT_PROVIDER_CONFIGURED,
    importStatus: typeof req.query.import === 'string' ? req.query.import : '',
    articleStatus: typeof req.query.article === 'string' ? req.query.article : '',
    duplicateStatus: typeof req.query.duplicate === 'string' ? req.query.duplicate : '',
    siteUrl: SITE_URL,
    tab: typeof req.query.tab === 'string' ? req.query.tab : 'stats',
    contactMessages: getContactMessages(100),
  }));
});

app.post('/admin/contact-messages/:id/read', requireAdminOrigin, (req, res) => {
  updateContactMessageStatus(Number(req.params.id), 'read');
  auditAdminAction(req, 'contact.read', 'contact_message', req.params.id);
  return res.redirect(303, '/admin?tab=messages');
});

app.get('/admin/statistics.csv', (req, res) => {
  const statistics = getAdminStatistics(parseStatisticsFilters(req.query));
  auditAdminAction(req, 'statistics.export_csv', 'statistics', `${statistics.filters.from}:${statistics.filters.to}`, {
    category: statistics.filters.category,
    sourceId: statistics.filters.sourceId,
  });
  const filename = `finskienovosti-statistics-${statistics.filters.from}-${statistics.filters.to}.csv`;
  res.set({
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  return res.type('text/csv; charset=utf-8').send(renderStatisticsCsv(statistics));
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
  const scheduled = Boolean(input.scheduledPublishAt);
  const articleId = createManualArticle({
    title: input.title,
    body: input.text,
    category: input.category,
    editorialStatus: input.editorialStatus,
    pinnedUntil: input.pinnedUntil,
    slug,
    originalUrl: `manual:${stableKey}`,
    publishedAt: input.scheduledPublishAt || new Date().toISOString(),
    scheduledPublishAt: input.scheduledPublishAt,
    publicationStatus: scheduled ? 'draft' : 'published',
  });
  auditAdminAction(req, scheduled ? 'article.schedule' : 'article.create', 'article', articleId, {
    slug,
    title: input.title,
    scheduledPublishAt: input.scheduledPublishAt,
  });
  if (scheduled) return res.redirect(303, '/admin?article=scheduled');
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
    const sourceName = new URL(fetched.url).hostname;
    const similarArticle = findSimilarArticle({
      sourceId: `import:${sourceName}`,
      titleFi: extracted.title,
      summaryFi: extracted.text.slice(0, 5000),
      publishedAt: new Date().toISOString(),
    });
    if (similarArticle) {
      recordDuplicateArticle({
        originalUrl: fetched.url,
        sourceId: `import:${sourceName}`,
        sourceName,
        titleFi: extracted.title,
        summaryFi: extracted.text.slice(0, 5000),
        externalGuid: fetched.url,
        category: categorize(extracted.title, extracted.text.slice(0, 5000)),
        publishedAt: new Date().toISOString(),
        matchedArticleId: similarArticle.id,
        similarity: similarArticle.similarity,
      });
      return res.redirect(303, '/admin?import=similar');
    }
    const result = await getRussianVersion({
      titleFi: extracted.title,
      summaryFi: extracted.text.slice(0, 5000),
      sourceName,
    });
    if (result.method === 'fallback-original' || !result.titleRu || !result.summaryRu) {
      return res.redirect(303, '/admin?import=error');
    }
    const articleId = createImportedDraft({
      sourceName,
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
    auditAdminAction(req, 'article.import_draft', 'article', articleId, {
      sourceName,
      originalUrl: fetched.url,
    });
    return res.redirect(303, '/admin?import=draft-created');
  } catch {
    return res.redirect(303, '/admin?import=error');
  }
});

app.post('/admin/duplicates/:id/publish', requireAdminOrigin, async (req, res) => {
  const id = parseArticleId(req.params.id);
  const duplicate = id ? getDuplicateArticleById(id) : null;
  if (!duplicate || duplicate.resolution !== 'skipped') {
    return res.status(404).type('text').send('Запись повтора не найдена или уже обработана.');
  }
  if (articleExists(duplicate.originalUrl)) {
    resolveDuplicateArticle({ id, resolution: 'published', resolvedBy: req.adminAccount.username });
    return res.redirect(303, '/admin?duplicate=already-published');
  }
  try {
    const result = await getRussianVersion({
      titleFi: duplicate.titleFi,
      summaryFi: duplicate.summaryFi || duplicate.titleFi,
      sourceName: duplicate.sourceName,
    });
    if (result.method === 'fallback-original' || !result.titleRu || !result.summaryRu) {
      return res.redirect(303, '/admin?duplicate=error');
    }
    const sourceId = duplicate.sourceId.startsWith('import:') ? 'imported' : duplicate.sourceId;
    const inserted = insertArticle({
      sourceId,
      sourceName: duplicate.sourceName,
      originalUrl: duplicate.originalUrl,
      externalGuid: duplicate.externalGuid || duplicate.originalUrl,
      slug: slugify(result.titleRu, duplicate.originalUrl),
      category: duplicate.category || categorize(duplicate.titleFi, duplicate.summaryFi || duplicate.titleFi),
      titleFi: duplicate.titleFi,
      summaryFi: duplicate.summaryFi || duplicate.titleFi,
      titleRu: result.titleRu,
      summaryRu: result.summaryRu,
      translationMethod: result.method,
      promptVersion: result.promptVersion || PROMPT_VERSION,
      publishedAt: duplicate.publishedAt || new Date().toISOString(),
    });
    if (!inserted) return res.redirect(303, '/admin?duplicate=error');
    resolveDuplicateArticle({ id, resolution: 'published', resolvedBy: req.adminAccount.username });
    auditAdminAction(req, 'duplicate.publish_anyway', 'duplicate', id, {
      originalUrl: duplicate.originalUrl,
      matchedArticleId: duplicate.matchedArticleId,
    });
    return res.redirect(303, '/admin?duplicate=published');
  } catch {
    return res.redirect(303, '/admin?duplicate=error');
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
    scheduledPublishAt: input.scheduledPublishAt,
  });
  auditAdminAction(req, input.scheduledPublishAt ? 'article.schedule' : 'article.update', 'article', id, {
    title: input.title,
    scheduledPublishAt: input.scheduledPublishAt,
  });
  return res.redirect(303, `/admin?q=${encodeURIComponent(typeof req.query.q === 'string' ? req.query.q : '')}`);
});

app.post('/admin/articles/:id/publish', requireAdminOrigin, (req, res) => {
  const id = parseArticleId(req.params.id);
  const article = id ? getArticleById(id) : null;
  if (!article || !categories.includes(article.category) || !publishArticle(id)) {
    return res.status(400).type('text').send('Заполните категорию и сохраните черновик перед публикацией.');
  }
  auditAdminAction(req, 'article.publish', 'article', id, { slug: article.slug, title: article.titleRu || article.titleFi });
  return res.redirect(303, '/admin?import=published');
});

app.get('/admin/articles/:id/delete', requireAdministrator, (req, res) => {
  const article = getArticleById(parseArticleId(req.params.id));
  if (!article) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  return res.type('html').send(renderAdminArticleDeletePage({ article, siteUrl: SITE_URL }));
});

app.post('/admin/articles/:id/delete', requireAdminOrigin, requireAdministrator, (req, res) => {
  const id = parseArticleId(req.params.id);
  if (!id || req.body.confirm_delete !== 'delete') {
    return res.status(400).type('text').send('Удаление статьи не подтверждено.');
  }
  const article = id ? getArticleById(id) : null;
  if (article && deleteArticle(id)) {
    auditAdminAction(req, 'article.delete', 'article', id, { slug: article.slug, title: article.titleRu || article.titleFi });
  }
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
    auditAdminAction(req, 'article.telegram_send', 'article', id, {
      telegramMessageId: String(telegramMessageId),
      slug: article.slug,
    });
    return res.redirect(303, '/admin?telegram=sent');
  } catch {
    return res.redirect(303, '/admin?telegram=error');
  } finally {
    telegramSendingArticleIds.delete(id);
  }
});

app.post('/admin/comments/:id', requireAdminOrigin, (req, res) => {
  const id = parseCommentId(req.params.id);
  const authorName = typeof req.body.author_name === 'string' ? req.body.author_name.trim() : '';
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!id || !authorName || !body || authorName.length > COMMENT_NAME_MAX_LENGTH || body.length > COMMENT_BODY_MAX_LENGTH) {
    return res.status(400).type('text').send('Проверьте имя и текст комментария.');
  }
  if (!updateComment({ id, authorName, body })) {
    return res.status(404).type('text').send('Комментарий не найден.');
  }
  auditAdminAction(req, 'comment.update', 'comment', id, { authorName });
  return res.redirect(303, '/admin');
});

app.post('/admin/comments/:id/approve', requireAdminOrigin, (req, res) => {
  const id = parseCommentId(req.params.id);
  if (id && updateCommentStatus(id, 'approved')) auditAdminAction(req, 'comment.approve', 'comment', id);
  res.redirect(303, '/admin');
});

app.post('/admin/comments/:id/reject', requireAdminOrigin, (req, res) => {
  const id = parseCommentId(req.params.id);
  if (id && updateCommentStatus(id, 'rejected')) auditAdminAction(req, 'comment.reject', 'comment', id);
  res.redirect(303, '/admin');
});

app.post('/admin/comments/:id/delete', requireAdminOrigin, requireAdministrator, (req, res) => {
  const id = parseCommentId(req.params.id);
  if (id && deleteComment(id)) auditAdminAction(req, 'comment.delete', 'comment', id);
  res.redirect(303, '/admin');
});

app.listen(PORT, () => {
  console.log(`Финские Новости — API запущен на http://localhost:${PORT}`);
  console.log(`Обновление RSS каждые ${REFRESH_MIN} мин.`);
  // Первое обновление сразу при старте, чтобы не ждать 15 минут до первых данных
  runScheduledPublishing();
  safeRefresh();
  cleanupAnalytics(ANALYTICS_RETENTION_DAYS);
  cleanupAdminAuthData();
});

// Периодическое обновление по cron (например, "*/15 * * * *")
cron.schedule(`*/${REFRESH_MIN} * * * *`, safeRefresh, {
  name: 'rss-refresh',
  noOverlap: true,
});
cron.schedule('* * * * *', runScheduledPublishing, {
  name: 'scheduled-publishing',
  noOverlap: true,
});
cron.schedule('15 0 * * *', () => cleanupAnalytics(ANALYTICS_RETENTION_DAYS), {
  name: 'analytics-cleanup',
  noOverlap: true,
  timezone: 'UTC',
});
cron.schedule('25 0 * * *', () => cleanupAdminAuthData(), {
  name: 'admin-auth-cleanup',
  noOverlap: true,
  timezone: 'UTC',
});
