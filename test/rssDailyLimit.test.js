const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(os.tmpdir(), `finskienovosti-rss-limit-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = databasePath;
const db = require('../src/db');
const { fetchAllNews } = require('../src/fetchNews');
const { balancedEntries, dailyRssLimit, helsinkiDay } = require('../src/rssDailyLimit');

test.after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${databasePath}${suffix}`); } catch {}
  }
});

test('Helsinki day changes at local midnight, including winter and summer time', () => {
  assert.equal(helsinkiDay(new Date('2026-01-01T21:59:00Z')), '2026-01-01');
  assert.equal(helsinkiDay(new Date('2026-01-01T22:00:00Z')), '2026-01-02');
  assert.equal(helsinkiDay(new Date('2026-07-01T20:59:00Z')), '2026-07-01');
  assert.equal(helsinkiDay(new Date('2026-07-01T21:00:00Z')), '2026-07-02');
  assert.equal(dailyRssLimit('50'), 50);
  assert.equal(dailyRssLimit('0'), 0);
  assert.equal(dailyRssLimit('501'), 50);
});

test('candidates rotate between sources rather than exhausting the first feed', () => {
  const entries = [...balancedEntries([
    { source: { id: 'yle' }, entries: ['a', 'b', 'c'] },
    { source: { id: 'hs' }, entries: ['d'] },
  ])].map(({ source, entry }) => `${source.id}:${entry}`);
  assert.deepEqual(entries, ['yle:a', 'hs:d', 'yle:b', 'yle:c']);
});

test('admin limit caps new RSS articles across refreshes before translation work', async () => {
  db.setSystemSettings({ rss_daily_limit: '3' });
  const sources = [{ id: 'yle', name: 'YLE' }, { id: 'hs', name: 'Helsingin Sanomat' }];
  const translated = [];
  let fetched = 0;
  const options = {
    sources,
    loadFeed: async (source) => {
      fetched += 1;
      return { items: Array.from({ length: 8 }, (_, i) => ({
        title: `${source.id} ${i}`, link: `https://example.test/${source.id}/${i}`,
        isoDate: new Date(Date.now() - i * 60000).toISOString(),
      })) };
    },
    importEntry: async (source, entry) => {
      if (db.articleExists(entry.link)) return null;
      translated.push(`${source.id}:${entry.title}`);
      const id = db.insertArticle({
        sourceId: source.id, sourceName: source.name, originalUrl: entry.link,
        externalGuid: entry.link, slug: `${source.id}-${entry.title.split(' ')[1]}`,
        category: 'Общество', titleFi: entry.title, summaryFi: 'Uutinen',
        titleRu: entry.title, summaryRu: 'Новость', translationMethod: 'test',
        promptVersion: 1, publishedAt: entry.isoDate,
      });
      return id ? { id } : null;
    },
  };
  assert.equal((await fetchAllNews(options)).length, 3);
  assert.deepEqual(translated.map((item) => item.split(':')[0]), ['yle', 'hs', 'yle']);
  assert.equal(db.countRssArticlesImportedOn(), 3);
  assert.equal((await fetchAllNews(options)).length, 0);
  assert.equal(fetched, 2);
  assert.equal(translated.length, 3);
  db.setSystemSettings({ rss_daily_limit: '5' });
  assert.equal((await fetchAllNews(options)).length, 2);
  assert.equal(db.countRssArticlesImportedOn(), 5);
});
