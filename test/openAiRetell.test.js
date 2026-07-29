const assert = require('node:assert/strict');
const test = require('node:test');
const {
  OpenAiProviderError,
  isBillingError,
} = require('../src/openAiRetell');

test('recognizes OpenAI balance and quota errors', () => {
  assert.equal(isBillingError(402, '', ''), true);
  assert.equal(isBillingError(429, 'insufficient_quota', ''), true);
  assert.equal(isBillingError(429, '', 'You exceeded your current quota'), true);
  assert.equal(isBillingError(500, 'server_error', 'Temporary failure'), false);
});

test('provider error keeps safe machine-readable billing metadata', () => {
  const error = new OpenAiProviderError('OpenAI API: quota exhausted', {
    status: 429,
    code: 'insufficient_quota',
    billing: true,
  });

  assert.equal(error.name, 'OpenAiProviderError');
  assert.equal(error.status, 429);
  assert.equal(error.code, 'insufficient_quota');
  assert.equal(error.billing, true);
});
