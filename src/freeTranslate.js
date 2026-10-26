const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

function parseGoogleTranslation(payload) {
  if (!Array.isArray(payload?.[0])) {
    throw new Error('Google Translate вернул неожиданный ответ');
  }
  const translation = payload[0]
    .map((part) => (Array.isArray(part) ? part[0] : ''))
    .filter(Boolean)
    .join('')
    .trim();
  if (!translation) throw new Error('Google Translate вернул пустой перевод');
  return translation;
}

async function googleTranslateFree(text, {
  fetchImpl = globalThis.fetch,
  endpoint = GOOGLE_TRANSLATE_ENDPOINT,
} = {}) {
  const value = String(text || '').trim();
  if (!value) return value;
  if (typeof fetchImpl !== 'function') throw new Error('HTTP-клиент недоступен');

  const translated = [];
  let remaining = value;
  while (remaining) {
    const window = remaining.slice(0, 4000);
    const lastSpace = window.lastIndexOf(' ');
    const length = remaining.length <= 4000 ? remaining.length : lastSpace >= 2000 ? lastSpace : 4000;
    const chunk = remaining.slice(0, length).trim();
    remaining = remaining.slice(length).trimStart();

    const url = new URL(endpoint);
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'fi');
    url.searchParams.set('tl', 'ru');
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', chunk);

    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Google Translate error ${response.status}`);
    translated.push(parseGoogleTranslation(await response.json()));
  }
  return translated.join(' ');
}

async function translateArticleWithGoogleFree(article, options = {}) {
  const [titleRu, summaryRu] = await Promise.all([
    googleTranslateFree(article.titleFi, options),
    googleTranslateFree(article.summaryFi, options),
  ]);
  return {
    titleRu,
    summaryRu,
    method: 'google-translate-free',
  };
}

module.exports = {
  GOOGLE_TRANSLATE_ENDPOINT,
  googleTranslateFree,
  parseGoogleTranslation,
  translateArticleWithGoogleFree,
};
