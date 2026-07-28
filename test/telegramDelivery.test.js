const assert = require('node:assert/strict');
const test = require('node:test');
const {
  articleMatchesSubscription,
  buildTelegramDigestMessage,
  buildTelegramMessage,
  isQuietTime,
  normalizeContentTypes,
} = require('../src/telegramDelivery');

const article = {
  id: 17,
  publicationStatus: 'published',
  editorialStatus: 'normal',
  category: 'Общество',
  sourceId: 'yle',
  sourceName: 'YLE',
  slug: 'test-news',
  titleRu: 'Важная новость из Финляндии',
  summaryRu: 'Краткое описание новости, которое помогает понять её смысл до перехода на сайт.',
  originalUrl: 'https://yle.fi/example',
};

const subscription = {
  importance: 'all',
  scope: 'finland',
  categories: [],
  sourceIds: [],
  contentTypes: ['news'],
  includeOriginal: true,
};

test('filters news by selected source and content type', () => {
  assert.equal(articleMatchesSubscription(article, subscription), true);
  assert.equal(articleMatchesSubscription(article, { ...subscription, sourceIds: ['hs'] }), false);
  assert.equal(articleMatchesSubscription(article, { ...subscription, sourceIds: ['yle'] }), true);
  assert.equal(articleMatchesSubscription(article, { ...subscription, contentTypes: ['holidays'] }), false);
});

test('quiet hours work both across midnight and within one day', () => {
  const overnight = {
    quietHoursEnabled: true,
    quietStart: '22:00',
    quietEnd: '07:00',
    timezone: 'Europe/Helsinki',
  };
  assert.equal(isQuietTime(overnight, new Date('2026-01-10T21:30:00Z')), true);
  assert.equal(isQuietTime(overnight, new Date('2026-01-11T06:00:00Z')), false);
  assert.equal(isQuietTime({ ...overnight, quietStart: '12:00', quietEnd: '14:00' }, new Date('2026-01-10T11:00:00Z')), true);
  assert.equal(isQuietTime({ ...overnight, quietHoursEnabled: false }, new Date('2026-01-10T23:00:00Z')), false);
});

test('instant and digest messages contain title, excerpt and read-more link', () => {
  const instant = buildTelegramMessage(article, { siteUrl: 'https://finskienovosti.fi/' });
  assert.match(instant, /Важная новость из Финляндии/);
  assert.match(instant, /Краткое описание новости/);
  assert.match(instant, /Читать далее: https:\/\/finskienovosti\.fi\/news\/test-news/);
  assert.match(instant, /Первоисточник: https:\/\/yle\.fi\/example/);

  const digest = buildTelegramDigestMessage([article], subscription, { siteUrl: 'https://finskienovosti.fi' });
  assert.match(digest, /Ежедневная подборка/);
  assert.match(digest, /Краткое описание новости/);
  assert.match(digest, /Читать далее: https:\/\/finskienovosti\.fi\/news\/test-news/);
});

test('normalizes future content types safely', () => {
  assert.deepEqual(normalizeContentTypes(['news', 'holidays', 'invalid', 'news']), ['news', 'holidays']);
  assert.deepEqual(normalizeContentTypes([]), ['news']);
});
