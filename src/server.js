// src/server.js
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { fetchAllNews } = require('./fetchNews');
const { getRussianVersion } = require('./russianVersion');
const { PROMPT_VERSION, generateEditorialDiscussions } = require('./aiRetell');
const { extractArticleContent, fetchExternalHtml, parseExternalUrl } = require('./importArticle');
const { parseAdminAccounts, verifyAdminAuthorization } = require('./adminAccounts');
const {
  configureRussianTelegramBot,
  configureTelegramWebhook,
  getRussianTelegramReply,
} = require('./telegramBot');
const {
  articleMatchesSubscription,
  buildTelegramDigestMessage,
  buildTelegramMessage,
  canDeliverArticleNow,
  isDeliveryScheduleDue,
  normalizeContentTypes,
} = require('./telegramDelivery');
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
  claimDueTasks,
  completeTask,
  countUntranslatedArticles,
  countArticlesByCategory,
  countArticlesByRegionCode,
  countArticlesByTagSlug,
  countPublishedSearchResults,
  createComment,
  createContactMessage,
  countTelegramChannelPublicationsToday,
  countUnreadAdminNotifications,
  createManualArticle,
  createImportedDraft,
  enqueueTask,
  failTask,
  deleteArticle,
  deleteUntranslatedArticles,
  deleteComment,
  findSimilarArticle,
  getAdminAuditLog,
  getAdminComments,
  getContactMessages,
  getAdminNotifications,
  getUnreadContactMessageCount,
  getManagedTaxonomy,
  getVisibleManagedCategories,
  resolveManagedCategorySlug,
  getManagedCategoryByName,
  createManagedTaxonomyItem,
  updateManagedTaxonomyItem,
  setManagedTaxonomyVisibility,
  deleteManagedTaxonomyItem,
  mergeManagedCategories,
  getAdminSources,
  getAdminStatistics,
  getArticleBySlug,
  getArticleById,
  getArticleClassification,
  getQualityReviewQueue,
  countQualityReviewQueue,
  reviewArticleQuality,
  getArticles,
  getArticlesByCategory,
  getArticlesByRegionCode,
  getArticlesByTagSlug,
  getAdjacentArticles,
  getRelatedArticles,
  getAnalyticsSecret,
  getApprovedComments,
  getLatestApprovedComments,
  getCategories,
  getNews,
  getOperationalMetrics,
  getRecentDuplicateArticles,
  getDuplicateArticleById,
  getHomeArticles,
  articleExists,
  cleanupAnalytics,
  cleanupAdminAuthData,
  consumeAdminOAuthState,
  createAdminOAuthState,
  createAdminSession,
  createUserOAuthState,
  consumeUserOAuthState,
  createUserSession,
  getUserSession,
  deleteUserSession,
  getUserSubscription,
  getActiveUserSubscriptions,
  upsertUserSubscription,
  createTelegramLinkCode,
  getTelegramUserLink,
  linkTelegramUser,
  deleteAdminSession,
  getAdminSession,
  recordView,
  recordDuplicateArticle,
  searchArticles,
  searchPublishedArticles,
  getSourceCounts,
  getSitemapArticles,
  getTelegramPublication,
  getTelegramChannelPublication,
  getTelegramChannelSettings,
  insertArticle,
  classifyAndStoreArticle,
  classifyUnclassifiedArticles,
  getPublishedArticlesSince,
  getReactionTotals,
  recordArticleReaction,
  recordAdminAction,
  recordTelegramPublication,
  recordTelegramChannelPublication,
  recordTelegramDeliveryAttempt,
  recordSearchQuery,
  countTelegramUserDeliveries,
  recordTelegramUserDelivery,
  hasTelegramUserDelivery,
  publishArticle,
  publishScheduledArticles,
  resolveDuplicateArticle,
  updateCommentStatus,
  updateComment,
  updateContactMessageStatus,
  markAdminNotificationRead,
  saveTelegramChannelSettings,
  updateArticleEditorial,
  createEditorialDiscussion,
  getEditorialDiscussions,
  updateEditorialDiscussion,
} = require('./db');
const {
  categories: fallbackCategories,
  categoryFromSlug: fallbackCategoryFromSlug,
  categoryToSlug: fallbackCategoryToSlug,
} = require('./categories');
const { slugify } = require('./slugify');
const {
  renderAccountErrorPage,
  renderAccountLoginPage,
  renderAccountPage,
  renderArticlePage,
  renderAdminPage,
  renderAdminLoginPage,
  renderAdminArticleDeletePage,
  renderListPage,
  renderNotFound,
  renderAboutPage,
  renderContactPage,
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
const USER_SESSION_COOKIE = 'fn_user_session';
const USER_OAUTH_STATE_COOKIE = 'fn_user_oauth_state';
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
const TAXONOMY_TYPES = new Set(['categories', 'tags', 'regions', 'audiences']);
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
const GOOGLE_AUTH_ENABLED = Boolean(
  GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET && GOOGLE_ADMIN_ACCOUNTS.length,
);
const GOOGLE_USER_AUTH_ENABLED = Boolean(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);

function getRequestOrigin(req) {
  try {
    const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
    const host = forwardedHost || req.get('host') || '';
    const protocol = forwardedProto || (req.secure ? 'https' : 'http');
    const origin = new URL(`${protocol}://${host}`).origin;
    return origin === 'null' ? SITE_URL : origin;
  } catch {
    return SITE_URL;
  }
}

function getAdminGoogleAuthProvider(req) {
  return createGoogleAuthProvider({
    clientId: GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: `${getRequestOrigin(req)}/admin/auth/google/callback`,
  });
}

function getUserGoogleAuthProvider(req) {
  return createGoogleAuthProvider({
    clientId: GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: `${getRequestOrigin(req)}/account/auth/google/callback`,
  });
}
const ANALYTICS_SECRET = getAnalyticsSecret();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET
  || (process.env.TELEGRAM_BOT_TOKEN
    ? crypto.createHash('sha256').update(`finskienovosti-webhook:${process.env.TELEGRAM_BOT_TOKEN}`).digest('hex')
    : '');

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
const TELEGRAM_BOT_CONFIGURED = Boolean(TELEGRAM_BOT_TOKEN);
const TELEGRAM_CONFIGURED = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
const TELEGRAM_BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
let telegramBotProfileCache = null;
let telegramBotProfileCacheExpiresAt = 0;
let telegramBotProfileRequest = null;

function normalizeTelegramBotProfile(result) {
  if (!result || typeof result !== 'object') return null;
  const username = String(result.username || '').replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) return null;
  return {
    username,
    displayName: String(result.first_name || 'Финские Новости').trim() || 'Финские Новости',
  };
}

