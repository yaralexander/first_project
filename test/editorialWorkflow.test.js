const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(os.tmpdir(), `finskienovosti-editorial-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = databasePath;

const db = require('../src/db');

test.after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(`${databasePath}${suffix}`);
    } catch {
      // The isolated test database may not have created every SQLite sidecar.
    }
  }
});

test('publishes a scheduled draft only when it becomes due', () => {
  const articleId = db.createManualArticle({
    title: 'Запланированная новость',
    body: 'Текст запланированной новости.',
    category: 'Общество',
    slug: 'scheduled-story',
    originalUrl: 'manual:scheduled-story',
    publishedAt: '2030-01-15T10:00:00.000Z',
    editorialStatus: 'important',
    pinnedUntil: null,
    scheduledPublishAt: '2030-01-15T10:00:00.000Z',
    publicationStatus: 'draft',
  });

  assert.equal(db.getArticleBySlug('scheduled-story'), null);
  assert.equal(db.publishScheduledArticles('2030-01-15T09:59:59.000Z').length, 0);
  assert.equal(db.publishScheduledArticles('2030-01-15T10:00:00.000Z').length, 1);
  assert.equal(db.getArticleBySlug('scheduled-story').id, articleId);
});

test('keeps a doubtful RSS article hidden until an editor approves publication', () => {
  const articleId = db.insertArticle({
    sourceId: 'yle',
    sourceName: 'YLE',
    originalUrl: 'https://example.test/quality-rss',
    externalGuid: 'quality-rss',
    slug: 'quality-rss',
    category: 'Общество',
    titleFi: 'Testiuutinen',
    summaryFi: 'Testiuutisen riittävän pitkä kuvaus laadunvalvonnan tarkistamista varten.',
    titleRu: '[RU] Тестовая новость',
    summaryRu: '[RU] Тестовый текст специально должен попасть в очередь ручной проверки качества.',
    translationMethod: 'mock',
    promptVersion: 1,
    publishedAt: '2030-01-15T12:00:00.000Z',
  });

  const pending = db.getArticleById(articleId);
  assert.equal(pending.qualityStatus, 'manual_review');
  assert.equal(pending.qualityPublishOnApproval, true);
  assert.equal(pending.publicationStatus, 'draft');
  assert.equal(db.getArticleBySlug('quality-rss'), null);

  const reviewed = db.reviewArticleQuality({
    id: articleId,
    decision: 'approve',
    category: 'Общество',
    importanceLevel: 3,
    reviewedBy: 'editor',
    note: 'Перевод проверен.',
  });
  assert.equal(reviewed.published, true);
  assert.equal(db.getArticleBySlug('quality-rss').qualityStatus, 'passed');
  assert.equal(db.reviewArticleQuality({
    id: articleId,
    decision: 'approve',
    category: 'Общество',
    importanceLevel: 3,
    reviewedBy: 'editor',
  }), false);
});

test('quality approval does not accidentally publish an imported editorial draft', () => {
  const articleId = db.createImportedDraft({
    sourceName: 'Example',
    originalUrl: 'https://example.test/quality-import',
    slug: 'quality-import',
    titleFi: 'Tuotu testiuutinen',
    summaryFi: 'Tuodun testiuutisen kuvaus.',
    titleRu: '[RU] Импортированный черновик',
    summaryRu: '[RU] Этот импортированный материал должен остаться черновиком после проверки качества.',
    translationMethod: 'mock',
    promptVersion: 1,
    importedAt: '2030-01-15T13:00:00.000Z',
  });

  const pending = db.getArticleById(articleId);
  assert.equal(pending.qualityStatus, 'manual_review');
  assert.equal(pending.qualityPublishOnApproval, false);

  const reviewed = db.reviewArticleQuality({
    id: articleId,
    decision: 'approve',
    category: 'Общество',
    importanceLevel: 2,
    reviewedBy: 'editor',
  });
  assert.equal(reviewed.published, false);
  assert.equal(db.getArticleById(articleId).publicationStatus, 'draft');
  assert.equal(db.getArticleBySlug('quality-import'), null);
});

test('stores duplicate decisions, audit entries and filtered statistics', () => {
  const matched = db.getArticleBySlug('scheduled-story');
  db.recordDuplicateArticle({
    originalUrl: 'https://example.test/duplicate',
    sourceId: 'yle',
    sourceName: 'YLE',
    titleFi: 'Sama uutinen',
    summaryFi: 'Lyhyt kuvaus.',
    externalGuid: 'duplicate-guid',
    category: 'Общество',
    publishedAt: '2030-01-15T11:00:00.000Z',
    matchedArticleId: matched.id,
    similarity: 0.94,
  });
  const duplicate = db.getRecentDuplicateArticles(1)[0];
  assert.equal(db.getDuplicateArticleById(duplicate.id).summaryFi, 'Lyhyt kuvaus.');
  assert.deepEqual(db.getArticleRankingSignals(matched.id), {
    independentSourceCount: 2,
    corroboratingMentions: 1,
  });
  assert.equal(db.resolveDuplicateArticle({ id: duplicate.id, resolution: 'published', resolvedBy: 'editor' }), true);

  db.recordAdminAction({
    actorUsername: 'editor',
    actorRole: 'editor',
    action: 'duplicate.publish_anyway',
    targetType: 'duplicate',
    targetId: duplicate.id,
    details: { articleId: matched.id },
  });
  const audit = db.getAdminAuditLog(1)[0];
  assert.equal(audit.actorUsername, 'editor');
  assert.equal(audit.details.articleId, matched.id);

  const statistics = db.getAdminStatistics({
    from: '2030-01-15',
    to: '2030-01-15',
    category: 'Общество',
    sourceId: 'editorial',
  });
  assert.equal(statistics.report.articles, 1);
  assert.equal(statistics.filters.sourceId, 'editorial');
  assert.ok(db.getAdminSources().some((source) => source.sourceId === 'editorial'));
});

test('consumes OAuth state once and stores only a hashed session token', () => {
  db.createAdminOAuthState({
    stateHash: 'state-hash',
    nonce: 'nonce',
    codeVerifier: 'verifier',
    expiresAt: '2030-01-15T11:00:00.000Z',
  });
  assert.equal(db.consumeAdminOAuthState('state-hash').nonce, 'nonce');
  assert.equal(db.consumeAdminOAuthState('state-hash'), null);

  db.createAdminSession({
    tokenHash: 'session-token-hash',
    googleSub: 'google-sub',
    email: 'editor@example.com',
    displayName: 'Editor',
    role: 'editor',
    expiresAt: '2030-01-15T11:00:00.000Z',
  });
  assert.equal(db.getAdminSession('session-token-hash').email, 'editor@example.com');
  assert.equal(db.deleteAdminSession('session-token-hash'), true);
  assert.equal(db.getAdminSession('session-token-hash'), null);
});

test('admin can disable a configured RSS source without removing its archive', () => {
  const source = db.getAdminSources().find((item) => item.sourceId === 'helsinki');
  assert.ok(source);
  assert.equal(source.enabled, true);
  assert.equal(db.setNewsSourceEnabled('helsinki', false), true);
  assert.equal(db.isNewsSourceEnabled('helsinki'), false);
  assert.equal(db.getAdminSources().find((item) => item.sourceId === 'helsinki').enabled, false);
  assert.equal(db.setNewsSourceEnabled('unknown-source', false), false);
});

test('user statistics render persisted users and subscription topics', () => {
  const created = db.createUserSession({
    tokenHash: 'user-session-token',
    googleSub: 'reader-google-sub',
    email: 'reader@example.com',
    displayName: 'Reader',
    expiresAt: '2030-01-15T11:00:00.000Z',
  });
  assert.equal(created.isNew, true);
  db.upsertUserSubscription({
    ...db.getUserSubscription('reader-google-sub'),
    enabled: true,
    categories: ['Экономика', 'Работа'],
    sourceIds: ['yle'],
  });
  const statistics = db.getUserStatistics();
  assert.equal(statistics.totals.registered, 1);
  assert.equal(statistics.users[0].email, 'reader@example.com');
  assert.deepEqual(statistics.users[0].categories, ['Экономика', 'Работа']);
  assert.equal(statistics.topics.find((topic) => topic.name === 'Экономика').count, 1);
});
