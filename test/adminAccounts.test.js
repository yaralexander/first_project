const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAdminAccounts, verifyAdminAuthorization } = require('../src/adminAccounts');

test('supports multiple JSON accounts and the legacy admin account', () => {
  const accounts = parseAdminAccounts({
    accountsJson: JSON.stringify([{ username: 'editor', password: 'one:two', role: 'editor' }]),
    legacyUser: 'admin',
    legacyPassword: 'legacy',
  });
  assert.deepEqual(accounts.map(({ username, role }) => ({ username, role })), [
    { username: 'editor', role: 'editor' },
    { username: 'admin', role: 'admin' },
  ]);
  const authorization = `Basic ${Buffer.from('editor:one:two').toString('base64')}`;
  assert.deepEqual(verifyAdminAuthorization(authorization, accounts), { username: 'editor', role: 'editor' });
});

test('invalid JSON does not disable a valid legacy account', () => {
  const accounts = parseAdminAccounts({ accountsJson: '{', legacyUser: 'admin', legacyPassword: 'secret' });
  assert.equal(accounts.length, 1);
  assert.equal(verifyAdminAuthorization(`Basic ${Buffer.from('admin:wrong').toString('base64')}`, accounts), null);
});