async function getTelegramBotProfile() {
  if (TELEGRAM_BOT_USERNAME) {
    return normalizeTelegramBotProfile({
      username: TELEGRAM_BOT_USERNAME,
      first_name: 'Финские Новости',
    });
  }
  if (!TELEGRAM_BOT_TOKEN) return null;
  if (Date.now() < telegramBotProfileCacheExpiresAt) return telegramBotProfileCache;
  if (telegramBotProfileRequest) return telegramBotProfileRequest;

  telegramBotProfileRequest = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${TELEGRAM_BOT_TOKEN}/getMe`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`telegram getMe failed: ${response.status}`);
      const payload = await response.json();
      const profile = payload && payload.ok ? normalizeTelegramBotProfile(payload.result) : null;
      telegramBotProfileCache = profile;
      telegramBotProfileCacheExpiresAt = Date.now() + (profile ? 6 * 60 * 60 * 1000 : 60 * 1000);
      return profile;
    } catch (error) {
      telegramBotProfileCache = null;
      telegramBotProfileCacheExpiresAt = Date.now() + 60 * 1000;
      console.error('[telegram] failed to load bot profile', error.message);
      return null;
    } finally {
      clearTimeout(timeout);
      telegramBotProfileRequest = null;
    }
  })();

  return telegramBotProfileRequest;
}

async function callTelegramBotMethod(method, body) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('telegram bot token is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok || !payload || payload.ok !== true) {
      throw new Error(`telegram ${method} failed`);
    }
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function configureTelegramBotInterface() {
  if (!TELEGRAM_BOT_TOKEN) return;
  await configureRussianTelegramBot(callTelegramBotMethod);
  const webhook = await configureTelegramWebhook(callTelegramBotMethod, {
    siteUrl: SITE_URL,
    secret: TELEGRAM_WEBHOOK_SECRET,
  });
  console.log('[telegram] русское меню и описание бота настроены');
  if (webhook.configured) {
    console.log(`[telegram] webhook подключён: ${webhook.url}`);
  } else {
    console.warn('[telegram] webhook не подключён: SITE_URL должен использовать HTTPS');
  }
}

function isImportProviderConfigured() {
  if (RUSSIAN_PROVIDER === 'mock') return true;
  if (RUSSIAN_PROVIDER === 'openai') return Boolean(process.env.OPENAI_API_KEY);
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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function getUserAuth(req) {
  const token = getCookie(req, USER_SESSION_COOKIE);
  if (!token || token.length > 300) return null;
  const tokenHash = sha256(token);
  const session = getUserSession(tokenHash);
  return session ? { ...session, tokenHash } : null;
}
function setUserSessionCookie(res, token) {
  const parts = [`${USER_SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=43200'];
  if (SITE_URL.startsWith('https://')) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
function clearUserSessionCookie(res) { res.append('Set-Cookie', `${USER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }
async function simpleAccountPage(req, res, message = '', telegramLinkCode = '') {
  try {
    const user = getUserAuth(req);
    if (!user) return res.redirect(303, '/account/login');
    const link = getTelegramUserLink(user.googleSub);
    let sub = getUserSubscription(user.googleSub);
    if (link?.telegramChatId && !sub.persisted) {
      upsertUserSubscription({ ...sub, enabled: true });
      sub = getUserSubscription(user.googleSub);
    }
    const botProfile = await getTelegramBotProfile();
    return res.type('html').send(renderAccountPage({
      siteUrl: SITE_URL,
      user,
      subscription: sub,
      categories: managedCategories(),
      sources: getAdminSources(),
      taxonomy: getManagedTaxonomy(),
      telegramLink: link,
      botProfile,
      message,
      telegramLinkCode,
    }));
  } catch (error) {
    console.error('[account] failed to render account page', error);
    return res.status(500).type('html').send(renderAccountErrorPage({ siteUrl: SITE_URL }));
  }
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

function managedCategories() {
  const names = getVisibleManagedCategories().map((category) => category.name);
  return names.length ? names : fallbackCategories;
}

function categoryToSlug(category) {
  return getManagedCategoryByName(category)?.slug || fallbackCategoryToSlug(category);
}

function categorySlugResolution(slug) {
  const managed = resolveManagedCategorySlug(slug);
  if (managed) return managed;
  const category = fallbackCategoryFromSlug(slug);
  return category ? {
    category: { name: category, slug: fallbackCategoryToSlug(category) },
    isAlias: false,
    canonicalSlug: fallbackCategoryToSlug(category),
  } : null;
}

function parseTaxonomyType(value) {
  return TAXONOMY_TYPES.has(value) ? value : null;
}

function parseTaxonomyInput(body) {
  return {
    name: body.name,
    code: body.code,
    slug: body.slug,
    emoji: body.emoji,
    color: body.color,
    description: body.description,
    synonyms: body.synonyms,
    keywords: body.keywords,
    classificationRules: body.classification_rules,
    aliases: body.aliases,
    regionType: body.region_type,
    parentCode: body.parent_code,
    sortOrder: body.sort_order,
  };
}

function taxonomyRedirect(status, type = '') {
  const params = new URLSearchParams({ tab: 'taxonomy', taxonomy: status });
  if (type) params.set('type', type);
  return `/admin?${params.toString()}`;
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
  if (!title || !text || !managedCategories().includes(category)
    || title.length > ARTICLE_TITLE_MAX_LENGTH || text.length > ARTICLE_BODY_MAX_LENGTH
    || !EDITORIAL_STATUSES.has(editorialStatus)) return null;
  return { title, text, category, editorialStatus, pinnedUntil, scheduledPublishAt };
}

function parseStatisticsFilters(query = {}) {
  const category = managedCategories().includes(query.category) ? query.category : '';
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

async function sendTelegramMessageToChat(chatId, text) {
  const result = await callTelegramBotMethod('sendMessage', { chat_id: chatId, text });
  if (!result || result.message_id === undefined) throw new Error('telegram sendMessage returned no message id');
  return result.message_id;
}

async function sendTelegramMessage(article) {
  return sendTelegramMessageToChat(TELEGRAM_CHAT_ID, buildTelegramMessage(article, { siteUrl: SITE_URL, includeOriginal: true }));
}

function normalizeTelegramChannelSettings(input = {}) {
  const chatId = String(input.chatId || '@finskienovosti').trim();
  const importance = new Set(['all', 'important', 'urgent']).has(input.importance)
    ? input.importance
    : 'all';
  const categories = Array.isArray(input.categories)
    ? input.categories
    : String(input.categories || '').split(',');
  return {
    enabled: input.enabled === true || input.enabled === '1' || input.enabled === 'on',
    chatId: /^@[A-Za-z0-9_]{5,32}$/.test(chatId) ? chatId : '@finskienovosti',
    categories: categories.map((value) => String(value).trim()).filter((value) => managedCategories().includes(value)),
    importance,
    maxPostsPerDay: Math.min(Math.max(Number.parseInt(input.maxPostsPerDay, 10) || 20, 1), 100),
    includeOriginal: input.includeOriginal === true || input.includeOriginal === '1' || input.includeOriginal === 'on',
    template: String(input.template || '{label}\\n{category}\\n{title}\\n\\n{excerpt}\\n\\nЧитать далее: {article_url}')
      .trim()
      .slice(0, 3000),
  };
}

function articleMatchesTelegramChannel(article, settings) {
  if (!article || article.publicationStatus !== 'published') return false;
  if (settings.categories.length && !settings.categories.includes(article.category)) return false;
  const importanceLevel = Number(article.importanceLevel || 1);
  if (settings.importance === 'urgent') {
    return article.editorialStatus === 'urgent' || importanceLevel >= 5;
  }
  if (settings.importance === 'important') {
    return ['important', 'urgent'].includes(article.editorialStatus) || importanceLevel >= 4;
  }
  return true;
}

function renderTelegramChannelTemplate(article, settings) {
  const label = article.editorialStatus === 'urgent'
    ? '🔴 СРОЧНО'
    : article.editorialStatus === 'important' ? '🟠 ВАЖНО' : '📰 Финские Новости';
  const articleUrl = `${SITE_URL}/news/${encodeURIComponent(article.slug)}`;
  const originalUrl = settings.includeOriginal && article.originalUrl ? article.originalUrl : '';
  const values = {
    label,
    category: article.category || '',
    title: article.titleRu || article.titleFi || '',
    excerpt: article.summaryRu || article.summaryFi || '',
    article_url: articleUrl,
    original_url: originalUrl,
  };
  let text = settings.template.replace(/\\n/g, '\n');
  for (const [key, value] of Object.entries(values)) {
    text = text.replaceAll(`{${key}}`, String(value));
  }
  if (!text.includes(articleUrl)) text += `\n\nЧитать далее: ${articleUrl}`;
  if (originalUrl && !text.includes(originalUrl)) text += `\nОригинал: ${originalUrl}`;
  return text.trim().slice(0, 4096);
}

async function sendArticleToTelegramChannel(article, { deliveryType = 'auto', ignoreEnabled = false } = {}) {
  if (!TELEGRAM_BOT_CONFIGURED) return { sent: false, reason: 'not_configured' };
  const settings = normalizeTelegramChannelSettings(getTelegramChannelSettings());
  if (!ignoreEnabled && !settings.enabled) return { sent: false, reason: 'disabled' };
  if (!articleMatchesTelegramChannel(article, settings)) return { sent: false, reason: 'filtered' };
  if (getTelegramChannelPublication(article.id)) return { sent: false, reason: 'already_sent' };
  if (countTelegramChannelPublicationsToday(settings.chatId) >= settings.maxPostsPerDay) {
    return { sent: false, reason: 'daily_limit' };
  }
  const telegramMessageId = await sendTelegramMessageToChat(
    settings.chatId,
    renderTelegramChannelTemplate(article, settings),
  );
  recordTelegramChannelPublication({
    articleId: article.id,
    channelChatId: settings.chatId,
    telegramMessageId,
    deliveryType,
  });
  return { sent: true, telegramMessageId };
}

async function publishArticlesToTelegramChannel(articles) {
  const results = { sent: 0, skipped: 0 };
  for (const article of Array.isArray(articles) ? articles : []) {
    try {
      const result = await sendArticleToTelegramChannel(article);
      if (result.sent) results.sent += 1;
      else results.skipped += 1;
    } catch (error) {
      results.skipped += 1;
      console.error('[telegram-channel] ошибка отправки:', error.message);
    }
  }
  return results;
}

function getTelegramTodayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

async function notifyTelegramSubscribersForArticles(articles, { frequency, sinceIso = null, retryOnly = false } = {}) {
  try {
    return await deliverTelegramArticlesToSubscriptions(articles, { frequency, sinceIso, retryOnly });
  } catch (error) {
    console.error('[telegram-notify] ошибка доставки:', error.message);
    return { delivered: 0, skipped: 0 };
  }
}

async function deliverTelegramArticlesToSubscriptions(articles, { frequency, sinceIso = null, retryOnly = false } = {}) {
  if (!TELEGRAM_BOT_CONFIGURED || !Array.isArray(articles) || !articles.length) return { delivered: 0, skipped: 0 };
  const subscriptions = getActiveUserSubscriptions().filter((subscription) => subscription.frequency === frequency);
  if (!subscriptions.length) return { delivered: 0, skipped: 0 };
  const today = getTelegramTodayKey();
  let delivered = 0;
  let skipped = 0;
  for (const subscription of subscriptions) {
    if (!retryOnly && !isDeliveryScheduleDue(subscription)) {
      skipped += 1;
      continue;
    }
    const quota = subscription.maxPostsPerDay || 5;
    let sentToday = countTelegramUserDeliveries({ userId: subscription.userId, day: today });
    if (retryOnly && sentToday > 0) {
      skipped += 1;
      continue;
    }
    if (sentToday >= quota) {
      skipped += 1;
      continue;
    }
    const eligible = articles.filter((article) => (
      articleMatchesSubscription(article, subscription)
      && canDeliverArticleNow(article, subscription)
      && !hasTelegramUserDelivery({ userId: subscription.userId, articleId: article.id })
    ));
    if (sinceIso) {
      eligible.sort((a, b) => new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0));
    }
    const remaining = quota - sentToday;
    const batch = sinceIso ? eligible.slice(-remaining) : eligible.slice(0, remaining);
    if (!batch.length) {
      skipped += 1;
      continue;
    }
    if (frequency === 'daily') {
      const text = buildTelegramDigestMessage(batch, subscription, { siteUrl: SITE_URL });
      try {
        const telegramMessageId = await sendTelegramMessageToChat(subscription.telegramChatId, text);
        for (const article of batch) {
          if (recordTelegramUserDelivery({ userId: subscription.userId, articleId: article.id, telegramMessageId })) {
            delivered += 1;
            recordTelegramDeliveryAttempt({ userId: subscription.userId, articleId: article.id, deliveryKind: 'daily', status: 'sent', telegramMessageId });
          }
        }
      } catch (error) {
        console.error('[telegram-digest] ошибка отправки:', error.message);
        for (const article of batch) {
          recordTelegramDeliveryAttempt({ userId: subscription.userId, articleId: article.id, deliveryKind: 'daily', status: 'failed', errorCode: error.message });
          enqueueTask({
            taskType: 'personal_telegram',
            payload: { userId: subscription.userId, articleId: article.id },
            idempotencyKey: `personal-telegram:${subscription.userId}:${article.id}`,
          });
        }
        skipped += 1;
      }
      continue;
    }
    for (const article of batch) {
      try {
        const telegramMessageId = await sendTelegramMessageToChat(subscription.telegramChatId, buildTelegramMessage(article, {
          siteUrl: SITE_URL,
          includeOriginal: subscription.includeOriginal !== false,
        }));
        if (recordTelegramUserDelivery({ userId: subscription.userId, articleId: article.id, telegramMessageId })) {
          delivered += 1;
          sentToday += 1;
          recordTelegramDeliveryAttempt({ userId: subscription.userId, articleId: article.id, deliveryKind: 'instant', status: 'sent', telegramMessageId });
        }
      } catch (error) {
        console.error('[telegram-instant] ошибка отправки:', error.message);
        recordTelegramDeliveryAttempt({ userId: subscription.userId, articleId: article.id, deliveryKind: 'instant', status: 'failed', errorCode: error.message });
        enqueueTask({
          taskType: 'personal_telegram',
          payload: { userId: subscription.userId, articleId: article.id },
          idempotencyKey: `personal-telegram:${subscription.userId}:${article.id}`,
        });
        skipped += 1;
      }
      if (sentToday >= quota) break;
    }
  }
  return { delivered, skipped };
}

async function processTelegramRetryQueue() {
  if (!TELEGRAM_BOT_CONFIGURED) return { completed: 0, failed: 0 };
  const subscriptions = new Map(getActiveUserSubscriptions().map((subscription) => [subscription.userId, subscription]));
  const tasks = claimDueTasks('personal_telegram', 10);
  let completed = 0;
  let failed = 0;
  for (const task of tasks) {
    const subscription = subscriptions.get(task.payload.userId);
    const article = getArticleById(task.payload.articleId);
    if (!subscription || !article || hasTelegramUserDelivery({ userId: task.payload.userId, articleId: task.payload.articleId })) {
      completeTask(task.id);
      completed += 1;
      continue;
    }
    try {
      const telegramMessageId = await sendTelegramMessageToChat(subscription.telegramChatId, buildTelegramMessage(article, {
        siteUrl: SITE_URL,
        includeOriginal: subscription.includeOriginal !== false,
      }));
      recordTelegramUserDelivery({ userId: subscription.userId, articleId: article.id, telegramMessageId });
      recordTelegramDeliveryAttempt({ userId: subscription.userId, articleId: article.id, deliveryKind: 'retry', status: 'sent', telegramMessageId });
      completeTask(task.id);
      completed += 1;
    } catch (error) {
      recordTelegramDeliveryAttempt({ userId: subscription.userId, articleId: article.id, deliveryKind: 'retry', status: 'failed', errorCode: error.message });
      failTask(task.id, error.message);
      failed += 1;
    }
  }
  return { completed, failed };
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
    const insertedArticles = await fetchAllNews();
    if (insertedArticles.length) {
      await Promise.all([
        notifyTelegramSubscribersForArticles(insertedArticles, { frequency: 'instant' }),
        publishArticlesToTelegramChannel(insertedArticles),
      ]);
    }
  } catch (err) {
    console.error('[safeRefresh] ошибка обновления:', err);
  } finally {
    isRefreshing = false;
  }
}

async function runScheduledPublishing() {
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
  if (published.length) {
    await Promise.all([
      notifyTelegramSubscribersForArticles(published, { frequency: 'instant' }),
      publishArticlesToTelegramChannel(published),
    ]);
  }
  return published;
}

async function runDailyTelegramDigest({ retryOnly = false } = {}) {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const articles = getPublishedArticlesSince(sinceIso);
  if (!articles.length) return { delivered: 0, skipped: 0 };
  return notifyTelegramSubscribersForArticles(articles, { frequency: 'daily', sinceIso, retryOnly });
}

async function runInstantTelegramCatchup() {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const articles = getPublishedArticlesSince(sinceIso);
  if (!articles.length) return { delivered: 0, skipped: 0 };
  return notifyTelegramSubscribersForArticles(articles, { frequency: 'instant', sinceIso });
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

app.get('/contact', (req, res) => {
  res.type('html').send(renderContactPage({ siteUrl: SITE_URL, status: typeof req.query.contact === 'string' ? req.query.contact : '' }));
});

app.get('/sitemap.xml', (req, res) => {
  const categorySlugs = getCategories().map(categoryToSlug).filter(Boolean);
  const taxonomy = getManagedTaxonomy();
  const sitemap = renderSitemap({
    siteUrl: SITE_URL,
    categorySlugs,
    tagSlugs: taxonomy.tags.filter((item) => item.isVisible !== false).map((item) => item.slug),
    regionCodes: taxonomy.regions.filter((item) => item.isVisible !== false).map((item) => item.code),
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
  if (searchable) recordSearchQuery(query, total);
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

app.get('/api/search/suggestions', (req, res) => {
  const query = (typeof req.query.q === 'string' ? req.query.q : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (query.length < 2) return res.json({ query, suggestions: [] });
  const suggestions = searchPublishedArticles({ query, limit: 5, offset: 0 })
    .map((article) => ({
      title: article.titleRu || article.titleFi,
      url: `/news/${encodeURIComponent(article.slug)}`,
    }));
  return res.json({ query, suggestions });
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
  const page = Number.parseInt(req.query.page, 10) || 1;
  if (page < 1) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  const resolution = categorySlugResolution(req.params.slug);
  if (!resolution) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  if (resolution.isAlias) {
    const pageQuery = page > 1 ? `?page=${page}` : '';
    return res.redirect(301, `/category/${encodeURIComponent(resolution.canonicalSlug)}${pageQuery}`);
  }
  recordPublicView(req);
  const category = resolution.category.name;
  const total = countArticlesByCategory(category);
  const articles = withReactionTotalsForList(getArticlesByCategory(category, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }));
  if (page > 1 && articles.length === 0) {
    return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  }
  const pageSuffix = page === 1 ? '' : ` — страница ${page}`;
  const categoryPath = `/category/${encodeURIComponent(resolution.canonicalSlug)}`;
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

app.get('/tag/:slug', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const tag = getManagedTaxonomy().tags.find((item) => item.slug === req.params.slug && item.isVisible !== false);
  if (!tag) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  recordPublicView(req);
  const total = countArticlesByTagSlug(tag.slug);
  const articles = withReactionTotalsForList(getArticlesByTagSlug(tag.slug, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }));
  if (page > 1 && articles.length === 0) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  const basePath = `/tag/${encodeURIComponent(tag.slug)}`;
  return res.type('html').send(renderListPage({
    title: `Тема: ${tag.name}${page > 1 ? ` — страница ${page}` : ''}`,
    description: tag.description || `Все опубликованные материалы по теме «${tag.name}».`,
    canonicalPath: page === 1 ? basePath : `${basePath}?page=${page}`,
    siteUrl: SITE_URL,
    articles,
    page,
    total,
    pagePath: (targetPage) => (targetPage === 1 ? basePath : `${basePath}?page=${targetPage}`),
    categoryToSlug,
  }));
});

app.get('/region/:code', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const region = getManagedTaxonomy().regions.find((item) => item.code === req.params.code && item.isVisible !== false);
  if (!region) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  recordPublicView(req);
  const total = countArticlesByRegionCode(region.code);
  const articles = withReactionTotalsForList(getArticlesByRegionCode(region.code, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }));
  if (page > 1 && articles.length === 0) return res.status(404).type('html').send(renderNotFound({ siteUrl: SITE_URL }));
  const basePath = `/region/${encodeURIComponent(region.code)}`;
  return res.type('html').send(renderListPage({
    title: `Регион: ${region.name}${page > 1 ? ` — страница ${page}` : ''}`,
    description: `Новости по региону «${region.name}».`,
    canonicalPath: page === 1 ? basePath : `${basePath}?page=${page}`,
    siteUrl: SITE_URL,
    articles,
    page,
    total,
    pagePath: (targetPage) => (targetPage === 1 ? basePath : `${basePath}?page=${targetPage}`),
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
    relatedArticles: getRelatedArticles(article.id, 4),
    adjacent: getAdjacentArticles(article.id),
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
  return res.redirect(303, '/contact?contact=sent');
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
  const authorizationUrl = getAdminGoogleAuthProvider(req).createAuthorizationUrl({
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
    const identity = await getAdminGoogleAuthProvider(req).exchangeAndVerify({
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

app.get('/account/login', (req, res) => {
  if (getUserAuth(req)) return res.redirect(303, '/account');
  const status = GOOGLE_USER_AUTH_ENABLED ? 200 : 503;
  return res.status(status).type('html').send(renderAccountLoginPage({
    siteUrl: SITE_URL,
    googleEnabled: GOOGLE_USER_AUTH_ENABLED,
    error: typeof req.query.error === 'string' ? req.query.error : '',
  }));
});
app.get('/account/login/start', (req, res) => {
  if (getUserAuth(req)) return res.redirect(303, '/account');
  if (!GOOGLE_USER_AUTH_ENABLED) return res.status(503).send('Google-вход для пользователей не настроен.');
  const state = randomBase64Url(32); const nonce = randomBase64Url(32); const pkce = createPkcePair();
  createUserOAuthState({ stateHash: sha256(state), nonce, codeVerifier: pkce.verifier, expiresAt: new Date(Date.now() + 600000).toISOString() });
  res.append('Set-Cookie', `${USER_OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/account/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=600`);
  return res.redirect(303, getUserGoogleAuthProvider(req).createAuthorizationUrl({ state, nonce, codeChallenge: pkce.challenge }));
});
app.get('/account/auth/google/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : ''; const code = typeof req.query.code === 'string' ? req.query.code : '';
  const saved = state && safelyMatches(state, getCookie(req, USER_OAUTH_STATE_COOKIE)) ? consumeUserOAuthState(sha256(state)) : null;
  if (!saved || !code || Date.parse(saved.expiresAt) <= Date.now()) return res.redirect(303, '/account/login?error=state');
  try { const identity = await getUserGoogleAuthProvider(req).exchangeAndVerify({ code, codeVerifier: saved.codeVerifier, nonce: saved.nonce }); const token = randomBase64Url(48); createUserSession({ tokenHash: sha256(token), googleSub: identity.googleSub, email: identity.email, displayName: identity.displayName, expiresAt: new Date(Date.now() + 43200000).toISOString() }); setUserSessionCookie(res, token); return res.redirect(303, '/account'); } catch { return res.redirect(303, '/account/login?error=failed'); }
});
app.get('/account', async (req, res) => simpleAccountPage(req, res));
app.post('/account/subscription', async (req, res) => {
  const user = getUserAuth(req);
  if (!user) return res.redirect(303, '/account/login');
  const cats = Array.isArray(req.body.categories) ? req.body.categories : (req.body.categories ? [req.body.categories] : []);
  const requestedSources = Array.isArray(req.body.source_ids) ? req.body.source_ids : (req.body.source_ids ? [req.body.source_ids] : []);
  const requestedExcludedCategories = Array.isArray(req.body.excluded_categories) ? req.body.excluded_categories : (req.body.excluded_categories ? [req.body.excluded_categories] : []);
  const requestedTags = Array.isArray(req.body.tag_ids) ? req.body.tag_ids : (req.body.tag_ids ? [req.body.tag_ids] : []);
  const requestedRegions = Array.isArray(req.body.region_codes) ? req.body.region_codes : (req.body.region_codes ? [req.body.region_codes] : []);
  const requestedAudiences = Array.isArray(req.body.audience_codes) ? req.body.audience_codes : (req.body.audience_codes ? [req.body.audience_codes] : []);
  const requestedDeliveryWeekdays = Array.isArray(req.body.delivery_weekdays) ? req.body.delivery_weekdays : (req.body.delivery_weekdays ? [req.body.delivery_weekdays] : []);
  const requestedQuietWeekdays = Array.isArray(req.body.quiet_weekdays) ? req.body.quiet_weekdays : (req.body.quiet_weekdays ? [req.body.quiet_weekdays] : []);
  const taxonomy = getManagedTaxonomy();
  const allowedSourceIds = new Set(getAdminSources().map((source) => source.sourceId));
  const allowedTagIds = new Set(taxonomy.tags.filter((tag) => tag.isVisible).map((tag) => String(tag.id)));
  const allowedRegionCodes = new Set(taxonomy.regions.filter((region) => region.isVisible).map((region) => region.code));
  const allowedAudienceCodes = new Set(taxonomy.audiences.filter((audience) => audience.isVisible).map((audience) => audience.code));
  const allowedWeekdays = new Set(['0', '1', '2', '3', '4', '5', '6']);
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const quietStart = timePattern.test(req.body.quiet_start || '') ? req.body.quiet_start : '22:00';
  const quietEnd = timePattern.test(req.body.quiet_end || '') ? req.body.quiet_end : '07:00';
  upsertUserSubscription({
    userId: user.googleSub,
    enabled: req.body.enabled === 'on',
    frequency: req.body.frequency === 'instant' ? 'instant' : 'daily',
    categories: cats.filter((category) => managedCategories().includes(category)),
    scope: req.body.scope === 'all' ? 'all' : 'finland',
    importance: req.body.importance === 'important' ? 'important' : 'all',
    sourceIds: requestedSources.filter((sourceId) => allowedSourceIds.has(sourceId)),
    maxPostsPerDay: Math.min(30, Math.max(1, Number.parseInt(req.body.max_posts_per_day, 10) || 5)),
    includeOriginal: req.body.include_original === 'on',
    quietHoursEnabled: req.body.quiet_hours_enabled === 'on',
    quietStart,
    quietEnd,
    timezone: 'Europe/Helsinki',
    contentTypes: normalizeContentTypes(req.body.content_types),
    excludedCategories: requestedExcludedCategories.filter((category) => managedCategories().includes(category)),
    tagIds: requestedTags.map(String).filter((id) => allowedTagIds.has(id)),
    regionCodes: requestedRegions.filter((code) => allowedRegionCodes.has(code)),
    audienceCodes: requestedAudiences.filter((code) => allowedAudienceCodes.has(code)),
    minimumImportance: Math.min(5, Math.max(1, Number.parseInt(req.body.minimum_importance, 10) || 1)),
    deliveryTimes: [req.body.delivery_time].filter((value) => timePattern.test(value || '')),
    deliveryWeekdays: requestedDeliveryWeekdays.filter((day) => allowedWeekdays.has(day)),
    quietWeekdays: requestedQuietWeekdays.filter((day) => allowedWeekdays.has(day)),
    allowCriticalDuringQuiet: req.body.allow_critical_during_quiet === 'on',
  });
  if (req.body.enabled === 'on') {
    runInstantTelegramCatchup().catch((error) => console.error('[telegram-catchup] ошибка:', error.message));
  }
  return simpleAccountPage(req, res, 'Настройки сохранены.');
});
app.post('/account/telegram/connect', async (req, res) => {
  const user = getUserAuth(req);
  if (!user) return res.redirect(303, '/account/login');
  const botProfile = await getTelegramBotProfile();
  if (!botProfile?.username) {
    return simpleAccountPage(req, res, 'Не удалось открыть Telegram. Проверьте настройку TELEGRAM_BOT_TOKEN.');
  }
  const raw = randomBase64Url(16);
  createTelegramLinkCode({
    userId: user.googleSub,
    linkCodeHash: sha256(raw),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  return res.redirect(303, `https://t.me/${botProfile.username}?start=${encodeURIComponent(raw)}`);
});
app.post('/account/telegram/code', (req, res) => res.redirect(307, '/account/telegram/connect'));
app.post('/account/telegram/test', async (req, res) => {
  const user = getUserAuth(req);
  if (!user) return res.redirect(303, '/account/login');
  const link = getTelegramUserLink(user.googleSub);
  if (!link?.telegramChatId) {
    return simpleAccountPage(req, res, 'Сначала подключите Telegram.');
  }
  if (!TELEGRAM_BOT_CONFIGURED) {
    return simpleAccountPage(req, res, 'Telegram-бот временно не настроен на сервере.');
  }
  try {
    await sendTelegramMessageToChat(link.telegramChatId, [
      '✅ Доставка работает',
      'Это проверочное сообщение от «Финских Новостей».',
      `Открыть личный кабинет: ${SITE_URL}/account`,
    ].join('\n\n'));
    return simpleAccountPage(req, res, 'Проверочное сообщение отправлено в Telegram.');
  } catch (error) {
    console.error('[telegram-test] ошибка отправки:', error.message);
    return simpleAccountPage(req, res, 'Не удалось отправить проверочное сообщение. Проверьте бота и повторите позже.');
  }
});
app.post('/account/logout', (req, res) => { const user = getUserAuth(req); if (user) deleteUserSession(user.tokenHash); clearUserSessionCookie(res); return res.redirect(303, '/account/login'); });

app.post('/telegram/webhook', express.json(), async (req, res) => {
  if (TELEGRAM_WEBHOOK_SECRET && req.get('x-telegram-bot-api-secret-token') !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(403).json({ ok: false });
  }
  const message = req.body && req.body.message;
  const text = message && typeof message.text === 'string' ? message.text.trim() : '';
  const chatId = message && message.chat && message.chat.id;
  const match = /^\/start(?:@[A-Za-z0-9_]{5,32})?\s+([A-Za-z0-9_-]{8,64})$/i.exec(text);
  const linkedUserId = match && chatId
    ? linkTelegramUser({ linkCodeHash: sha256(match[1]), telegramChatId: String(chatId) })
    : null;
  const linkSucceeded = Boolean(linkedUserId);
  if (linkedUserId) {
    const subscription = getUserSubscription(linkedUserId);
    upsertUserSubscription({ ...subscription, enabled: true });
    runInstantTelegramCatchup().catch((error) => console.error('[telegram-link-catchup] ошибка:', error.message));
  }
  if (chatId && TELEGRAM_BOT_TOKEN) {
    try {
      await sendTelegramMessageToChat(chatId, getRussianTelegramReply(text, {
        accountUrl: SITE_URL,
        linkSucceeded,
      }));
    } catch (error) {
      console.error('[telegram webhook] не удалось отправить ответ:', error.message);
    }
  }
  return res.status(200).json({ ok: true });
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
    .map((article) => ({
      ...article,
      classification: getArticleClassification(article.id),
      telegramPublication: getTelegramPublication(article.id),
      editorialDiscussions: getEditorialDiscussions(article.id),
    }));
  res.set('Cache-Control', 'no-store');
  res.type('html').send(renderAdminPage({
    comments: getAdminComments(100),
    articles,
    query: typeof req.query.q === 'string' ? req.query.q : '',
    statistics: { ...getAdminStatistics(statisticsFilters), operational: getOperationalMetrics() },
    statisticsSources: getAdminSources(),
    duplicateArticles: getRecentDuplicateArticles(20),
    auditLog: getAdminAuditLog(100),
    currentAccount: req.adminAccount,
    categories: managedCategories(),
    taxonomy: getManagedTaxonomy(),
    taxonomyStatus: typeof req.query.taxonomy === 'string' ? req.query.taxonomy : '',
    classificationStatus: typeof req.query.classification === 'string' ? req.query.classification : '',
    classificationCount: Number.parseInt(req.query.count, 10) || 0,
    qualityQueue: getQualityReviewQueue(100),
    qualityQueueCount: countQualityReviewQueue(),
    qualityStatus: typeof req.query.quality === 'string' ? req.query.quality : '',
    telegramConfigured: TELEGRAM_CONFIGURED,
    telegramStatus: typeof req.query.telegram === 'string' ? req.query.telegram : '',
    telegramChannelConfigured: TELEGRAM_BOT_CONFIGURED,
    telegramChannelSettings: normalizeTelegramChannelSettings(getTelegramChannelSettings()),
    telegramChannelStatus: typeof req.query.telegramChannel === 'string' ? req.query.telegramChannel : '',
    importProviderConfigured: IMPORT_PROVIDER_CONFIGURED,
    importStatus: typeof req.query.import === 'string' ? req.query.import : '',
    rssStatus: typeof req.query.rss === 'string' ? req.query.rss : '',
    articleStatus: typeof req.query.article === 'string' ? req.query.article : '',
    duplicateStatus: typeof req.query.duplicate === 'string' ? req.query.duplicate : '',
    siteUrl: SITE_URL,
    tab: typeof req.query.tab === 'string' ? req.query.tab : 'stats',
    contactMessages: getContactMessages(100),
    unreadContactMessages: getUnreadContactMessageCount(),
    adminNotifications: getAdminNotifications(50),
    unreadAdminNotifications: countUnreadAdminNotifications(),
    untranslatedArticleCount: countUntranslatedArticles(),
  }));
});

app.post('/admin/rss/refresh', requireAdminOrigin, (req, res) => {
  if (isRefreshing) {
    return res.redirect(303, '/admin?tab=articles&rss=already-running');
  }
  auditAdminAction(req, 'rss.refresh', 'rss', 'manual');
  safeRefresh().catch((error) => {
    console.error('[admin-rss-refresh] ошибка обновления:', error.message);
  });
  return res.redirect(303, '/admin?tab=articles&rss=started');
});

app.post('/admin/telegram-channel/settings', requireAdminOrigin, (req, res) => {
  const settings = normalizeTelegramChannelSettings({
    enabled: req.body.enabled,
    chatId: req.body.chat_id,
    categories: req.body.categories,
    importance: req.body.importance,
    maxPostsPerDay: req.body.max_posts_per_day,
    includeOriginal: req.body.include_original,
    template: req.body.template,
  });
  saveTelegramChannelSettings({
    ...settings,
    categories: settings.categories.join(','),
  });
  auditAdminAction(req, 'telegram_channel.settings', 'telegram_channel', settings.chatId, {
    enabled: settings.enabled,
    categories: settings.categories,
    importance: settings.importance,
    maxPostsPerDay: settings.maxPostsPerDay,
  });
  return res.redirect(303, '/admin?tab=telegram-channel&telegramChannel=saved');
});

app.post('/admin/telegram-channel/test', requireAdminOrigin, async (req, res) => {
  if (!TELEGRAM_BOT_CONFIGURED) {
    return res.redirect(303, '/admin?tab=telegram-channel&telegramChannel=not-configured');
  }
  const settings = normalizeTelegramChannelSettings(getTelegramChannelSettings());
  try {
    await sendTelegramMessageToChat(settings.chatId, [
      '✅ Тест общего канала «Финские Новости»',
      '',
      'Связь с сайтом настроена. Новые публикации будут отправляться сюда по правилам из админ-панели.',
      SITE_URL,
    ].join('\n'));
    auditAdminAction(req, 'telegram_channel.test', 'telegram_channel', settings.chatId);
    return res.redirect(303, '/admin?tab=telegram-channel&telegramChannel=test-sent');
  } catch (error) {
    console.error('[telegram-channel-test] ошибка:', error.message);
    return res.redirect(303, '/admin?tab=telegram-channel&telegramChannel=test-error');
  }
});

app.post('/admin/notifications/:id/read', requireAdminOrigin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isInteger(id) && id > 0) markAdminNotificationRead(id);
  return res.redirect(303, '/admin?tab=messages');
});

app.post('/admin/taxonomy/:type', requireAdminOrigin, (req, res) => {
  const type = parseTaxonomyType(req.params.type);
  if (!type) return res.status(404).type('text').send('Справочник не найден.');
  try {
    const id = createManagedTaxonomyItem(type, parseTaxonomyInput(req.body));
    auditAdminAction(req, 'taxonomy.create', type, id, { name: req.body.name });
    return res.redirect(303, taxonomyRedirect('created', type));
  } catch (error) {
    const status = String(error.code || '').startsWith('SQLITE_CONSTRAINT') ? 'duplicate' : 'invalid';
    return res.redirect(303, taxonomyRedirect(status, type));
  }
});

app.post('/admin/taxonomy/:type/:id', requireAdminOrigin, (req, res) => {
  const type = parseTaxonomyType(req.params.type);
  const id = parseArticleId(req.params.id);
  if (!type || !id) return res.status(404).type('text').send('Запись справочника не найдена.');
  try {
    if (!updateManagedTaxonomyItem(type, id, parseTaxonomyInput(req.body))) {
      return res.status(404).type('text').send('Запись справочника не найдена.');
    }
    auditAdminAction(req, 'taxonomy.update', type, id, { name: req.body.name });
    return res.redirect(303, taxonomyRedirect('updated', type));
  } catch (error) {
    const status = String(error.code || '').startsWith('SQLITE_CONSTRAINT') ? 'duplicate' : 'invalid';
    return res.redirect(303, taxonomyRedirect(status, type));
  }
});

app.post('/admin/taxonomy/:type/:id/visibility', requireAdminOrigin, (req, res) => {
  const type = parseTaxonomyType(req.params.type);
  const id = parseArticleId(req.params.id);
  const visible = req.body.visible === '1';
  if (!type || !id) return res.status(404).type('text').send('Запись справочника не найдена.');
  try {
    if (!setManagedTaxonomyVisibility(type, id, visible)) {
      return res.status(404).type('text').send('Запись справочника не найдена.');
    }
    auditAdminAction(req, 'taxonomy.visibility', type, id, { visible });
    return res.redirect(303, taxonomyRedirect(visible ? 'shown' : 'hidden', type));
  } catch (error) {
    auditAdminAction(req, 'taxonomy.visibility_failed', type, id, {
      visible,
      reason: error.code || 'unknown',
    });
    return res.redirect(303, taxonomyRedirect(
      error.code === 'CATEGORY_MERGED' ? 'merged-hidden' : 'invalid',
      type,
    ));
  }
});

app.post('/admin/taxonomy/:type/:id/delete', requireAdminOrigin, requireAdministrator, (req, res) => {
  const type = parseTaxonomyType(req.params.type);
  const id = parseArticleId(req.params.id);
  if (!type || !id) return res.status(404).type('text').send('Запись справочника не найдена.');
  const result = deleteManagedTaxonomyItem(type, id);
  auditAdminAction(req, result.deleted ? 'taxonomy.delete' : 'taxonomy.delete_blocked', type, id, result);
  const status = result.deleted ? 'deleted' : result.reason === 'not_found' ? 'not-found' : result.reason;
  return res.redirect(303, taxonomyRedirect(status, type));
});

app.post('/admin/taxonomy/categories/:id/merge', requireAdminOrigin, requireAdministrator, (req, res) => {
  const sourceId = parseArticleId(req.params.id);
  const targetId = parseArticleId(req.body.target_id);
  if (!sourceId || !targetId || req.body.confirm !== 'MERGE') {
    return res.redirect(303, taxonomyRedirect('merge-invalid', 'categories'));
  }
  try {
    const result = mergeManagedCategories(sourceId, targetId, req.adminAccount.username);
    auditAdminAction(req, 'taxonomy.merge', 'categories', sourceId, result);
    return res.redirect(303, taxonomyRedirect('merged', 'categories'));
  } catch (error) {
    auditAdminAction(req, 'taxonomy.merge_failed', 'categories', sourceId, {
      targetId,
      reason: error.message,
    });
    return res.redirect(303, taxonomyRedirect('merge-invalid', 'categories'));
  }
});

app.post('/admin/articles/reclassify', requireAdminOrigin, (req, res) => {
  const includeClassified = req.body.scope === 'all';
  const classified = classifyUnclassifiedArticles(500, { includeClassified });
  auditAdminAction(req, 'classification.batch', 'articles', includeClassified ? 'all' : 'unclassified', { classified });
  const status = classified > 0 ? 'completed' : 'empty';
  return res.redirect(303, `/admin?tab=taxonomy&classification=${status}&count=${classified}`);
});

app.post('/admin/quality/:id', requireAdminOrigin, (req, res) => {
  const id = parseArticleId(req.params.id);
  const decision = req.body.decision === 'reject' ? 'reject' : 'approve';
  const category = typeof req.body.category === 'string' ? req.body.category.trim() : '';
  const importanceLevel = Number.parseInt(req.body.importance_level, 10);
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (!id || !managedCategories().includes(category)
    || !Number.isInteger(importanceLevel) || importanceLevel < 1 || importanceLevel > 5) {
    return res.status(400).type('text').send('Проверьте категорию и важность статьи.');
  }
  const reviewed = reviewArticleQuality({
    id,
    decision,
    category,
    importanceLevel,
    reviewedBy: req.adminAccount.username,
    note,
  });
  if (!reviewed) return res.status(404).type('text').send('Статья для проверки не найдена.');
  auditAdminAction(req, `quality.${decision}`, 'article', id, {
    category,
    importanceLevel,
    note,
    published: reviewed.published,
  });
  const status = decision === 'reject'
    ? 'rejected'
    : reviewed.published ? 'approved' : 'approved-draft';
  return res.redirect(303, `/admin?tab=quality&quality=${status}`);
});

app.post('/admin/contact-messages/:id/read', requireAdminOrigin, (req, res) => {
  updateContactMessageStatus(Number(req.params.id), 'read');
  auditAdminAction(req, 'contact.read', 'contact_message', req.params.id);
  return res.redirect(303, '/admin?tab=messages');
});

app.post('/admin/articles/cleanup-untranslated', requireAdminOrigin, requireAdministrator, (req, res) => {
  if (req.body.confirm !== 'DELETE_UNTRANSLATED') return res.status(400).type('text').send('Требуется подтверждение удаления.');
  const deleted = deleteUntranslatedArticles();
  auditAdminAction(req, 'article.cleanup_untranslated', 'articles', 'bulk', { deleted });
  return res.redirect(303, `/admin?tab=articles&article=cleanup-${deleted}`);
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
  if (!scheduled) {
    const article = getArticleById(articleId);
    if (article) notifyTelegramSubscribersForArticles([article], { frequency: 'instant' }).catch((error) => console.error('[telegram-admin-create] ошибка доставки:', error.message));
  }
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
    const article = getArticleById(inserted);
    if (article) notifyTelegramSubscribersForArticles([article], { frequency: 'instant' }).catch((error) => console.error('[telegram-duplicate-publish] ошибка доставки:', error.message));
    return res.redirect(303, '/admin?duplicate=published');
  } catch {
    return res.redirect(303, '/admin?duplicate=error');
  }
});

