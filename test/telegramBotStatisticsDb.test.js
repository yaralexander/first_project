const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const databasePath = path.join(os.tmpdir(), `finskienovosti-bot-stats-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = databasePath;
const db = require('../src/db');

test.after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${databasePath}${suffix}`); } catch {}
  }
});

test('stores anonymous bot events and aggregates command usage', () => {
  db.recordTelegramBotEvent({ chatId: '123', eventType: 'command_today' });
  db.recordTelegramBotEvent({ chatId: '123', eventType: 'command_today' });
  db.recordTelegramBotEvent({ chatId: '456', eventType: 'command_offers' });
  const statistics = db.getTelegramBotStatistics();
  assert.equal(statistics.totals.activeUsers7Days, 2);
  assert.deepEqual(statistics.commands.map(({ eventType, uses, users }) => ({ eventType, uses, users })), [
    { eventType: 'command_today', uses: 2, users: 1 },
    { eventType: 'command_offers', uses: 1, users: 1 },
  ]);
});
