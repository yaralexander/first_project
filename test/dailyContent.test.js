const test = require('node:test');
const assert = require('node:assert/strict');
const { contentForDate, easterSunday } = require('../src/dailyContent');

test('слово дня создаётся каждый день и имеет стабильный ключ', () => {
  const items = contentForDate(new Date('2026-07-29T09:00:00Z'));
  assert.equal(items[0].type, 'word');
  assert.equal(items[0].key, 'word:2026-07-29:A1-A2');
  assert.match(items[0].title, /Три финских слова/);
  assert.match(items[0].message, /Три новых слова/);
  assert.match(items[0].message, /Повторяем вчерашние/);
  assert.match(items[0].message, /Фраза дня/);
  assert.match(items[0].message, /🇫🇮/);
  assert.match(items[0].message, /🇷🇺/);
});

test('слово дня соответствует выбранному уровню финского', () => {
  const date = new Date('2026-07-29T09:00:00Z');
  const beginner = contentForDate(date, { wordLevel: 'A1-A2' })[0];
  const intermediate = contentForDate(date, { wordLevel: 'B1-B2' })[0];
  const advanced = contentForDate(date, { wordLevel: 'C1-C2' })[0];
  assert.match(beginner.title, /A1-A2/);
  assert.match(intermediate.title, /B1-B2/);
  assert.match(advanced.title, /C1-C2/);
  assert.notEqual(beginner.message, intermediate.message);
  assert.notEqual(intermediate.message, advanced.message);
});

test('можно одновременно выбрать несколько уровней слова дня', () => {
  const item = contentForDate(new Date('2026-07-29T09:00:00Z'), {
    wordLevels: ['A1-A2', 'B1-B2', 'C1-C2'],
  })[0];
  assert.equal(item.key, 'word:2026-07-29:A1-A2+B1-B2+C1-C2');
  assert.match(item.message, /\(A1-A2\)/);
  assert.match(item.message, /\(B1-B2\)/);
  assert.match(item.message, /\(C1-C2\)/);
});

test('официальный день флага и праздник определяются по календарю', () => {
  const independence = contentForDate(new Date('2026-12-06T09:00:00Z'));
  assert.ok(independence.some((item) => item.type === 'flag_days'));
  assert.ok(independence.some((item) => item.type === 'holidays'));
});

test('день Туве Янссон и другие календарные дни 2026 не пропускаются', () => {
  const today = contentForDate(new Date('2026-08-09T09:00:00Z'));
  const flagDay = today.find((item) => item.type === 'flag_days');
  assert.ok(flagDay);
  assert.match(flagDay.message, /Туве Янссон/);
  const natureDay = contentForDate(new Date('2026-08-29T09:00:00Z'));
  assert.match(natureDay.find((item) => item.type === 'flag_days').message, /финской природы/);
});

test('подвижные пасхальные даты вычисляются корректно для 2026', () => {
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), '2026-04-05');
  const goodFriday = contentForDate(new Date('2026-04-03T09:00:00Z'));
  assert.ok(goodFriday.some((item) => item.type === 'holidays'));
});
