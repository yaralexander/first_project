const PEOPLE = [
  {
    id: 'mika-poutala',
    aliases: ['Mika Poutala', 'Mika Poutalan', 'Мика Поутала', 'Мики Поуталы'],
    nameRu: 'Мика Поутала',
    shortRoleRu: 'министр по делам молодёжи, спорта и физической активности',
    descriptionRu: 'Финский политик от партии «Христианские демократы». С июня 2025 года отвечает в правительстве за молодёжную и спортивную политику. До политической карьеры был конькобежцем и участвовал в четырёх Олимпийских играх.',
    sourceUrl: 'https://valtioneuvosto.fi/en/governments-and-ministers/ministers/-/min/mika-poutala',
  },
];

function peopleForArticle(article = {}) {
  const text = [article.titleFi, article.summaryFi, article.titleRu, article.summaryRu].filter(Boolean).join(' ');
  const normalized = text.toLocaleLowerCase('fi-FI');
  return PEOPLE.filter((person) => person.aliases.some((alias) => normalized.includes(alias.toLocaleLowerCase('fi-FI'))));
}

function contextualTitle(article = {}) {
  const title = article.seoTitle || article.titleRu || article.titleFi || '';
  const person = peopleForArticle(article)[0];
  if (!person || title.includes('(') || title.toLocaleLowerCase('ru').includes(person.shortRoleRu.toLocaleLowerCase('ru'))) return title;
  const namePattern = new RegExp(person.nameRu.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
  if (!namePattern.test(title)) return title;
  return title.replace(namePattern, `${person.nameRu} (${person.shortRoleRu})`);
}

function contextualSummary(article = {}) {
  const summary = article.summaryRu || article.summaryFi || '';
  const people = peopleForArticle(article);
  if (!people.length) return summary;
  const context = people.map((person) => `${person.nameRu} — ${person.descriptionRu}`).join('\n\n');
  return `${summary.trim()}\n\n${context}`.trim();
}

module.exports = { PEOPLE, contextualSummary, contextualTitle, peopleForArticle };
