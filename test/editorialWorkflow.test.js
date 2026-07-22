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
  assert.equal(db.getAdminSources()[0].sourceId, 'editorial');
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
