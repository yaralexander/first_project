const CATEGORY_SLUGS = {
  Политика: 'politika',
  Экономика: 'ekonomika',
  Иммиграция: 'immigratsiya',
  Работа: 'rabota',
  Общество: 'obshchestvo',
  Образование: 'obrazovanie',
  Россия: 'rossiya',
  Мир: 'mir',
};

const SLUG_CATEGORIES = Object.fromEntries(
  Object.entries(CATEGORY_SLUGS).map(([category, slug]) => [slug, category]),
);

function categoryToSlug(category) {
  return CATEGORY_SLUGS[category] || null;
}

function categoryFromSlug(slug) {
  return SLUG_CATEGORIES[slug] || null;
}

module.exports = { categories: Object.keys(CATEGORY_SLUGS), categoryFromSlug, categoryToSlug };
