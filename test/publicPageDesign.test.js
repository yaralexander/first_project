const assert = require('node:assert/strict');
const test = require('node:test');
const {
  renderAccountErrorPage,
  renderAccountLoginPage,
  renderAccountPage,
  renderAboutPage,
  renderContactPage,
} = require('../src/render');

const siteUrl = 'https://finskienovosti.fi';

function assertSharedSiteShell(html) {
  assert.match(html, /class="masthead"/);
  assert.match(html, /class="catnav"/);
  assert.match(html, /class="site-footer"/);
  assert.match(html, /data-font-step="-0\.10"/);
  assert.match(html, /data-font-step="0\.10"/);
  assert.match(html, /data-theme-toggle/);
}

test('secondary public pages use the same site shell', () => {
  const pages = [
    renderAboutPage({ siteUrl }),
    renderContactPage({ siteUrl }),
    renderAccountLoginPage({ siteUrl }),
    renderAccountErrorPage({ siteUrl }),
  ];

  for (const html of pages) assertSharedSiteShell(html);
});

test('account page keeps subscription controls inside the shared design', () => {
  const html = renderAccountPage({
    siteUrl,
    user: {
      email: 'reader@example.com',
      displayName: '<Reader>',
    },
    subscription: {
      enabled: true,
      frequency: 'daily',
      scope: 'finland',
      importance: 'all',
      maxPostsPerDay: 7,
      includeOriginal: true,
      categories: ['Политика'],
    },
    categories: ['Политика', 'Общество'],
    telegramLink: null,
    botProfile: { username: 'FinskieNovostiBot' },
  });

  assertSharedSiteShell(html);
  assert.match(html, /class="account-page"/);
  assert.match(html, /action="\/account\/subscription"/);
  assert.match(html, /action="\/account\/telegram\/connect"/);
  assert.match(html, /Имя канала вводить не нужно/);
  assert.match(html, /Подключить Telegram/);
  assert.match(html, /&lt;Reader&gt;/);
  assert.doesNotMatch(html, /<Reader>/);
});

test('contact and login states retain accessible feedback', () => {
  const contact = renderContactPage({ siteUrl, status: 'sent' });
  const login = renderAccountLoginPage({ siteUrl, error: 'failed' });

  assert.match(contact, /role="status"/);
  assert.match(contact, /action="\/contact"/);
  assert.match(login, /role="alert"/);
  assert.match(login, /href="\/account\/login\/start"/);
});
