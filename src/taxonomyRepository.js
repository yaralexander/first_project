const TAXONOMY_TYPES = Object.freeze({
  categories: {
    table: 'managed_categories',
    select: 'id, code, name, slug, emoji, color, description, synonyms, keywords, classification_rules, sort_order, is_visible, is_system, created_at, updated_at',
  },
  tags: {
    table: 'managed_tags',
    select: 'id, name, slug, description, aliases, is_visible, created_at, updated_at',
  },
  regions: {
    table: 'managed_regions',
    select: 'id, code, name, region_type, parent_code, sort_order, is_visible, created_at, updated_at',
  },
  audiences: {
    table: 'managed_audiences',
    select: 'id, code, name, description, sort_order, is_visible, created_at, updated_at',
  },
});

function taxonomyConfig(type) {
  const config = TAXONOMY_TYPES[type];
  if (!config) throw new Error('Неизвестный тип справочника.');
  return config;
}

function normalizeText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeSlug(value) {
  return normalizeText(value, 100)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeCode(value) {
  return normalizeText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeSortOrder(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 0), 10000) : 100;
}

function replaceCsvValue(value, source, target) {
  const result = [];
  const seen = new Set();
  String(value || '').split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => {
    const next = item === source ? target : item;
    if (!seen.has(next)) {
      seen.add(next);
      result.push(next);
    }
  });
  return result.join(',');
}

