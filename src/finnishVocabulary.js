const KOTUS_WORD_LIST_URL = 'https://kaino.kotus.fi/lataa/nykysuomensanalista2024.txt';
const OPENAI_URL = 'https://api.openai.com/v1/responses';
const LEVELS = ['A1-A2', 'B1-B2', 'C1-C2'];
const CANDIDATES_PER_LEVEL = 12;

let vocabularyPromise;

function gcd(a, b) {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) [left, right] = [right, left % right];
  return left;
}

function permutationStep(size) {
  let step = Math.min(7919, Math.max(3, size - 1));
  if (step % 2 === 0) step -= 1;
  while (step > 1 && gcd(step, size) !== 1) step -= 2;
  return Math.max(step, 1);
}

function parseKotusVocabulary(text) {
  const seen = new Set();
  return String(text || '').split(/\r?\n/).slice(1).flatMap((line) => {
    const [word = '', , partOfSpeech = '', inflection = ''] = line.split('\t');
    const normalized = word.trim().toLocaleLowerCase('fi-FI');
    if (!normalized
      || seen.has(normalized)
      || inflection.includes('100')
      || !/(substantiivi|adjektiivi|verbi|adverbi)/.test(partOfSpeech)
      || normalized.length < 3
      || normalized.length > 28
      || /[\d<>/&]|\s{2,}/.test(normalized)
      || normalized.endsWith('-')) return [];
    seen.add(normalized);
    return [normalized];
  });
}

async function loadKotusVocabulary(fetchImpl = global.fetch) {
  if (!vocabularyPromise) {
    vocabularyPromise = (async () => {
      const response = await fetchImpl(KOTUS_WORD_LIST_URL, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Kotus vocabulary HTTP ${response.status}`);
      const words = parseKotusVocabulary(await response.text());
      if (words.length < 50000) throw new Error(`Kotus vocabulary is unexpectedly small: ${words.length}`);
      return words;
    })().catch((error) => {
      vocabularyPromise = undefined;
      throw error;
    });
  }
  return vocabularyPromise;
}

function candidateWords(words, dayNumber, level) {
  const levelIndex = Math.max(0, LEVELS.indexOf(level));
  const ordinalStart = (dayNumber * LEVELS.length + levelIndex) * CANDIDATES_PER_LEVEL;
  const step = permutationStep(words.length);
  return Array.from({ length: CANDIDATES_PER_LEVEL }, (_, index) => {
    const ordinal = ((ordinalStart + index) % words.length + words.length) % words.length;
    return words[(ordinal * step) % words.length];
  });
}

function responseText(payload) {
  return payload?.output_text
    || payload?.output?.flatMap((item) => item?.content || []).find((item) => item?.type === 'output_text')?.text
    || '';
}

function validCards(cards, candidates, level) {
  const allowed = new Set(candidates.map((word) => word.toLocaleLowerCase('fi-FI')));
  if (!Array.isArray(cards) || cards.length !== 3) return false;
  const unique = new Set();
  return cards.every((card) => {
    const word = String(card?.word || '').trim().toLocaleLowerCase('fi-FI');
    if (!allowed.has(word) || unique.has(word)) return false;
    unique.add(word);
    return card.level === level
      && String(card.translationRu || '').trim()
      && String(card.exampleFi || '').trim()
      && String(card.exampleRu || '').trim();
  });
}

async function generateWordCards({ candidates, level, fetchImpl = global.fetch }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const response = await fetchImpl(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_ASSISTANT_MODEL || process.env.OPENAI_MODEL || 'gpt-5-nano',
      instructions: `Ты преподаватель финского языка для русскоязычных. Выбери ровно три наиболее полезных современных слова уровня ${level} только из предоставленного списка. Не выбирай имена, бренды, оскорбительные, устаревшие, диалектные или узкоспециальные слова. Дай естественный перевод и короткий пример употребления.`,
      input: `Кандидаты: ${candidates.join(', ')}`,
      text: { format: { type: 'json_schema', name: 'finnish_daily_words', strict: true, schema: {
        type: 'object', additionalProperties: false, required: ['words'], properties: { words: {
          type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false,
            required: ['word', 'level', 'translationRu', 'exampleFi', 'exampleRu'], properties: {
              word: { type: 'string' }, level: { type: 'string', enum: [level] }, translationRu: { type: 'string' },
              exampleFi: { type: 'string' }, exampleRu: { type: 'string' },
            } },
        } } } } },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`OpenAI vocabulary HTTP ${response.status}`);
  const parsed = JSON.parse(responseText(await response.json()));
  if (!validCards(parsed.words, candidates, level)) throw new Error('OpenAI returned invalid vocabulary cards');
  return parsed.words.map((card) => ({
    level,
    word: String(card.word).trim().toLocaleLowerCase('fi-FI'),
    translationRu: String(card.translationRu).trim(),
    exampleFi: String(card.exampleFi).trim(),
    exampleRu: String(card.exampleRu).trim(),
  }));
}

async function getVocabularyCards({ dayNumber, level, getCached, setCached, fetchImpl = global.fetch }) {
  const cacheKey = `daily_words_kotus_v1:${dayNumber}:${level}`;
  const cached = getCached(cacheKey, '');
  if (cached) {
    try {
      const cards = JSON.parse(cached);
      if (Array.isArray(cards) && cards.length === 3) return cards;
    } catch {}
  }
  const words = await loadKotusVocabulary(fetchImpl);
  const cards = await generateWordCards({ candidates: candidateWords(words, dayNumber, level), level, fetchImpl });
  setCached({ [cacheKey]: JSON.stringify(cards) });
  return cards;
}

function resetVocabularyCacheForTests() {
  vocabularyPromise = undefined;
}

module.exports = {
  CANDIDATES_PER_LEVEL,
  KOTUS_WORD_LIST_URL,
  candidateWords,
  generateWordCards,
  getVocabularyCards,
  loadKotusVocabulary,
  parseKotusVocabulary,
  resetVocabularyCacheForTests,
};
