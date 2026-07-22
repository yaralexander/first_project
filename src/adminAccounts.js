const crypto = require('crypto');

const ALLOWED_ROLES = new Set(['admin', 'editor']);

function normalizeAccount(value) {
  if (!value || typeof value !== 'object') return null;
  const username = typeof value.username === 'string' ? value.username.trim() : '';
  const password = typeof value.password === 'string' ? value.password : '';
  const role = ALLOWED_ROLES.has(value.role) ? value.role : 'editor';
  if (!username || !password || username.length > 80 || password.length > 500) return null;
  return { username, password, role };
}

function parseAdminAccounts({ accountsJson = '', legacyUser = '', legacyPassword = '' } = {}) {
  const accounts = [];
  if (accountsJson) {
    try {
      const parsed = JSON.parse(accountsJson);
      if (Array.isArray(parsed)) {
        for (const value of parsed) {
          const account = normalizeAccount(value);
          if (account && !accounts.some((item) => item.username === account.username)) accounts.push(account);
        }
      }
    } catch {
      // Invalid JSON safely disables only the additional accounts.
    }
  }
  const legacy = normalizeAccount({ username: legacyUser, password: legacyPassword, role: 'admin' });
  if (legacy && !accounts.some((item) => item.username === legacy.username)) accounts.push(legacy);
  return accounts;
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyAdminAuthorization(authorization, accounts) {
  const match = typeof authorization === 'string' && /^Basic (.+)$/.exec(authorization);
  if (!match) return null;
  let credentials;
  try {
    credentials = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return null;
  }
  const separator = credentials.indexOf(':');
  if (separator < 0) return null;
  const username = credentials.slice(0, separator);
  const password = credentials.slice(separator + 1);
  for (const account of accounts) {
    if (timingSafeEqualText(username, account.username) && timingSafeEqualText(password, account.password)) {
      return { username: account.username, role: account.role };
    }
  }
  return null;
}

module.exports = { parseAdminAccounts, verifyAdminAuthorization };
