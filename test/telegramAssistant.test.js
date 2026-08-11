const test = require('node:test');
const assert = require('node:assert/strict');
const {
  articleMatchesFollowedTopics,
  detectAssistantIntent,
  extractFinnishWords,
  fallbackAnswer,
  parseReminderDate,
  selectRelevantArticles,
} = require('../src/telegramAssistant');

const articles = [
  {
    id: 1, slug: 'hsl-price', titleRu: 'HSL изменит стоимость билетов',
    summaryRu: 'Новые цены начнут действовать осенью.', summaryFi: 'HSL muuttaa lippujen hintoja syksyllä.',
    category: 'Общество', regionCode: 'uusimaa', importanceLevel: 4,
    publishedAt: '2026-08-11T08:00:00.000Z', publicationStatus: 'published',
  },
  {
    id: 2, slug: 'sports', titleRu: 'Результаты футбольного матча',
    summaryRu: 'Команда выиграла матч.', category: 'Спорт', importanceLevel: 1,
    publishedAt: '2026-08-11T09:00:00.000Z', publicationStatus: 'published',
  },
];

test('detects impact, price, verification and language questions', () => {
  assert.equal(detectAssistantIntent('Как это повлияет на меня?'), 'impact');
  assert.equal(detectAssistantIntent('Подорожают ли билеты?'), 'prices');
  assert.equal(detectAssistantIntent('Это правда, проверь источник'), 'verify');
  assert.equal(detectAssistantIntent('Покажи финские слова из статьи'), 'language');
});

test('personal relevance prefers important local transport news', () => {
  const selected = selectRelevantArticles(articles, 'Какие новости важны для меня?', {
    now: new Date('2026-08-11T12:00:00.000Z'),
    profile: { city: 'Эспоо', transport: 'HSL', interests: ['цены'] },
  });
  assert.equal(selected[0].id, 1);
});

test('fallback response keeps links to grounded articles', () => {
  const answer = fallbackAnswer('Что будет с ценами?', [articles[0]], { siteUrl: 'https://finskienovosti.fi' });
  assert.match(answer, /Прямой прогноз цен/);
  assert.match(answer, /https:\/\/finskienovosti\.fi\/news\/hsl-price/);
});

test('extracts unique Finnish vocabulary from an article', () => {
  assert.deepEqual(extractFinnishWords(articles[0], 3), ['muuttaa', 'lippujen', 'hintoja']);
});

test('recognizes a continuation of a followed topic', () => {
  assert.equal(articleMatchesFollowedTopics(articles[0], ['HSL изменит стоимость билетов']), true);
  assert.equal(articleMatchesFollowedTopics(articles[1], ['HSL изменит стоимость билетов']), false);
});

test('parses safe relative reminder times', () => {
  const now = new Date('2026-08-11T10:00:00.000Z');
  assert.equal(parseReminderDate('через 30 минут', now).toISOString(), '2026-08-11T10:30:00.000Z');
  assert.equal(parseReminderDate('через 2 часа', now).toISOString(), '2026-08-11T12:00:00.000Z');
  assert.equal(parseReminderDate('завтра', now).toISOString(), '2026-08-12T10:00:00.000Z');
  assert.equal(parseReminderDate('когда-нибудь', now), null);
});
