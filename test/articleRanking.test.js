const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PUBLIC_CHANNEL_SCORE,
  calculateArticleRanking,
  meetsPublicChannelThreshold,
} = require('../src/articleRanking');

const now = new Date('2026-07-30T12:00:00.000Z');

function article(overrides = {}) {
  return {
    importanceLevel: 2,
    editorialStatus: 'normal',
    regionCode: 'finland',
    publishedAt: '2026-07-30T10:00:00.000Z',
    publicationStatus: 'published',
    qualityStatus: 'passed',
    ...overrides,
  };
}

test('обычная новость из одного источника не проходит порог общего канала', () => {
  const ranking = calculateArticleRanking(article(), { independentSourceCount: 1 }, now);
  assert.equal(ranking.score, 30);
  assert.equal(meetsPublicChannelThreshold(ranking), false);
});

test('важная новость проходит рекомендуемый порог', () => {
  const ranking = calculateArticleRanking(article({ importanceLevel: 4 }), {
    independentSourceCount: 1,
  }, now);
  assert.equal(ranking.score, DEFAULT_PUBLIC_CHANNEL_SCORE);
  assert.equal(meetsPublicChannelThreshold(ranking), true);
});

test('несколько независимых источников усиливают общественно значимую тему', () => {
  const ranking = calculateArticleRanking(article({ importanceLevel: 3 }), {
    independentSourceCount: 2,
  }, now);
  assert.equal(ranking.score, DEFAULT_PUBLIC_CHANNEL_SCORE);
  assert.equal(ranking.independentSourceCount, 2);
  assert.match(ranking.explanation, /2 независимых источника/);
});

test('ручная проверка качества блокирует отправку даже при высоком балле', () => {
  const ranking = calculateArticleRanking(article({
    importanceLevel: 5,
    qualityStatus: 'manual_review',
  }), { independentSourceCount: 4 }, now);
  assert.equal(ranking.score, 100);
  assert.equal(ranking.eligible, false);
  assert.equal(meetsPublicChannelThreshold(ranking), false);
});

test('редакционная метка повышает рейтинг прозрачным образом', () => {
  const ranking = calculateArticleRanking(article({
    importanceLevel: 3,
    editorialStatus: 'important',
  }), { independentSourceCount: 1 }, now);
  assert.equal(ranking.score, 55);
  assert.match(ranking.explanation, /метка редакции «Важно»/);
});