app.post('/admin/articles/:id/classify', requireAdminOrigin, (req, res) => {
  const id = parseArticleId(req.params.id);
  const article = id ? getArticleById(id) : null;
  if (!article) return res.status(404).type('text').send('Статья не найдена.');
  const classification = classifyAndStoreArticle(id);
  auditAdminAction(req, 'article.classify', 'article', id, {
    category: classification.category,
    regionCode: classification.regionCode,
    confidence: classification.confidence,
  });
  return res.redirect(303, `/admin?tab=articles&q=${encodeURIComponent(article.titleRu || article.titleFi || '')}&classification=article-updated`);
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
  if (!article || !managedCategories().includes(article.category) || !publishArticle(id)) {
    return res.status(400).type('text').send('Заполните категорию и сохраните черновик перед публикацией.');
  }
  auditAdminAction(req, 'article.publish', 'article', id, { slug: article.slug, title: article.titleRu || article.titleFi });
  notifyTelegramSubscribersForArticles([getArticleById(id)], { frequency: 'instant' }).catch((error) => console.error('[telegram-admin-publish] ошибка доставки:', error.message));
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

app.post('/admin/articles/:id/discussions/generate', requireAdminOrigin, async (req, res) => {
  const id = parseArticleId(req.params.id); const article = id ? getArticleById(id) : null;
  if (!article) return res.status(404).type('text').send('Статья не найдена.');
  try {
    const items = await generateEditorialDiscussions({ titleRu: article.titleRu || article.titleFi, summaryRu: article.summaryRu || article.summaryFi, category: article.category });
    items.forEach((item) => createEditorialDiscussion({ articleId:id, note:item.note, question:item.question, createdBy:req.adminAccount.username }));
    auditAdminAction(req, 'editorial_discussion.generate', 'article', id, { count: items.length });
    return res.redirect(303, `/admin?tab=articles&article=discussion-generated`);
  } catch { return res.redirect(303, '/admin?tab=articles&article=discussion-error'); }
});

app.post('/admin/discussions/:id', requireAdminOrigin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10); const status = String(req.body.status || 'draft');
  const note = String(req.body.note || '').trim(); const question = String(req.body.question || '').trim();
  if (!Number.isInteger(id) || !note || !question || note.length > 3000 || question.length > 500) return res.status(400).type('text').send('Проверьте редакционный текст.');
  if (!updateEditorialDiscussion(id, { note, question, status })) return res.status(400).type('text').send('Недопустимый статус.');
  auditAdminAction(req, `editorial_discussion.${status}`, 'discussion', id);
  return res.redirect(303, '/admin?tab=articles');
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
  configureTelegramBotInterface().catch((error) => {
    console.error('[telegram] не удалось настроить русское меню:', error.message);
  });
  // Первое обновление сразу при старте, чтобы не ждать 15 минут до первых данных
  runScheduledPublishing().catch((error) => console.error('[startup scheduled publish] ошибка:', error.message));
  safeRefresh();
  cleanupAnalytics(ANALYTICS_RETENTION_DAYS);
  cleanupAdminAuthData();
});

