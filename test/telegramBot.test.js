const assert = require('node:assert/strict');
const test = require('node:test');
const {
  RUSSIAN_BOT_COMMANDS,
  configureRussianTelegramBot,
  getRussianTelegramReply,
} = require('../src/telegramBot');

test('configures Russian Telegram commands and descriptions for default and ru language', async () => {
  const calls = [];
  await configureRussianTelegramBot(async (method, body) => {
    calls.push({ method, body });
    return true;
  });

  assert.equal(calls.length, 6);
  assert.deepEqual(calls[0], {
    method: 'setMyCommands',
    body: { commands: RUSSIAN_BOT_COMMANDS },
  });
  assert.equal(calls[1].method, 'setMyDescription');
  assert.match(calls[1].body.description, /Персональная рассылка/);
  assert.equal(calls[2].method, 'setMyShortDescription');
  assert.match(calls[2].body.short_description, /Новости Финляндии/);
  assert.equal(calls[3].body.language_code, 'ru');
  assert.equal(calls[4].body.language_code, 'ru');
  assert.equal(calls[5].body.language_code, 'ru');
  assert.ok(calls.every(({ body }) => JSON.stringify(body).match(/[А-Яа-яЁё]/)));
});

test('returns clear Russian replies for linking, help and settings', () => {
  const linked = getRussianTelegramReply('/start abcdefgh', {
    accountUrl: 'https://finskienovosti.fi',
    linkSucceeded: true,
  });
  assert.match(linked, /Telegram подключён/);
  assert.match(linked, /https:\/\/finskienovosti\.fi\/account/);

  const expired = getRussianTelegramReply('/start abcdefgh', {
    accountUrl: 'https://finskienovosti.fi',
  });
  assert.match(expired, /недействителен или уже истёк/);

  const help = getRussianTelegramReply('/help', {
    accountUrl: 'https://finskienovosti.fi',
  });
  assert.match(help, /Это бот «Финские Новости»/);

  const settings = getRussianTelegramReply('/settings@FinskieNovostiBot', {
    accountUrl: 'https://finskienovosti.fi/',
  });
  assert.match(settings, /Настройки тем и частоты рассылки/);
  assert.match(settings, /https:\/\/finskienovosti\.fi\/account/);
});
