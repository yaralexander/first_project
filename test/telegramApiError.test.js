const assert = require('node:assert/strict');
const test = require('node:test');
const { telegramApiFailure, isTelegramChatUnavailable } = require('../src/telegramApiError');

test('Telegram API failures expose a safe diagnostic without chat details', () => {
  assert.equal(
    telegramApiFailure('sendMessage', 403, {
      error_code: 403,
      description: 'Forbidden: bot was blocked by the user',
    }).message,
    'telegram sendMessage failed (403: blocked_by_user)',
  );
  assert.equal(
    telegramApiFailure('sendMessage', 400, {
      error_code: 400,
      description: "Bad Request: can't parse entities: user-specific details",
    }).message,
    'telegram sendMessage failed (400: invalid_message_markup)',
  );
  assert.equal(
    telegramApiFailure('sendMessage', 502, { description: 'unexpected private detail' }).message,
    'telegram sendMessage failed (502: unknown)',
  );
  assert.equal(isTelegramChatUnavailable(telegramApiFailure('sendMessage', 403, {
    description: 'Forbidden: bot was blocked by the user',
  })), true);
  assert.equal(isTelegramChatUnavailable(telegramApiFailure('sendMessage', 400, {
    description: "Bad Request: can't parse entities",
  })), false);
});
