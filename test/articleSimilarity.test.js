const test = require('node:test');
const assert = require('node:assert/strict');
const { compareArticles, normalizeText } = require('../src/articleSimilarity');

test('normalizes punctuation and case consistently', () => {
  assert.equal(normalizeText('[RU] Hallitus: UUSI energia-paketti!'), 'hallitus uusi energia paketti');
});

test('recognizes a high-confidence version of the same story', () => {
  const result = compareArticles(
    {
      title: 'Hallitus esittelee uuden energiapaketin ensi viikolla',
      summary: 'Paketti sisältää tukea sähkön hinnan nousuun ja teollisuudelle.',
    },
    {
      title: 'Uusi energiapaketti esitellään ensi viikolla hallituksessa',
      summary: 'Hallituksen paketti tukee teollisuutta sähkön hinnan noustessa.',
    },
  );
  assert.equal(result.isDuplicate, true);
  assert.ok(result.score >= 0.7);
});

test('does not merge different stories that only share a broad topic', () => {
  const result = compareArticles(
    {
      title: 'Hallitus esittelee uuden energiapaketin ensi viikolla',
      summary: 'Paketti sisältää tukea sähkön hinnan nousuun.',
    },
    {
      title: 'Sähköautojen myynti kasvoi Suomessa kesäkuussa',
      summary: 'Uusien autojen rekisteröinti lisääntyi viime vuodesta.',
    },
  );
  assert.equal(result.isDuplicate, false);
});

test('recognizes the same accident about a named person despite different wording', () => {
  const result = compareArticles(
    {
      title: 'Surullinen tapaturma: ministeri Mika Poutala loukkaantui vakavasti maataloustöissä',
      summary: 'Ministeri loukkaantui maatilan töissä.',
    },
    {
      title: 'Ministeri Poutala sai vakavan vamman onnettomuudessa',
      summary: 'Hänen jalkansa jäi työkoneen ja maan väliin.',
    },
  );
  assert.equal(result.isDuplicate, true);
});

test('does not merge different events about the same person', () => {
  const result = compareArticles(
    { title: 'Ministeri Mika Poutala loukkaantui vakavasti', summary: 'Tapaturma sattui maatilalla.' },
    { title: 'Ministeri Mika Poutala esitteli uuden liikuntaohjelman', summary: 'Ohjelma julkaistiin Helsingissä.' },
  );
  assert.equal(result.isDuplicate, false);
});
