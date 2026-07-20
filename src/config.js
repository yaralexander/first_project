// src/config.js
// Список источников. Каждый источник — это один RSS-канал.
// ВАЖНО про Ilta-Sanomat (is.fi): ссылка, которую вы дали
// (https://www.is.fi/info/art-2000009880115.html) — это НЕ сам RSS-фид,
// а информационная страница IS со списком их RSS-адресов вида
// https://www.is.fi/rss/<раздел>.xml (например, digitoday.xml — раздел про технологии).
// Откройте эту страницу в браузере, найдите там адрес фида с общими новостями
// (обычно называется что-то вроде "tuoreimmat" или "kotimaa") и подставьте его сюда.
// Ниже стоит правдоподобный адрес по умолчанию — его нужно проверить и при
// необходимости поправить.

const SOURCES = [
  {
    id: 'yle',
    name: 'YLE',
    url: 'https://yle.fi/rss/uutiset/paauutiset',
    homepage: 'https://yle.fi',
  },
  {
    id: 'hs',
    name: 'Helsingin Sanomat',
    url: 'https://www.hs.fi/rss/tuoreimmat.xml',
    homepage: 'https://www.hs.fi',
  },
  {
    id: 'il',
    name: 'Iltalehti',
    url: 'https://www.iltalehti.fi/rss/uutiset.xml',
    homepage: 'https://www.iltalehti.fi',
  },
  {
    id: 'is',
    name: 'Ilta-Sanomat',
    // ПРОВЕРЬТЕ этот адрес — см. комментарий выше.
    url: 'https://www.is.fi/rss/tuoreimmat.xml',
    homepage: 'https://www.is.fi',
  },
];

// Простая категоризация по ключевым словам в финском заголовке/описании.
// Это эвристика "лучше чем ничего" — при желании замените на вызов
// классификатора (например, отдельный промпт к LLM) для точности.
const CATEGORY_KEYWORDS = {
  'Политика': ['hallitus', 'eduskunta', 'ministeri', 'presidentti', 'puolue', 'vaalit', 'laki', 'nato'],
  'Экономика': ['talous', 'osake', 'pörssi', 'yritys', 'työttömyys', 'inflaatio', 'korko', 'vero', 'budjetti'],
  'Иммиграция': ['maahanmuutto', 'oleskelulupa', 'turvapaikka', 'ulkomaalais', 'kansalaisuus', 'viisumi'],
  'Работа': ['työpaikka', 'työntekijä', 'rekrytointi', 'palkka', 'ura', 'kausityö'],
  'Общество': ['kunta', 'kaupunki', 'koulu', 'terveys', 'sosiaali', 'liikenne', 'sää', 'ilmasto'],
  'Образование': ['yliopisto', 'opiskelija', 'koulutus', 'tutkimus', 'opetus'],
  'Россия': ['venäjä', 'venäläis', 'putin', 'moskova', 'ukraina'],
  'Мир': ['yhdysvallat', 'kiina', 'eu', 'euroopan', 'sota', 'kansainvälinen'],
};

function categorize(title = '', description = '') {
  const text = (title + ' ' + description).toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return category;
  }
  return 'Общество';
}

module.exports = { SOURCES, categorize };
