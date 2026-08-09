const assert = require('node:assert/strict');
const test = require('node:test');
const {
  renderArticlePage,
  renderListPage,
  renderSitemap,
} = require('../src/render');

const siteUrl = 'https://finskienovosti.fi';
const article = {
  id: 1,
  slug: 'postoyannaya-novost-finlyandii',
  titleRu: 'В Финляндии открылась новая библиотека',
  summaryRu: 'Свежая новость Финляндии на русском языке.',
  category: 'Общество',
  sourceId: 'yle',
  sourceName: 'YLE',
  originalUrl: 'https://yle.fi/a/74-20000000',
  publishedAt: '2026-07-29T10:00:00.000Z',
  createdAt: '2026-07-29T10:05:00.000Z',
  reactionTotals: { like: 0, important: 0, sad: 0 },
};
const categoryToSlug = () => 'obshchestvo';

test('article page exposes stable canonical URL and NewsArticle metadata', () => {
  const html = renderArticlePage({ article, siteUrl, categoryToSlug });

  assert.match(html, /<title>В Финляндии открылась новая библиотека \| Финские Новости<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/finskienovosti\.fi\/news\/postoyannaya-novost-finlyandii"/);
  assert.match(html, /Финские Новости, Finskie Novosti, новости Финляндии/);
  assert.match(html, /"@type":"NewsArticle"/);
  assert.match(html, /"mainEntityOfPage":"https:\/\/finskienovosti\.fi\/news\/postoyannaya-novost-finlyandii"/);
  assert.match(html, /"alternateName":"Finskie Novosti"/);
  assert.doesNotMatch(html, />Finskiye Novosti</);
});

test('article page renders a translated summary as readable paragraphs', () => {
  const html = renderArticlePage({
    article: {
      ...article,
      summaryRu: 'Первый абзац сообщает главное событие.\n\nВторой абзац добавляет подтверждённые подробности.',
    },
    siteUrl,
    categoryToSlug,
  });

  assert.match(html, /<div class="article-lead"><p>Первый абзац сообщает главное событие\.<\/p><p>Второй абзац добавляет подтверждённые подробности\.<\/p><\/div>/);
});

test('listing page has CollectionPage and searchable website metadata', () => {
  const html = renderListPage({
    title: 'Финские Новости — Finskie Novosti',
    description: 'Новости Финляндии на русском языке.',
    canonicalPath: '/',
    siteUrl,
    articles: [article],
    page: 1,
    total: 1,
    pagePath: (page) => `/page/${page}`,
    categoryToSlug,
  });

  assert.match(html, /"@type":"WebSite"/);
  assert.match(html, /"@type":"SearchAction"/);
  assert.match(html, /"@type":"CollectionPage"/);
  assert.match(html, /"@type":"ItemList"/);
  assert.match(html, /https:\/\/finskienovosti\.fi\/search\?q=\{search_term_string\}/);
});

test('sitemap keeps permanent article and archive URLs indexable', () => {
  const xml = renderSitemap({
    siteUrl,
    categorySlugs: ['obshchestvo'],
    articles: [article],
    archivePageCount: 3,
  });

  assert.match(xml, /https:\/\/finskienovosti\.fi\/news\/postoyannaya-novost-finlyandii/);
  assert.match(xml, /https:\/\/finskienovosti\.fi\/page\/2/);
  assert.match(xml, /https:\/\/finskienovosti\.fi\/page\/3/);
  assert.match(xml, /https:\/\/finskienovosti\.fi\/about/);
  assert.match(xml, /<lastmod>2026-07-29T10:05:00.000Z<\/lastmod>/);
});
