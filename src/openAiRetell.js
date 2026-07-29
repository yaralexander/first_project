const { formatGlossaryForPrompt } = require('./glossary');

const API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5-nano';
const API_KEY = process.env.OPENAI_API_KEY || '';
const PROMPT_VERSION = 3;

class OpenAiProviderError extends Error {
  constructor(message, { status = 0, code = 'request_failed', billing = false } = {}) {
    super(message);
    this.name = 'OpenAiProviderError';
    this.status = status;
    this.code = code;
    this.billing = billing;
  }
}

const SYSTEM_PROMPT = `Ты — редактор русскоязычного новостного дайджеста о Финляндии.
По заголовку и RSS-анонсу на финском языке подготовь самостоятельный краткий
пересказ по-русски. Не переводи дословно, не добавляй фактов и не угадывай роли
людей. Заголовок — до 12 слов, пересказ — 1–3 предложения. Пиши нейтрально.

Устоявшиеся написания:
${formatGlossaryForPrompt()}`;

function isBillingError(status, code, message) {
  const text = `${code || ''} ${message || ''}`.toLowerCase();
  return status === 402
    || text.includes('insufficient_quota')
    || text.includes('billing')
    || text.includes('credit balance')
    || text.includes('exceeded your current quota');
}

async function openAiRetellArticle({ titleFi, summaryFi, sourceName }, attempt = 1) {
  if (!API_KEY) {
    throw new OpenAiProviderError('OPENAI_API_KEY не задан', { code: 'missing_api_key' });
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Источник: ${sourceName}\nЗаголовок (FI): ${titleFi}\nОписание (FI): ${summaryFi || '(нет описания)'}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'russian_news_retelling',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['titleRu', 'summaryRu'],
            properties: {
              titleRu: { type: 'string' },
              summaryRu: { type: 'string' },
            },
          },
        },
      },
    }),
  });

  if ((response.status === 429 || response.status >= 500) && attempt <= 3) {
    const waitMs = Math.min(8000, attempt * 1500);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return openAiRetellArticle({ titleFi, summaryFi, sourceName }, attempt + 1);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const code = payload?.error?.code || payload?.error?.type || 'request_failed';
    const message = payload?.error?.message || `HTTP ${response.status}`;
    throw new OpenAiProviderError(`OpenAI API: ${message}`, {
      status: response.status,
      code,
      billing: isBillingError(response.status, code, message),
    });
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new OpenAiProviderError('OpenAI вернул пустой ответ', { code: 'empty_response' });
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new OpenAiProviderError('OpenAI вернул некорректный JSON', { code: 'invalid_json' });
  }
  if (!parsed.titleRu || !parsed.summaryRu) {
    throw new OpenAiProviderError('OpenAI вернул неполный пересказ', { code: 'invalid_response' });
  }
  return {
    titleRu: String(parsed.titleRu).trim(),
    summaryRu: String(parsed.summaryRu).trim(),
  };
}

module.exports = {
  MODEL,
  OpenAiProviderError,
  PROMPT_VERSION,
  isBillingError,
  openAiRetellArticle,
};
