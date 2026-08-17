const test = require('node:test');
const assert = require('node:assert/strict');
const {
  candidateWords,
  getVocabularyCards,
  parseKotusVocabulary,
  resetVocabularyCacheForTests,
} = require('../src/finnishVocabulary');

test('список Kotus фильтрует дубли, ошибки и неподходящие записи', () => {
  const words = parseKotusVocabulary([
    'Hakusana\tHomonymia\tSanaluokka\tTaivutustiedot',
    'koti\t\tsubstantiivi\t5',
    'KOTI\t\tsubstantiivi\t5',
    'juosta\t\tverbi\t52',
    'enään\t\tadverbi\t100',
    '12-apostoli\t\tsubstantiivi\t',
  ].join('\n'));
  assert.deepEqual(words, ['koti', 'juosta']);
});

test('разные дни и уровни получают непересекающиеся кандидаты', () => {
  const words = Array.from({ length: 1000 }, (_, index) => `sana${String.fromCharCode(97 + (index % 26))}${index}`);
  const first = candidateWords(words, 100, 'A1-A2');
  const second = candidateWords(words, 101, 'A1-A2');
  const advanced = candidateWords(words, 100, 'C1-C2');
  assert.equal(new Set([...first, ...second, ...advanced]).size, first.length + second.length + advanced.length);
});

test('подготовленные карточки сохраняются и повторно берутся из кеша', async () => {
  resetVocabularyCacheForTests();
  const previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  const source = ['Hakusana\tHomonymia\tSanaluokka\tTaivutustiedot'];
  const letters = (number) => {
    let value = number;
    let result = '';
    do {
      result = String.fromCharCode(97 + (value % 26)) + result;
      value = Math.floor(value / 26);
    } while (value);
    return result.padStart(4, 'a');
  };
  for (let index = 0; index < 50020; index += 1) source.push(`sana${letters(index)}\t\tsubstantiivi\t5`);
  let apiCalls = 0;
  const fetchImpl = async (_url, options = {}) => {
    if (!options.method) return { ok: true, text: async () => source.join('\n') };
    apiCalls += 1;
    const candidates = JSON.parse(options.body).input.replace('Кандидаты: ', '').split(', ');
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ words: candidates.slice(0, 3).map((word) => ({
      word, level: 'A1-A2', translationRu: `перевод ${word}`, exampleFi: `${word} on tärkeä.`, exampleRu: `${word} — важное слово.`,
    })) }) }) };
  };
  const cache = new Map();
  const options = {
    dayNumber: 42, level: 'A1-A2', fetchImpl,
    getCached: (key, fallback) => cache.get(key) || fallback,
    setCached: (entries) => Object.entries(entries).forEach(([key, value]) => cache.set(key, value)),
  };
  const first = await getVocabularyCards(options);
  const second = await getVocabularyCards(options);
  assert.deepEqual(second, first);
  assert.equal(apiCalls, 1);
  if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousApiKey;
});
