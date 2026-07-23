const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createGoogleAuthProvider,
  createPkcePair,
  findGoogleAdminAccount,
  parseGoogleAdminAccounts,
} = require('../src/googleAdminAuth');

test('parses a Google email allowlist with roles', () => {
  const accounts = parseGoogleAdminAccounts({
    accountsJson: JSON.stringify([
      { email: 'Owner@Example.com', role: 'admin' },
      { email: 'editor@example.com', role: 'editor' },
    ]),
    allowedEmails: 'legacy@example.com, invalid',
  });
  assert.deepEqual(accounts, [
    { email: 'owner@example.com', role: 'admin' },
    { email: 'editor@example.com', role: 'editor' },
    { email: 'legacy@example.com', role: 'admin' },
  ]);
  assert.equal(findGoogleAdminAccount(accounts, 'OWNER@example.com').role, 'admin');
});

test('creates a PKCE authorization request and verifies the returned identity', async () => {
  let generatedOptions;
  class FakeOAuth2Client {
    generateAuthUrl(options) {
      generatedOptions = options;
      return 'https://accounts.google.com/mock';
    }

    async getToken(options) {
      assert.equal(options.code, 'code');
      assert.equal(options.codeVerifier, 'verifier');
      return { tokens: { id_token: 'signed-id-token' } };
    }

    async verifyIdToken(options) {
      assert.equal(options.audience, 'client-id');
      return {
        getPayload: () => ({
          sub: 'google-sub',
          email: 'Editor@example.com',
          email_verified: true,
          nonce: 'nonce',
          name: 'Editor Name',
        }),
      };
    }
  }
  const provider = createGoogleAuthProvider({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://example.com/admin/auth/google/callback',
    OAuth2ClientClass: FakeOAuth2Client,
  });
  provider.createAuthorizationUrl({ state: 'state', nonce: 'nonce', codeChallenge: 'challenge' });
  assert.equal(generatedOptions.code_challenge_method, 'S256');
  assert.deepEqual(generatedOptions.scope, ['openid', 'email', 'profile']);
  assert.ok(createPkcePair().verifier.length >= 43);
  assert.deepEqual(await provider.exchangeAndVerify({ code: 'code', codeVerifier: 'verifier', nonce: 'nonce' }), {
    googleSub: 'google-sub',
    email: 'editor@example.com',
    displayName: 'Editor Name',
  });
});
