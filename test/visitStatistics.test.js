const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const { initializeVisitStatistics, incrementDailyVisits, getVisitOverview, shouldCountVisit } = require('../src/visitStatistics');

test('monthly history includes empty months and survives retention and repeated startup', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE analytics_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE analytics_views (article_id INTEGER, visitor_hash TEXT, viewed_on TEXT);
    INSERT INTO analytics_views VALUES (0, 'a', '2026-09-01'), (0, 'b', '2026-09-01'),
      (0, 'c', '2026-09-02'), (1, 'c', '2026-09-02'), (0, 'd', '2026-11-01');`);
  initializeVisitStatistics(db);
  initializeVisitStatistics(db);
  assert.deepEqual(getVisitOverview(db, '2026-11-28').months, [
    { month: '2026-11', visits: 1 }, { month: '2026-10', visits: 0 }, { month: '2026-09', visits: 3 },
  ]);
  db.exec('DELETE FROM analytics_views');
  initializeVisitStatistics(db);
  incrementDailyVisits(db, '2026-11-28');
  const overview = getVisitOverview(db, '2026-11-28');
  assert.equal(overview.months[2].visits, 3);
  assert.equal(overview.last30Days, 2);
  assert.equal(overview.daily.length, 30);
  assert.equal(overview.daily[0].day, '2026-10-30');
  assert.equal(overview.daily.at(-1).day, '2026-11-28');
  db.close();
});

test('empty history and calendar year boundaries are explicit', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE analytics_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE analytics_views (article_id INTEGER, visitor_hash TEXT, viewed_on TEXT);`);
  initializeVisitStatistics(db);
  assert.deepEqual(getVisitOverview(db, '2027-01-01').months, [{ month: '2027-01', visits: 0 }]);
  incrementDailyVisits(db, '2026-12-31');
  incrementDailyVisits(db, '2027-01-01');
  assert.deepEqual(getVisitOverview(db, '2027-01-01').months, [
    { month: '2027-01', visits: 1 }, { month: '2026-12', visits: 1 },
  ]);
  db.close();
});

test('known robots, HEAD requests and speculative loads are excluded', () => {
  const req = (agent, method = 'GET', purpose = '') => ({ method, get: (name) => ({ 'user-agent': agent, 'sec-purpose': purpose })[name] });
  assert.equal(shouldCountVisit(req('Mozilla/5.0 Chrome/140.0 Safari/537.36')), true);
  for (const agent of ['', 'Googlebot', 'bingbot', 'TelegramBot', 'facebookexternalhit', 'curl/8', 'HeadlessChrome']) {
    assert.equal(shouldCountVisit(req(agent)), false, agent);
  }
  assert.equal(shouldCountVisit(req('Mozilla/5.0', 'HEAD')), false);
  assert.equal(shouldCountVisit(req('Mozilla/5.0', 'GET', 'prefetch;prerender')), false);
});

test('admin labels calendar months and shows all 30 chart days independently of article filters', () => {
  const { renderAdminPage } = require('../src/render');
  const html = renderAdminPage({
    comments: [], articles: [], query: '', categories: [], duplicateArticles: [], siteUrl: 'https://example.test',
    statistics: {
      report: {}, daily: [], topRead: [], topCommented: [],
      filters: { from: '2026-09-28', to: '2026-09-28', category: '', sourceId: '' },
      visits: {
        today: '2026-09-28', firstDay: '2026-08-17', filteredSince: '2026-09-28', last30Days: 435,
        months: [{ month: '2026-09', visits: 300 }, { month: '2026-08', visits: 135 }],
        daily: Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.UTC(2026, 7, 30 + i)).toISOString().slice(0, 10), visits: i })),
      },
    },
  });
  assert.match(html, /сентябрь 2026/);
  assert.match(html, /август 2026/);
  assert.match(html, /месяц ещё идёт/);
  assert.match(html, /Доступны данные с 17 августа/);
  assert.doesNotMatch(html, /Уникальных за 30 дней/);
  assert.equal((html.match(/class="visitor-bar-wrap"/g) || []).length, 30);
  assert.ok(html.indexOf('2026-08-30: 0 посещений') < html.indexOf('2026-09-28: 29 посещений'));
});
