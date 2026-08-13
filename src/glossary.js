// src/glossary.js
// Справочник устоявшихся русских написаний финских (и часто встречающихся
// зарубежных) имён, названий мест и организаций. Передаётся модели вместе
// с промптом, чтобы одно и то же имя не транслитерировалось по-разному в
// разных статьях (например, "Стубб" в одной новости и "Суббо" в другой).
//
// Это НЕ исчерпывающий список — RSS-лента каждый день приносит новые имена,
// которых здесь не будет. Модель по-прежнему транслитерирует остальные
// имена самостоятельно по общим правилам, единообразие которых уже не
// гарантировано на 100% для имён вне этого списка. Пополняйте список по
// мере того, как замечаете расхождения в реальных новостях.

const GLOSSARY = {
  // --- Политики Финляндии ---
  'Alexander Stubb': 'Александр Стубб',
  'Alexander Stubbin': 'Александра Стубба', // частый падеж в финских заголовках
  'Petteri Orpo': 'Петтери Орпо',
  'Riikka Purra': 'Риикка Пурра',
  'Mauri Peltokangas': 'Маури Пелтокангас',

  // --- Политические партии и государственные организации ---
  'Perussuomalaiset': '«Истинные финны» (Perussuomalaiset)',
  'Suomen Sosialidemokraattinen Puolue': 'Социал-демократическая партия Финляндии (SDP)',
  'SDP': 'SDP',
  'Kansallinen Kokoomus': 'Национальная коалиционная партия (Kokoomus)',
  'Keskusta': 'Финляндский центр (Keskusta)',
  'Vihreä liitto': '«Зелёный союз» (Vihreä liitto)',
  'Vasemmistoliitto': '«Левый союз» (Vasemmistoliitto)',
  'Svenska folkpartiet': 'Шведская народная партия (SFP)',
  'Kristillisdemokraatit': '«Христианские демократы» (Kristillisdemokraatit)',
  'Eduskunta': 'парламент Финляндии (Eduskunta)',

  // --- Мировые политики ---
  'Donald Trump': 'Дональд Трамп',
  'Vladimir Putin': 'Владимир Путин',
  'Viktor Orbán': 'Виктор Орбан',
  'Viktor Orban': 'Виктор Орбан',
  'Péter Magyar': 'Петер Мадьяр',
  'Peter Magyar': 'Петер Мадьяр',
  'Tamás Sulyok': 'Тамаш Шуйок',
  'Marine Le Pen': 'Марин Ле Пен',
  'Lindsey Graham': 'Линдси Грэм',
  'Andy Burnham': 'Энди Бёрнхэм',
  'Boris Nadezhdin': 'Борис Надеждин',

  // --- Спорт ---
  'Erling Haaland': 'Эрлинг Холанд',
  'Patrik Laine': 'Патрик Лайне',
  'Lamine Yamal': 'Ламин Ямаль',
  'Cristiano Ronaldo': 'Криштиану Роналду',
  'Conor McGregor': 'Конор Макгрегор',
  'Gianni Infantino': 'Джанни Инфантино',
  'Jarmo Kekäläinen': 'Ярмо Кекяляйнен',
  'Mikael Jantunen': 'Микаэль Янтунен',

  // --- Королевские особы ---
  'Mette-Marit': 'Метте-Марит',

  // --- Бизнес/скандалы ---
  'Aleksanteri Kivimäki': 'Александр Кивимяки',
  'Peter Nygård': 'Питер Нюгард',

  // --- Города и районы Финляндии ---
  'Helsinki': 'Хельсинки',
  'Espoo': 'Эспоо',
  'Tampere': 'Тампере',
  'Turku': 'Турку',
  'Oulu': 'Оулу',
  'Seinäjoki': 'Сейняйоки',
  'Munkkivuori': 'Мункквуори',
  'Munkkiniemi': 'Мунккиниеми',
  'Kempele': 'Кемпеле',
  'Kauklahti': 'Кауклахти',
  'Hanko': 'Ханко',

  // --- Организации/бренды (оставлять как есть, не переводить) ---
  'Vastaamo': 'Vastaamo',
  'Kesko': 'Kesko',
  'Paulig': 'Paulig',
};

// Формирует блок текста для системного промпта.
function formatGlossaryForPrompt() {
  const lines = Object.entries(GLOSSARY).map(([fi, ru]) => `${fi} → ${ru}`);
  return lines.join('\n');
}

const RUSSIAN_CORRECTIONS = Object.freeze([
  [/(?<![А-ЯЁа-яё])Перуссуомалайсет(?:а|ом|е|у)?(?![А-ЯЁа-яё])/giu, '«Истинные финны» (Perussuomalaiset)'],
  [/(?<![А-ЯЁа-яё])Перуссуомалайстен(?![А-ЯЁа-яё])/giu, 'партии «Истинные финны» (Perussuomalaiset)'],
  [/(?<![А-ЯЁа-яё])Маури\s+Пельтокангас(?![А-ЯЁа-яё])/giu, 'Маури Пелтокангас'],
  [/(?<![А-ЯЁа-яё])Мункkiniеми(?![А-ЯЁа-яё])/gu, 'Мунккиниеми'],
]);

function normalizeRussianProperNames(text) {
  let result = String(text || '');
  for (const [pattern, replacement] of RUSSIAN_CORRECTIONS) result = result.replace(pattern, replacement);
  return result;
}

function normalizeRussianArticle({ titleRu = '', summaryRu = '' } = {}) {
  return {
    titleRu: normalizeRussianProperNames(titleRu),
    summaryRu: normalizeRussianProperNames(summaryRu),
  };
}

module.exports = { GLOSSARY, formatGlossaryForPrompt, normalizeRussianArticle, normalizeRussianProperNames };
