const test = require('node:test');
const assert = require('node:assert/strict');
const { contextualSummary, contextualTitle, peopleForArticle } = require('../src/peopleContext');

test('adds a verified role to Mika Poutala without changing unrelated titles', () => {
  const article = {
    titleFi: 'Ministeri Mika Poutala loukkaantui vakavasti',
    titleRu: 'Министр Мика Поутала получил тяжёлую травму',
  };
  assert.match(contextualTitle(article), /Мика Поутала \(министр по делам молодёжи/);
  assert.equal(peopleForArticle(article)[0].id, 'mika-poutala');
  assert.match(contextualSummary({ ...article, summaryRu: 'Он получил травму.' }), /\n\nМика Поутала —/);
  assert.equal(contextualTitle({ titleRu: 'В Хельсинки открылась библиотека' }), 'В Хельсинки открылась библиотека');
});
