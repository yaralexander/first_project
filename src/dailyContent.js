// Calendar references:
// https://almanakka.helsinki.fi/fi/liputus-ja-juhlapaivat/liputuspaivat-2026/
// https://finlex.fi/fi/lainsaadanto/saadoskokoelma/1978/383
const WORDS = [
  ['sisu', 'стойкость, внутренняя сила', 'Suomalainen sisu auttaa vaikeina aikoina.', 'Финская стойкость помогает в трудные времена.'],
  ['arki', 'будни, повседневная жизнь', 'Hyvä arki syntyy pienistä asioista.', 'Хорошие будни складываются из мелочей.'],
  ['kiitos', 'спасибо', 'Kiitos avusta!', 'Спасибо за помощь!'],
  ['ystävä', 'друг', 'Ystävä kulkee rinnalla.', 'Друг идёт рядом.'],
  ['rauha', 'мир, спокойствие', 'Luonto tuo rauhaa.', 'Природа приносит спокойствие.'],
  ['onni', 'счастье, удача', 'Onni löytyy usein läheltä.', 'Счастье часто находится рядом.'],
  ['koti', 'дом', 'Koti on tärkeä paikka.', 'Дом — важное место.'],
  ['valo', 'свет', 'Keväällä valo lisääntyy.', 'Весной света становится больше.'],
  ['luonto', 'природа', 'Suomen luonto on monimuotoinen.', 'Природа Финляндии разнообразна.'],
  ['yhdessä', 'вместе', 'Yhdessä onnistumme paremmin.', 'Вместе мы добиваемся большего.'],
  ['tervetuloa', 'добро пожаловать', 'Tervetuloa Suomeen!', 'Добро пожаловать в Финляндию!'],
  ['hyvinvointi', 'благополучие', 'Uni tukee hyvinvointia.', 'Сон поддерживает благополучие.'],
];

const FLAG_DAYS = new Map([
  ['02-03', 'День Алвара и Айно Аалто, финской архитектуры и дизайна'],
  ['02-05', 'День Рунеберга'],
  ['02-06', 'Национальный день саамов'],
  ['02-28', 'День Калевалы и финской культуры'],
  ['03-19', 'День Минны Кант и равноправия'],
  ['04-09', 'День Микаэля Агриколы и финского языка'],
  ['04-27', 'Национальный день ветеранов'],
  ['05-01', 'Ваппу — День финского труда'],
  ['05-09', 'День Европы'],
  ['05-12', 'День Снелльмана и финской идентичности'],
  ['06-04', 'День флага Сил обороны Финляндии'],
  ['07-06', 'День Эйно Лейно, поэзии и лета'],
  ['10-10', 'День Алексиса Киви и финской литературы'],
  ['10-24', 'День Организации Объединённых Наций'],
  ['11-06', 'День шведского наследия'],
  ['11-20', 'День прав ребёнка'],
  ['12-06', 'День независимости Финляндии'],
  ['12-08', 'День Яна Сибелиуса и финской музыки'],
]);

const FIXED_HOLIDAYS = new Map([
  ['01-01', ['Новый год', 'Uudenvuodenpäivä']],
  ['01-06', ['Крещение', 'Loppiainen']],
  ['05-01', ['Ваппу', 'Vappu']],
  ['12-06', ['День независимости Финляндии', 'Itsenäisyyspäivä']],
  ['12-24', ['Сочельник', 'Jouluaatto']],
  ['12-25', ['Рождество', 'Joulupäivä']],
  ['12-26', ['День святого Стефана', 'Tapaninpäivä']],
]);

function helsinkiDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

function dateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function monthDay(parts) {
  return `${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function shiftedDateKey(date, days) {
  const shifted = new Date(date.getTime() + days * 86400000);
  return shifted.toISOString().slice(0, 10);
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const day = 1 + ((7 + weekday - first.getUTCDay()) % 7) + (nth - 1) * 7;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function saturdayInRange(year, month, startDay, endDay) {
  for (let day = startDay; day <= endDay; day += 1) {
    if (new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() === 6) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return '';
}

function movableDays(year) {
  const easter = easterSunday(year);
  return new Map([
    [shiftedDateKey(easter, -2), ['Страстная пятница', 'Pitkäperjantai']],
    [shiftedDateKey(easter, 0), ['Пасха', 'Pääsiäispäivä']],
    [shiftedDateKey(easter, 1), ['Второй день Пасхи', 'Toinen pääsiäispäivä']],
    [shiftedDateKey(easter, 39), ['Вознесение', 'Helatorstai']],
    [shiftedDateKey(easter, 49), ['Троица', 'Helluntai']],
    [saturdayInRange(year, 6, 20, 26), ['Юханнус — праздник середины лета', 'Juhannuspäivä']],
    [saturdayInRange(year, 10, 31, 31) || saturdayInRange(year, 11, 1, 6), ['День всех святых', 'Pyhäinpäivä']],
  ]);
}

function contentForDate(now = new Date()) {
  const parts = helsinkiDateParts(now);
  const key = dateKey(parts);
  const md = monthDay(parts);
  const dayNumber = Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000);
  const word = WORDS[((dayNumber % WORDS.length) + WORDS.length) % WORDS.length];
  const content = [{
    type: 'word',
    key: `word:${key}`,
    title: `💬 Слово дня: ${word[0]}`,
    message: `${word[0]} — ${word[1]}.\n\n🇫🇮 ${word[2]}\n🇷🇺 ${word[3]}`,
  }];
  const flagName = FLAG_DAYS.get(md)
    || (key === nthWeekdayOfMonth(parts.year, 5, 0, 2) ? 'День матери' : '')
    || (key === nthWeekdayOfMonth(parts.year, 11, 0, 2) ? 'День отца' : '')
    || (key === saturdayInRange(parts.year, 6, 20, 26) ? 'Юханнус — День флага Финляндии' : '');
  if (flagName) {
    content.push({
      type: 'flag_days',
      key: `flag:${key}`,
      title: `🇫🇮 Сегодня в Финляндии поднимают флаг`,
      message: `${flagName}.\n\nLiputuspäivä — день, когда по всей Финляндии можно увидеть государственные флаги.`,
    });
  }
  const holiday = FIXED_HOLIDAYS.get(md) || movableDays(parts.year).get(key);
  if (holiday) {
    content.push({
      type: 'holidays',
      key: `holiday:${key}`,
      title: `🎉 Сегодня в Финляндии: ${holiday[0]}`,
      message: `${holiday[1]} — ${holiday[0]}.\n\nПроверьте расписание магазинов, транспорта и государственных служб: в праздничный день оно может отличаться.`,
    });
  }
  return content;
}

function buildDailyContentMessage(item, siteUrl) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  return `${item.title}\n\n${item.message}\n\nПодробнее о Финляндии: ${base}/`;
}

module.exports = {
  buildDailyContentMessage,
  contentForDate,
  easterSunday,
  helsinkiDateParts,
};
