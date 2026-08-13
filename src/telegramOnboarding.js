const TOPICS = Object.freeze([
  ['politika', '🏛 Политика'], ['ekonomika', '💶 Экономика'], ['immigratsiya', '✈️ Иммиграция'],
  ['rabota', '💼 Работа'], ['obshchestvo', '👥 Общество'], ['obrazovanie', '🎓 Образование'],
]);
const CHAINS = Object.freeze([
  ['lidl', 'Lidl'], ['prisma', 'Prisma'], ['smarket', 'S-market'], ['alepa', 'Alepa'],
  ['kmarket', 'K-Market'], ['ksupermarket', 'K-Supermarket'], ['kcitymarket', 'K-Citymarket'],
]);

function emptyOnboarding() {
  return { step: 0, topics: [], region: 'finland', frequency: 'daily', maxPosts: 5, time: '08:00', importance: 'all', word: false, levels: ['A1-A2'], offers: false, chains: [] };
}

function keyboard(rows) {
  return { inline_keyboard: rows };
}

function choice(value, label, selected = false) {
  return { text: `${selected ? '✅ ' : ''}${label}`, callback_data: `onb:${value}` };
}

function onboardingView(state = emptyOnboarding()) {
  const s = { ...emptyOnboarding(), ...state };
  const number = Math.min(10, s.step + 1);
  const prefix = `<b>Шаг ${number} из 10</b>\n\n`;
  if (s.step === 0) return { text: `${prefix}<b>Какие темы вам интересны?</b>\nМожно выбрать несколько.`, reply_markup: keyboard([
    ...TOPICS.map(([id, label]) => [choice(`topic:${id}`, label, s.topics.includes(id))]),
    [choice('next', 'Дальше →')],
  ]) };
  if (s.step === 1) return { text: `${prefix}<b>Новости какого региона показывать?</b>`, reply_markup: keyboard([
    [choice('region:finland', 'Вся Финляндия')], [choice('region:capital', 'Хельсинки · Эспоо · Вантаа')], [choice('region:all', 'Финляндия и мир')],
  ]) };
  if (s.step === 2) return { text: `${prefix}<b>Как получать новости?</b>`, reply_markup: keyboard([
    [choice('frequency:daily', 'Одна удобная подборка')], [choice('frequency:instant', 'Сразу после публикации')],
  ]) };
  if (s.step === 3) return { text: `${prefix}<b>Сколько новостей в день?</b>`, reply_markup: keyboard([[choice('max:3', '3 — только главное'), choice('max:5', '5 — оптимально')], [choice('max:10', 'До 10 новостей')]]) };
  if (s.step === 4) return { text: `${prefix}<b>Когда присылать ежедневную подборку?</b>\nВремя Финляндии.`, reply_markup: keyboard([[choice('time:08:00', '08:00'), choice('time:12:00', '12:00')], [choice('time:18:00', '18:00'), choice('time:21:00', '21:00')]]) };
  if (s.step === 5) return { text: `${prefix}<b>Какие новости включать?</b>`, reply_markup: keyboard([[choice('importance:all', 'Все по моим темам')], [choice('importance:important', 'Только важные')]]) };
  if (s.step === 6) return { text: `${prefix}<b>Добавить «Слово дня»?</b>\nТри новых финских слова, повторение вчерашних и полезная фраза.`, reply_markup: keyboard([[choice('word:yes', '🇫🇮 Да, добавить')], [choice('word:no', 'Нет')]]) };
  if (s.step === 7) return { text: `${prefix}<b>Ваш уровень финского</b>\nМожно выбрать несколько уровней и нажать «Дальше».`, reply_markup: keyboard([
    [['A1-A2', 'A1–A2'], ['B1-B2', 'B1–B2'], ['C1-C2', 'C1–C2']].map(([id, label]) => choice(`level:${id}`, label, s.levels.includes(id))),
    [choice('next', 'Дальше →')],
  ]) };
  if (s.step === 8) return { text: `${prefix}<b>Показывать акции продуктовых магазинов?</b>`, reply_markup: keyboard([[choice('offers:yes', '🛒 Да, раз в неделю')], [choice('offers:no', 'Нет')]]) };
  return { text: `${prefix}<b>Какие магазины вам интересны?</b>\nВыберите несколько и завершите настройку.`, reply_markup: keyboard([
    ...CHAINS.map(([id, label]) => [choice(`chain:${id}`, label, s.chains.includes(id))]),
    [choice('finish', '✅ Создать мою ленту')],
  ]) };
}

function applyOnboardingAction(state, action) {
  const s = { ...emptyOnboarding(), ...state, topics: [...(state.topics || [])], levels: [...(state.levels || [])], chains: [...(state.chains || [])] };
  const separator = String(action || '').indexOf(':');
  const kind = separator < 0 ? String(action || '') : String(action || '').slice(0, separator);
  const value = separator < 0 ? '' : String(action || '').slice(separator + 1);
  const toggle = (key, item) => { s[key] = s[key].includes(item) ? s[key].filter((x) => x !== item) : [...s[key], item]; };
  if (kind === 'topic') toggle('topics', value);
  else if (kind === 'level') toggle('levels', value);
  else if (kind === 'chain') toggle('chains', value);
  else if (kind === 'region') { s.region = value; s.step += 1; }
  else if (kind === 'frequency') { s.frequency = value; s.step += 1; }
  else if (kind === 'max') { s.maxPosts = Number(value) || 5; s.step += 1; }
  else if (kind === 'time') { s.time = value; s.step += 1; }
  else if (kind === 'importance') { s.importance = value; s.step += 1; }
  else if (kind === 'word') { s.word = value === 'yes'; s.step += 1; }
  else if (kind === 'offers') {
    s.offers = value === 'yes';
    if (s.offers) s.step += 1;
    else s.chains = [];
  }
  else if (kind === 'next') { if (s.step === 0 && !s.topics.length) return { state: s, error: 'Выберите хотя бы одну тему.' }; if (s.step === 7 && !s.levels.length) return { state: s, error: 'Выберите хотя бы один уровень.' }; s.step += 1; }
  return { state: s, finished: kind === 'finish' || (kind === 'offers' && value === 'no') };
}

function onboardingSummary(state, accountUrl) {
  const topicNames = TOPICS.filter(([id]) => state.topics.includes(id)).map(([, name]) => name.replace(/^\S+\s/, '')).join(', ');
  const accountLink = `${String(accountUrl).replace(/\/$/, '')}/account`;
  return [
    '✅ <b>Ваша персональная лента готова</b>',
    `Темы: ${topicNames || 'главные новости'}`,
    `Доставка: ${state.frequency === 'instant' ? 'сразу' : `ежедневно в ${state.time}`}, до ${state.maxPosts} новостей`,
    `Слово дня: ${state.word ? 'включено' : 'выключено'} · Акции: ${state.offers ? 'включены' : 'выключены'}`,
    '',
    'Можно сразу нажать /today или задать вопрос боту.',
    '',
    '⚙️ <b>Хотите настроить ленту ещё точнее?</b>',
    'В личном кабинете на сайте можно выбрать конкретные источники новостей, дни и время доставки, тихие часы, регионы, уровни важности и другие параметры.',
    '',
    `Открыть личный кабинет: ${accountLink}`,
  ].join('\n');
}

module.exports = { TOPICS, CHAINS, emptyOnboarding, onboardingView, applyOnboardingAction, onboardingSummary };
