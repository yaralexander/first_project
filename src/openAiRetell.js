const { formatGlossaryForPrompt } = require('./glossary');

const API_URL = 'https://api.openai.com/v1/responses';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5-nano';
const API_KEY = process.env.OPENAI_API_KEY || '';
const PROMPT_VERSION = 6;

class OpenAiProviderError extends Error {
  constructor(message, { status = 0, code = 'request_failed', billing = false } = {}) {
    super(message);
    this.name = 'OpenAiProviderError';
    this.status = status;
    this.code = code;
    this.billing = billing;
  }
}

const SYSTEM_PROMPT = `Ты — опытный редактор русскоязычного новостного сайта о Финляндии.
На основе уже переведённого исходного материала подготовь самостоятельную
новостную публикацию. Твоя задача — добавить читателю ясность и контекст, а не
механически переписать RSS. Не выдумывай факты, даты, цифры, должности,
причины или последствия. Не копируй фразы источника дословно и не используй
кликбейт или оценочные суждения.

titleRu — точный самостоятельный заголовок до 12 слов.
summaryRu — текст публикации с такой структурой:
1) «Кратко» — 3–4 предложения: что произошло, где, когда и кого касается;
2) «Подробности» — только подтверждённые исходником детали, без воды;
3) «Почему это важно?» — аккуратное объяснение последствий. Если последствий
нет в исходнике, напиши: «Новость носит информационный характер; дополнительных
последствий источник не сообщает.»;
4) «Источник» — укажи переданное название финского СМИ.

Разделяй блоки пустой строкой. При полном тексте статьи пиши 6–10 предложений
и 2–4 содержательных абзаца. При коротком RSS-анонсе пиши 3–5 предложений,
не растягивай материал и честно укажи, каких деталей в источнике нет. Не
добавляй внешний контекст, которого нет во входных данных. Имена и топонимы
транслитерируй последовательно.

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

async function openAiRetellArticle({ titleFi, summaryFi, sourceName, hasFullArticle = false }, attempt = 1) {
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
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: 'user',
          content: `Источник: ${sourceName}\nТип материала: ${hasFullArticle ? 'основной текст оригинальной статьи' : 'короткий RSS-анонс'}\nЗаголовок (FI): ${titleFi}\nИсходный текст (FI): ${summaryFi || '(нет описания)'}`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
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
    return openAiRetellArticle({ titleFi, summaryFi, sourceName, hasFullArticle }, attempt + 1);
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
  const content = payload?.output_text
    || payload?.output?.flatMap((item) => item?.content || []).find((item) => item?.type === 'output_text')?.text;
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
