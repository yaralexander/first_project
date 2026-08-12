const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const STOP_WORDS = new Set(['какие', 'какой', 'сегодня', 'новости', 'новость', 'были', 'было', 'меня', 'может', 'это', 'этот', 'этой', 'как', 'что', 'для', 'про', 'или', 'чем', 'самые', 'важные', 'расскажи', 'покажи']);

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}\s-]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function queryTerms(query) {
  return normalizeText(query).split(' ').filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function articleMatchesFollowedTopics(article, topics = []) {
  const haystack = normalizeText([article.titleRu, article.summaryRu, article.titleFi, article.summaryFi].join(' '));
  return topics.some((topic) => {
    const terms = queryTerms(topic);
    if (!terms.length) return false;
    const matches = terms.filter((term) => haystack.includes(term)).length;
    return matches >= Math.min(2, terms.length);
  });
}

function detectAssistantIntent(text) {
  const value = normalizeText(text);
  if (/коммент|оставить отзыв/.test(value)) return 'comment';
  if (/сохран|заклад/.test(value)) return 'save';
  if (/следить|подпис.*тем|продолжени/.test(value)) return 'follow';
  if (/финск|слова из|уровн[яе] a[12]|язык/.test(value)) return 'language';
  if (/правд|провер|первоисточник|подтвержд/.test(value)) return 'verify';
  if (/цен|подорож|аренд|электр|кредит|кошел|деньг/.test(value)) return 'prices';
  if (/повлия|косн[её]т|отраз|для меня/.test(value)) return 'impact';
  if (/прост.*слов|объясн|что значит/.test(value)) return 'explain';
  if (/недел/.test(value)) return 'week';
  if (/сегодня|главн|важн|итог/.test(value)) return 'today';
  return 'search';
}

function parseReminderDate(text, now = new Date()) {
  const value = String(text || '').toLocaleLowerCase('ru-RU').trim();
  const minutes = /через\s+(\d+)\s*(?:мин|минут)/u.exec(value);
  const hours = /через\s+(\d+)\s*(?:час|часа|часов)/u.exec(value);
  let delay = 0;
  if (minutes) delay = Number(minutes[1]) * 60000;
  else if (hours) delay = Number(hours[1]) * 3600000;
  else if (/завтра/u.test(value)) delay = 24 * 3600000;
  else if (/через\s+недел|на\s+недел/u.test(value)) delay = 7 * 86400000;
  if (!delay) return null;
  const result = new Date(now.getTime() + delay);
  return result.getTime() > now.getTime() ? result : null;
}

function articleDate(article) {
  const date = new Date(article.publishedAt || article.createdAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function selectRelevantArticles(articles, query, { intent = detectAssistantIntent(query), now = new Date(), profile = {}, limit = 5 } = {}) {
  const terms = queryTerms(query);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(now);
  const cutoff = intent === 'week' ? now.getTime() - 7 * 86400000 : now.getTime() - 36 * 3600000;
  const modeTerms = {
    family: ['семья', 'дети', 'школа', 'детский сад', 'пособие', 'kela'],
    entrepreneur: ['предприниматель', 'бизнес', 'компания', 'налог', 'грант'],
    newcomer: ['миграция', 'migri', 'dvv', 'kela', 'интеграция', 'финский язык'],
  };
  const profileTerms = [profile.city, profile.lifeStatus, profile.transport, ...(profile.interests || []),
    ...(profile.modes || []).flatMap((mode) => modeTerms[mode] || [])].map(normalizeText).filter(Boolean);
  return articles.map((article) => {
    const haystack = normalizeText([article.titleRu, article.summaryRu, article.category, article.sourceName, article.regionCode].join(' '));
    const published = articleDate(article);
    const day = published ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(published)) : '';
    let score = Number(article.importanceLevel || 1) * 2;
    score += terms.reduce((sum, term) => sum + (haystack.includes(term) ? 4 : 0), 0);
    score += profileTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 2 : 0), 0);
    if (intent === 'today' && day === today) score += 8;
    if (published >= cutoff) score += 3;
    if (article.editorialStatus === 'urgent') score += 6;
    return { article, score, published };
  }).filter((entry) => entry.published >= cutoff || terms.some((term) => normalizeText(entry.article.titleRu).includes(term)))
    .sort((a, b) => b.score - a.score || b.published - a.published)
    .slice(0, limit)
    .map((entry) => entry.article);
}

