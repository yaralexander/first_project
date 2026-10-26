const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

process.env.DATABASE_PATH = path.join(os.tmpdir(), `finskienovosti-translation-provider-${process.pid}-${Date.now()}.db`);
process.env.OPENAI_API_KEY = 'test-key';

const db = require('../src/db');
const { getArticleTranslationProvider, getRussianVersion } = require('../src/russianVersion');

test('saved Google mode never calls GPT even when an API key is configured, and can switch back', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const article = { titleFi: 'Otsikko', summaryFi: 'Yhteenveto', sourceName: 'Testi' };
  try {
    db.setSystemSettings({ article_translation_provider: 'google' });
    assert.equal(getArticleTranslationProvider(), 'google');
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      const text = new URL(url).searchParams.get('q');
      return { ok: true, json: async () => [[[(text === 'Otsikko' ? 'Заголовок' : 'Текст'), text]]] };
    };
    assert.deepEqual(await getRussianVersion(article), {
      titleRu: 'Заголовок', summaryRu: 'Текст', method: 'google-translate-free',
    });
    assert.equal(calls.length, 2);
    assert.ok(calls.every((url) => new URL(url).hostname === 'translate.googleapis.com'));

    db.setSystemSettings({ article_translation_provider: 'openai' });
    assert.equal(getArticleTranslationProvider(), 'openai');
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => ({ output_text: JSON.stringify({ titleRu: 'Новый заголовок', summaryRu: 'Новый текст' }) }),
      };
    };
    assert.deepEqual(await getRussianVersion(article), {
      titleRu: 'Новый заголовок', summaryRu: 'Новый текст', method: 'openai-retelling', promptVersion: 6,
    });
    assert.equal(new URL(calls.at(-1)).hostname, 'api.openai.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google failure does not silently spend GPT API balance', async () => {
  const originalFetch = globalThis.fetch;
  try {
    db.setSystemSettings({ article_translation_provider: 'google' });
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return { ok: false, status: 429 };
    };
    const result = await getRussianVersion({ titleFi: 'Otsikko', summaryFi: 'Yhteenveto', sourceName: 'Testi' });
    assert.equal(result.method, 'fallback-original');
    assert.ok(calls.every((url) => new URL(url).hostname === 'translate.googleapis.com'));
    assert.ok(db.getAdminNotifications().some((item) => item.notificationKey === 'google-translate-unavailable'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
