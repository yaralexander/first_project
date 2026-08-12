const assert = require('node:assert/strict');
const test = require('node:test');
const {
  renderAccountErrorPage,
  renderAccountLoginPage,
  renderAccountPage,
  renderAboutPage,
  renderPrivacyPage,
  renderTermsPage,
  renderContactPage,
  renderAdminPage,
  renderAdminLoginPage,
  renderRssFeed,
  renderTelegramInfoPage,
} = require('../src/render');

const siteUrl = 'https://finskienovosti.fi';

function assertSharedSiteShell(html) {
  assert.match(html, /class="masthead"/);
  assert.match(html, /class="catnav"/);
  assert.match(html, /class="site-footer"/);
  assert.match(html, /\.footer-mark\{display:block;width:52px;height:52px;overflow:hidden/);
  assert.match(html, /\.related-grid a\{color:var\(--ink\)/);
  assert.match(html, /\.article-navigation a\{[^}]*color:var\(--ink\)/);
  assert.match(html, /data-font-step="-0\.10"/);
  assert.match(html, /data-font-step="0\.10"/);
  assert.match(html, /class="utility-button utility-theme-status"[^>]*data-theme-toggle/);
  assert.match(html, /localStorage\.getItem\(themeKey\)/);
  assert.match(html, /savedTheme='light'/);
  assert.match(html, /localStorage\.getItem\(themeKey\)==='dark'\?'dark':'light'/);
  assert.doesNotMatch(html, /prefers-color-scheme:\s*dark/);
  assert.match(html, /class="telegram-promo"/);
  assert.match(html, /href="\/telegram"/);
}

test('secondary public pages use the same site shell', () => {
  const pages = [
    renderAboutPage({ siteUrl }),
    renderPrivacyPage({ siteUrl }),
    renderTermsPage({ siteUrl }),
    renderContactPage({ siteUrl }),
    renderAccountLoginPage({ siteUrl }),
    renderAccountErrorPage({ siteUrl }),
    renderTelegramInfoPage({ siteUrl }),
  ];

  for (const html of pages) assertSharedSiteShell(html);
});

test('privacy and terms pages disclose Google sign-in and service rules', () => {
  const privacy = renderPrivacyPage({ siteUrl });
  const terms = renderTermsPage({ siteUrl });

  assert.match(privacy, /Политика конфиденциальности/);
  assert.match(privacy, /уникальный идентификатор Google/);
  assert.match(privacy, /Пароль Google сервису не передаётся/);
  assert.match(privacy, /rel="canonical" href="https:\/\/finskienovosti\.fi\/privacy"/);
  assert.match(terms, /Условия использования/);
  assert.match(terms, /Digitransit\/HSL/);
  assert.match(terms, /rel="canonical" href="https:\/\/finskienovosti\.fi\/terms"/);
});

test('Telegram information page explains the one-button personalized setup', () => {
  const html = renderTelegramInfoPage({ siteUrl });

  assertSharedSiteShell(html);
  assert.match(html, /Новости, транспорт и полезные предложения/);
  assert.match(html, /Настроить мою ленту/);
  assert.match(html, /href="\/account"/);
  assert.match(html, /темы и источники новостей, частоту/i);
  assert.match(html, /Имя канала вводить не нужно/);
  assert.match(html, /Расписание транспорта HSL прямо в Telegram/);
  assert.match(html, /src="\/assets\/hsl-logo\.png"/);
  assert.match(html, /Номер остановки/);
  assert.doesNotMatch(html, /Фото таблички/);
  assert.match(html, /Геопозиция/);
  assert.match(html, /Шесть понятных команд/);
  assert.match(html, /K-Supermarket/);
  assert.match(html, /Три новых слова/);
  assert.match(html, /\.telegram-promo-inner\{grid-template-columns:auto minmax\(0,1fr\) auto auto\}/);
  assert.match(html, /rel="canonical" href="https:\/\/finskienovosti\.fi\/telegram"/);
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
      sourceIds: ['yle'],
      contentTypes: ['news', 'holidays'],
      quietHoursEnabled: true,
      quietStart: '22:00',
      quietEnd: '07:00',
    },
    categories: ['Политика', 'Общество'],
    sources: [{ sourceId: 'yle', sourceName: 'YLE' }, { sourceId: 'hs', sourceName: 'Helsingin Sanomat' }],
    telegramLink: null,
    botProfile: { username: 'FinskieNovostiBot' },
  });

  assertSharedSiteShell(html);
  assert.match(html, /class="account-page"/);
  assert.match(html, /action="\/account\/subscription"/);
  assert.match(html, /action="\/account\/telegram\/connect"/);
  assert.match(html, /Имя канала вводить не нужно/);
  assert.match(html, /Подключить Telegram/);
  assert.match(html, /name="source_ids" value="yle" checked/);
  assert.match(html, /name="quiet_start" type="time" value="22:00"/);
  assert.match(html, /name="content_types" value="holidays" checked/);
  assert.match(html, /Срочные — уровень 5/);
  assert.match(html, /name="max_posts_per_day" type="number" min="1" max="100"/);
  assert.match(html, /Что означает важность 1–5/);
  assert.match(html, /&lt;Reader&gt;/);
  assert.doesNotMatch(html, /<Reader>/);

  const connectedHtml = renderAccountPage({
    siteUrl,
    user: { email: 'reader@example.com', displayName: 'Reader' },
    subscription: {
      enabled: true,
      frequency: 'instant',
      scope: 'finland',
      importance: 'all',
      maxPostsPerDay: 5,
      includeOriginal: true,
      categories: [],
      sourceIds: [],
      contentTypes: ['news'],
    },
    telegramLink: { telegramChatId: '123456' },
  });
  assert.match(connectedHtml, /action="\/account\/telegram\/test"/);
  assert.match(connectedHtml, /Проверить доставку/);
});

