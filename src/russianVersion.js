// src/russianVersion.js
// Единая функция getRussianVersion(article) — под капотом дергает выбранного
// провайдера. По умолчанию — ИИ-пересказ через Claude (см. src/aiRetell.js):
// не дословный перевод, а самостоятельная переформулировка сути на русском.
//
// Провайдер переключается переменной RUSSIAN_PROVIDER в .env:
//   claude         — пересказ через Claude API (рекомендуется, см. README)
//   deepl          — дословный перевод через DeepL API
//   libretranslate — дословный перевод через self-hosted LibreTranslate
//   mock           — без реального перевода, для проверки пайплайна

const { retellArticle, PROMPT_VERSION } = require('./aiRetell');

const PROVIDER = (process.env.RUSSIAN_PROVIDER || 'claude').toLowerCase();

const DEEPL_KEY = process.env.DEEPL_API_KEY || '';
const LIBRE_URL = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000/translate';
const LIBRE_KEY = process.env.LIBRETRANSLATE_API_KEY || '';

function deeplHost() {
  return DEEPL_KEY.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

async function deeplTranslate(text) {
  if (!text || !text.trim()) return text;
  const res = await fetch(deeplHost(), {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${DEEPL_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ text, source_lang: 'FI', target_lang: 'RU' }),
  });
  if (!res.ok) throw new Error(`DeepL API error ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  return data.translations?.[0]?.text || text;
}

async function libreTranslate(text) {
  if (!text || !text.trim()) return text;
  const res = await fetch(LIBRE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'fi', target: 'ru', format: 'text', api_key: LIBRE_KEY || undefined }),
  });
  if (!res.ok) throw new Error(`LibreTranslate error ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  return data.translatedText || text;
}

// getRussianVersion({ titleFi, summaryFi, sourceName }) -> { titleRu, summaryRu, method }
async function getRussianVersion(article) {
  const { titleFi, summaryFi } = article;
  try {
    if (PROVIDER === 'claude') {
      const { titleRu, summaryRu } = await retellArticle(article);
      return { titleRu, summaryRu, method: 'ai-retelling', promptVersion: PROMPT_VERSION };
    }
    if (PROVIDER === 'deepl') {
      const [titleRu, summaryRu] = await Promise.all([deeplTranslate(titleFi), deeplTranslate(summaryFi)]);
      return { titleRu, summaryRu, method: 'deepl-literal' };
    }
    if (PROVIDER === 'libretranslate') {
      const [titleRu, summaryRu] = await Promise.all([libreTranslate(titleFi), libreTranslate(summaryFi)]);
      return { titleRu, summaryRu, method: 'libretranslate-literal' };
    }
    // mock
    return { titleRu: `[RU] ${titleFi}`, summaryRu: `[RU] ${summaryFi}`, method: 'mock' };
  } catch (err) {
    console.error('[getRussianVersion] ошибка, возвращаю оригинал на финском:', err.message);
    return { titleRu: titleFi, summaryRu: summaryFi, method: 'fallback-original' };
  }
}

module.exports = { getRussianVersion };
