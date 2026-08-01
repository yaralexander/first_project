const ALLOWED_CONTENT_TYPES = new Set(['news', 'holidays', 'flag_days', 'word']);
const DEFAULT_TELEGRAM_CHANNEL_TEMPLATE = '<b>🔥 {title}</b>\n\n{excerpt}\n\n📁 {source} || {category}\n\n👉 <a href="{article_url}">Читать далее</a>';
const TELEGRAM_CHANNEL_TEMPLATE_VARIABLES = Object.freeze([
  'label',
  'category',
  'source',
  'title',
  'excerpt',
  'article_url',
  'original_url',
]);

function trimExcerpt(value, maxLength = 420) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function escapeTelegramHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function validateTelegramChannelTemplate(value) {
  const template = String(value || '').replace(/\\n/g, '\n').trim();
  const errors = [];
  if (!template) errors.push('Шаблон не может быть пустым.');
  if (template.length > 3000) errors.push('Шаблон длиннее 3000 символов.');

  const allowedVariables = new Set(TELEGRAM_CHANNEL_TEMPLATE_VARIABLES);
  const variables = [...template.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
  const unknownVariables = [...new Set(variables.filter((name) => !allowedVariables.has(name)))];
  if (unknownVariables.length) {
    errors.push(`Неизвестные переменные: ${unknownVariables.map((name) => `{${name}}`).join(', ')}.`);
  }
  if (!variables.includes('title')) {
    errors.push('Шаблон должен содержать заголовок новости: {title}.');
  }
  if (!variables.includes('article_url')) {
    errors.push('Шаблон должен содержать ссылку на статью: {article_url}.');
  }

  const tags = template.match(/<[^>]*>/g) || [];
  for (const tag of tags) {
    const simpleTag = /^<\/?(?:b|strong|i|em|u|ins|s|strike|del|code)>$/i.test(tag);
    const closingLink = /^<\/a>$/i.test(tag);
    const safeLink = /^<a\s+href=(?:"|')\{(?:article_url|original_url)\}(?:"|')>$/i.test(tag);
    if (!simpleTag && !closingLink && !safeLink) {
      errors.push(`Недопустимый HTML-тег: ${tag}.`);
    }
  }

  const textWithoutTags = template.replace(/<[^>]*>/g, '');
  if (/[<>]/.test(textWithoutTags)) {
    errors.push('В шаблоне есть незакрытая или недопустимая HTML-разметка.');
  }

  return {
    valid: errors.length === 0,
    errors,
    variables: [...new Set(variables)],
  };
}

function renderTelegramChannelTemplate(article, settings = {}, { siteUrl } = {}) {
  const label = article.editorialStatus === 'urgent'
    ? '🔴 СРОЧНО'
    : article.editorialStatus === 'important' ? '🟠 ВАЖНО' : '📰 Финские Новости';
  const articleUrl = article.slug
    ? `${String(siteUrl || '').replace(/\/+$/, '')}/news/${encodeURIComponent(article.slug)}`
    : '';
  const originalUrl = settings.includeOriginal && article.originalUrl
    && !String(article.originalUrl).startsWith('manual:')
    ? article.originalUrl
    : '';
  const rawExcerpt = String(article.summaryRu || article.summaryFi || '').replace(/\s+/g, ' ').trim();
  const channelExcerpt = rawExcerpt.length > 280
    ? `${rawExcerpt.slice(0, 277).trimEnd()}...`
    : rawExcerpt;
  const values = {
    label,
    category: article.category || 'Новости',
    source: article.sourceName || 'Финские Новости',
    title: article.titleRu || article.titleFi || '',
    excerpt: channelExcerpt,
    article_url: articleUrl,
    original_url: originalUrl,
  };
  const requestedTemplate = String(settings.template || DEFAULT_TELEGRAM_CHANNEL_TEMPLATE);
  const template = validateTelegramChannelTemplate(requestedTemplate).valid
    ? requestedTemplate
    : DEFAULT_TELEGRAM_CHANNEL_TEMPLATE;
  let text = template.replace(/\\n/g, '\n');
  for (const [key, value] of Object.entries(values)) {
    text = text.replaceAll(`{${key}}`, escapeTelegramHtml(value));
  }
  if (articleUrl && !text.includes(escapeTelegramHtml(articleUrl))) {
    text += `\n\n👉 <a href="${escapeTelegramHtml(articleUrl)}">Читать далее</a>`;
  }
  if (originalUrl && !text.includes(escapeTelegramHtml(originalUrl))) {
    text += `\n<a href="${escapeTelegramHtml(originalUrl)}">Оригинал</a>`;
  }
  return text.trim().slice(0, 4096);
}

function isTelegramChannelIntervalDue(lastSentAt, intervalMinutes, now = new Date()) {
  const minutes = Math.max(0, Number.parseInt(intervalMinutes, 10) || 0);
  if (!minutes || !lastSentAt) return true;
  const timestamp = String(lastSentAt).trim();
  const normalizedTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)
    ? `${timestamp.replace(' ', 'T')}Z`
    : timestamp;
  const lastSent = new Date(normalizedTimestamp);
  if (Number.isNaN(lastSent.getTime())) return true;
  return now.getTime() - lastSent.getTime() >= minutes * 60 * 1000;
}

function articleMatchesSubscription(article, subscription) {
  if (!article || article.publicationStatus !== 'published') return false;
  const contentTypes = Array.isArray(subscription.contentTypes) ? subscription.contentTypes : ['news'];
  if (!contentTypes.includes('news')) return false;
  const importanceLevel = Number(article.importanceLevel) || 1;
  const editorialStatus = article.editorialStatus || 'normal';
  if (subscription.importance === 'urgent'
    && editorialStatus !== 'urgent'
    && importanceLevel < 5) return false;
  if (subscription.importance === 'important'
    && !['important', 'urgent'].includes(editorialStatus)
    && importanceLevel < 4) return false;
  if (importanceLevel < (Number(subscription.minimumImportance) || 1)) return false;
  if (subscription.scope === 'finland' && (article.category || '') === 'Мир') return false;
  if (subscription.categories.length && !subscription.categories.includes(article.category || '')) return false;
  if ((subscription.excludedCategories || []).includes(article.category || '')) return false;
  if (subscription.sourceIds.length && !subscription.sourceIds.includes(article.sourceId || '')) return false;
  if ((subscription.regionCodes || []).length && !subscription.regionCodes.includes(article.regionCode || 'finland')) return false;
  const articleTagIds = new Set((article.classification?.tags || []).map((tag) => String(tag.id)));
  if ((subscription.tagIds || []).length && !subscription.tagIds.some((id) => articleTagIds.has(String(id)))) return false;
  const articleAudienceCodes = new Set((article.classification?.audiences || []).map((audience) => audience.code));
  if ((subscription.audienceCodes || []).length
    && !subscription.audienceCodes.some((code) => articleAudienceCodes.has(code))) return false;
  return true;
}

function minutesFromTime(value) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function localMinutes(now, timezone = 'Europe/Helsinki') {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    return hour * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

function localWeekday(now, timezone = 'Europe/Helsinki') {
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(now);
    return String(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday));
  } catch {
    return String(now.getUTCDay());
  }
}

