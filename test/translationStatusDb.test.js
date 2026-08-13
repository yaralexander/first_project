const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(os.tmpdir(), `finskienovosti-translation-status-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = databasePath;
const db = require('../src/db');

test('reports whether the latest article used AI retelling or Google fallback', () => {
  const base = { sourceId: 'test', sourceName: 'Test', externalGuid: '', category: 'Общество', titleFi: 'Otsikko', summaryFi: 'Teksti', titleRu: 'Заголовок', summaryRu: 'Текст', promptVersion: 1, publishedAt: new Date().toISOString() };
  db.insertArticle({ ...base, originalUrl: 'https://example.com/ai', slug: 'ai', translationMethod: 'openai-retelling' });
  assert.equal(db.getTranslationServiceStatus().mode, 'ai');
  db.insertArticle({ ...base, originalUrl: 'https://example.com/google', slug: 'google', translationMethod: 'google-translate-free' });
  assert.equal(db.getTranslationServiceStatus().mode, 'google');
});
