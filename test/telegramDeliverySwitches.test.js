const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const databasePath = path.join(os.tmpdir(), `finskienovosti-delivery-switches-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = databasePath;
const db = require('../src/db');

test.after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${databasePath}${suffix}`); } catch {}
  }
});

test('personal delivery starts enabled and its global switch survives a database read', () => {
  assert.equal(db.isPersonalTelegramDeliveryEnabled(), true);
  db.setSystemSettings({ telegram_personal_delivery_enabled: '0' });
  assert.equal(db.isPersonalTelegramDeliveryEnabled(), false);
  db.setSystemSettings({ telegram_personal_delivery_enabled: '1' });
  assert.equal(db.isPersonalTelegramDeliveryEnabled(), true);
});

test('paused retry work can be released without losing an attempt', () => {
  db.enqueueTask({ taskType: 'personal_telegram', payload: { userId: 'reader', articleId: 1 }, idempotencyKey: 'paused-delivery' });
  const [claimed] = db.claimDueTasks('personal_telegram', 1);
  assert.equal(claimed.attempts, 1);
  assert.equal(db.releaseTask(claimed.id), true);
  const [resumed] = db.claimDueTasks('personal_telegram', 1);
  assert.equal(resumed.id, claimed.id);
  assert.equal(resumed.attempts, 1);
  db.completeTask(resumed.id);
});
