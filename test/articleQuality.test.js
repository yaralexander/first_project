const assert = require('node:assert/strict');
const test = require('node:test');
const { assessArticleQuality, assessImportance } = require('../src/articleQuality');

function article(overrides = {}) {
  return {
    category: 'Общество',
    editorialStatus: 'normal',
    titleFi: 'Helsingin uusi kirjasto avattiin',
    summaryFi: 'Kaupungin uusi kirjasto avattiin tänään.',
    titleRu: 'В Хельсинки открылась новая библиотека',
    summaryRu: 'Новая городская библиотека открылась сегодня. В ней предусмотрены пространства для чтения, учёбы и встреч жителей.',
    translationMethod: 'claude',
    ...overrides,
  };
}

test('качественный перевод проходит автоматическую проверку', () => {
  const result = assessArticleQuality(article(), { confidence: 0.82 });
  assert.equal(result.status, 'passed');
  assert.ok(result.confidence >= 0.9);
  assert.equal(result.importanceLevel, 2);
  assert.match(result.reason, /прошли автоматические проверки/i);
});

test('низкая уверенность и тестовый перевод отправляют статью на ручную проверку', () => {
  const result = assessArticleQuality(article({
    titleRu: '[RU] Test',
    summaryRu: '[RU] Short',
    translationMethod: 'mock',
  }), { confidence: 0.41 });
  assert.equal(result.status, 'manual_review');
  assert.ok(result.issues.includes('тестовый перевод'));
  assert.match(result.reason, /низкая уверенность классификатора/i);
});

test('редакционная срочная новость получает важность 5', () => {
  const result = assessImportance(article({ editorialStatus: 'urgent' }));
  assert.equal(result.level, 5);
  assert.match(result.reason, /Срочно/);
});

test('общественно значимая тема получает объяснимую повышенную важность', () => {
  const result = assessImportance(article({
    titleRu: 'Правительство и парламент обсуждают новый закон',
  }));
  assert.equal(result.level, 4);
  assert.match(result.reason, /значимую общественную тему/i);
});

test('лёгкая повседневная тема получает минимальную важность 1', () => {
  const result = assessImportance(article({
    titleRu: 'Рецепт летнего пирога от известной знаменитости',
  }));
  assert.equal(result.level, 1);
  assert.match(result.reason, /лёгкой повседневной тематике/i);
});