test('contact and login states retain accessible feedback', () => {
  const contact = renderContactPage({ siteUrl, status: 'sent', formToken: 'signed-token' });
  const login = renderAccountLoginPage({ siteUrl, error: 'failed' });

  assert.match(contact, /role="status"/);
  assert.match(contact, /action="\/contact"/);
  assert.match(contact, /name="form_token" value="signed-token"/);
  assert.match(contact, /name="website"/);
  assert.match(login, /role="alert"/);
  assert.match(login, /href="\/account\/login\/start"/);
  assert.match(login, /Продолжить с Google/);
  assert.match(login, /class="google-g"/);
  assert.match(login, /account-google-button\{width:min\(100%,480px\)/);
});

test('admin uses the same branded Google sign-in button as user accounts', () => {
  const html = renderAdminLoginPage({ siteUrl, googleEnabled: true, basicEnabled: false });
  assert.match(html, /href="\/admin\/auth\/google"/);
  assert.match(html, /class="google-login-button account-google-button"/);
  assert.match(html, /class="google-g"/);
  assert.match(html, /Продолжить с Google/);
});

test('articles admin tab exposes the protected manual RSS refresh control', () => {
  const html = renderAdminPage({
    comments: [],
    articles: [],
    query: '',
    statistics: {
      articleCount: 0,
      pendingComments: 0,
      report: {
        articles: 0,
        visitors: 0,
        articleViews: 0,
        comments: 0,
        reactions: 0,
        duplicates: 0,
      },
      daily: [],
      topRead: [],
      topCommented: [],
      filters: { from: '', to: '', category: '', sourceId: '' },
      operational: { queue: {}, delivery: {}, searches: [] },
    },
    duplicateArticles: [],
    auditLog: [],
    currentAccount: { username: 'editor', role: 'editor' },
    categories: ['Политика', 'Общество'],
    telegramConfigured: false,
    telegramStatus: '',
    telegramChannelStatus: 'saved',
    importProviderConfigured: false,
    importStatus: '',
    siteUrl,
    tab: 'articles',
  });

  assert.match(html, /action="\/admin\/rss\/refresh" method="post"/);
  assert.match(html, /Обновить RSS сейчас/);
  assert.match(html, /Уже сохранённые материалы повторно не переводятся/);
  assert.match(html, /href="\/rss\.xml"/);
  assert.match(html, /name="interval_minutes"/);
  assert.match(html, /name="quiet_hours_enabled"/);
  assert.match(html, /name="quiet_start" type="time" value="22:00"/);
  assert.match(html, /name="quiet_end" type="time" value="07:00"/);
  assert.match(html, /Время применяется по часовому поясу Финляндии/);
  assert.match(html, /\{source\}/);
  assert.match(html, /data-template-editor/);
  assert.match(html, /data-template-preview/);
  assert.match(html, /Вернуть красивый шаблон/);
  assert.match(html, /&lt;b&gt;🔥 \{title\}&lt;\/b&gt;/);
  assert.match(html, /class="account-notice" role="status">Настройки сохранены\.<\/p>/);
  assert.match(html, /class="telegram-rule-list"/);
  assert.match(html, /class="account-fieldset telegram-channel-categories"/);
  assert.match(html, /class="account-choice"/);
  assert.doesNotMatch(html, /Настройки общего Telegram-канала сохранены/);
  const templateStudioScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .find((match) => match[1].includes('data-template-editor'));
  assert.ok(templateStudioScript, 'template editor script should be rendered');
  assert.doesNotThrow(() => new Function(templateStudioScript[1]));
});

test('public RSS contains Russian summaries, permanent URLs and escaped XML', () => {
  const rss = renderRssFeed({
    siteUrl,
    articles: [{
      slug: 'novost-test',
      titleRu: 'Новость & проверка',
      summaryRu: 'Описание <безопасно>',
      titleFi: 'Uutinen',
      summaryFi: 'Kuvaus',
      category: 'Общество',
      sourceName: 'YLE',
      originalUrl: 'https://yle.fi/a/1?x=1&y=2',
      publishedAt: '2026-07-29T10:00:00.000Z',
    }, {
      slug: 'only-finnish',
      titleFi: 'Ei venäjäksi',
      summaryFi: 'Kuvaus',
    }],
  });

  assert.match(rss, /<rss version="2\.0">/);
  assert.match(rss, /https:\/\/finskienovosti\.fi\/news\/novost-test/);
  assert.match(rss, /Новость &amp; проверка/);
  assert.match(rss, /Описание &lt;безопасно&gt;/);
  assert.doesNotMatch(rss, /only-finnish/);
});
