const { categories: defaultCategories } = require('./categories');
const { siteStyles, brandMark, themeScript } = require('./siteDesign');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '#';
  } catch {
    return '#';
  }
}

function truncateText(value, maxLength = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Helsinki' }).format(date);
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Helsinki' }).format(date);
}

function documentPage({ title, description, canonicalPath, siteUrl, content, robots, breakingArticle, searchQuery = '', showInterestModal = false, structuredData = null }) {
  const canonical = `${siteUrl}${canonicalPath}`;
  const breakingTitle = breakingArticle
    ? breakingArticle.titleRu || breakingArticle.titleFi
    : 'Свежие новости Финляндии для русскоязычных читателей';
  const breakingHref = breakingArticle ? articleUrl(breakingArticle) : '/';
  const breakingLabel = breakingArticle?.editorialStatus === 'urgent' ? 'СРОЧНО ⚡' : 'BREAKING ⚡';
  const breaking = `<section class="breaking" aria-label="Важная новость"><div class="wrap"><span class="breaking-label">${breakingLabel}</span><a class="breaking-link" href="${breakingHref}">${escapeHtml(breakingTitle)}</a><button class="breaking-close" type="button" data-breaking-close aria-label="Закрыть">×</button></div></section>`;
  const categoryIcons = { Политика: '🏛️', Экономика: '💰', Иммиграция: '✈️', Работа: '💼', Общество: '👥', Образование: '🎓', Россия: '🇷🇺', Мир: '🌍' };
  const nav = defaultCategories.map((category) => `<a href="/category/${encodeURIComponent(categoryToStaticSlug(category))}">${categoryIcons[category]} ${escapeHtml(category)}</a>`).join('');
  const interestButtons = defaultCategories.map((category) => `<button type="button" class="interest-chip" data-interest="${escapeHtml(category)}" aria-pressed="false">${categoryIcons[category]} ${escapeHtml(category)}</button>`).join('');
  const interestControl = showInterestModal ? '<button class="icon-btn" type="button" data-interests-open aria-label="Настроить интересы">✦</button>' : '';
  const interestModal = showInterestModal ? `<div class="interest-modal" data-interest-modal hidden><div class="interest-dialog" role="dialog" aria-modal="true" aria-labelledby="interest-title"><p class="interest-flags">🇫🇮🤝🇷🇺</p><h2 id="interest-title">Что вам интереснее всего?</h2><p>Выберите 2–3 темы — соберём для вас персональную ленту. Можно изменить в любой момент.</p><div class="interest-options">${interestButtons}</div><p class="interest-status" data-interest-status aria-live="polite"></p><div class="interest-actions"><button type="button" class="interest-skip" data-interest-skip>Пропустить</button><button type="button" class="interest-save" data-interest-save>Готово</button></div></div></div>` : '';
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${canonicalPath.startsWith('/news/') ? 'article' : 'website'}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="Финские Новости">
  ${robots ? `<meta name="robots" content="${escapeHtml(robots)}">` : ''}
  <link rel="canonical" href="${escapeHtml(canonical)}">
  ${structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>` : ''}
  <style>${siteStyles}</style>
</head>
<body>
  <a class="skip-link" href="#content">К содержанию</a>
  <div class="util-bar"><div class="wrap"><div class="util-left">🇫🇮 → 🇷🇺 AI пересказ в реальном времени</div><div class="util-right"><button class="utility-button" type="button" data-font-step="-0.10" aria-label="Уменьшить текст">A−</button><button class="utility-button utility-button--scale" type="button" data-font-reset aria-label="Обычный размер текста">100%</button><button class="utility-button" type="button" data-font-step="0.10" aria-label="Увеличить текст">A+</button><button class="utility-button" type="button" data-theme-toggle>Тёмная</button></div></div></div>
  ${breaking}
  <header class="masthead"><div class="wrap"><div class="topbar"><a class="brand" href="/"><span class="brand-mark">${brandMark}</span><span><strong class="brand-name">Финские Новости</strong><small class="brand-tagline">Свежие новости Финляндии на русском языке</small></span></a><form class="search-box" action="/search" method="get" role="search"><label class="skip-link" for="site-search">Поиск по новостям</label><span aria-hidden="true">⌕</span><input id="site-search" name="q" type="search" value="${escapeHtml(searchQuery)}" placeholder="Поиск новостей…" minlength="2" maxlength="120" required><button type="submit">Найти</button></form><div class="top-actions">${interestControl}<a class="account-link" href="/account" aria-label="Личный кабинет">👤 Личный кабинет</a><a class="icon-btn" href="/about" aria-label="О проекте">i</a><a class="icon-btn" href="/page/2" aria-label="Архив">☰</a></div></div><nav class="catnav" id="category-nav" aria-label="Категории"><a class="active" href="/">🏠 Главная</a>${nav}</nav></div></header>
  <main class="wrap" id="content">${content}</main>
  <footer class="site-footer" id="contact"><div class="wrap footer-grid"><div class="footer-brand"><span class="footer-mark">${brandMark}</span><div><strong>Новости Финляндии</strong><p>Свежие новости Финляндии на русском языке</p></div><p class="footer-copy">Понятные пересказы, проверенные источники и уважение к читателю.</p></div><div><h2>Категории</h2><a href="/category/politika">Политика</a><a href="/category/ekonomika">Экономика</a><a href="/category/obshchestvo">Общество</a><a href="/page/2">Архив новостей</a></div><div><h2>Информация</h2><a href="/about">О проекте</a><a href="/contact">Контакты</a><a href="/account">Личный кабинет</a><a href="/about#privacy">Конфиденциальность</a></div></div><div class="footer-bottom"><span>© 2026 Новости Финляндии</span><span>Все материалы принадлежат оригинальным источникам.</span></div></footer>
  ${interestModal}
  <nav class="mobile-bottom-nav" aria-label="Мобильная навигация"><a href="/"><i>⌂</i><span>Главная</span></a><a href="/search"><i>⌕</i><span>Поиск</span></a><a href="/#feed-heading"><i>♧</i><span>Лента</span></a><a href="#category-nav"><i>⊞</i><span>Разделы</span></a><button type="button" data-theme-toggle><i>◐</i><span>Тема</span></button></nav>
  ${themeScript}
</body>
</html>`;
}

function categoryToStaticSlug(category) {
  const values = { Политика: 'politika', Экономика: 'ekonomika', Иммиграция: 'immigratsiya', Работа: 'rabota', Общество: 'obshchestvo', Образование: 'obrazovanie', Россия: 'rossiya', Мир: 'mir' };
  return values[category] || 'obshchestvo';
}

function articleUrl(article) {
  return `/news/${encodeURIComponent(article.slug)}`;
}

function categoryMarkup(article, categoryToSlug) {
  const slug = categoryToSlug(article.category);
  return slug ? `<a href="/category/${encodeURIComponent(slug)}">${escapeHtml(article.category)}</a>` : escapeHtml(article.category || 'Новости');
}

function articleMeta(article, categoryToSlug) {
  return `<p class="meta">${categoryMarkup(article, categoryToSlug)}<span class="meta-separator">·</span><span>${escapeHtml(article.sourceName || 'Финские Новости')}</span><span class="meta-separator">·</span><time datetime="${escapeHtml(article.publishedAt || '')}">${escapeHtml(shortDate(article.publishedAt))}</time></p>`;
}

function isPinned(article) {
  const date = new Date(article.pinnedUntil);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

function editorialBadges(article) {
  const badges = [];
  if (isPinned(article)) badges.push('<span class="badge badge--pinned">Главное</span>');
  if (article.editorialStatus === 'urgent') badges.push('<span class="badge badge--urgent">Срочно</span>');
  if (article.editorialStatus === 'important') badges.push('<span class="badge badge--important">Важно</span>');
  return badges.length ? `<div class="badge-row" aria-label="Редакционные метки">${badges.join('')}</div>` : '';
}

function reactionTotalsMarkup(article) {
  const totals = article.reactionTotals || { like: 0, important: 0, sad: 0 };
  return `<p class="reaction-totals" aria-label="Реакции"><span>👍 ${totals.like || 0}</span><span>❗ ${totals.important || 0}</span><span>😔 ${totals.sad || 0}</span></p>`;
}

function sourceLine(article) {
  return article.sourceName === 'Редакция Финские Новости'
    ? '<p class="source-name">Материал подготовлен редакцией</p>'
    : `<p class="source-name">Источник: ${escapeHtml(article.sourceName || '')}</p>`;
}

function renderCardTools(article) {
  const title = article.titleRu || article.titleFi || '';
  const summary = article.summaryRu || article.summaryFi || '';
  const original = article.sourceName === 'Редакция Финские Новости'
    ? '<span class="card-tool card-tool--disabled" aria-disabled="true">↗ Без оригинала</span>'
    : `<a class="card-tool" href="${escapeHtml(safeExternalUrl(article.originalUrl))}" rel="noopener noreferrer" target="_blank">↗ Читать оригинал</a>`;
  return `<div class="card-tools" aria-label="Действия с новостью">${original}<button class="card-tool" type="button" data-listen-title="${escapeHtml(title)}" data-listen-text="${escapeHtml(summary)}">🔊 Слушать</button><button class="card-tool" type="button" data-share-title="${escapeHtml(title)}" data-share-url="${escapeHtml(articleUrl(article))}">↗ Поделиться</button><a class="card-tool card-tool--comment" href="${articleUrl(article)}#comment-form">Оставить комментарий</a></div>`;
}

function renderArticleCard(article, categoryToSlug) {
  return `<article class="card" data-category="${escapeHtml(article.category || 'Новости')}">${editorialBadges(article)}${articleMeta(article, categoryToSlug)}<h3><a href="${articleUrl(article)}">${escapeHtml(article.titleRu || article.titleFi)}</a></h3><p class="summary">${escapeHtml(article.summaryRu || article.summaryFi || '')}</p>${sourceLine(article)}${reactionTotalsMarkup(article)}${renderCardTools(article)}</article>`;
}

function renderMiniCard(article, categoryToSlug, teal = false) {
  return `<article class="mini-card${teal ? ' mini-card--teal' : ''}">${editorialBadges(article)}${articleMeta(article, categoryToSlug)}<h3><a href="${articleUrl(article)}">${escapeHtml(article.titleRu || article.titleFi)}</a></h3></article>`;
}

function renderHeroCard(article, categoryToSlug) {
  return `<article class="lead-card">${editorialBadges(article)}${articleMeta(article, categoryToSlug)}<h2><a href="${articleUrl(article)}">${escapeHtml(article.titleRu || article.titleFi)}</a></h2><p>${escapeHtml(article.summaryRu || article.summaryFi || '')}</p><div class="lead-meta"><span>${escapeHtml(article.sourceName || 'Финские Новости')} · ${escapeHtml(shortDate(article.publishedAt))}</span><a href="${articleUrl(article)}#comment-form">Комментировать</a></div></article>`;
}

function renderCategoryNavigation(articles, categoryToSlug) {
  const used = new Map(articles.map((article) => [categoryToSlug(article.category), article.category]).filter(([slug]) => slug));
  return used.size ? `<nav class="category-pills" aria-label="Категории страницы">${[...used.entries()].map(([slug, category]) => `<a class="category-pill" href="/category/${encodeURIComponent(slug)}">${escapeHtml(category)}</a>`).join('')}</nav>` : '';
}

function renderDigest(articles) {
  const points = articles.slice(0, 3).map((article) => `<li>${escapeHtml(article.summaryRu || article.titleRu || article.titleFi || '')}</li>`).join('');
  return `<section aria-labelledby="digest-heading"><div class="section-head"><span>✦</span><h2 id="digest-heading">AI-дайджест дня</h2><span class="sub">— главное за 40 секунд</span></div><div class="digest-card"><div class="digest-mark">AI</div><div><h2>Главное за день</h2><p>Короткая выжимка из свежих русскоязычных пересказов.</p>${points ? `<ul class="digest-list">${points}</ul>` : ''}</div></div></section>`;
}

function renderCommentTicker(comments = []) {
  const renderItems = (hidden = false) => comments.map((comment) => `<a class="comment-ticker-item" href="/news/${encodeURIComponent(comment.articleSlug)}#comments-heading"${hidden ? ' aria-hidden="true" tabindex="-1"' : ''}><strong>${escapeHtml(comment.authorName)}</strong><span>“${escapeHtml(truncateText(comment.body, 150))}”</span><em>${escapeHtml(truncateText(comment.articleTitle, 70))}</em></a>`).join('');
  const items = comments.length
    ? `${renderItems()}${renderItems(true)}`
    : '<span class="comment-ticker-empty">После модерации здесь появятся последние комментарии читателей.</span>';
  return `<section class="comment-ticker" aria-labelledby="comment-ticker-heading"><div class="section-head"><span>💬</span><h2 id="comment-ticker-heading">Последние комментарии</h2><span class="sub">— обсуждают читатели</span></div><div class="comment-ticker-window"><div class="comment-ticker-track${comments.length ? ' is-moving' : ''}">${items}</div></div></section>`;
}

function renderRail(articles) {
  const entries = articles.slice(0, 3).map((article) => `<article class="foryou-card" data-category="${escapeHtml(article.category || 'Новости')}"><p class="card-label">${escapeHtml(article.category || 'Новости')}</p><h3><a href="${articleUrl(article)}">${escapeHtml(article.titleRu || article.titleFi)}</a></h3></article>`).join('');
  return entries ? `<section class="foryou-section" aria-labelledby="rail-heading"><div class="section-head"><h2 id="rail-heading">Не пропустите</h2></div><div class="foryou-rail">${entries}</div></section>` : '';
}

function renderSidebar(articles) {
  const links = articles.slice(0, 4).map((article) => `<li><a href="${articleUrl(article)}">${escapeHtml(article.titleRu || article.titleFi)}</a><small>${escapeHtml(article.category || 'Новости')} · ${escapeHtml(shortDate(article.publishedAt))}</small></li>`).join('');
  return `<aside class="sidebar" aria-label="Дополнительные материалы"><section class="side-card side-card--navy"><p class="sidebar-kicker">Еженедельная подборка</p><h2>Финляндия — главное за неделю</h2><p>Подписка на редакционную подборку появится перед публичным запуском.</p><form class="newsletter-form"><input type="email" placeholder="Ваш e-mail" disabled><button type="button">Скоро будет доступно</button></form></section><section class="side-card"><p class="sidebar-kicker">В фокусе</p><h2>Сейчас в ленте</h2><ul class="side-list">${links || '<li>Свежие материалы скоро появятся здесь.</li>'}</ul></section><section class="side-card side-card--teal"><p class="sidebar-kicker">Финское слово</p><p class="word">sisu</p><p class="word-translation">стойкость, характер</p><p class="side-note">Слово дня — небольшой культурный контекст рядом с новостями.</p></section></aside>`;
}

function renderListPage({ title, description, canonicalPath, siteUrl, articles, page, total, pagePath, categoryToSlug, selectedSource = '', sort = 'newest', recentComments = [], searchQuery = null, robots }) {
  const isHome = canonicalPath === '/';
  const isSearch = searchQuery !== null;
  const [hero, miniOne, miniTwo, ...rest] = articles;
  const featured = [hero, miniOne, miniTwo].filter(Boolean);
  const emptyMessage = isSearch
    ? (searchQuery.length >= 2 ? 'По вашему запросу ничего не найдено.' : 'Введите не менее двух символов, чтобы найти статью.')
    : 'Новостей пока нет.';
  const cards = (isHome ? rest : articles).map((article) => renderArticleCard(article, categoryToSlug)).join('') || `<div class="empty-state">${emptyMessage}</div>`;
  const previousPath = page > 1 ? pagePath(page - 1) : null;
  const nextPath = page * 50 < total ? pagePath(page + 1) : null;
  const pagination = previousPath || nextPath ? `<nav class="pagination" aria-label="Страницы">${previousPath ? `<a href="${previousPath}">← Новее</a>` : '<span></span>'}${nextPath ? `<a href="${nextPath}">Старее →</a>` : '<span></span>'}</nav>` : '';
  const headline = isHome ? 'Новости Финляндии на русском' : title;
  const bento = isHome && hero ? `<section class="bento" aria-label="Главные новости">${renderHeroCard(hero, categoryToSlug)}<div class="bento-side">${miniOne ? renderMiniCard(miniOne, categoryToSlug) : ''}${miniTwo ? renderMiniCard(miniTwo, categoryToSlug, true) : ''}</div></section>` : '';
  const searchLead = `<section class="page-top search-page-head"><p class="eyebrow">Архив и поиск</p><h1 class="page-heading">Поиск по статьям</h1><p class="page-intro">Ищем в русских и финских заголовках и текстах всех опубликованных материалов.</p><form class="search-page-form" action="/search" method="get" role="search"><label for="archive-search">Запрос</label><div><input id="archive-search" name="q" type="search" value="${escapeHtml(searchQuery || '')}" placeholder="Например: Хельсинки" minlength="2" maxlength="120" required><button type="submit">Найти</button></div></form>${searchQuery ? `<p class="search-result-note">По запросу «${escapeHtml(searchQuery)}» найдено: ${total}</p>` : ''}</section>`;
  const homeLead = isHome ? '' : isSearch ? searchLead : `<section class="page-top"><p class="eyebrow">Лента новостей</p><h1 class="page-heading">${escapeHtml(headline)}</h1><p class="page-intro">${escapeHtml(description)}</p></section>${renderCategoryNavigation(articles, categoryToSlug)}`;
  const sourceOptions = [['', 'Все'], ['yle', 'YLE'], ['hs', 'HS'], ['il', 'Iltalehti'], ['is', 'Ilta-Sanomat']];
  const sourceToolbar = isHome ? `<div class="feed-controls"><nav class="source-toolbar" aria-label="Источники"><span>Источники:</span>${sourceOptions.map(([value, label]) => {
    const params = new URLSearchParams();
    if (value) params.set('source', value);
    if (sort !== 'newest') params.set('sort', sort);
    const href = params.toString() ? `/?${params.toString()}#feed-heading` : '/#feed-heading';
    return `<a class="source-chip${selectedSource === value ? ' active' : ''}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  }).join('')}</nav><form class="sort-form" action="/" method="get">${selectedSource ? `<input type="hidden" name="source" value="${escapeHtml(selectedSource)}">` : ''}<label for="feed-sort">Сортировка</label><select id="feed-sort" name="sort" data-sort-select><option value="newest"${sort === 'newest' ? ' selected' : ''}>Сначала новые</option><option value="oldest"${sort === 'oldest' ? ' selected' : ''}>Сначала старые</option></select><button type="submit">Применить</button></form></div>` : '';
  const feedContent = `${sourceToolbar}<div class="feed-count"><h2 id="feed-heading">${isHome ? 'Свежие новости' : 'Материалы'}</h2><p>${total} материалов · ${sort === 'oldest' ? 'Старые сначала' : 'Новые сначала'}</p></div><section class="grid" aria-labelledby="feed-heading">${cards}</section>${pagination}<p class="footer-note">Материалы пересказываются на русском. Для полного контекста открывайте первоисточник.</p>`;
  const content = isHome
    ? `${bento}${renderCommentTicker(recentComments)}${renderDigest(featured)}${renderRail(rest)}<div class="layout"><div>${feedContent}</div>${renderSidebar(rest)}</div>`
    : `<div class="listing-layout"><div>${homeLead}${feedContent}</div>${renderSidebar(articles)}</div>`;
  return documentPage({ title, description, canonicalPath, siteUrl, content, robots, searchQuery: searchQuery || '', breakingArticle: articles.find((article) => article.editorialStatus === 'urgent') || (isHome ? featured[0] : null), showInterestModal: isHome });
}

function reactionForm(article, reactionMessage) {
  return `<section class="reactions" aria-labelledby="reactions-heading"><h2 id="reactions-heading">Реакции читателей</h2>${reactionTotalsMarkup(article)}${reactionMessage ? `<p class="form-message" role="status">${escapeHtml(reactionMessage)}</p>` : ''}<form action="/news/${encodeURIComponent(article.slug)}/reactions" method="post"><button type="submit" name="reaction" value="like" aria-label="Нравится">👍</button><button type="submit" name="reaction" value="important" aria-label="Важно">❗</button><button type="submit" name="reaction" value="sad" aria-label="Грустно">😔</button></form></section>`;
}

function renderComments({ article, comments, commentMessage }) {
  const list = comments.length ? comments.map((comment) => `<article class="comment"><p class="comment-author">${escapeHtml(comment.authorName)}</p><time class="comment-date" datetime="${escapeHtml(comment.createdAt || '')}">${escapeHtml(formatDate(comment.createdAt))}</time><p class="comment-body">${escapeHtml(comment.body)}</p></article>`).join('') : '<p class="summary">Пока нет одобренных комментариев.</p>';
  return `<section class="comments" aria-labelledby="comments-heading"><h2 id="comments-heading">Комментарии</h2>${list}<form class="comment-form" id="comment-form" action="/news/${encodeURIComponent(article.slug)}/comments" method="post"><h3>Оставить комментарий</h3>${commentMessage ? `<p class="form-message" role="status">${escapeHtml(commentMessage)}</p>` : ''}<label class="honeypot" for="website">Сайт</label><input class="honeypot" id="website" name="website" type="text" autocomplete="off" tabindex="-1" aria-hidden="true"><label for="author_name">Имя</label><input id="author_name" name="author_name" type="text" maxlength="80" required><label for="body">Комментарий</label><textarea id="body" name="body" maxlength="1500" required></textarea><button type="submit">Отправить на модерацию</button></form></section>`;
}

function renderArticlePage({ article, siteUrl, categoryToSlug, comments = [], commentMessage = '', reactionMessage = '', relatedArticles = [], adjacent = {} }) {
  const title = article.titleRu || article.titleFi;
  const description = article.summaryRu || article.summaryFi || title;
  const classification = article.classification || {};
  const classificationItems = [
    classification.region ? `<a href="/region/${encodeURIComponent(classification.region.code)}">📍 ${escapeHtml(classification.region.name)}</a>` : '',
    ...(classification.tags || []).map((tag) => `<a href="/tag/${encodeURIComponent(tag.slug)}">#${escapeHtml(tag.name)}</a>`),
    ...(classification.audiences || [])
      .filter((audience) => audience.code !== 'all')
      .map((audience) => `<span>Для: ${escapeHtml(audience.name)}</span>`),
  ].filter(Boolean);
  const classificationMarkup = classificationItems.length
    ? `<div class="article-classification" aria-label="Темы и география">${classificationItems.join('')}</div>`
    : '';
  const original = article.sourceName === 'Редакция Финские Новости'
    ? '<p class="editorial-note">Материал подготовлен редакцией «Финские Новости».</p>'
    : `<div class="original-box"><p>Полный текст опубликован у первоисточника. Мы рекомендуем открыть его для подробностей и контекста.</p><a href="${escapeHtml(safeExternalUrl(article.originalUrl))}" rel="noopener noreferrer" target="_blank">Открыть оригинал ↗</a></div>`;
  const adjacentMarkup = adjacent.older || adjacent.newer
    ? `<nav class="article-navigation" aria-label="Соседние статьи">${adjacent.older ? `<a href="${articleUrl(adjacent.older)}">← Предыдущая<br><strong>${escapeHtml(truncateText(adjacent.older.titleRu || adjacent.older.titleFi, 75))}</strong></a>` : '<span></span>'}${adjacent.newer ? `<a href="${articleUrl(adjacent.newer)}">Следующая →<br><strong>${escapeHtml(truncateText(adjacent.newer.titleRu || adjacent.newer.titleFi, 75))}</strong></a>` : '<span></span>'}</nav>`
    : '';
  const relatedMarkup = relatedArticles.length
    ? `<section class="related-articles" aria-labelledby="related-heading"><h2 id="related-heading">Похожие материалы</h2><div class="related-grid">${relatedArticles.map((item) => `<article><p>${escapeHtml(item.category || 'Новости')}</p><h3><a href="${articleUrl(item)}">${escapeHtml(item.titleRu || item.titleFi)}</a></h3></article>`).join('')}</div></section>`
    : '';
  const content = `<div class="article-wrap"><article><header class="article-head"><p class="eyebrow">Новость Финляндии</p>${editorialBadges(article)}${articleMeta(article, categoryToSlug)}<h1 class="article-title">${escapeHtml(title)}</h1><div class="article-facts"><span class="fact">${escapeHtml(article.category || 'Новости')}</span><span class="fact">${escapeHtml(article.sourceName || '')}</span><span class="fact">${escapeHtml(formatDate(article.publishedAt))}</span></div>${classificationMarkup}<p class="article-lead">${escapeHtml(article.summaryRu || article.summaryFi || '')}</p></header><div class="article-body-grid"><div>${reactionForm(article, reactionMessage)}${renderComments({ article, comments, commentMessage })}</div><aside class="article-aside">${original}<section class="side-card"><p class="sidebar-kicker">Поделиться</p><h2>Читайте и обсуждайте</h2><p>Сохраните постоянную ссылку на материал и оставьте комментарий после модерации.</p></section></aside></div>${adjacentMarkup}${relatedMarkup}</article></div>`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description: truncateText(description, 300),
    datePublished: article.publishedAt || undefined,
    dateModified: article.createdAt || article.publishedAt || undefined,
    mainEntityOfPage: `${siteUrl}/news/${encodeURIComponent(article.slug)}`,
    publisher: { '@type': 'Organization', name: 'Финские Новости', url: siteUrl },
    isBasedOn: safeExternalUrl(article.originalUrl) === '#' ? undefined : safeExternalUrl(article.originalUrl),
  };
  return documentPage({ title: `${title} — Финские Новости`, description, canonicalPath: `/news/${encodeURIComponent(article.slug)}`, siteUrl, content, breakingArticle: article.editorialStatus === 'urgent' ? article : null, structuredData });
}

function optionMarkup(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function renderTelegramControl(article, telegramConfigured) {
  if (article.telegramPublication) return `<p class="form-message" role="status">✓ Опубликовано в Telegram: ${escapeHtml(formatDate(article.telegramPublication.sentAt))}.</p>`;
  if (!telegramConfigured) return '<p class="summary">Telegram не настроен: укажите переменные на сервере.</p>';
  return `<form class="telegram-publish-form" action="/admin/articles/${article.id}/telegram" method="post"><button class="telegram-publish-button" type="submit">✈ Запостить в Telegram</button></form>`;
}

function renderAdminArticleForm(article, categories, telegramConfigured, canDelete) {
  const categoryOptions = categories.map((category) => optionMarkup(category, category, article.category)).join('');
  const statusOptions = ['normal', 'important', 'urgent'].map((value) => optionMarkup(value, { normal: 'Обычная', important: 'Важная', urgent: 'Срочная' }[value], article.editorialStatus)).join('');
  const scheduleField = article.publicationStatus === 'draft'
    ? `<label for="scheduled-${article.id}">Отложенная публикация</label><input id="scheduled-${article.id}" name="scheduled_publish_at" type="datetime-local" value="${escapeHtml(toDateTimeLocal(article.scheduledPublishAt))}"><p class="field-hint">Оставьте пустым, чтобы сохранить без расписания.</p>`
    : '';
  const publication = article.publicationStatus === 'draft'
    ? `<p class="form-message">${article.scheduledPublishAt ? `Запланировано на ${escapeHtml(formatDate(article.scheduledPublishAt))}.` : 'Черновик: статья ещё не видна публично.'}</p><form action="/admin/articles/${article.id}/publish" method="post"><button type="submit">Опубликовать сейчас</button></form>`
    : renderTelegramControl(article, telegramConfigured);
  const deleteControl = canDelete
    ? `<a class="admin-delete-link" href="/admin/articles/${article.id}/delete">Удалить статью</a>`
    : '';
  const discussionMarkup = article.publicationStatus === 'published' ? `<section class="editorial-discussion"><h3>Editorial Discussion</h3><p class="summary">ИИ подготовит варианты заметки и вопроса. Ничего не публикуется автоматически.</p><form action="/admin/articles/${article.id}/discussions/generate" method="post"><button type="submit">✨ Сгенерировать обсуждение</button></form>${(article.editorialDiscussions || []).map((d) => `<form class="editorial-discussion-card" action="/admin/discussions/${d.id}" method="post"><span class="editorial-label">Редакционная дискуссия · создано ИИ</span><textarea name="note" maxlength="3000" required>${escapeHtml(d.note)}</textarea><input name="question" maxlength="500" required value="${escapeHtml(d.question)}"><select name="status"><option value="draft" ${d.status === 'draft' ? 'selected' : ''}>Черновик</option><option value="approved" ${d.status === 'approved' ? 'selected' : ''}>Одобрено</option><option value="published" ${d.status === 'published' ? 'selected' : ''}>Опубликовано</option><option value="deleted">Удалить</option></select><button type="submit">Сохранить</button></form>`).join('')}</section>` : '';
  const classification = article.classification || {};
  const classificationSummary = [
    classification.region ? `Регион: ${classification.region.name}` : '',
    classification.tags?.length ? `Теги: ${classification.tags.map((tag) => tag.name).join(', ')}` : '',
    classification.audiences?.length ? `Аудитории: ${classification.audiences.map((audience) => audience.name).join(', ')}` : '',
    Number.isFinite(classification.confidence) ? `Уверенность: ${Math.round(classification.confidence * 100)}%` : '',
  ].filter(Boolean).join(' · ');
  const classificationControl = `<section class="admin-classification"><div><h3>Автоматическая классификация</h3><p>${escapeHtml(classificationSummary || 'Статья ещё не классифицирована.')}</p></div><form action="/admin/articles/${article.id}/classify" method="post"><button type="submit">Переклассифицировать</button></form></section>`;
  return `<article class="admin-comment"><h2>${article.publicationStatus === 'draft' ? 'Черновик: ' : ''}${article.publicationStatus === 'published' ? `<a href="/news/${encodeURIComponent(article.slug)}">${escapeHtml(article.titleRu || article.titleFi)}</a>` : escapeHtml(article.titleRu || article.titleFi)}</h2><form class="admin-form" action="/admin/articles/${article.id}" method="post"><label for="title-${article.id}">Заголовок</label><input id="title-${article.id}" name="title" maxlength="300" required value="${escapeHtml(article.titleRu || article.titleFi || '')}"><label for="text-${article.id}">Текст</label><textarea id="text-${article.id}" name="text" maxlength="20000" required>${escapeHtml(article.summaryRu || article.summaryFi || '')}</textarea><label for="category-${article.id}">Категория</label><select id="category-${article.id}" name="category" required>${categoryOptions}</select><label for="status-${article.id}">Редакционная метка</label><select id="status-${article.id}" name="editorial_status">${statusOptions}</select><label for="pinned-${article.id}">Закрепить до</label><input id="pinned-${article.id}" name="pinned_until" type="datetime-local" value="${escapeHtml(toDateTimeLocal(article.pinnedUntil))}">${scheduleField}<div class="admin-actions"><button type="submit">Сохранить</button>${deleteControl}</div></form>${classificationControl}<div class="admin-actions">${publication}</div>${discussionMarkup}</article>`;
}

function statusMessage(kind, status) {
  const values = {
    telegram: { sent: 'Новость отправлена в Telegram.', 'already-sent': 'Эта новость уже была отправлена в Telegram.', error: 'Не удалось отправить новость в Telegram. Попробуйте позже.' },
    import: { 'draft-created': 'Черновик импортированной статьи создан.', published: 'Черновик опубликован.', duplicate: 'Статья с этим источником уже существует.', similar: 'Импорт не выполнен: за этот день уже найдена очень похожая новость. Решение записано в журнал повторов.', error: 'Не удалось импортировать страницу. Проверьте ссылку и попробуйте позже.' },
    article: { scheduled: 'Новость сохранена и будет опубликована автоматически в указанное время.' },
    duplicate: { published: 'Материал опубликован несмотря на совпадение.', 'already-published': 'Этот материал уже был опубликован.', error: 'Не удалось опубликовать материал из журнала повторов.' },
    taxonomy: {
      created: 'Запись справочника создана.',
      updated: 'Изменения сохранены.',
      hidden: 'Запись скрыта из публичного выбора.',
      shown: 'Запись снова доступна.',
      deleted: 'Неиспользуемая запись удалена.',
      duplicate: 'Название, код или slug уже используются.',
      invalid: 'Проверьте обязательные поля и латинский код.',
      system: 'Системную категорию нельзя удалить — её можно скрыть.',
      'in-use': 'Удаление запрещено: запись используется статьями или подписками.',
      'not-found': 'Запись уже удалена или не найдена.',
      merged: 'Категории объединены. Статьи и подписки перенесены, старый URL перенаправляется на новую категорию.',
      'merge-invalid': 'Не удалось объединить категории. Проверьте категорию назначения.',
      'merged-hidden': 'Эта категория уже объединена с другой. Её старый адрес сохранён как перенаправление, поэтому снова показывать её отдельно нельзя.',
    },
    classification: {
      completed: 'Старые статьи без классификации обработаны.',
      empty: 'Все статьи уже классифицированы.',
      'article-updated': 'Классификация статьи обновлена.',
    },
    quality: {
      approved: 'Статья проверена, одобрена и опубликована редактором.',
      'approved-draft': 'Качество статьи одобрено. Редакционный черновик сохранён и ожидает отдельной публикации.',
      rejected: 'Статья скрыта с публичных страниц после проверки.',
    },
  };
  return values[kind][status] || '';
}

function renderTaxonomyManagement(taxonomy, canDelete, classificationCount = 0) {
  const definitions = {
    categories: {
      title: 'Категории',
      description: 'Основные разделы сайта и правила автоматической классификации.',
      newFields: '<label>Название<input name="name" maxlength="120" required></label><label>Slug латиницей<input name="slug" maxlength="100" placeholder="novaya-kategoriya" required></label><label>Код<input name="code" maxlength="80" placeholder="new-category"></label><label>Эмодзи<input name="emoji" maxlength="16"></label><label>Цвет<input name="color" type="color" value="#0f766e"></label><label>Порядок<input name="sort_order" type="number" min="0" max="10000" value="100"></label><label class="taxonomy-wide">Описание<textarea name="description" maxlength="1000"></textarea></label><label class="taxonomy-wide">Синонимы<textarea name="synonyms" maxlength="1000" placeholder="через запятую"></textarea></label><label class="taxonomy-wide">Ключевые слова<textarea name="keywords" maxlength="1000" placeholder="через запятую"></textarea></label>',
    },
    tags: {
      title: 'Теги',
      description: 'Гибкие тематические метки для статей и персональных подписок.',
      newFields: '<label>Название<input name="name" maxlength="120" required></label><label>Slug латиницей<input name="slug" maxlength="100" required></label><label class="taxonomy-wide">Описание<textarea name="description" maxlength="1000"></textarea></label><label class="taxonomy-wide">Альтернативные названия<textarea name="aliases" maxlength="1000" placeholder="через запятую"></textarea></label>',
    },
    regions: {
      title: 'Регионы',
      description: 'География новостей: страна, область, город или международная повестка.',
      newFields: '<label>Название<input name="name" maxlength="120" required></label><label>Код латиницей<input name="code" maxlength="80" required></label><label>Тип<input name="region_type" maxlength="80" value="region" required></label><label>Родительский код<input name="parent_code" maxlength="80"></label><label>Порядок<input name="sort_order" type="number" min="0" max="10000" value="100"></label>',
    },
    audiences: {
      title: 'Аудитории',
      description: 'Группы читателей для рекомендаций и персональных Telegram-рассылок.',
      newFields: '<label>Название<input name="name" maxlength="120" required></label><label>Код латиницей<input name="code" maxlength="80" required></label><label>Порядок<input name="sort_order" type="number" min="0" max="10000" value="100"></label><label class="taxonomy-wide">Описание<textarea name="description" maxlength="1000"></textarea></label>',
    },
  };
  const rowFields = (type, item) => {
    if (type === 'categories') {
      const locked = item.isSystem || item.usage?.total > 0;
      return `<label>Название<input name="name" maxlength="120" value="${escapeHtml(item.name)}" ${locked ? 'readonly' : ''} required></label><label>Slug<input name="slug" maxlength="100" value="${escapeHtml(item.slug)}" ${locked ? 'readonly' : ''} required></label><label>Эмодзи<input name="emoji" maxlength="16" value="${escapeHtml(item.emoji)}"></label><label>Цвет<input name="color" type="color" value="${escapeHtml(item.color || '#0f766e')}"></label><label>Порядок<input name="sort_order" type="number" min="0" max="10000" value="${item.sortOrder}"></label><label class="taxonomy-wide">Описание<textarea name="description" maxlength="1000">${escapeHtml(item.description)}</textarea></label><label class="taxonomy-wide">Синонимы<textarea name="synonyms" maxlength="1000">${escapeHtml(item.synonyms)}</textarea></label><label class="taxonomy-wide">Ключевые слова<textarea name="keywords" maxlength="1000">${escapeHtml(item.keywords)}</textarea></label><label class="taxonomy-wide">Правила классификации<textarea name="classification_rules" maxlength="2000">${escapeHtml(item.classificationRules)}</textarea></label>`;
    }
    if (type === 'tags') {
      const locked = item.usage?.total > 0;
      return `<label>Название<input name="name" maxlength="120" value="${escapeHtml(item.name)}" required></label><label>Slug<input name="slug" maxlength="100" value="${escapeHtml(item.slug)}" ${locked ? 'readonly' : ''} required></label><label class="taxonomy-wide">Описание<textarea name="description" maxlength="1000">${escapeHtml(item.description)}</textarea></label><label class="taxonomy-wide">Альтернативные названия<textarea name="aliases" maxlength="1000">${escapeHtml(item.aliases)}</textarea></label>`;
    }
    if (type === 'regions') {
      return `<label>Название<input name="name" maxlength="120" value="${escapeHtml(item.name)}" required></label><label>Тип<input name="region_type" maxlength="80" value="${escapeHtml(item.regionType)}" required></label><label>Родительский код<input name="parent_code" maxlength="80" value="${escapeHtml(item.parentCode)}"></label><label>Порядок<input name="sort_order" type="number" min="0" max="10000" value="${item.sortOrder}"></label>`;
    }
    return `<label>Название<input name="name" maxlength="120" value="${escapeHtml(item.name)}" required></label><label>Порядок<input name="sort_order" type="number" min="0" max="10000" value="${item.sortOrder}"></label><label class="taxonomy-wide">Описание<textarea name="description" maxlength="1000">${escapeHtml(item.description)}</textarea></label>`;
  };
  const sections = Object.entries(definitions).map(([type, definition]) => {
    const items = taxonomy[type] || [];
    const rows = items.map((item) => {
      const identity = item.code || item.slug;
      const usage = item.usage || { total: 0, articles: 0, subscriptions: 0 };
      const visibility = item.isVisible ? 'Скрыть' : 'Показать';
      const deleteControl = canDelete && !(type === 'categories' && item.isSystem)
        ? `<form action="/admin/taxonomy/${type}/${item.id}/delete" method="post" onsubmit="return confirm('Удалить запись? Операция будет отклонена, если запись используется.')"><button class="delete" type="submit">Удалить</button></form>`
        : '';
      const protection = type === 'categories' && item.isSystem
        ? 'Системная категория: постоянные имя и URL защищены.'
        : usage.total > 0
          ? `Используется: статьи — ${usage.articles}, подписки — ${usage.subscriptions}. Удаление защищено.`
          : 'Запись пока не используется и может быть удалена администратором.';
      const mergeOptions = type === 'categories'
        ? (taxonomy.categories || [])
          .filter((category) => category.id !== item.id && category.isVisible)
          .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
          .join('')
        : '';
      const mergeControl = canDelete && type === 'categories' && mergeOptions
        ? `<details class="taxonomy-merge"><summary>Объединить с другой категорией</summary><p class="field-hint">Все статьи и персональные подписки перейдут в выбранную категорию. «${escapeHtml(item.name)}» будет скрыта, а её прежний URL навсегда перенаправится на новый раздел.</p><form class="admin-actions" action="/admin/taxonomy/categories/${item.id}/merge" method="post" onsubmit="return confirm('Объединить категории? Статьи и подписки будут перенесены, а старая категория скрыта.')"><input type="hidden" name="confirm" value="MERGE"><label>Категория назначения<select name="target_id" required><option value="">Выберите категорию</option>${mergeOptions}</select></label><button class="reject" type="submit">Объединить безопасно</button></form></details>`
        : '';
      return `<details class="taxonomy-row"><summary><span>${escapeHtml(item.name)}</span><code>${escapeHtml(identity || '')}</code><span class="admin-status ${item.isVisible ? 'admin-status--approved' : 'admin-status--rejected'}">${item.isVisible ? 'Видна' : 'Скрыта'}</span><span>Изменить →</span></summary><form class="taxonomy-form" action="/admin/taxonomy/${type}/${item.id}" method="post">${rowFields(type, item)}<div class="taxonomy-wide admin-actions"><button type="submit">Сохранить</button></div></form><div class="admin-actions"><form action="/admin/taxonomy/${type}/${item.id}/visibility" method="post"><input type="hidden" name="visible" value="${item.isVisible ? '0' : '1'}"><button class="${item.isVisible ? 'reject' : ''}" type="submit">${visibility}</button></form>${deleteControl}<span class="field-hint">${escapeHtml(protection)}</span></div>${mergeControl}</details>`;
    }).join('') || '<p class="summary">Записей пока нет.</p>';
    return `<section class="admin-panel admin-panel--wide taxonomy-section" id="taxonomy-${type}"><div class="taxonomy-heading"><div><p class="eyebrow">Справочник</p><h2>${definition.title}</h2><p class="summary">${definition.description}</p></div><span class="taxonomy-count">${items.length}</span></div><details class="taxonomy-create"><summary>＋ Добавить запись</summary><form class="taxonomy-form" action="/admin/taxonomy/${type}" method="post">${definition.newFields}<div class="taxonomy-wide"><button type="submit">Создать</button></div></form></details><div class="taxonomy-list">${rows}</div></section>`;
  }).join('');
  const classifiedResult = classificationCount > 0
    ? `<p class="form-message" role="status">Обработано статей: ${classificationCount}.</p>`
    : '';
  return `<div class="taxonomy-intro"><div><p class="eyebrow">Структура контента</p><h2>Категории, теги, регионы и аудитории</h2><p>Скрытие безопасно убирает запись из нового выбора. Удаление разрешено только для неиспользуемых записей; системные категории защищены.</p></div><div class="taxonomy-links">${Object.entries(definitions).map(([type, item]) => `<a href="#taxonomy-${type}">${item.title}</a>`).join('')}</div></div><section class="admin-panel admin-panel--wide classifier-panel"><div><p class="eyebrow">Автоматизация</p><h2>Классификация статей</h2><p class="summary">Новые RSS, импортированные и ручные статьи классифицируются при сохранении. Обработайте старые записи без результата или примените изменённые правила заново к последним 500 статьям. Claude API не вызывается.</p>${classifiedResult}</div><div class="classifier-actions"><form action="/admin/articles/reclassify" method="post"><input type="hidden" name="scope" value="unclassified"><button type="submit">Обработать без классификации</button></form><form action="/admin/articles/reclassify" method="post"><input type="hidden" name="scope" value="all"><button class="secondary" type="submit">Применить правила заново</button></form></div></section>${sections}`;
}

function renderAdminLoginPage({ siteUrl, googleEnabled, basicEnabled, error = '' }) {
  const errors = {
    'not-configured': 'Вход через Google пока не настроен.',
    'invalid-state': 'Сеанс входа истёк или был отклонён. Попробуйте ещё раз.',
    'not-allowed': 'Этот Google-аккаунт не включён в список редакторов.',
    'google-failed': 'Google не подтвердил вход. Попробуйте ещё раз.',
  };
  const googleControl = googleEnabled
    ? '<a class="google-login-button" href="/admin/auth/google"><span aria-hidden="true">G</span> Войти через Google</a>'
    : '<p class="summary">Google-вход появится после настройки Client ID, Client Secret и списка разрешённых адресов.</p>';
  const basicControl = basicEnabled
    ? '<p class="admin-login-fallback"><a href="/admin/basic">Аварийный вход по старому паролю</a></p>'
    : '';
  const content = `<section class="admin-login"><div class="admin-login-card"><p class="eyebrow">Закрытая зона</p><h1>Вход в редакцию</h1><p>Используйте только разрешённый Google-аккаунт. Сайт не получает пароль Gmail и не запрашивает доступ к письмам.</p>${errors[error] ? `<p class="form-message" role="alert">${escapeHtml(errors[error])}</p>` : ''}${googleControl}${basicControl}<p class="admin-login-note">После входа защищённая сессия автоматически завершится. Все редакционные действия записываются в журнал.</p></div></section>`;
  return documentPage({
    title: 'Вход в редакцию — Финские Новости',
    description: 'Закрытая авторизация редакции.',
    canonicalPath: '/admin/login',
    siteUrl,
    robots: 'noindex,nofollow',
    content,
  });
}

function renderAdminPage({
  comments,
  articles,
  query,
  statistics,
  statisticsSources = [],
  duplicateArticles,
  auditLog = [],
  currentAccount = { username: 'admin', role: 'admin' },
  categories,
  telegramConfigured,
  telegramStatus,
  importProviderConfigured,
  importStatus,
  articleStatus = '',
  duplicateStatus = '',
  siteUrl,
  tab = 'stats',
  contactMessages = [],
  unreadContactMessages = 0,
  untranslatedArticleCount = 0,
  taxonomy = { categories: [], tags: [], regions: [], audiences: [] },
  taxonomyStatus = '',
  classificationStatus = '',
  classificationCount = 0,
  qualityQueue = [],
  qualityQueueCount = 0,
  qualityStatus = '',
}) {
  const canDelete = currentAccount && currentAccount.role === 'admin';
  const statusLabels = { pending: 'На модерации', approved: 'Опубликован', rejected: 'Отклонён' };
  const commentMarkup = comments.length ? comments.map((comment) => {
    const approve = comment.status === 'approved' ? '' : `<form action="/admin/comments/${comment.id}/approve" method="post"><button type="submit">Одобрить</button></form>`;
    const reject = comment.status === 'rejected' ? '' : `<form action="/admin/comments/${comment.id}/reject" method="post"><button class="reject" type="submit">Отклонить</button></form>`;
    const deleteControl = canDelete
      ? `<form action="/admin/comments/${comment.id}/delete" method="post"><button class="delete" type="submit">Удалить</button></form>`
      : '';
    return `<article class="admin-comment"><div class="admin-comment-head"><h2><a href="/news/${encodeURIComponent(comment.articleSlug)}">${escapeHtml(comment.articleTitle)}</a></h2><span class="admin-status admin-status--${escapeHtml(comment.status)}">${escapeHtml(statusLabels[comment.status] || comment.status)}</span></div><time class="comment-date" datetime="${escapeHtml(comment.createdAt || '')}">${escapeHtml(formatDate(comment.createdAt))}</time><form class="admin-form" action="/admin/comments/${comment.id}" method="post"><label for="comment-author-${comment.id}">Имя</label><input id="comment-author-${comment.id}" name="author_name" maxlength="80" required value="${escapeHtml(comment.authorName)}"><label for="comment-body-${comment.id}">Комментарий</label><textarea id="comment-body-${comment.id}" name="body" maxlength="1500" required>${escapeHtml(comment.body)}</textarea><button type="submit">Сохранить правки</button></form><div class="admin-actions">${approve}${reject}${deleteControl}</div></article>`;
  }).join('') : '<div class="empty-state">Комментариев пока нет.</div>';
  const articleForms = articles.length ? articles.map((article) => `<details class="admin-article-row"><summary><span class="admin-article-title">${escapeHtml(article.titleRu || article.titleFi)}</span><span class="admin-article-meta">${escapeHtml(article.category || 'Без категории')} · ${escapeHtml(formatDate(article.publishedAt))}</span><span class="admin-article-edit">Редактировать →</span></summary>${renderAdminArticleForm(article, categories, telegramConfigured, canDelete)}</details>`).join('') : '<div class="empty-state">Статьи не найдены.</div>';
  const top = (list, empty) => list.length ? `<ol>${list.map((item) => `<li><a href="/news/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a> <span class="admin-count">${item.count}</span></li>`).join('')}</ol>` : `<p class="summary">${empty}</p>`;
  const categoryOptions = categories.map((category) => optionMarkup(category, category, '')).join('');
  const notices = [statusMessage('telegram', telegramStatus), statusMessage('import', importStatus), statusMessage('article', articleStatus), statusMessage('duplicate', duplicateStatus), statusMessage('taxonomy', taxonomyStatus), statusMessage('classification', classificationStatus), statusMessage('quality', qualityStatus)].filter(Boolean).map((message) => `<p class="form-message" role="status">${escapeHtml(message)}</p>`).join('');
  const dailyRows = statistics.daily.map((day) => `<tr><th scope="row">${escapeHtml(day.day)}</th><td>${day.articles}</td><td>${day.visitors}</td><td>${day.articleViews}</td><td>${day.comments}</td><td>${day.reactions}</td><td>${day.duplicates}</td></tr>`).join('');
  const maxVisitors = Math.max(1, ...statistics.daily.map((day) => day.visitors));
  const visitorChart = `<div class="visitor-chart" aria-label="Посетители по дням">${statistics.daily.slice(-14).map((day) => `<div class="visitor-bar-wrap" title="${escapeHtml(day.day)}: ${day.visitors} посетителей"><div class="visitor-bar" style="height:${Math.max(8, Math.round((day.visitors / maxVisitors) * 100))}%"></div><span>${escapeHtml(day.day.slice(5))}</span></div>`).join('')}</div>`;
  const operational = statistics.operational || { queue: {}, delivery: {}, searches: [] };
  const operationalMarkup = `<div class="admin-grid"><section class="admin-panel"><h2>Доставка Telegram за 24 часа</h2><dl class="admin-stats"><div class="stat-card"><dt>Отправлено</dt><dd>${operational.delivery.sent || 0}</dd></div><div class="stat-card"><dt>Ошибок</dt><dd>${operational.delivery.failed || 0}</dd></div><div class="stat-card"><dt>В очереди</dt><dd>${(operational.queue.queued || 0) + (operational.queue.retry || 0)}</dd></div><div class="stat-card"><dt>Исчерпано попыток</dt><dd>${operational.queue.dead || 0}</dd></div></dl></section><section class="admin-panel"><h2>Популярные запросы за 7 дней</h2>${operational.searches.length ? `<ol>${operational.searches.map((item) => `<li>${escapeHtml(item.query)} <span class="admin-count">${item.searches}</span></li>`).join('')}</ol>` : '<p class="summary">Поисковых запросов пока нет.</p>'}</section></div>`;
  const resolutionLabels = { skipped: 'Пропущено', published: 'Опубликовано редактором', dismissed: 'Отклонено редактором' };
  const duplicateMarkup = duplicateArticles.length ? `<ol class="duplicate-list">${duplicateArticles.map((item) => `<li><div><a href="${escapeHtml(safeExternalUrl(item.originalUrl))}" rel="noopener noreferrer">${escapeHtml(item.titleFi)}</a><span class="summary">${escapeHtml(item.sourceName)} · совпадение ${Math.round(item.similarity * 100)}% · ${escapeHtml(resolutionLabels[item.resolution] || item.resolution)}</span>${item.resolution === 'skipped' ? `<form action="/admin/duplicates/${item.id}/publish" method="post"><button type="submit">Опубликовать всё равно</button></form>` : `<span class="summary">${item.resolvedBy ? `Решение: ${escapeHtml(item.resolvedBy)}` : ''}</span>`}</div><span>→</span><div>${item.matchedSlug ? `<a href="/news/${encodeURIComponent(item.matchedSlug)}">${escapeHtml(item.matchedTitle)}</a>` : escapeHtml(item.matchedTitle || 'Исходная статья удалена')}<span class="summary">${escapeHtml(item.matchedSourceName || '')}</span></div></li>`).join('')}</ol>` : '<p class="summary">Похожие материалы пока не пропускались.</p>';
  const statsCategoryOptions = categories.map((category) => optionMarkup(category, category, statistics.filters.category)).join('');
  const sourceOptions = statisticsSources.map((source) => optionMarkup(source.sourceId, `${source.sourceName} (${source.count})`, statistics.filters.sourceId)).join('');
  const statsParams = new URLSearchParams();
  statsParams.set('from', statistics.filters.from);
  statsParams.set('to', statistics.filters.to);
  if (statistics.filters.category) statsParams.set('category', statistics.filters.category);
  if (statistics.filters.sourceId) statsParams.set('source', statistics.filters.sourceId);
  const statisticsFilter = `<form class="admin-filter" action="/admin" method="get"><div><label for="stats-from">С даты</label><input id="stats-from" name="from" type="date" value="${escapeHtml(statistics.filters.from)}"></div><div><label for="stats-to">По дату</label><input id="stats-to" name="to" type="date" value="${escapeHtml(statistics.filters.to)}"></div><div><label for="stats-category">Категория</label><select id="stats-category" name="category"><option value="">Все категории</option>${statsCategoryOptions}</select></div><div><label for="stats-source">Источник</label><select id="stats-source" name="source"><option value="">Все источники</option>${sourceOptions}</select></div><div class="admin-filter-actions"><button type="submit">Применить</button><a href="/admin">Сбросить</a><a class="button-link" href="/admin/statistics.csv?${escapeHtml(statsParams.toString())}">Скачать CSV</a></div></form>`;
  const actionLabels = {
    'article.create': 'Создана статья', 'article.update': 'Изменена статья', 'article.schedule': 'Запланирована статья',
    'article.publish': 'Опубликован черновик', 'article.scheduled_publish': 'Опубликовано по расписанию',
    'article.delete': 'Удалена статья', 'article.import_draft': 'Импортирован черновик',
    'article.telegram_send': 'Отправлено в Telegram', 'duplicate.publish_anyway': 'Повтор опубликован вручную',
    'comment.update': 'Изменён комментарий', 'comment.approve': 'Одобрен комментарий',
    'comment.reject': 'Отклонён комментарий', 'comment.delete': 'Удалён комментарий',
    'statistics.export_csv': 'Выгружена статистика CSV',
    'taxonomy.create': 'Создана запись справочника', 'taxonomy.update': 'Изменена запись справочника',
    'taxonomy.visibility': 'Изменена видимость справочника', 'taxonomy.delete': 'Удалена запись справочника',
    'taxonomy.delete_blocked': 'Удаление справочника отклонено',
    'taxonomy.merge': 'Объединены категории', 'taxonomy.merge_failed': 'Объединение категорий отклонено',
    'classification.batch': 'Классифицированы старые статьи', 'article.classify': 'Обновлена классификация статьи',
    'quality.approve': 'Статья одобрена после проверки качества',
    'quality.reject': 'Статья скрыта после проверки качества',
    'auth.google_login': 'Вход через Google', 'auth.google_denied': 'Google-вход отклонён',
    'authorization.denied': 'Действие отклонено по роли',
    'auth.logout': 'Выход из редакции',
  };
  const auditMarkup = auditLog.length ? `<div class="admin-table-scroll"><table class="admin-table audit-table"><thead><tr><th>Время</th><th>Редактор</th><th>Действие</th><th>Объект</th><th>Детали</th></tr></thead><tbody>${auditLog.map((entry) => {
    const details = entry.details ? Object.entries(entry.details).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ') : '';
    return `<tr><td>${escapeHtml(formatDate(entry.createdAt))}</td><td>${escapeHtml(entry.actorUsername)} <span class="summary">${escapeHtml(entry.actorRole)}</span></td><td>${escapeHtml(actionLabels[entry.action] || entry.action)}</td><td>${escapeHtml(entry.targetType)}${entry.targetId ? ` #${escapeHtml(entry.targetId)}` : ''}</td><td>${escapeHtml(details)}</td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="summary">Журнал пока пуст.</p>';
  const activeTab = new Set(['stats', 'articles', 'comments', 'quality', 'duplicates', 'audit', 'messages', 'taxonomy']).has(tab) ? tab : 'stats';
  const tabPanel = (name, label, html) => `<section class="admin-tab-panel${activeTab === name ? ' is-active' : ''}" id="admin-tab-${name}" data-admin-tab="${name}"><h2 class="sr-only">${label}</h2>${html}</section>`;
  const cleanupPanel = untranslatedArticleCount > 0 ? `<section class="admin-panel admin-panel--danger"><h2>Проверка перевода</h2><p class="summary">Найдено статей без русского перевода: <strong>${untranslatedArticleCount}</strong>.</p><form action="/admin/articles/cleanup-untranslated" method="post" onsubmit="return confirm('Удалить все статьи без русского перевода и связанные данные?')"><input type="hidden" name="confirm" value="DELETE_UNTRANSLATED"><button class="delete" type="submit">Удалить все непереведённые статьи</button></form></section>` : '<section class="admin-panel"><h2>Проверка перевода</h2><p class="summary">Статей без русского перевода не найдено.</p></section>';
  const contactMarkup = contactMessages.length ? `<div class="admin-list">${contactMessages.map((message) => `<article class="admin-comment"><div class="admin-comment-head"><h2>${escapeHtml(message.name)} · <a href="mailto:${escapeHtml(message.email)}">${escapeHtml(message.email)}</a></h2><span class="admin-status admin-status--${escapeHtml(message.status)}">${escapeHtml(message.status === 'new' ? 'Новое' : message.status === 'read' ? 'Прочитано' : 'Архив')}</span></div><time class="comment-date">${escapeHtml(formatDate(message.createdAt))}</time><p class="comment-body">${escapeHtml(message.body)}</p>${message.status === 'new' ? `<form action="/admin/contact-messages/${message.id}/read" method="post"><button type="submit">Отметить прочитанным</button></form>` : ''}</article>`).join('')}</div>` : '<p class="summary">Сообщений пока нет.</p>';
  const messageBadge = unreadContactMessages > 0 ? ` <span class="admin-tab-badge" aria-label="Непрочитанных: ${unreadContactMessages}">${unreadContactMessages > 99 ? '99+' : unreadContactMessages}</span>` : '';
  const qualityBadge = qualityQueueCount > 0 ? ` <span class="admin-tab-badge" aria-label="Ожидают проверки: ${qualityQueueCount}">${qualityQueueCount > 99 ? '99+' : qualityQueueCount}</span>` : '';
  const qualityMarkup = qualityQueue.length ? `<div class="quality-queue">${qualityQueue.map((article) => {
    const classification = article.classification || {};
    const categoryReviewOptions = categories.map((category) => optionMarkup(category, category, article.category)).join('');
    const importanceOptions = [1, 2, 3, 4, 5].map((level) => optionMarkup(String(level), `${level} — ${['низкая', 'обычная', 'заметная', 'важная', 'критическая'][level - 1]}`, String(article.importanceLevel || 1))).join('');
    const articleTitle = escapeHtml(article.titleRu || article.titleFi || 'Без заголовка');
    const articleHeading = article.publicationStatus === 'published'
      ? `<a href="/news/${encodeURIComponent(article.slug)}">${articleTitle}</a>`
      : articleTitle;
    return `<article class="quality-card">
      <header><div><span class="quality-status">Нужна ручная проверка</span><h3>${articleHeading}</h3><p class="summary">${escapeHtml(article.sourceName)} · ${escapeHtml(formatDate(article.publishedAt))}${article.publicationStatus === 'draft' ? ' · скрытый черновик' : ''}</p></div><strong class="quality-score">${Math.round(Number(article.qualityConfidence || 0) * 100)}%</strong></header>
      <div class="quality-explanation"><p><strong>Почему статья попала в очередь:</strong> ${escapeHtml(article.qualityReason || classification.qualityReason || 'Автоматическая проверка не завершена.')}</p><p><strong>Решение классификатора:</strong> ${escapeHtml(classification.explanation || 'Подробное объяснение отсутствует.')}</p><p><strong>Важность:</strong> ${escapeHtml(article.importanceReason || classification.importanceReason || '')}</p></div>
      <form class="quality-review-form" action="/admin/quality/${article.id}" method="post">
        <label>Категория<select name="category" required>${categoryReviewOptions}</select></label>
        <label>Важность 1–5<select name="importance_level" required>${importanceOptions}</select></label>
        <label class="quality-note">Комментарий редактора<textarea name="note" maxlength="1000" placeholder="Необязательно: почему решение изменено"></textarea></label>
        <p class="field-hint">${article.qualityPublishOnApproval ? 'После одобрения статья будет опубликована.' : 'Одобрение качества не публикует редакционный черновик автоматически.'}</p>
        <div class="admin-actions"><button name="decision" value="approve" type="submit">${article.qualityPublishOnApproval ? '✓ Одобрить и опубликовать' : '✓ Одобрить качество'}</button><button class="reject" name="decision" value="reject" type="submit">Отклонить и скрыть</button></div>
      </form>
    </article>`;
  }).join('')}</div>` : '<div class="empty-state">Очередь пуста: сомнительных статей нет.</div>';
  const tabNav = `<nav class="admin-tabs" aria-label="Разделы админ-панели">${[['stats', '📊 Статистика'], ['articles', '📰 Статьи'], ['comments', '💬 Комментарии'], ['quality', `✅ Качество${qualityBadge}`], ['taxonomy', '🗂 Справочники'], ['messages', `✉️ Сообщения${messageBadge}`], ['duplicates', '🔎 Повторы'], ['audit', '🛡 Журнал']].map(([name, label]) => `<a class="${activeTab === name ? 'active' : ''}" href="/admin?tab=${name}">${label}</a>`).join('')}</nav>`;
  const content = `<div class="admin-wrap">
    <header class="admin-hero"><div><p class="eyebrow">Закрытая зона</p><h1 class="page-heading">Редакция и модерация</h1></div><div class="admin-account"><p>Вошли как <strong>${escapeHtml(currentAccount.displayName || currentAccount.username)}</strong> · ${escapeHtml(currentAccount.role)} · ${escapeHtml(currentAccount.authMethod || 'basic')}</p><form action="/admin/logout" method="post"><button type="submit">Выйти</button></form></div></header>
    ${notices}${activeTab === 'stats' ? visitorChart : ''}${tabNav}${activeTab === 'articles' ? cleanupPanel : ''}
    ${tabPanel('stats', 'Статистика', `<section class="admin-panel admin-panel--wide"><h2>Статистика</h2>${statisticsFilter}<dl class="admin-stats"><div class="stat-card"><dt>Всего статей</dt><dd>${statistics.articleCount}</dd></div><div class="stat-card"><dt>Статей за период</dt><dd>${statistics.report.articles}</dd></div><div class="stat-card"><dt>Читатели за период</dt><dd>${statistics.report.visitors}</dd></div><div class="stat-card"><dt>Чтения за период</dt><dd>${statistics.report.articleViews}</dd></div><div class="stat-card"><dt>Комментарии</dt><dd>${statistics.report.comments}</dd></div><div class="stat-card"><dt>Реакции</dt><dd>${statistics.report.reactions}</dd></div><div class="stat-card"><dt>Повторы</dt><dd>${statistics.report.duplicates}</dd></div><div class="stat-card"><dt>На модерации</dt><dd>${statistics.pendingComments}</dd></div></dl><div class="admin-table-scroll"><table class="admin-table"><thead><tr><th>Дата</th><th>Статьи</th><th>Читатели</th><th>Чтения</th><th>Комментарии</th><th>Реакции</th><th>Повторы</th></tr></thead><tbody>${dailyRows}</tbody></table></div></section><div class="admin-grid"><section class="admin-panel"><h2>Топ читаемых за период</h2>${top(statistics.topRead, 'Просмотров за период пока нет.')}</section><section class="admin-panel"><h2>Топ комментируемых за период</h2>${top(statistics.topCommented, 'Одобренных комментариев за период пока нет.')}</section></div>${operationalMarkup}`)}
    ${tabPanel('articles', 'Статьи', `<div class="admin-grid"><section class="admin-panel"><h2>Импортировать по ссылке</h2>${importProviderConfigured ? '<p class="summary">Страница будет безопасно загружена, проверена на повтор, переведена и сохранена как черновик.</p><form class="admin-form" action="/admin/import" method="post"><label for="import-url">Внешний HTTPS-адрес</label><input id="import-url" name="url" type="url" inputmode="url" placeholder="https://example.com/news" required><button type="submit">Создать черновик</button></form>' : '<p class="summary">Импорт недоступен: настройте провайдер пересказа.</p>'}</section><section class="admin-panel"><h2>Новая ручная новость</h2><form class="admin-form" action="/admin/articles" method="post"><label for="new-title">Заголовок</label><input id="new-title" name="title" maxlength="300" required><label for="new-text">Текст</label><textarea id="new-text" name="text" maxlength="20000" required></textarea><label for="new-category">Категория</label><select id="new-category" name="category" required><option value="">Выберите категорию</option>${categoryOptions}</select><label for="new-status">Редакционная метка</label><select id="new-status" name="editorial_status">${optionMarkup('normal', 'Обычная', 'normal')}${optionMarkup('important', 'Важная', 'normal')}${optionMarkup('urgent', 'Срочная', 'normal')}</select><label for="new-pinned">Показывать в главных до</label><input id="new-pinned" name="pinned_until" type="datetime-local"><label for="new-scheduled">Опубликовать позже</label><input id="new-scheduled" name="scheduled_publish_at" type="datetime-local"><p class="field-hint">Если дата не указана, новость появится сразу.</p><button type="submit">Опубликовать или запланировать</button></form></section></div><h2 class="section-heading">Редактирование статей</h2><form class="admin-search" action="/admin" method="get"><input type="hidden" name="tab" value="articles"><label for="article-search">Поиск по заголовку</label><input id="article-search" name="q" type="search" value="${escapeHtml(query)}"><button type="submit">Найти</button></form><section class="admin-list">${articleForms}</section>`)}
    ${tabPanel('comments', 'Комментарии', `<h2 class="section-heading">Модерация и редактирование комментариев</h2><section class="admin-list">${commentMarkup}</section>`)}
    ${tabPanel('quality', 'Контроль качества', `<section class="admin-panel admin-panel--wide"><div class="admin-panel-heading"><div><h2>Очередь контроля качества</h2><p class="summary">Автоматическая оценка объясняет причину сомнения. Только редактор может одобрить материал или скрыть его.</p></div><span class="quality-total">${qualityQueueCount} на проверке</span></div>${qualityMarkup}</section>`)}
    ${tabPanel('taxonomy', 'Справочники', renderTaxonomyManagement(taxonomy, canDelete, classificationCount))}
    ${tabPanel('messages', 'Сообщения', `<section class="admin-panel admin-panel--wide"><h2>Сообщения от посетителей</h2><p class="summary">Сообщения сохраняются в SQLite и доступны редакции. Ответ можно отправить на e-mail через почтовый клиент.</p>${contactMarkup}</section>`)}
    ${tabPanel('duplicates', 'Повторы', `<section class="admin-panel admin-panel--wide"><h2>Журнал похожих новостей</h2><p class="summary">Автоматически пропущенный материал можно проверить и опубликовать вручную.</p>${duplicateMarkup}</section>`)}
    ${tabPanel('audit', 'Журнал', `<section class="admin-panel admin-panel--wide"><h2>Журнал действий редакторов</h2><p class="summary">Хранятся имя учётной записи, действие, объект и время.</p>${auditMarkup}</section>`)}
  </div>`;
  return documentPage({ title: 'Редакция и модерация — Финские Новости', description: 'Закрытая страница редакции и модерации.', canonicalPath: '/admin', siteUrl, robots: 'noindex', content });
}

function renderAboutPage({ siteUrl }) {
  const content = `<article class="info-page">
    <section class="info-hero">
      <div><p class="eyebrow">О проекте</p><h1 class="page-heading">Новости Финляндии — понятно и с уважением к источникам</h1><p class="page-intro">Следите за событиями Финляндии на русском языке и всегда переходите к первоисточнику, когда нужен полный контекст.</p></div>
      <div class="info-hero-mark" aria-hidden="true">${brandMark}</div>
    </section>
    <div class="info-grid">
      <section class="info-card"><span class="info-card-icon">🇫🇮</span><h2>Что мы публикуем</h2><p>Мы собираем открытые RSS-анонсы финских СМИ и публикуем краткие русскоязычные пересказы. У каждой новости указан источник и доступна ссылка на оригинальный материал.</p></section>
      <section class="info-card"><span class="info-card-icon">✨</span><h2>Как используется ИИ</h2><p>ИИ помогает подготовить пересказ, но не заменяет оригинальную статью. Редакционные материалы и обсуждения всегда имеют понятную маркировку.</p></section>
      <section class="info-card"><span class="info-card-icon">💬</span><h2>Комментарии</h2><p>Комментарий сначала попадает на премодерацию. После одобрения редакцией его имя и текст становятся видны на странице соответствующей новости.</p></section>
      <section class="info-card" id="privacy"><span class="info-card-icon">🛡️</span><h2>Конфиденциальность</h2><p>Сайт учитывает просмотры и реакции с помощью анонимного дневного идентификатора. IP-адреса и User-Agent не сохраняются в открытом виде.</p></section>
    </div>
    <aside class="info-note"><strong>Главный принцип:</strong> краткий пересказ помогает быстро понять событие, а оригинальный источник остаётся основой материала.</aside>
  </article>`;
  return documentPage({ title: 'О проекте и конфиденциальность — Финские Новости', description: 'Как «Финские Новости» публикуют русскоязычные пересказы новостей Финляндии.', canonicalPath: '/about', siteUrl, content });
}

function renderContactPage({ siteUrl, status = '' }) {
  const message = status === 'sent' ? '<p class="form-message" role="status">Сообщение отправлено в редакцию.</p>' : '';
  const content = `<article class="contact-page">
    <section class="page-top"><p class="eyebrow">Обратная связь</p><h1 class="page-heading">Связаться с редакцией</h1><p class="page-intro">Расскажите о новости, предложите сотрудничество или сообщите, что можно улучшить.</p></section>
    <div class="contact-layout">
      <form class="contact-form contact-form--page" action="/contact" method="post">
        ${message}
        <label>Ваше имя<input name="name" maxlength="80" autocomplete="name" placeholder="Иван Иванов" required></label>
        <label>E-mail для ответа<input name="email" type="email" maxlength="254" autocomplete="email" placeholder="ivan@example.com" required></label>
        <label>Сообщение<textarea name="body" maxlength="3000" placeholder="Ваше сообщение…" required></textarea></label>
        <button type="submit">✈ Отправить сообщение</button>
      </form>
      <aside class="contact-aside"><p class="eyebrow">Как это работает</p><h2>Сообщение попадёт прямо в редакцию</h2><p>Мы сохраняем обращение в защищённом разделе админ-панели. E-mail нужен только для ответа.</p><a href="/about#privacy">О конфиденциальности →</a></aside>
    </div>
  </article>`;
  return documentPage({ title: 'Контакты — Финские Новости', description: 'Свяжитесь с редакцией Финских Новостей.', canonicalPath: '/contact', siteUrl, content });
}

function renderAccountPage({
  siteUrl,
  user,
  subscription,
  categories = defaultCategories,
  sources = [],
  taxonomy = { tags: [], regions: [], audiences: [] },
  telegramLink = null,
  botProfile = null,
  message = '',
  telegramLinkCode = '',
}) {
  const selectedCategories = Array.isArray(subscription.categories) ? subscription.categories : [];
  const selectedSources = Array.isArray(subscription.sourceIds) ? subscription.sourceIds : [];
  const selectedContentTypes = Array.isArray(subscription.contentTypes) ? subscription.contentTypes : ['news'];
  const selectedExcludedCategories = Array.isArray(subscription.excludedCategories) ? subscription.excludedCategories : [];
  const selectedTagIds = new Set((subscription.tagIds || []).map(String));
  const selectedRegions = new Set(subscription.regionCodes || []);
  const selectedAudiences = new Set(subscription.audienceCodes || []);
  const selectedDeliveryWeekdays = new Set(subscription.deliveryWeekdays || ['1', '2', '3', '4', '5', '6', '0']);
  const selectedQuietWeekdays = new Set(subscription.quietWeekdays || ['1', '2', '3', '4', '5', '6', '0']);
  const categoryOptions = categories.map((category) => `<label class="account-choice"><input type="checkbox" name="categories" value="${escapeHtml(category)}"${selectedCategories.includes(category) ? ' checked' : ''}><span>${escapeHtml(category)}</span></label>`).join('');
  const sourceOptions = sources.map((source) => `<label class="account-choice"><input type="checkbox" name="source_ids" value="${escapeHtml(source.sourceId)}"${selectedSources.includes(source.sourceId) ? ' checked' : ''}><span>${escapeHtml(source.sourceName || source.sourceId)}</span></label>`).join('');
  const excludedCategoryOptions = categories.map((category) => `<label class="account-choice"><input type="checkbox" name="excluded_categories" value="${escapeHtml(category)}"${selectedExcludedCategories.includes(category) ? ' checked' : ''}><span>${escapeHtml(category)}</span></label>`).join('');
  const tagOptions = (taxonomy.tags || []).filter((tag) => tag.isVisible).map((tag) => `<label class="account-choice"><input type="checkbox" name="tag_ids" value="${tag.id}"${selectedTagIds.has(String(tag.id)) ? ' checked' : ''}><span>#${escapeHtml(tag.name)}</span></label>`).join('');
  const regionOptions = (taxonomy.regions || []).filter((region) => region.isVisible).map((region) => `<label class="account-choice"><input type="checkbox" name="region_codes" value="${escapeHtml(region.code)}"${selectedRegions.has(region.code) ? ' checked' : ''}><span>${escapeHtml(region.name)}</span></label>`).join('');
  const audienceOptions = (taxonomy.audiences || []).filter((audience) => audience.isVisible && audience.code !== 'all').map((audience) => `<label class="account-choice"><input type="checkbox" name="audience_codes" value="${escapeHtml(audience.code)}"${selectedAudiences.has(audience.code) ? ' checked' : ''}><span>${escapeHtml(audience.name)}</span></label>`).join('');
  const weekdayLabels = [['1', 'Пн'], ['2', 'Вт'], ['3', 'Ср'], ['4', 'Чт'], ['5', 'Пт'], ['6', 'Сб'], ['0', 'Вс']];
  const weekdayOptions = (name, selected) => weekdayLabels.map(([value, label]) => `<label class="account-choice"><input type="checkbox" name="${name}" value="${value}"${selected.has(value) ? ' checked' : ''}><span>${label}</span></label>`).join('');
  const telegramConnected = Boolean(telegramLink?.telegramChatId);
  const telegramStatus = telegramConnected ? 'Подключён' : 'Не подключён';
  const botLabel = botProfile?.username ? `@${botProfile.username}` : 'бот проекта «Финские Новости»';
  const statusMessage = message ? `<p class="account-notice" role="status">${escapeHtml(message)}</p>` : '';
  const deliveryWarning = telegramConnected && !subscription.enabled
    ? '<p class="account-notice account-notice--error" role="alert">Telegram подключён, но рассылка выключена. Включите переключатель «Получать новые публикации» и сохраните настройки.</p>'
    : '';
  let telegramSetup;
  if (telegramConnected) {
    telegramSetup = '<div class="account-callout account-callout--success"><strong>✓ Telegram подключён</strong><span>Выберите темы и сохраните настройки — рассылка будет приходить в привязанный чат.</span></div>';
  } else {
    telegramSetup = `<div class="account-callout"><strong>Подключение почти автоматическое</strong><span>Нажмите кнопку ниже — откроется именно ${escapeHtml(botLabel)} с готовой безопасной привязкой.</span><span><b>Имя канала вводить не нужно.</b> В Telegram останется нажать только «Запустить» — это обязательное подтверждение Telegram.</span></div>`;
  }
  const content = `<article class="account-page">
    <section class="account-hero">
      <div><p class="eyebrow">Личный кабинет</p><h1>Персональная Telegram-рассылка</h1><p>Здравствуйте, <strong>${escapeHtml(user.displayName || user.email)}</strong>. Настройте темы, частоту и количество новостей — бот пришлёт только выбранное.</p></div>
      <span class="account-hero-icon" aria-hidden="true">✈</span>
    </section>
    ${statusMessage}
    ${deliveryWarning}
    <dl class="account-stats">
      <div><dt>Telegram</dt><dd class="${telegramConnected ? 'is-connected' : ''}">${telegramStatus}</dd></div>
      <div><dt>Частота</dt><dd>${subscription.frequency === 'instant' ? 'Сразу' : 'Ежедневно'}</dd></div>
      <div><dt>Лимит</dt><dd>${subscription.maxPostsPerDay} в день</dd></div>
    </dl>
    <div class="account-layout">
      <section class="account-card account-card--settings">
        <div class="account-section-head"><div><p class="eyebrow">Настройки</p><h2>Ваша новостная лента</h2></div><span>01</span></div>
        <form class="account-form" method="post" action="/account/subscription">
          <label class="account-toggle"><input type="checkbox" name="enabled"${subscription.enabled ? ' checked' : ''}><span><strong>Включить рассылку</strong><small>Получать новые публикации в Telegram</small></span></label>
          <div class="account-form-grid">
            <label class="account-field"><span>Частота</span><select name="frequency"><option value="instant"${subscription.frequency === 'instant' ? ' selected' : ''}>Сразу после публикации</option><option value="daily"${subscription.frequency === 'daily' ? ' selected' : ''}>Ежедневная подборка</option></select></label>
            <label class="account-field"><span>Охват</span><select name="scope"><option value="finland"${subscription.scope === 'finland' ? ' selected' : ''}>Только Финляндия</option><option value="all"${subscription.scope === 'all' ? ' selected' : ''}>Финляндия и мир</option></select></label>
            <label class="account-field"><span>Важность</span><select name="importance"><option value="all"${subscription.importance === 'all' ? ' selected' : ''}>Все выбранные статьи</option><option value="important"${subscription.importance === 'important' ? ' selected' : ''}>Только важные и срочные</option></select></label>
            <label class="account-field"><span>Минимальная важность 1–5</span><input name="minimum_importance" type="number" min="1" max="5" value="${subscription.minimumImportance || 1}"></label>
            <label class="account-field"><span>Максимум постов в день</span><input name="max_posts_per_day" type="number" min="1" max="30" value="${subscription.maxPostsPerDay}"></label>
            <label class="account-field"><span>Время ежедневной подборки</span><input name="delivery_time" type="time" value="${escapeHtml(subscription.deliveryTimes?.[0] || '08:00')}"></label>
          </div>
          <fieldset class="account-fieldset"><legend>Темы</legend><div class="account-choices">${categoryOptions || '<span class="account-muted">Нет доступных категорий.</span>'}</div></fieldset>
          <details class="account-advanced"><summary>Расширенные фильтры</summary>
            <fieldset class="account-fieldset"><legend>Не присылать темы</legend><div class="account-choices">${excludedCategoryOptions}</div></fieldset>
            <fieldset class="account-fieldset"><legend>Теги</legend><div class="account-choices">${tagOptions || '<span class="account-muted">Теги появятся после классификации статей.</span>'}</div></fieldset>
            <fieldset class="account-fieldset"><legend>География</legend><div class="account-choices">${regionOptions}</div></fieldset>
            <fieldset class="account-fieldset"><legend>Для кого</legend><div class="account-choices">${audienceOptions}</div></fieldset>
          </details>
          <fieldset class="account-fieldset"><legend>Источники новостей</legend><div class="account-choices">${sourceOptions || '<span class="account-muted">Источники появятся после обновления новостей.</span>'}</div><small class="account-muted">Если ничего не выбрано, будут использоваться все источники.</small></fieldset>
          <fieldset class="account-fieldset"><legend>Дни доставки</legend><div class="account-choices">${weekdayOptions('delivery_weekdays', selectedDeliveryWeekdays)}</div></fieldset>
          <fieldset class="account-fieldset">
            <legend>Что присылать</legend>
            <div class="account-choices">
              <label class="account-choice"><input type="checkbox" name="content_types" value="news"${selectedContentTypes.includes('news') ? ' checked' : ''}><span>📰 Новости</span></label>
              <label class="account-choice"><input type="checkbox" name="content_types" value="holidays"${selectedContentTypes.includes('holidays') ? ' checked' : ''}><span>🇫🇮 Праздники <small>скоро</small></span></label>
              <label class="account-choice"><input type="checkbox" name="content_types" value="word"${selectedContentTypes.includes('word') ? ' checked' : ''}><span>💬 Слово дня <small>скоро</small></span></label>
            </div>
            <small class="account-muted">Новости уже работают. Праздники и слово/фраза дня сохраняются в настройках и будут включены после запуска этих рубрик.</small>
          </fieldset>
          <fieldset class="account-fieldset account-quiet">
            <legend>Не беспокоить</legend>
            <label class="account-toggle account-toggle--compact"><input type="checkbox" name="quiet_hours_enabled"${subscription.quietHoursEnabled ? ' checked' : ''}><span><strong>Не отправлять ночью</strong><small>Отложенные новости придут после окончания тихого времени.</small></span></label>
            <div class="account-form-grid">
              <label class="account-field"><span>Начало</span><input name="quiet_start" type="time" value="${escapeHtml(subscription.quietStart || '22:00')}"></label>
              <label class="account-field"><span>Окончание</span><input name="quiet_end" type="time" value="${escapeHtml(subscription.quietEnd || '07:00')}"></label>
            </div>
            <p class="account-muted">Дни действия тихого времени</p><div class="account-choices">${weekdayOptions('quiet_weekdays', selectedQuietWeekdays)}</div>
            <label class="account-toggle account-toggle--compact"><input type="checkbox" name="allow_critical_during_quiet"${subscription.allowCriticalDuringQuiet ? ' checked' : ''}><span><strong>Разрешить только критически важные новости</strong><small>Срочные материалы важности 5 могут прийти во время тишины.</small></span></label>
            <small class="account-muted">Часовой пояс: Финляндия (Europe/Helsinki), с автоматическим переходом на летнее время.</small>
          </fieldset>
          <label class="account-toggle account-toggle--compact"><input type="checkbox" name="include_original"${subscription.includeOriginal ? ' checked' : ''}><span><strong>Добавлять ссылку на оригинал</strong><small>Можно прочитать полный материал у источника</small></span></label>
          <div class="account-actions"><button class="account-button" type="submit">Сохранить настройки</button><a class="account-button account-button--ghost" href="/account">Обновить</a></div>
        </form>
      </section>
      <aside class="account-side">
        <section class="account-card">
          <div class="account-section-head"><div><p class="eyebrow">Подключение</p><h2>Telegram</h2></div><span>02</span></div>
          <p class="account-muted">${telegramConnected ? `Привязанный чат: ${escapeHtml(telegramLink.telegramChatId)}` : `Для рассылки используется ${escapeHtml(botLabel)}.`}</p>
          ${telegramSetup}
          ${telegramConnected
            ? '<form method="post" action="/account/telegram/test" class="account-actions"><button class="account-button account-button--telegram" type="submit">✈ Проверить доставку</button></form>'
            : '<form method="post" action="/account/telegram/connect" class="account-actions"><button class="account-button account-button--telegram" type="submit">✈ Подключить Telegram</button></form>'}
        </section>
        <section class="account-card account-help"><p class="eyebrow">Подсказка</p><h2>Вы управляете рассылкой</h2><ul><li>Каждая новость содержит заголовок, краткое описание и ссылку «Читать далее» на сайт.</li><li>Ночные сообщения откладываются, а не теряются.</li><li>Можно отключить рассылку в любой момент.</li><li>Редакционный канал и личная рассылка работают отдельно.</li></ul></section>
      </aside>
    </div>
    <form class="account-logout" method="post" action="/account/logout"><button class="account-button account-button--ghost" type="submit">Выйти из кабинета</button></form>
  </article>`;
  return documentPage({ title: 'Личный кабинет — Финские Новости', description: 'Настройки персональной Telegram-рассылки Финских Новостей.', canonicalPath: '/account', siteUrl, robots: 'noindex', content });
}

function renderAccountLoginPage({ siteUrl, googleEnabled = true, error = '' }) {
  const errorMessage = error === 'state'
    ? 'Сессия входа устарела. Попробуйте войти ещё раз.'
    : error === 'failed'
      ? 'Google не подтвердил вход. Проверьте аккаунт и повторите попытку.'
      : '';
  const action = googleEnabled
    ? '<a class="google-login-button account-google-button" href="/account/login/start"><span>G</span>Войти через Google</a>'
    : '<p class="account-notice account-notice--error">Вход временно недоступен: Google-авторизация не настроена.</p>';
  const content = `<section class="account-login">
    <div class="account-login-card">
      <span class="account-login-mark">${brandMark}</span>
      <p class="eyebrow">Персональная рассылка</p>
      <h1>Ваши новости — в удобное время</h1>
      <p>Войдите через Google, выберите темы и получайте персональную подборку в Telegram.</p>
      ${errorMessage ? `<p class="account-notice account-notice--error" role="alert">${escapeHtml(errorMessage)}</p>` : ''}
      ${action}
      <div class="account-login-benefits"><span>✓ Без пароля</span><span>✓ Настройки под вашим контролем</span><span>✓ Можно отключить в любой момент</span></div>
    </div>
  </section>`;
  return documentPage({ title: 'Вход в личный кабинет — Финские Новости', description: 'Вход в настройки персональной Telegram-рассылки.', canonicalPath: '/account/login', siteUrl, robots: 'noindex', content });
}

function renderAccountErrorPage({ siteUrl }) {
  const content = '<section class="account-login"><div class="account-login-card"><span class="account-login-mark">⚠️</span><p class="eyebrow">Личный кабинет</p><h1>Не удалось открыть кабинет</h1><p>Ошибка уже записана. Попробуйте обновить страницу или войти заново.</p><div class="account-actions account-actions--center"><a class="account-button" href="/account/login">Вернуться ко входу</a><a class="account-button account-button--ghost" href="/">На главную</a></div></div></section>';
  return documentPage({ title: 'Личный кабинет — ошибка', description: 'Не удалось открыть личный кабинет.', canonicalPath: '/account', siteUrl, robots: 'noindex', content });
}

function renderAdminArticleDeletePage({ article, siteUrl }) {
  const title = article.titleRu || article.titleFi;
  return documentPage({ title: 'Подтверждение удаления — Финские Новости', description: 'Подтверждение удаления статьи.', canonicalPath: `/admin/articles/${article.id}/delete`, siteUrl, robots: 'noindex', content: `<section class="not-found"><p class="eyebrow">Подтверждение</p><h1>Удалить статью?</h1><p class="summary">${escapeHtml(title)}</p><p>Будут удалены и все связанные комментарии.</p><form action="/admin/articles/${article.id}/delete" method="post"><input type="hidden" name="confirm_delete" value="delete"><button class="delete" type="submit">Удалить без возможности восстановления</button></form><p><a href="/admin">Отмена</a></p></section>` });
}

function renderNotFound({ siteUrl }) {
  return documentPage({ title: 'Страница не найдена — Финские Новости', description: 'Запрошенная страница не найдена.', canonicalPath: '/404', siteUrl, robots: 'noindex', content: '<section class="not-found"><p class="eyebrow">Ошибка 404</p><h1>Страница не найдена</h1><p class="summary">Возможно, ссылка устарела или адрес введён с ошибкой.</p><p><a href="/">Вернуться к свежим новостям →</a></p></section>' });
}

function escapeXml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function formatLastmod(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function renderSitemap({
  siteUrl,
  categorySlugs,
  tagSlugs = [],
  regionCodes = [],
  articles,
  archivePageCount = 1,
}) {
  const archivePages = Array.from({ length: Math.max(0, archivePageCount - 1) }, (_, index) => ({ path: `/page/${index + 2}` }));
  const urls = [
    { path: '/' },
    ...archivePages,
    ...categorySlugs.map((slug) => ({ path: `/category/${encodeURIComponent(slug)}` })),
    ...tagSlugs.map((slug) => ({ path: `/tag/${encodeURIComponent(slug)}` })),
    ...regionCodes.map((code) => ({ path: `/region/${encodeURIComponent(code)}` })),
    ...articles.map((article) => ({
      path: `/news/${encodeURIComponent(article.slug)}`,
      lastmod: formatLastmod(article.publishedAt),
    })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((entry) => `  <url><loc>${escapeXml(`${siteUrl}${entry.path}`)}</loc>${entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
}

function renderRobots({ siteUrl }) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

module.exports = {
  renderAccountErrorPage,
  renderAccountLoginPage,
  renderAccountPage,
  renderArticlePage,
  renderAdminPage,
  renderAdminLoginPage,
  renderAdminArticleDeletePage,
  renderAboutPage,
  renderContactPage,
  renderListPage,
  renderNotFound,
  renderRobots,
  renderSitemap,
};
