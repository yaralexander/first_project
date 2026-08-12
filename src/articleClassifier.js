const DEFAULT_CATEGORY_TERMS = Object.freeze({
  politics: ['hallitus', 'eduskunta', 'ministeri', 'presidentti', 'puolue', 'vaalit', 'laki', 'политик', 'правительств', 'министр', 'парламент', 'выбор'],
  economy: ['talous', 'osake', 'pörssi', 'yritys', 'inflaatio', 'korko', 'vero', 'budjetti', 'экономик', 'бизнес', 'компани', 'инфляц', 'налог', 'бюджет'],
  immigration: ['maahanmuutto', 'oleskelulupa', 'turvapaikka', 'ulkomaalais', 'kansalaisuus', 'viisumi', 'иммиграц', 'мигрант', 'вид на жительство', 'гражданств', 'виз'],
  work: ['työpaikka', 'työntekijä', 'rekrytointi', 'palkka', 'ura', 'kausityö', 'работ', 'зарплат', 'ваканси', 'трудоустрой'],
  society: ['kunta', 'kaupunki', 'terveys', 'sosiaali', 'liikenne', 'sää', 'общество', 'город', 'здоров', 'социальн', 'транспорт', 'погод'],
  education: ['koulu', 'yliopisto', 'opiskelija', 'koulutus', 'tutkimus', 'opetus', 'образован', 'школ', 'университет', 'студент', 'обучен'],
  russia: ['venäjä', 'venäläis', 'putin', 'moskova', 'ukraina', 'росси', 'путин', 'москв', 'украин'],
  world: ['yhdysvallat', 'kiina', 'euroopan', 'kansainvälinen', 'сша', 'китай', 'европ', 'международ', 'миров'],
});

const DEFAULT_AUDIENCE_TERMS = Object.freeze({
  families: ['семь', 'дет', 'ребен', 'perhe', 'laps'],
  students: ['студент', 'учащ', 'opiskelija', 'koulutus', 'университет'],
  workers: ['работ', 'зарплат', 'työ', 'palkka', 'сотрудник'],
  entrepreneurs: ['бизнес', 'предприним', 'yritys', 'yrittäj', 'компани'],
  immigrants: ['иммиграц', 'мигрант', 'гражданств', 'вид на жительство', 'maahanmuutto', 'oleskelulupa', 'turvapaikka'],
});

const DEFAULT_REGION_TERMS = Object.freeze({
  uusimaa: ['uusimaa', 'helsinki', 'helsing', 'espoo', 'vantaa', 'хельсинк', 'эспоо', 'вантаа'],
  pirkanmaa: ['pirkanmaa', 'tampere', 'тампере'],
  'varsinais-suomi': ['varsinais-suomi', 'turku', 'турку'],
  'pohjois-pohjanmaa': ['pohjois-pohjanmaa', 'oulu', 'оулу'],
  lappi: ['lappi', 'rovaniemi', 'лапланд', 'рованиеми'],
});

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/[«»“”„"'`(){}[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTerms(...values) {
  return [...new Set(values
    .flatMap((value) => String(value || '').split(/[,;\n|]+/))
    .map(normalize)
    .filter((value) => value.length >= 3))];
}

function scoreTerms(text, terms, weight = 1) {
  const matches = terms.filter((term) => {
    if (text.includes(term)) return true;
    const meaningfulWords = term.split(/\s+/).filter((word) => word.length >= 3);
    return meaningfulWords.length > 1
      && meaningfulWords.every((word) => text.includes(word));
  });
  return { score: matches.length * weight, matches };
}

function rank(items, scorer) {
  return items
    .map((item) => ({ item, ...scorer(item) }))
    .sort((left, right) => right.score - left.score || left.item.id - right.item.id);
}

