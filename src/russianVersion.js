// src/russianVersion.js
// Единая функция getRussianVersion(article) — под капотом дергает выбранного
// провайдера. По умолчанию — ИИ-пересказ через OpenAI (см. src/openAiRetell.js):
// не дословный перевод, а самостоятельная переформулировка сути на русском.
//
// Провайдер переключается переменной RUSSIAN_PROVIDER в .env:
//   openai         — пересказ через OpenAI API
//   claude         — пересказ через Claude API
//   deepl          — дословный перевод через DeepL API
//   libretranslate — дословный перевод через self-hosted LibreTranslate
//   mock           — без реального перевода, для проверки пайплайна

const { retellArticle, PROMPT_VERSION } = require('./aiRetell');
const {
  openAiRetellArticle,
  PROMPT_VERSION: OPENAI_PROMPT_VERSION,
} = require('./openAiRetell');
const { translateArticleWithGoogleFree } = require('./freeTranslate');
const { createAdminNotification, getSystemSetting, setSystemSettings } = require('./db');
const { normalizeRussianArticle } = require('./glossary');

const PROVIDER = (process.env.RUSSIAN_PROVIDER || 'openai').toLowerCase();
const FALLBACK_PROVIDER = (process.env.RUSSIAN_FALLBACK_PROVIDER || '').toLowerCase();
const FREE_FALLBACK_PROVIDER = (process.env.RUSSIAN_FREE_FALLBACK || 'google').toLowerCase();

const DEEPL_KEY = process.env.DEEPL_API_KEY || '';
const LIBRE_URL = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000/translate';
const LIBRE_KEY = process.env.LIBRETRANSLATE_API_KEY || '';
let providerFailureNotifier = null;

function setProviderFailureNotifier(notifier) {
  providerFailureNotifier = typeof notifier === 'function' ? notifier : null;
}

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

async function translateWithLibre(titleFi, summaryFi) {
  const [titleRu, summaryRu] = await Promise.all([
    libreTranslate(titleFi),
    libreTranslate(summaryFi),
  ]);
  return { titleRu, summaryRu, method: 'libretranslate-literal' };
}

function notifyProviderFailure(provider, error) {
  if (!error?.billing && error?.code !== 'missing_api_key') return;
  const title = error?.code === 'missing_api_key'
    ? `Не настроен ключ ${provider === 'openai' ? 'OpenAI' : provider}`
    : `Закончился баланс ${provider === 'openai' ? 'OpenAI' : provider}`;
  const body = `Новые статьи временно переводятся резервным методом. Пополните баланс и проверьте ключ API. Код: ${error.code || error.status || 'billing_error'}.`;
  createAdminNotification({
    notificationKey: `${provider}-billing`,
    level: 'error',
    title,
    body,
  });
  const rateLimitKey = `admin_telegram_last_${provider}_billing_notification`;
  const lastSent = Date.parse(getSystemSetting(rateLimitKey, ''));
  if (providerFailureNotifier && (!Number.isFinite(lastSent) || Date.now() - lastSent > 6 * 60 * 60 * 1000)) {
    setSystemSettings({ [rateLimitKey]: new Date().toISOString() });
    providerFailureNotifier({ provider, title, body });
  }
}

function canUseEmergencyFreeFallback(provider, error) {
  return provider === 'openai'
    && FREE_FALLBACK_PROVIDER === 'google'
    && (Boolean(error?.billing) || error?.code === 'missing_api_key');
}

function notifyFreeFallbackEnabled() {
  createAdminNotification({
    notificationKey: 'google-free-fallback-enabled',
    level: 'warning',
    title: 'Включён бесплатный резервный перевод',
    body: 'OpenAI недоступен из-за ключа или баланса. Новые статьи временно переводятся через бесплатный Google Translate без гарантии качества. Проверьте баланс OpenAI.',
  });
}

// getRussianVersion({ titleFi, summaryFi, sourceName }) -> { titleRu, summaryRu, method }
async function getRussianVersion(article) {
  const { titleFi, summaryFi } = article;
  try {
    if (PROVIDER === 'openai') {
      const { titleRu, summaryRu } = await openAiRetellArticle(article);
      return {
        ...normalizeRussianArticle({ titleRu, summaryRu }),
        method: 'openai-retelling',
        promptVersion: OPENAI_PROMPT_VERSION,
      };
    }
    if (PROVIDER === 'claude') {
      const { titleRu, summaryRu } = await retellArticle(article);
      return { ...normalizeRussianArticle({ titleRu, summaryRu }), method: 'ai-retelling', promptVersion: PROMPT_VERSION };
    }
    if (PROVIDER === 'deepl') {
      const [titleRu, summaryRu] = await Promise.all([deeplTranslate(titleFi), deeplTranslate(summaryFi)]);
      return { ...normalizeRussianArticle({ titleRu, summaryRu }), method: 'deepl-literal' };
    }
    if (PROVIDER === 'libretranslate') {
      return { ...normalizeRussianArticle(await translateWithLibre(titleFi, summaryFi)), method: 'libretranslate-literal' };
    }
    // mock
    return { titleRu: `[RU] ${titleFi}`, summaryRu: `[RU] ${summaryFi}`, method: 'mock' };
  } catch (err) {
    notifyProviderFailure(PROVIDER, err);
    if (FALLBACK_PROVIDER === 'libretranslate' && process.env.LIBRETRANSLATE_URL) {
      try {
        return await translateWithLibre(titleFi, summaryFi);
      } catch (fallbackError) {
        console.error('[getRussianVersion] резервный LibreTranslate недоступен:', fallbackError.message);
      }
    }
    if (canUseEmergencyFreeFallback(PROVIDER, err)) {
      try {
        const translated = await translateArticleWithGoogleFree(article);
        notifyFreeFallbackEnabled();
        return translated;
      } catch (fallbackError) {
        console.error('[getRussianVersion] бесплатный Google Translate недоступен:', fallbackError.message);
      }
    }
    console.error('[getRussianVersion] ошибка, возвращаю оригинал на финском:', err.message);
    return { titleRu: titleFi, summaryRu: summaryFi, method: 'fallback-original' };
  }
}

module.exports = { getRussianVersion, setProviderFailureNotifier };
