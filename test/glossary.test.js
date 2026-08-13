const assert = require('node:assert/strict');
const test = require('node:test');
const { GLOSSARY, normalizeRussianArticle, normalizeRussianProperNames } = require('../src/glossary');

test('uses stable Russian names with the Finnish original for institutions', () => {
  assert.equal(GLOSSARY.Perussuomalaiset, '«Истинные финны» (Perussuomalaiset)');
  assert.equal(GLOSSARY['Mauri Peltokangas'], 'Маури Пелтокангас');
  assert.equal(GLOSSARY.Munkkiniemi, 'Мунккиниеми');
});

test('corrects common machine transliterations before publication', () => {
  assert.equal(
    normalizeRussianProperNames('Аналитика: Перуссуомалайсет снова в центре внимания'),
    'Аналитика: «Истинные финны» (Perussuomalaiset) снова в центре внимания',
  );
  assert.deepEqual(normalizeRussianArticle({
    titleRu: 'Маури Пельтокангас выступил с заявлением',
    summaryRu: 'Депутат партии Перуссуомалайсет написал в Facebook.',
  }), {
    titleRu: 'Маури Пелтокангас выступил с заявлением',
    summaryRu: 'Депутат партии «Истинные финны» (Perussuomalaiset) написал в Facebook.',
  });
});
