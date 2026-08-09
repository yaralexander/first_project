const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const databasePath = path.join(os.tmpdir(), `finskienovosti-fetch-dedupe-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = databasePath;
const {
  findPendingSimilarArticle,
  rememberPendingArticle,
  resetPendingArticles,
} = require('../src/fetchNews');

test.after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${databasePath}${suffix}`); } catch {}
  }
});

test('blocks a cross-source duplicate while the first article is still being translated', () => {
  resetPendingArticles();
  rememberPendingArticle({
    sourceId: 'hs', sourceName: 'Helsingin Sanomat',
    titleFi: 'Ministeri Mika Poutala loukkaantui vakavasti maataloustöissä',
    summaryFi: 'Tapaturma sattui maatilalla.', publishedAt: '2026-08-09T10:00:00Z',
  });
  const duplicate = findPendingSimilarArticle({
    sourceId: 'yle',
    titleFi: 'Ministeri Poutala sai vakavan vamman onnettomuudessa',
    summaryFi: 'Hänen jalkansa jäi työkoneen ja maan väliin.',
    publishedAt: '2026-08-09T10:05:00Z',
  });
  assert.equal(duplicate.sourceId, 'hs');
  resetPendingArticles();
});