function isQuietTime(subscription, now = new Date()) {
  if (!subscription.quietHoursEnabled) return false;
  const quietWeekdays = Array.isArray(subscription.quietWeekdays)
    ? subscription.quietWeekdays.map(String)
    : ['1', '2', '3', '4', '5', '6', '0'];
  if (!quietWeekdays.includes(localWeekday(now, subscription.timezone))) return false;
  const start = minutesFromTime(subscription.quietStart);
  const end = minutesFromTime(subscription.quietEnd);
  if (start === null || end === null || start === end) return false;
  const current = localMinutes(now, subscription.timezone);
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

function canDeliverArticleNow(article, subscription, now = new Date()) {
  const deliveryWeekdays = Array.isArray(subscription.deliveryWeekdays)
    ? subscription.deliveryWeekdays.map(String)
    : ['1', '2', '3', '4', '5', '6', '0'];
  if (!deliveryWeekdays.includes(localWeekday(now, subscription.timezone))) return false;
  if (!isQuietTime(subscription, now)) return true;
  return Boolean(subscription.allowCriticalDuringQuiet)
    && ((Number(article?.importanceLevel) || 1) >= 5 || article?.editorialStatus === 'urgent');
}

function isArticleSuppressedByQuietHours(article, subscription) {
  if (!subscription?.quietHoursEnabled || !article?.publishedAt) return false;

  const publishedAt = new Date(article.publishedAt);
  if (Number.isNaN(publishedAt.getTime()) || !isQuietTime(subscription, publishedAt)) {
    return false;
  }

  const isCritical = (Number(article.importanceLevel) || 1) >= 5
    || article.editorialStatus === 'urgent';
  return !(subscription.allowCriticalDuringQuiet && isCritical);
}

function isDeliveryScheduleDue(subscription, now = new Date()) {
  if (subscription.frequency !== 'daily') return true;
  const deliveryTimes = Array.isArray(subscription.deliveryTimes) && subscription.deliveryTimes.length
    ? subscription.deliveryTimes
    : ['08:00'];
  const current = localMinutes(now, subscription.timezone);
  return deliveryTimes.some((value) => minutesFromTime(value) === current);
}

function isDailyContentDue(subscription, now = new Date()) {
  const deliveryTimes = Array.isArray(subscription.deliveryTimes) && subscription.deliveryTimes.length
    ? subscription.deliveryTimes
    : ['08:00'];
  const targets = deliveryTimes
    .map(minutesFromTime)
    .filter((value) => value !== null);
  const firstTarget = targets.length ? Math.min(...targets) : 8 * 60;
  return localMinutes(now, subscription.timezone) >= firstTarget;
}

function buildTelegramMessage(article, {
  siteUrl,
  includeOriginal = true,
} = {}) {
  return renderTelegramChannelTemplate(article, {
    includeOriginal,
    template: DEFAULT_TELEGRAM_CHANNEL_TEMPLATE,
  }, { siteUrl });
}

function buildTelegramDigestMessage(articles, subscription, { siteUrl } = {}) {
  return articles.map((article) => buildTelegramMessage(article, {
    siteUrl,
    includeOriginal: subscription.includeOriginal !== false,
  })).join('\n\n──────────\n\n').slice(0, 4096);
}

function normalizeContentTypes(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  const normalized = [...new Set(list.filter((value) => ALLOWED_CONTENT_TYPES.has(value)))];
  return normalized.length ? normalized : ['news'];
}

module.exports = {
  DEFAULT_TELEGRAM_CHANNEL_TEMPLATE,
  TELEGRAM_CHANNEL_TEMPLATE_VARIABLES,
  articleMatchesSubscription,
  buildTelegramDigestMessage,
  buildTelegramMessage,
  canDeliverArticleNow,
  escapeTelegramHtml,
  isDailyContentDue,
  isDeliveryScheduleDue,
  isArticleSuppressedByQuietHours,
  isQuietTime,
  isTelegramChannelIntervalDue,
  localWeekday,
  normalizeContentTypes,
  renderTelegramChannelTemplate,
  trimExcerpt,
  validateTelegramChannelTemplate,
};
