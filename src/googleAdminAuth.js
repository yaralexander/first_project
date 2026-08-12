const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : '';
}

function parseGoogleAdminAccounts({ accountsJson = '', allowedEmails = '' } = {}) {
  const accounts = [];
  if (accountsJson) {
    try {
      const values = JSON.parse(accountsJson);
      if (Array.isArray(values)) {
        for (const value of values) {
          const email = normalizeEmail(value && value.email);
          const role = value && value.role === 'admin' ? 'admin' : 'editor';
          if (email && !accounts.some((account) => account.email === email)) accounts.push({ email, role });
        }
      }
    } catch {
      // Invalid JSON safely disables only the malformed Google allowlist.
    }
  }
  for (const value of String(allowedEmails || '').split(',')) {
    const email = normalizeEmail(value);
    if (email && !accounts.some((account) => account.email === email)) accounts.push({ email, role: 'admin' });
  }
  return accounts;
}

function findGoogleAdminAccount(accounts, email) {
  const normalized = normalizeEmail(email);
  return accounts.find((account) => account.email === normalized) || null;
}

function randomBase64Url(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createPkcePair() {
  const verifier = randomBase64Url(48);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function createGoogleAuthProvider({ clientId, clientSecret, redirectUri, OAuth2ClientClass = OAuth2Client }) {
  const client = new OAuth2ClientClass(clientId, clientSecret, redirectUri);
  return {
    createAuthorizationUrl({ state, nonce, codeChallenge }) {
      return client.generateAuthUrl({
        access_type: 'online',
        scope: ['openid', 'email', 'profile'],
        state,
        nonce,
        prompt: 'select_account',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
    },
    async exchangeAndVerify({ code, codeVerifier, nonce }) {
      const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: redirectUri });
      if (!tokens || !tokens.id_token) throw new Error('missing_id_token');
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub || !payload.email || !payload.email_verified) throw new Error('invalid_identity');
      if (!payload.nonce || payload.nonce !== nonce) throw new Error('invalid_nonce');
      return {
        googleSub: payload.sub,
        email: normalizeEmail(payload.email),
        displayName: typeof payload.name === 'string' ? payload.name.slice(0, 160) : '',
      };
    },
  };
}

module.exports = {
  createGoogleAuthProvider,
  createPkcePair,
  findGoogleAdminAccount,
  parseGoogleAdminAccounts,
  randomBase64Url,
  sha256,
};
