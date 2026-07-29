const assert = require('node:assert/strict');
const test = require('node:test');
const {
  googleTranslateFree,
  parseGoogleTranslation,
  translateArticleWithGoogleFree,
} = require('../src/freeTranslate');

test('parses all translated fragments from Google response', () => {
  assert.equal(
    parseGoogleTranslation([[['Привет ', 'Hei '], ['мир', 'maailma']]]),
    'Привет мир',
  );
});

test('free translator sends a fixed Finnish to Russian request', async () => {
  let requestedUrl;
  const fetchImpl = async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      json: async () => [[['Русский текст', 'Suomenkielinen teksti']]],
    };
  };

  const result = await googleTranslateFree('Suomenkielinen teksti', { fetchImpl });
  assert.equal(result, 'Русский текст');
  assert.equal(requestedUrl.hostname, 'translate.googleapis.com');
  assert.equal(requestedUrl.searchParams.get('sl'), 'fi');
  assert.equal(requestedUrl.searchParams.get('tl'), 'ru');
});

test('translates title and summary and marks emergency method', async () => {
  const translations = new Map([
    ['Otsikko', 'Заголовок'],
    ['Yhteenveto', 'Краткое описание'],
  ]);
  const fetchImpl = async (url) => ({
    ok: true,
    json: async () => [[[translations.get(new URL(url).searchParams.get('q'))]]],
  });
  const result = await translateArticleWithGoogleFree({
    titleFi: 'Otsikko',
    summaryFi: 'Yhteenveto',
  }, { fetchImpl });

  assert.deepEqual(result, {
    titleRu: 'Заголовок',
    summaryRu: 'Краткое описание',
    method: 'google-translate-free',
  });
});

test('rejects invalid or failed responses', async () => {
  await assert.rejects(
    () => googleTranslateFree('Teksti', {
      fetchImpl: async () => ({ ok: false, status: 429 }),
    }),
    /Google Translate error 429/,
  );
  assert.throws(() => parseGoogleTranslation({}), /неожиданный ответ/);
});