// Периодическое обновление по cron (например, "*/15 * * * *")
cron.schedule(`*/${REFRESH_MIN} * * * *`, safeRefresh, {
  name: 'rss-refresh',
  noOverlap: true,
});
cron.schedule('* * * * *', () => runScheduledPublishing().catch((error) => console.error('[scheduled-publishing] ошибка:', error.message)), {
  name: 'scheduled-publishing',
  noOverlap: true,
});
cron.schedule('*/5 * * * *', () => runInstantTelegramCatchup().catch((error) => console.error('[telegram-catchup] ошибка:', error.message)), {
  name: 'telegram-instant-catchup',
  noOverlap: true,
});
cron.schedule('* * * * *', () => processTelegramRetryQueue().catch((error) => console.error('[telegram-retry-queue] ошибка:', error.message)), {
  name: 'telegram-retry-queue',
  noOverlap: true,
});
cron.schedule('* * * * *', () => runDailyTelegramDigest().catch((error) => console.error('[telegram-digest] ошибка:', error.message)), {
  name: 'telegram-digest',
  noOverlap: true,
  timezone: 'Europe/Helsinki',
});
cron.schedule('0 10 * * *', () => runDailyTelegramDigest({ retryOnly: true }).catch((error) => console.error('[telegram-digest-retry] ошибка:', error.message)), {
  name: 'telegram-digest-retry',
  noOverlap: true,
  timezone: 'Europe/Helsinki',
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