function articleLink(article, siteUrl) {
  return `${String(siteUrl || '').replace(/\/+$/, '')}/news/${encodeURIComponent(article.slug)}`;
}

function fallbackAnswer(question, articles, { siteUrl, intent = detectAssistantIntent(question), profile = {} } = {}) {
  if (!articles.length) return 'Я не нашёл подходящих опубликованных материалов. Попробуйте уточнить тему или период.';
  const intro = intent === 'impact'
    ? `Вот что может быть важно именно для вас${profile.city ? ` в городе ${profile.city}` : ''}. Возможное влияние отделено от подтверждённых фактов:`
    : intent === 'prices'
      ? 'Прямой прогноз цен возможен не всегда. Ниже — подтверждённые события; влияние на цены пока следует считать возможным, если источник не приводит расчётов:'
      : intent === 'verify'
        ? 'Я нашёл связанные публикации в базе «Финских Новостей». Наличие статьи подтверждает публикацию источника, но само по себе не является независимой проверкой каждого утверждения:'
        : 'Подходящие опубликованные материалы:';
  const rows = articles.map((article, index) => {
    const excerpt = String(article.summaryRu || article.summaryFi || '').replace(/\s+/g, ' ').trim().slice(0, 320);
    return `${index + 1}. <b>${escapeHtml(article.titleRu || article.titleFi)}</b>\n${escapeHtml(excerpt)}${excerpt.length >= 320 ? '…' : ''}\n<a href="${articleLink(article, siteUrl)}">Открыть статью</a>`;
  });
  return `${intro}\n\n${rows.join('\n\n')}\n\nЕсли хотите, спросите о влиянии одной конкретной статьи.`.slice(0, 4096);
}

async function generateGroundedAnswer(question, articles, { siteUrl, profile = {}, fetchImpl = globalThis.fetch } = {}) {
  const intent = detectAssistantIntent(question);
  if (!process.env.OPENAI_API_KEY || typeof fetchImpl !== 'function') return fallbackAnswer(question, articles, { siteUrl, intent, profile });
  const sources = articles.map((article, index) => ({
    number: index + 1,
    title: article.titleRu || article.titleFi,
    summary: article.summaryRu || article.summaryFi,
    category: article.category,
    publishedAt: article.publishedAt,
    url: articleLink(article, siteUrl),
  }));
  let response;
  try {
    response = await fetchImpl(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_ASSISTANT_MODEL || process.env.OPENAI_MODEL || 'gpt-5-nano',
        messages: [
          { role: 'system', content: 'Ты персональный новостной помощник о Финляндии. Отвечай только по переданным материалам. Чётко разделяй: подтверждённые факты, возможное влияние и то, что пока неизвестно. Не давай юридических, медицинских или финансовых гарантий. Не используй HTML. В конце перечисли номера использованных источников.' },
          { role: 'user', content: `Профиль пользователя: ${JSON.stringify(profile)}\nВопрос: ${question}\nМатериалы: ${JSON.stringify(sources)}` },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return fallbackAnswer(question, articles, { siteUrl, intent, profile });
  }
  if (!response.ok) return fallbackAnswer(question, articles, { siteUrl, intent, profile });
  const payload = await response.json();
  const answer = String(payload?.choices?.[0]?.message?.content || '').trim();
  if (!answer) return fallbackAnswer(question, articles, { siteUrl, intent, profile });
  const links = sources.map((source) => `${source.number}. <a href="${source.url}">${escapeHtml(source.title)}</a>`).join('\n');
  return `${escapeHtml(answer)}\n\n<b>Источники:</b>\n${links}`.slice(0, 4096);
}

function extractFinnishWords(article, limit = 5) {
  const words = String(article?.summaryFi || article?.titleFi || '').match(/[A-Za-zÅÄÖåäö]{5,}/g) || [];
  return [...new Set(words.map((word) => word.toLocaleLowerCase('fi-FI')))].slice(0, limit);
}

module.exports = { articleMatchesFollowedTopics, detectAssistantIntent, extractFinnishWords, fallbackAnswer, generateGroundedAnswer, parseReminderDate, queryTerms, selectRelevantArticles };
