const test = require('node:test');
const assert = require('node:assert/strict');
const { contentForDate, easterSunday } = require('../src/dailyContent');

test('слово дня создаётся каждый день и имеет стабильный ключ', () => {
  const items = contentForDate(new Date('2026-07-29T09:00:00Z'));
  assert.equal(items[0].type, 'word');
  assert.equal(items[0].key, 'word:2026-07-29');
  assert.match(items[0].message, /🇫🇮/);
  assert.match(items[0].message, /🇷🇺/);
});

test('официальный день флага и праздник определяются по календарю', () => {
  const independence = contentForDate(new Date('2026-12-06T09:00:00Z'));
  assert.ok(independence.some((item) => item.type === 'flag_days'));
  assert.ok(independence.some((item) => item.type === 'holidays'));
});

test('подвижные пасхальные даты вычисляются корректно для 2026', () => {
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), '2026-04-05');
  const goodFriday = contentForDate(new Date('2026-04-03T09:00:00Z'));
  assert.ok(goodFriday.some((item) => item.type === 'holidays'));
});
