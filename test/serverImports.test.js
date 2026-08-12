const assert = require('node:assert/strict');
const test = require('node:test');

test('Telegram followed-topic matcher is exported by the assistant module', () => {
  const assistant = require('../src/telegramAssistant');
  const contactSpam = require('../src/contactSpam');
  assert.equal(typeof assistant.articleMatchesFollowedTopics, 'function');
  assert.equal(contactSpam.articleMatchesFollowedTopics, undefined);
});
