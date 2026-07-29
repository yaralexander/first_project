const assert = require('node:assert/strict');
const test = require('node:test');
const {
  articleMatchesSubscription,
  buildTelegramDigestMessage,
  buildTelegramMessage,
  canDeliverArticleNow,
  isDeliveryScheduleDue,
  isQuietTime,
  isTelegramChannelIntervalDue,
  normalizeContentTypes,
  renderTelegramChannelTemplate,
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

test('filters by importance, exclusions, regions, tags and audiences', () => {
  const classifiedArticle = {
    ...article,
    importanceLevel: 4,
    regionCode: 'uusimaa',
    classification: {
      tags: [{ id: 12, slug: 'education' }],
      audiences: [{ code: 'families' }],
    },
  };
  assert.equal(articleMatchesSubscription(classifiedArticle, {
    ...subscription,
    minimumImportance: 4,
    regionCodes: ['uusimaa'],
    tagIds: ['12'],
    audienceCodes: ['families'],
  }), true);
  assert.equal(articleMatchesSubscription(classifiedArticle, {
    ...subscription,
    minimumImportance: 5,
  }), false);
  assert.equal(articleMatchesSubscription(classifiedArticle, {
    ...subscription,
    excludedCategories: ['Общество'],
  }), false);
  assert.equal(articleMatchesSubscription(classifiedArticle, {
    ...subscription,
    tagIds: ['99'],
  }), false);
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

test('delivery schedule respects selected days, digest time and critical quiet-hour override', () => {
  const mondayMorning = new Date('2026-01-12T06:00:00Z');
  const timed = {
    frequency: 'daily',
    timezone: 'Europe/Helsinki',
    deliveryTimes: ['08:00'],
    deliveryWeekdays: ['1'],
    quietHoursEnabled: false,
  };
  assert.equal(isDeliveryScheduleDue(timed, mondayMorning), true);
  assert.equal(isDeliveryScheduleDue({ ...timed, deliveryTimes: ['09:00'] }, mondayMorning), false);
  assert.equal(canDeliverArticleNow(article, timed, mondayMorning), true);
  assert.equal(canDeliverArticleNow(article, { ...timed, deliveryWeekdays: ['2'] }, mondayMorning), false);

  const quiet = {
    ...timed,
    quietHoursEnabled: true,
    quietStart: '07:00',
    quietEnd: '09:00',
    quietWeekdays: ['1'],
  };
  assert.equal(canDeliverArticleNow(article, quiet, mondayMorning), false);
  assert.equal(canDeliverArticleNow(
    { ...article, importanceLevel: 5, editorialStatus: 'urgent' },
    { ...quiet, allowCriticalDuringQuiet: true },
    mondayMorning,
  ), true);
});

test('instant and digest messages contain title, excerpt and read-more link', () => {
  const instant = buildTelegramMessage(article, { siteUrl: 'https://finskienovosti.fi/' });
  assert.match(instant, /Важная новость из Финляндии/);
  assert.match(instant, /Краткое описание новости/);
  assert.match(instant, /Читать далее: https:\/\/finskienovosti\.fi\/news\/test-news/);
  assert.match(instant, /Первоисточник: https:\/\/yle\.fi\/example/);
  assert.match(buildTelegramMessage({
    ...article,
    classification: { tags: [{ slug: 'finland-life' }] },
  }, { siteUrl: 'https://finskienovosti.fi' }), /#finland_life/);

  const digest = buildTelegramDigestMessage([article], subscription, { siteUrl: 'https://finskienovosti.fi' });
  assert.match(digest, /Ежедневная подборка/);
  assert.match(digest, /Краткое описание новости/);
  assert.match(digest, /Читать далее: https:\/\/finskienovosti\.fi\/news\/test-news/);
});

test('normalizes future content types safely', () => {
  assert.deepEqual(normalizeContentTypes(['news', 'holidays', 'invalid', 'news']), ['news', 'holidays']);
  assert.deepEqual(normalizeContentTypes([]), ['news']);
});

test('general channel template is safe HTML and links to the permanent article page', () => {
  const text = renderTelegramChannelTemplate({
    ...article,
    titleRu: 'Новость <важная>',
    summaryRu: `${'Очень длинное описание & подробности. '.repeat(20)}конец`,
  }, {}, { siteUrl: 'https://finskienovosti.fi/' });

  assert.match(text, /<b>🔥 Новость &lt;важная&gt;<\/b>/);
  assert.match(text, /📁 YLE \|\| Общество/);
  assert.match(text, /href="https:\/\/finskienovosti\.fi\/news\/test-news"/);
  assert.doesNotMatch(text, /<важная>/);
  const excerpt = text.split('\n\n')[1];
  assert.ok(excerpt.replaceAll('&amp;', '&').length <= 280);
  assert.match(excerpt, /\.\.\.$/);
});

test('general channel interval becomes due only after the configured pause', () => {
  const lastSentAt = '2026-07-29T10:00:00.000Z';
  assert.equal(isTelegramChannelIntervalDue(lastSentAt, 0, new Date('2026-07-29T10:00:01.000Z')), true);
  assert.equal(isTelegramChannelIntervalDue(lastSentAt, 60, new Date('2026-07-29T10:59:59.000Z')), false);
  assert.equal(isTelegramChannelIntervalDue(lastSentAt, 60, new Date('2026-07-29T11:00:00.000Z')), true);
  assert.equal(isTelegramChannelIntervalDue('2026-07-29 10:00:00', 60, new Date('2026-07-29T10:59:59.000Z')), false);
});
