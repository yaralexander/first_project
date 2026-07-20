// src/aiRetell.js
// Пересказ (не дословный перевод) финской новости на русском через Claude API.
// Модель получает заголовок + краткое описание из RSS и должна переформулировать
// их своими словами по-русски — это и дешевле, и безопаснее с точки зрения
// авторского права, чем прогонять текст через классический переводчик 1:1.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const { formatGlossaryForPrompt } = require('./glossary');

// Увеличивайте это число при каждом смысловом изменении SYSTEM_PROMPT или
// glossary.js — версия сохраняется у каждой новой статьи в SQLite.
const PROMPT_VERSION = 2;

const SYSTEM_PROMPT = `Ты — редактор русскоязычного новостного дайджеста о Финляндии.
Тебе присылают заголовок и краткое описание новости на финском языке (взятые из
публичного RSS-анонса финского СМИ). Твоя задача — НЕ переводить дословно, а
кратко и своими словами пересказать суть по-русски.

Правила:
1. titleRu — короткий заголовок на русском (до 12 слов), передающий суть, но
   сформулированный самостоятельно, а не как калька финской фразы.
2. summaryRu — пересказ в 2–3 своих предложениях. Только факты, которые
   действительно есть в исходном тексте. Ничего не выдумывай и не добавляй
   деталей, которых нет в оригинале.
3. КРИТИЧЕСКИ ВАЖНО: если в тексте упоминается имя человека, но его роль,
   профессия или должность явно не указаны — НЕ придумывай и не угадывай,
   кем он является. Не пиши "основатель компании", "хакер", "директор" и
   подобное, если это не сказано в исходном тексте прямо. В таких случаях
   просто используй имя без пояснений или напиши нейтрально ("упомянутый в
   деле человек"). Придуманная роль — это фактическая ошибка, даже если
   звучит правдоподобно.
4. Не копируй структуру и обороты речи оригинала — если исходное предложение
   короткое, это не значит, что твой пересказ должен быть его прямым аналогом.
5. Нейтральный, информационный тон — как в обычной новостной ленте.
6. Если исходный текст слишком короткий или бессодержательный, чтобы что-то
   пересказывать, — сократи summaryRu до одного предложения, не выдумывая наполнение.
7. Пиши грамотно и внимательно проверяй орфографию кириллицы перед ответом —
   не путай похожие буквы латиницы и кириллицы (например, "Kauko" — это
   "Кауко", а не "Каuko"; финские имена и топонимы транслитерируй на русский
   полностью и последовательно).
8. ЕДИНООБРАЗИЕ ИМЁН: если имя человека, города или организации есть в
   словаре ниже — используй ТОЧНО указанное написание, не придумывай
   вариант заново. Если имени нет в словаре — транслитерируй его сам по
   стандартным правилам практической транскрипции с финского/английского на
   русский и придерживайся ОДНОГО варианта написания внутри своего ответа.

Словарь устоявшихся написаний (используй именно эти варианты):
${formatGlossaryForPrompt()}

Отвечай СТРОГО в формате JSON без каких-либо пояснений до или после:
{"titleRu": "...", "summaryRu": "..."}`;

function extractJson(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retellArticle({ titleFi, summaryFi, sourceName }, attempt = 1) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY не задан в .env');
  }

  const userMessage = `Источник: ${sourceName}
Заголовок (FI): ${titleFi}
Описание (FI): ${summaryFi || '(описание отсутствует в RSS)'}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  // 429 (rate limit) и 5xx — временные ошибки, имеет смысл повторить с паузой.
  // При большом количестве статей (233 в вашем случае) это происходит регулярно —
  // без ретраев такие статьи навсегда остаются непереведёнными.
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
    const retryAfterHeader = parseFloat(res.headers.get('retry-after') || '');
    const waitMs = !isNaN(retryAfterHeader) ? retryAfterHeader * 1000 : attempt * 1500;
    console.warn(`[aiRetell] ${res.status} — повтор через ${Math.round(waitMs)}мс (попытка ${attempt}/4): "${titleFi.slice(0, 50)}..."`);
    await sleep(waitMs);
    return retellArticle({ titleFi, summaryFi, sourceName }, attempt + 1);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Пустой ответ от модели');

  const parsed = extractJson(textBlock.text);
  if (!parsed.titleRu || !parsed.summaryRu) {
    throw new Error('Модель вернула неполный JSON: ' + textBlock.text);
  }
  return { titleRu: parsed.titleRu.trim(), summaryRu: parsed.summaryRu.trim() };
}

module.exports = { retellArticle, PROMPT_VERSION };
