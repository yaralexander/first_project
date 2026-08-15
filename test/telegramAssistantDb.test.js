const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const databasePath = path.join(os.tmpdir(), `finskienovosti-assistant-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = databasePath;
const db = require('../src/db');

test.after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${databasePath}${suffix}`); } catch {}
  }
});

test('stores assistant profile, conversation, followed topics and saved articles', () => {
  db.createUserSession({ tokenHash: 'assistant-session', googleSub: 'assistant-user', email: 'assistant@example.com', displayName: 'Reader', expiresAt: '2030-01-01T00:00:00Z' });
  db.createTelegramLinkCode({ userId: 'assistant-user', linkCodeHash: 'link-hash', expiresAt: '2030-01-01T00:00:00Z' });
  assert.equal(db.linkTelegramUser({ linkCodeHash: 'link-hash', telegramChatId: '12345' }), 'assistant-user');
  assert.equal(db.getTelegramUserByChatId('12345').displayName, 'Reader');

  db.saveTelegramAssistantProfile('assistant-user', { city: 'Espoo', lifeStatus: 'work', hasChildren: true, transport: 'hsl', interests: ['Kela', 'налоги'], modes: ['family'], groceryOffersEnabled: true, groceryChains: ['lidl', 'prisma'] });
  assert.deepEqual(db.getTelegramAssistantProfile('assistant-user'), { city: 'Espoo', lifeStatus: 'work', hasChildren: true, housing: '', transport: 'hsl', interests: ['Kela', 'налоги'], modes: ['family'], groceryOffersEnabled: true, groceryChains: ['lidl', 'prisma'] });

  db.saveTelegramConversation({ chatId: '12345', userId: 'assistant-user', articleId: null, pendingAction: 'comment_text', draftText: 'Текст' });
  assert.equal(db.getTelegramConversation('12345').pendingAction, 'comment_text');
  assert.equal(db.clearTelegramConversation('12345'), true);

  assert.equal(db.toggleTelegramTopicFollow('assistant-user', 'Билеты HSL'), true);
  assert.deepEqual(db.getTelegramTopicFollows('assistant-user'), ['Билеты HSL']);
  assert.equal(db.toggleTelegramTopicFollow('assistant-user', 'Билеты HSL'), false);

  const reminderId = db.createTelegramReminder({ userId: 'assistant-user', chatId: '12345', reminderText: 'Проверить изменения', remindAt: '2026-08-11T10:00:00.000Z' });
  assert.equal(db.getTelegramReminders('assistant-user')[0].id, reminderId);
  assert.equal(db.getDueTelegramReminders('2026-08-11T11:00:00.000Z')[0].id, reminderId);
  assert.equal(db.markTelegramReminderSent(reminderId), true);
});

test('links phone onboarding to a Google account and preserves bot settings', () => {
  const phoneUser = db.ensureTelegramUser('77777');
  db.upsertUserSubscription({
    ...db.getUserSubscription(phoneUser.userId),
    enabled: true,
    frequency: 'instant',
    categories: ['Происшествия'],
  });
  db.saveTelegramAssistantProfile(phoneUser.userId, {
    city: 'Vantaa',
    interests: ['полиция'],
    groceryOffersEnabled: false,
  });
  db.toggleTelegramTopicFollow(phoneUser.userId, 'Безопасность района');

  db.createUserSession({ tokenHash: 'linked-session', googleSub: 'linked-google-user', email: 'linked@example.com', displayName: 'Linked Reader', expiresAt: '2030-01-01T00:00:00Z' });
  db.createTelegramLinkCode({ userId: 'linked-google-user', linkCodeHash: 'phone-link-hash', expiresAt: '2030-01-01T00:00:00Z' });
  assert.equal(db.linkTelegramUser({ linkCodeHash: 'phone-link-hash', telegramChatId: '77777' }), 'linked-google-user');

  assert.equal(db.getTelegramUserByChatId('77777').userId, 'linked-google-user');
  assert.deepEqual(db.getUserSubscription('linked-google-user').categories, ['Происшествия']);
  assert.equal(db.getTelegramAssistantProfile('linked-google-user').city, 'Vantaa');
  assert.deepEqual(db.getTelegramTopicFollows('linked-google-user'), ['Безопасность района']);
});
