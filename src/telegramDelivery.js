const ALLOWED_CONTENT_TYPES = new Set(['news', 'holidays', 'word']);

function trimExcerpt(value, maxLength = 420) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function articleMatchesSubscription(article, subscription) {
  if (!article || article.publicationStatus !== 'published') return false;
  const contentTypes = Array.isArray(subscription.contentTypes) ? subscription.contentTypes : ['news'];
  if (!contentTypes.includes('news')) return false;
  if (subscription.importance === 'important' && !['important', 'urgent'].includes(article.editorialStatus || 'normal')) return false;
  if (subscription.scope === 'finland' && (article.category || '') === 'Мир') return false;
  if (subscription.categories.length && !subscription.categories.includes(article.category || '')) return false;
  if (subscription.sourceIds.length && !subscription.sourceIds.includes(article.sourceId || '')) return false;
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

function isQuietTime(subscription, now = new Date()) {
  if (!subscription.quietHoursEnabled) return false;
  const start = minutesFromTime(subscription.quietStart);
  const end = minutesFromTime(subscription.quietEnd);
  if (start === null || end === null || start === end) return false;
  const current = localMinutes(now, subscription.timezone);
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

function buildTelegramMessage(article, {
  siteUrl,
  includeOriginal = true,
  excerptLength = 420,
} = {}) {
  const editorialLabel = article.editorialStatus === 'urgent'
    ? '🔴 Срочно'
    : article.editorialStatus === 'important'
      ? '🟠 Важно'
      : '';
  const title = article.titleRu || article.titleFi || '';
  const excerpt = trimExcerpt(article.summaryRu || article.summaryFi || '', excerptLength);
  const articleUrl = article.slug ? `${String(siteUrl || '').replace(/\/+$/, '')}/news/${encodeURIComponent(article.slug)}` : '';
  const originalUrl = includeOriginal && article.originalUrl && !String(article.originalUrl).startsWith('manual:')
    ? article.originalUrl
    : '';
  return [
    editorialLabel,
    title,
    excerpt,
    articleUrl ? `Читать далее: ${articleUrl}` : '',
    originalUrl ? `Первоисточник: ${originalUrl}` : '',
  ].filter(Boolean).join('\n\n');
}

function buildTelegramDigestMessage(articles, subscription, { siteUrl } = {}) {
  const header = '📰 Ежедневная подборка «Финских Новостей»';
  const lines = articles.map((article, index) => {
    const title = article.titleRu || article.titleFi || '';
    const excerpt = trimExcerpt(article.summaryRu || article.summaryFi || '', 220);
    const articleUrl = `${String(siteUrl || '').replace(/\/+$/, '')}/news/${encodeURIComponent(article.slug)}`;
    const source = article.sourceName ? ` · ${article.sourceName}` : '';
    const originalLink = subscription.includeOriginal !== false && article.originalUrl && !String(article.originalUrl).startsWith('manual:')
      ? `\nПервоисточник: ${article.originalUrl}`
      : '';
    return `${index + 1}. ${title}${source}${excerpt ? `\n${excerpt}` : ''}\nЧитать далее: ${articleUrl}${originalLink}`;
  });
  return [header, ...lines].join('\n\n');
}

function normalizeContentTypes(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  const normalized = [...new Set(list.filter((value) => ALLOWED_CONTENT_TYPES.has(value)))];
  return normalized.length ? normalized : ['news'];
}

module.exports = {
  articleMatchesSubscription,
  buildTelegramDigestMessage,
  buildTelegramMessage,
  isQuietTime,
  normalizeContentTypes,
  trimExcerpt,
};
