const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyArticle } = require('../src/articleClassifier');
const {
  DEFAULT_AUDIENCES,
  DEFAULT_CATEGORIES,
  DEFAULT_REGIONS,
} = require('../src/schemaFoundation');

function taxonomy() {
  return {
    categories: DEFAULT_CATEGORIES.map((item, index) => ({
      ...item,
      id: index + 1,
      synonyms: '',
      keywords: '',
      classificationRules: '',
    })),
    tags: [
      { id: 101, name: 'Транспорт', slug: 'transport', aliases: 'дороги, поезда, liikenne', description: '' },
      { id: 102, name: 'Визы', slug: 'visas', aliases: 'viisumi, вид на жительство', description: '' },
    ],
    regions: [
      ...DEFAULT_REGIONS.map((item, index) => ({ ...item, id: index + 201 })),
      { id: 203, code: 'uusimaa', name: 'Уусимаа' },
    ],
    audiences: DEFAULT_AUDIENCES.map((item, index) => ({
      ...item,
      id: index + 301,
      description: '',
    })),
  };
}

test('финская политическая новость получает категорию и общий охват', () => {
  const result = classifyArticle({
    titleFi: 'Hallitus valmistelee uutta lakia eduskunnalle',
    summaryFi: 'Ministeri esitteli päätöksen Helsingissä.',
    category: 'Общество',
  }, taxonomy());

  assert.equal(result.category, 'Политика');
  assert.equal(result.regionCode, 'uusimaa');
  assert.ok(result.audienceIds.includes(301));
  assert.ok(result.confidence > 0.5);
});

test('иммиграционная статья получает тематический тег и аудиторию', () => {
  const result = classifyArticle({
    titleRu: 'Новые правила для вида на жительство и рабочих виз',
    summaryRu: 'Изменения затронут мигрантов, работников и их семьи.',
    category: 'Общество',
  }, taxonomy());

  assert.equal(result.category, 'Иммиграция');
  assert.deepEqual(result.tagIds, [102]);
  assert.ok(result.audienceIds.includes(304));
  assert.ok(result.audienceIds.includes(306));
});

test('мировая новость получает международный регион', () => {
  const result = classifyArticle({
    titleRu: 'США и Китай обсуждают международную торговлю',
    summaryRu: 'Встреча прошла за пределами Финляндии.',
    category: 'Мир',
  }, taxonomy());

  assert.equal(result.category, 'Мир');
  assert.equal(result.regionCode, 'international');
});
