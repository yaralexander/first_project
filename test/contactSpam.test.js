const assert = require('node:assert/strict');
const test = require('node:test');
const {
  countLinks,
  createContactFormToken,
  createSlidingWindowRateLimiter,
  normalizeContactText,
  verifyContactFormToken,
} = require('../src/contactSpam');

test('contact form token rejects bots, tampering and stale forms', () => {
  const secret = 'test-secret';
  const createdAt = Date.UTC(2026, 7, 1, 12, 0, 0);
  const token = createContactFormToken(secret, createdAt);

  assert.equal(verifyContactFormToken(token, secret, { now: createdAt + 500, minAgeMs: 2000 }), false);
  assert.equal(verifyContactFormToken(token, secret, { now: createdAt + 3000, minAgeMs: 2000 }), true);
  assert.equal(verifyContactFormToken(`${token.slice(0, -1)}0`, secret, { now: createdAt + 3000 }), false);
  assert.equal(verifyContactFormToken(token, secret, { now: createdAt + 7200001, maxAgeMs: 7200000 }), false);
});

test('contact rate limiter applies a sliding window per anonymous key', () => {
  const limiter = createSlidingWindowRateLimiter({ windowMs: 1000, max: 2 });
  assert.equal(limiter.consume('visitor', 0), true);
  assert.equal(limiter.consume('visitor', 100), true);
  assert.equal(limiter.consume('visitor', 200), false);
  assert.equal(limiter.consume('other', 200), true);
  assert.equal(limiter.consume('visitor', 1100), true);
});

test('contact normalization and link counting make duplicate checks stable', () => {
  assert.equal(normalizeContactText('  Одно   и то же\nсообщение  '), 'Одно и то же сообщение');
  assert.equal(countLinks('Смотрите https://example.com и www.example.fi/news.'), 2);
  assert.equal(countLinks('Обычный текст без ссылок'), 0);
});