function classifyArticle(article, taxonomy) {
  const text = normalize([
    article.titleRu,
    article.summaryRu,
    article.titleFi,
    article.summaryFi,
  ].filter(Boolean).join(' '));

  const categoryRanking = rank(taxonomy.categories || [], (category) => {
    const configured = splitTerms(
      category.name,
      category.synonyms,
      category.keywords,
      category.classificationRules,
    );
    const defaults = DEFAULT_CATEGORY_TERMS[category.code] || [];
    const configuredScore = scoreTerms(text, configured, 2);
    const defaultScore = scoreTerms(text, defaults, 1);
    return {
      score: configuredScore.score + defaultScore.score,
      matches: [...configuredScore.matches, ...defaultScore.matches],
    };
  });
  const selectedCategory = categoryRanking.find((entry) => entry.score > 0)?.item
    || taxonomy.categories?.find((category) => category.name === article.category)
    || taxonomy.categories?.find((category) => category.code === 'society')
    || taxonomy.categories?.[0]
    || null;
  const categoryScore = categoryRanking.find((entry) => entry.item.id === selectedCategory?.id)?.score || 0;

  const tagRanking = rank(taxonomy.tags || [], (tag) => {
    const result = scoreTerms(text, splitTerms(tag.name, tag.aliases, tag.description), 1);
    return result;
  });
  const tags = tagRanking.filter((entry) => entry.score > 0).slice(0, 5);

  const regionRanking = rank(
    (taxonomy.regions || []).filter((region) => !['finland', 'international'].includes(region.code)),
    (region) => scoreTerms(text, splitTerms(region.name, region.code, DEFAULT_REGION_TERMS[region.code] || []), 1),
  );
  const matchedRegion = regionRanking.find((entry) => entry.score > 0)?.item;
  const fallbackRegionCode = ['world', 'russia'].includes(selectedCategory?.code) ? 'international' : 'finland';
  const region = matchedRegion
    || taxonomy.regions?.find((item) => item.code === fallbackRegionCode)
    || taxonomy.regions?.[0]
    || null;

  const audienceRanking = rank(
    (taxonomy.audiences || []).filter((audience) => audience.code !== 'all'),
    (audience) => scoreTerms(
      text,
      splitTerms(audience.name, audience.description, DEFAULT_AUDIENCE_TERMS[audience.code] || []),
      1,
    ),
  );
  const audiences = audienceRanking.filter((entry) => entry.score > 0).slice(0, 3);
  const allAudience = taxonomy.audiences?.find((audience) => audience.code === 'all');
  if (allAudience) audiences.unshift({ item: allAudience, score: 1, matches: [] });

  const evidenceCount = categoryScore + tags.reduce((sum, entry) => sum + entry.score, 0)
    + (matchedRegion ? 1 : 0) + Math.max(0, audiences.length - (allAudience ? 1 : 0));
  const confidence = Math.min(0.98, Math.max(0.35, 0.45 + evidenceCount * 0.06));
  const categoryMatches = categoryRanking
    .find((entry) => entry.item.id === selectedCategory?.id)?.matches || [];
  const explanationParts = [
    `Категория «${selectedCategory?.name || article.category || 'Общество'}»`,
    categoryMatches.length
      ? `совпали признаки: ${categoryMatches.slice(0, 4).join(', ')}`
      : 'выбрана по текущей категории или как безопасная категория по умолчанию',
    region ? `регион: ${region.name}` : '',
    tags.length ? `теги: ${tags.map((entry) => entry.item.name).join(', ')}` : '',
    audiences.length ? `аудитории: ${audiences.map((entry) => entry.item.name).join(', ')}` : '',
  ].filter(Boolean);

  return {
    category: selectedCategory?.name || article.category || 'Общество',
    categoryId: selectedCategory?.id || null,
    regionCode: region?.code || fallbackRegionCode,
    tagIds: tags.map((entry) => entry.item.id),
    audienceIds: audiences.map((entry) => entry.item.id),
    confidence: Number(confidence.toFixed(2)),
    explanation: `${explanationParts.join('; ')}.`,
    evidence: {
      categoryMatches,
      tagIds: tags.map((entry) => entry.item.id),
      regionCode: region?.code || fallbackRegionCode,
      audienceIds: audiences.map((entry) => entry.item.id),
    },
  };
}

module.exports = {
  classifyArticle,
  normalize,
  splitTerms,
};