function mapRow(type, row) {
  if (!row) return null;
  const common = {
    id: row.id,
    name: row.name,
    description: row.description || '',
    isVisible: Boolean(row.is_visible),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (type === 'categories') {
    return {
      ...common,
      code: row.code,
      slug: row.slug,
      emoji: row.emoji || '',
      color: row.color || '',
      synonyms: row.synonyms || '',
      keywords: row.keywords || '',
      classificationRules: row.classification_rules || '',
      sortOrder: row.sort_order,
      isSystem: Boolean(row.is_system),
    };
  }
  if (type === 'tags') {
    return { ...common, slug: row.slug, aliases: row.aliases || '' };
  }
  if (type === 'regions') {
    return {
      ...common,
      code: row.code,
      regionType: row.region_type,
      parentCode: row.parent_code || '',
      sortOrder: row.sort_order,
    };
  }
  return { ...common, code: row.code, sortOrder: row.sort_order };
}

function createTaxonomyRepository(db) {
  function list(type, { includeHidden = true } = {}) {
    const config = taxonomyConfig(type);
    const visibility = includeHidden ? '' : ' WHERE is_visible = 1';
    const order = type === 'tags' ? 'name COLLATE NOCASE, id' : 'sort_order, name COLLATE NOCASE, id';
    return db.prepare(`SELECT ${config.select} FROM ${config.table}${visibility} ORDER BY ${order}`)
      .all()
      .map((row) => mapRow(type, row));
  }

  function getById(type, id) {
    const config = taxonomyConfig(type);
    return mapRow(type, db.prepare(`SELECT ${config.select} FROM ${config.table} WHERE id = ?`).get(id));
  }

  function create(type, input) {
    const name = normalizeText(input.name, 120);
    if (!name) throw new Error('Название обязательно.');
    if (type === 'categories') {
      const slug = normalizeSlug(input.slug);
      const code = normalizeCode(input.code || slug);
      if (!slug || !code) throw new Error('Укажите корректный slug латиницей.');
      return db.prepare(`
        INSERT INTO managed_categories
          (code, name, slug, emoji, color, description, synonyms, keywords, classification_rules, sort_order, is_visible, is_system)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
      `).run(
        code, name, slug, normalizeText(input.emoji, 16), normalizeText(input.color, 20),
        normalizeText(input.description, 1000), normalizeText(input.synonyms, 1000),
        normalizeText(input.keywords, 1000), normalizeText(input.classificationRules, 2000),
        normalizeSortOrder(input.sortOrder),
      ).lastInsertRowid;
    }
    if (type === 'tags') {
      const slug = normalizeSlug(input.slug);
      if (!slug) throw new Error('Укажите корректный slug латиницей.');
      return db.prepare(`
        INSERT INTO managed_tags (name, slug, description, aliases, is_visible)
        VALUES (?, ?, ?, ?, 1)
      `).run(name, slug, normalizeText(input.description, 1000), normalizeText(input.aliases, 1000)).lastInsertRowid;
    }
    const code = normalizeCode(input.code);
    if (!code) throw new Error('Укажите корректный код латиницей.');
    if (type === 'regions') {
      return db.prepare(`
        INSERT INTO managed_regions (code, name, region_type, parent_code, sort_order, is_visible)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(
        code, name, normalizeCode(input.regionType) || 'region',
        normalizeCode(input.parentCode) || null, normalizeSortOrder(input.sortOrder),
      ).lastInsertRowid;
    }
    return db.prepare(`
      INSERT INTO managed_audiences (code, name, description, sort_order, is_visible)
      VALUES (?, ?, ?, ?, 1)
    `).run(code, name, normalizeText(input.description, 1000), normalizeSortOrder(input.sortOrder)).lastInsertRowid;
  }

  function update(type, id, input) {
    const existing = getById(type, id);
    if (!existing) return false;
    const name = normalizeText(input.name, 120);
    if (!name) throw new Error('Название обязательно.');
    if (type === 'categories') {
      const lockedIdentity = existing.isSystem || usage(type, id).total > 0;
      const slug = lockedIdentity ? existing.slug : normalizeSlug(input.slug);
      if (!slug) throw new Error('Укажите корректный slug латиницей.');
      const storedName = lockedIdentity ? existing.name : name;
      return db.prepare(`
        UPDATE managed_categories SET name = ?, slug = ?, emoji = ?, color = ?, description = ?,
          synonyms = ?, keywords = ?, classification_rules = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        storedName, slug, normalizeText(input.emoji, 16), normalizeText(input.color, 20),
        normalizeText(input.description, 1000), normalizeText(input.synonyms, 1000),
        normalizeText(input.keywords, 1000), normalizeText(input.classificationRules, 2000),
        normalizeSortOrder(input.sortOrder), id,
      ).changes === 1;
    }
    if (type === 'tags') {
      const slug = usage(type, id).total > 0 ? existing.slug : normalizeSlug(input.slug);
      if (!slug) throw new Error('Укажите корректный slug латиницей.');
      return db.prepare(`
        UPDATE managed_tags SET name = ?, slug = ?, description = ?, aliases = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, slug, normalizeText(input.description, 1000), normalizeText(input.aliases, 1000), id).changes === 1;
    }
    if (type === 'regions') {
      return db.prepare(`
        UPDATE managed_regions SET name = ?, region_type = ?, parent_code = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name, normalizeCode(input.regionType) || existing.regionType,
        normalizeCode(input.parentCode) || null, normalizeSortOrder(input.sortOrder), id,
      ).changes === 1;
    }
    return db.prepare(`
      UPDATE managed_audiences SET name = ?, description = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, normalizeText(input.description, 1000), normalizeSortOrder(input.sortOrder), id).changes === 1;
  }

  function setVisibility(type, id, isVisible) {
    const config = taxonomyConfig(type);
    const item = getById(type, id);
    if (!item) return false;
    if (type === 'categories' && isVisible) {
      const alias = db.prepare(`
        SELECT old_slug
        FROM category_slug_aliases
        WHERE old_slug = ?
        LIMIT 1
      `).get(item.slug);
      if (alias) {
        const error = new Error('Объединённую категорию нельзя снова показывать отдельно.');
        error.code = 'CATEGORY_MERGED';
        throw error;
      }
    }
    return db.prepare(`
      UPDATE ${config.table} SET is_visible = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(isVisible ? 1 : 0, id).changes === 1;
  }

  function csvUsage(column, value) {
    return db.prepare(`
      SELECT COUNT(*) AS count FROM user_subscriptions
      WHERE (',' || replace(${column}, ' ', '') || ',') LIKE ?
    `).get(`%,${value},%`).count;
  }

  function usage(type, id) {
    const item = getById(type, id);
    if (!item) return { total: 0, articles: 0, subscriptions: 0 };
    let articles = 0;
    let subscriptions = 0;
    if (type === 'categories') {
      articles = db.prepare('SELECT COUNT(*) AS count FROM articles WHERE category = ?').get(item.name).count;
      subscriptions = csvUsage('categories', item.name) + csvUsage('excluded_categories', item.name);
    } else if (type === 'tags') {
      articles = db.prepare('SELECT COUNT(*) AS count FROM article_tags WHERE tag_id = ?').get(id).count;
      subscriptions = csvUsage('tag_ids', String(id));
    } else if (type === 'regions') {
      articles = db.prepare('SELECT COUNT(*) AS count FROM articles WHERE region_code = ?').get(item.code).count;
      subscriptions = csvUsage('region_codes', item.code);
    } else {
      articles = db.prepare('SELECT COUNT(*) AS count FROM article_audiences WHERE audience_id = ?').get(id).count;
      subscriptions = csvUsage('audience_codes', item.code);
    }
    return { total: articles + subscriptions, articles, subscriptions };
  }

  function remove(type, id) {
    const config = taxonomyConfig(type);
    const item = getById(type, id);
    if (!item) return { deleted: false, reason: 'not_found', usage: { total: 0, articles: 0, subscriptions: 0 } };
    const currentUsage = usage(type, id);
    if ((type === 'categories' && item.isSystem) || currentUsage.total > 0) {
      return {
        deleted: false,
        reason: type === 'categories' && item.isSystem ? 'system' : 'in_use',
        usage: currentUsage,
      };
    }
    return {
      deleted: db.prepare(`DELETE FROM ${config.table} WHERE id = ?`).run(id).changes === 1,
      reason: null,
      usage: currentUsage,
    };
  }

  function categoryBySlug(slug) {
    return mapRow('categories', db.prepare(`
      SELECT ${TAXONOMY_TYPES.categories.select}
      FROM managed_categories WHERE slug = ? AND is_visible = 1
    `).get(normalizeSlug(slug)));
  }

  function categoryByName(name) {
    return mapRow('categories', db.prepare(`
      SELECT ${TAXONOMY_TYPES.categories.select}
      FROM managed_categories WHERE name = ? AND is_visible = 1
    `).get(normalizeText(name, 120)));
  }

  function categoryResolution(slug) {
    const normalized = normalizeSlug(slug);
    if (!normalized) return null;
    const alias = db.prepare(`
      SELECT ${TAXONOMY_TYPES.categories.select}
      FROM managed_categories
      WHERE id = (
        SELECT category_id FROM category_slug_aliases WHERE old_slug = ?
      ) AND is_visible = 1
    `).get(normalized);
    if (alias) {
      const category = mapRow('categories', alias);
      return { category, isAlias: true, canonicalSlug: category.slug };
    }
    const category = categoryBySlug(normalized);
    return category ? { category, isAlias: false, canonicalSlug: category.slug } : null;
  }

  function mergeCategories(sourceId, targetId, actor = '') {
    const source = getById('categories', sourceId);
    const target = getById('categories', targetId);
    if (!source || !target) throw new Error('Категория не найдена.');
    if (source.id === target.id) throw new Error('Нельзя объединить категорию с самой собой.');
    if (!target.isVisible) throw new Error('Категория назначения должна быть видимой.');

    const merge = db.transaction(() => {
      const articleChanges = db.prepare(
        'UPDATE articles SET category = ? WHERE category = ?',
      ).run(target.name, source.name).changes;
      const subscriptions = db.prepare(`
        SELECT id, categories, excluded_categories
        FROM user_subscriptions
      `).all().filter((subscription) => {
        const selected = String(subscription.categories || '').split(',').map((item) => item.trim());
        const excluded = String(subscription.excluded_categories || '').split(',').map((item) => item.trim());
        return selected.includes(source.name) || excluded.includes(source.name);
      });
      const updateSubscription = db.prepare(`
        UPDATE user_subscriptions
        SET categories = ?, excluded_categories = ?
        WHERE id = ?
      `);
      subscriptions.forEach((subscription) => {
        updateSubscription.run(
          replaceCsvValue(subscription.categories, source.name, target.name),
          replaceCsvValue(subscription.excluded_categories, source.name, target.name),
          subscription.id,
        );
      });
      const repointedAliases = db.prepare(`
        UPDATE category_slug_aliases SET category_id = ? WHERE category_id = ?
      `).run(target.id, source.id).changes;
      db.prepare(`
        INSERT INTO category_slug_aliases (old_slug, category_id, created_by)
        VALUES (?, ?, ?)
        ON CONFLICT(old_slug) DO UPDATE SET
          category_id = excluded.category_id,
          created_by = excluded.created_by,
          created_at = CURRENT_TIMESTAMP
      `).run(source.slug, target.id, normalizeText(actor, 160) || null);
      db.prepare(`
        UPDATE managed_categories
        SET is_visible = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(source.id);
      return {
        source: { id: source.id, name: source.name, slug: source.slug },
        target: { id: target.id, name: target.name, slug: target.slug },
        articles: articleChanges,
        subscriptions: subscriptions.length,
        aliases: repointedAliases + 1,
      };
    });
    return merge();
  }

  return {
    categoryByName,
    categoryResolution,
    categoryBySlug,
    create,
    getById,
    list,
    mergeCategories,
    remove,
    setVisibility,
    update,
    usage,
  };
}

module.exports = {
  TAXONOMY_TYPES,
  createTaxonomyRepository,
  normalizeCode,
  normalizeSlug,
  replaceCsvValue,
};
