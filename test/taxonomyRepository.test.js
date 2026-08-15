const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { applyFoundationSchema } = require('../src/schemaFoundation');
const { createTaxonomyRepository } = require('../src/taxonomyRepository');

function createTestDatabase() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE articles (
      id INTEGER PRIMARY KEY,
      category TEXT,
      region_code TEXT
    );

    CREATE TABLE user_subscriptions (
      id INTEGER PRIMARY KEY,
      categories TEXT NOT NULL DEFAULT '',
      excluded_categories TEXT NOT NULL DEFAULT '',
      tag_ids TEXT NOT NULL DEFAULT '',
      region_codes TEXT NOT NULL DEFAULT '',
      audience_codes TEXT NOT NULL DEFAULT ''
    );
  `);
  applyFoundationSchema(db);
  return db;
}

test('справочники создаются с системными категориями, регионами и аудиториями', () => {
  const db = createTestDatabase();
  const repository = createTaxonomyRepository(db);

  assert.equal(repository.list('categories').length, 9);
  assert.equal(repository.list('regions').length, 2);
  assert.equal(repository.list('audiences').length, 6);
  assert.equal(repository.list('tags').length, 0);
  assert.equal(repository.categoryBySlug('politika').name, 'Политика');
  assert.equal(repository.categoryBySlug('proisshestviya').name, 'Происшествия');

  db.close();
});

test('редактор может создать, изменить, скрыть и удалить неиспользуемую запись', () => {
  const db = createTestDatabase();
  const repository = createTaxonomyRepository(db);

  const id = Number(repository.create('tags', {
    name: 'Транспорт',
    slug: 'transport',
    description: 'Новости транспорта',
    aliases: 'дороги, поезда',
  }));

  assert.equal(repository.getById('tags', id).name, 'Транспорт');
  assert.equal(repository.update('tags', id, {
    name: 'Транспорт Финляндии',
    slug: 'transport-finland',
    description: 'Автомобили, дороги и общественный транспорт',
    aliases: 'дороги, поезда, автобусы',
  }), true);
  assert.equal(repository.getById('tags', id).slug, 'transport-finland');

  assert.equal(repository.setVisibility('tags', id, false), true);
  assert.equal(repository.list('tags', { includeHidden: false }).length, 0);
  assert.equal(repository.getById('tags', id).isVisible, false);

  assert.deepEqual(repository.remove('tags', id), {
    deleted: true,
    reason: null,
    usage: { total: 0, articles: 0, subscriptions: 0 },
  });
  assert.equal(repository.getById('tags', id), null);

  db.close();
});

test('системную категорию нельзя удалить или переименовать', () => {
  const db = createTestDatabase();
  const repository = createTaxonomyRepository(db);
  const category = repository.categoryBySlug('politika');

  assert.equal(repository.update('categories', category.id, {
    name: 'Новое название',
    slug: 'new-slug',
    emoji: '🗳',
    color: '#123456',
    sortOrder: 11,
  }), true);
  assert.equal(repository.getById('categories', category.id).name, 'Политика');
  assert.equal(repository.getById('categories', category.id).slug, 'politika');

  assert.deepEqual(repository.remove('categories', category.id), {
    deleted: false,
    reason: 'system',
    usage: { total: 0, articles: 0, subscriptions: 0 },
  });

  db.close();
});

test('используемые справочники защищены от удаления', () => {
  const db = createTestDatabase();
  const repository = createTaxonomyRepository(db);

  const regionId = Number(repository.create('regions', {
    name: 'Уусимаа',
    code: 'uusimaa',
    regionType: 'region',
    parentCode: 'finland',
    sortOrder: 30,
  }));
  db.prepare('INSERT INTO articles (category, region_code) VALUES (?, ?)').run('Общество', 'uusimaa');

  assert.deepEqual(repository.remove('regions', regionId), {
    deleted: false,
    reason: 'in_use',
    usage: { total: 1, articles: 1, subscriptions: 0 },
  });

  const audienceId = Number(repository.create('audiences', {
    name: 'Путешественники',
    code: 'travellers',
    sortOrder: 70,
  }));
  db.prepare('INSERT INTO user_subscriptions (audience_codes) VALUES (?)').run('all,travellers');

  assert.deepEqual(repository.remove('audiences', audienceId), {
    deleted: false,
    reason: 'in_use',
    usage: { total: 1, articles: 0, subscriptions: 1 },
  });

  db.close();
});

test('объединение категорий переносит статьи и подписки, сохраняя старый URL как алиас', () => {
  const db = createTestDatabase();
  const repository = createTaxonomyRepository(db);
  const source = repository.categoryBySlug('politika');
  const target = repository.categoryBySlug('obshchestvo');

  db.prepare('INSERT INTO articles (category, region_code) VALUES (?, ?)').run(source.name, 'finland');
  db.prepare(`
    INSERT INTO user_subscriptions (categories, excluded_categories)
    VALUES (?, ?)
  `).run(`${source.name},${target.name}`, source.name);

  const result = repository.mergeCategories(source.id, target.id, 'chief@example.com');

  assert.equal(result.articles, 1);
  assert.equal(result.subscriptions, 1);
  assert.equal(db.prepare('SELECT category FROM articles').get().category, target.name);
  assert.deepEqual(
    db.prepare('SELECT categories, excluded_categories FROM user_subscriptions').get(),
    { categories: target.name, excluded_categories: target.name },
  );
  assert.equal(repository.getById('categories', source.id).isVisible, false);
  assert.throws(
    () => repository.setVisibility('categories', source.id, true),
    (error) => error.code === 'CATEGORY_MERGED',
  );
  assert.equal(repository.categoryBySlug(source.slug), null);
  assert.deepEqual(repository.categoryResolution(source.slug), {
    category: repository.categoryBySlug(target.slug),
    isAlias: true,
    canonicalSlug: target.slug,
  });
  assert.deepEqual(repository.categoryResolution(target.slug), {
    category: repository.categoryBySlug(target.slug),
    isAlias: false,
    canonicalSlug: target.slug,
  });

  const alias = db.prepare(`
    SELECT old_slug, category_id, created_by FROM category_slug_aliases
    WHERE old_slug = ?
  `).get(source.slug);
  assert.deepEqual(alias, {
    old_slug: source.slug,
    category_id: target.id,
    created_by: 'chief@example.com',
  });

  db.close();
});

test('повторное объединение переносит прежнюю цепочку алиасов на итоговую категорию', () => {
  const db = createTestDatabase();
  const repository = createTaxonomyRepository(db);
  const politics = repository.categoryBySlug('politika');
  const society = repository.categoryBySlug('obshchestvo');
  const world = repository.categoryBySlug('mir');

  repository.mergeCategories(politics.id, society.id, 'admin');
  repository.mergeCategories(society.id, world.id, 'admin');

  assert.equal(repository.categoryResolution('politika').canonicalSlug, 'mir');
  assert.equal(repository.categoryResolution('obshchestvo').canonicalSlug, 'mir');
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM category_slug_aliases WHERE category_id = ?').get(world.id).count,
    2,
  );

  db.close();
});
