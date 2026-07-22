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

function documentPage({ title, description, canonicalPath, siteUrl, content, robots, breakingArticle, searchQuery = '', showInterestModal = false }) {
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
  ${robots ? `<meta name="robots" content="${escapeHtml(robots)}">` : ''}
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <style>${siteStyles}</style>
</head>
<body>
  <a class="skip-link" href="#content">К содержанию</a>
  <div class="util-bar"><div class="wrap"><div class="util-left">🇫🇮 → 🇷🇺 AI пересказ в реальном времени</div><div class="util-right"><button class="utility-button" type="button" data-font-step="-0.10" aria-label="Уменьшить текст">A−</button><button class="utility-button utility-button--scale" type="button" data-font-reset aria-label="Обычный размер текста">100%</button><button class="utility-button" type="button" data-font-step="0.10" aria-label="Увеличить текст">A+</button><button class="utility-button" type="button" data-theme-toggle>Тёмная</button></div></div></div>
  ${breaking}
  <header class="masthead"><div class="wrap"><div class="topbar"><a class="brand" href="/"><span class="brand-mark">${brandMark}</span><span><strong class="brand-name">Финские Новости</strong><small class="brand-tagline">Свежие новости Финляндии на русском языке</small></span></a><form class="search-box" action="/search" method="get" role="search"><label class="skip-link" for="site-search">Поиск по новостям</label><span aria-hidden="true">⌕</span><input id="site-search" name="q" type="search" value="${escapeHtml(searchQuery)}" placeholder="Поиск новостей…" minlength="2" maxlength="120" required><button type="submit">Найти</button></form><div class="top-actions">${interestControl}<a class="icon-btn" href="/about" aria-label="О проекте">i</a><a class="icon-btn" href="/page/2" aria-label="Архив">☰</a></div></div><nav class="catnav" id="category-nav" aria-label="Категории"><a class="active" href="/">🏠 Главная</a>${nav}</nav></div></header>
  <main class="wrap" id="content">${content}</main>
  <footer class="site-footer"><div class="wrap"><strong>Финские Новости</strong> · Русскоязычные пересказы новостей Финляндии со ссылками на первоисточники.</div></footer>
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

function renderArticlePage({ article, siteUrl, categoryToSlug, comments = [], commentMessage = '', reactionMessage = '' }) {
  const title = article.titleRu || article.titleFi;
  const description = article.summaryRu || article.summaryFi || title;
  const original = article.sourceName === 'Редакция Финские Новости'
    ? '<p class="editorial-note">Материал подготовлен редакцией «Финские Новости».</p>'
    : `<div class="original-box"><p>Полный текст опубликован у первоисточника. Мы рекомендуем открыть его для подробностей и контекста.</p><a href="${escapeHtml(safeExternalUrl(article.originalUrl))}" rel="noopener noreferrer" target="_blank">Открыть оригинал ↗</a></div>`;
  const content = `<div class="article-wrap"><article><header class="article-head"><p class="eyebrow">Новость Финляндии</p>${editorialBadges(article)}${articleMeta(article, categoryToSlug)}<h1 class="article-title">${escapeHtml(title)}</h1><div class="article-facts"><span class="fact">${escapeHtml(article.category || 'Новости')}</span><span class="fact">${escapeHtml(article.sourceName || '')}</span><span class="fact">${escapeHtml(formatDate(article.publishedAt))}</span></div><p class="article-lead">${escapeHtml(article.summaryRu || article.summaryFi || '')}</p></header><div class="article-body-grid"><div>${reactionForm(article, reactionMessage)}${renderComments({ article, comments, commentMessage })}</div><aside class="article-aside">${original}<section class="side-card"><p class="sidebar-kicker">Поделиться</p><h2>Читайте и обсуждайте</h2><p>Сохраните постоянную ссылку на материал и оставьте комментарий после модерации.</p></section></aside></div></article></div>`;
  return documentPage({ title: `${title} — Финские Новости`, description, canonicalPath: `/news/${encodeURIComponent(article.slug)}`, siteUrl, content, breakingArticle: article.editorialStatus === 'urgent' ? article : null });
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
  if (article.telegramPublication) return `<p class="form-message" role="status">Отправлено в Telegram: ${escapeHtml(formatDate(article.telegramPublication.sentAt))}.</p>`;
  if (!telegramConfigured) return '<p class="summary">Telegram не настроен: укажите переменные на сервере.</p>';
  return `<form action="/admin/articles/${article.id}/telegram" method="post"><button type="submit">Отправить в Telegram</button></form>`;
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
  return `<article class="admin-comment"><h2>${article.publicationStatus === 'draft' ? 'Черновик: ' : ''}${article.publicationStatus === 'published' ? `<a href="/news/${encodeURIComponent(article.slug)}">${escapeHtml(article.titleRu || article.titleFi)}</a>` : escapeHtml(article.titleRu || article.titleFi)}</h2><form class="admin-form" action="/admin/articles/${article.id}" method="post"><label for="title-${article.id}">Заголовок</label><input id="title-${article.id}" name="title" maxlength="300" required value="${escapeHtml(article.titleRu || article.titleFi || '')}"><label for="text-${article.id}">Текст</label><textarea id="text-${article.id}" name="text" maxlength="20000" required>${escapeHtml(article.summaryRu || article.summaryFi || '')}</textarea><label for="category-${article.id}">Категория</label><select id="category-${article.id}" name="category" required>${categoryOptions}</select><label for="status-${article.id}">Редакционная метка</label><select id="status-${article.id}" name="editorial_status">${statusOptions}</select><label for="pinned-${article.id}">Закрепить до</label><input id="pinned-${article.id}" name="pinned_until" type="datetime-local" value="${escapeHtml(toDateTimeLocal(article.pinnedUntil))}">${scheduleField}<div class="admin-actions"><button type="submit">Сохранить</button>${deleteControl}</div></form><div class="admin-actions">${publication}</div></article>`;
}

function statusMessage(kind, status) {
  const values = {
    telegram: { sent: 'Новость отправлена в Telegram.', 'already-sent': 'Эта новость уже была отправлена в Telegram.', error: 'Не удалось отправить новость в Telegram. Попробуйте позже.' },
    import: { 'draft-created': 'Черновик импортированной статьи создан.', published: 'Черновик опубликован.', duplicate: 'Статья с этим источником уже существует.', similar: 'Импорт не выполнен: за этот день уже найдена очень похожая новость. Решение записано в журнал повторов.', error: 'Не удалось импортировать страницу. Проверьте ссылку и попробуйте позже.' },
    article: { scheduled: 'Новость сохранена и будет опубликована автоматически в указанное время.' },
    duplicate: { published: 'Материал опубликован несмотря на совпадение.', 'already-published': 'Этот материал уже был опубликован.', error: 'Не удалось опубликовать материал из журнала повторов.' },
  };
  return values[kind][status] || '';
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
  const articleForms = articles.length ? articles.map((article) => renderAdminArticleForm(article, categories, telegramConfigured, canDelete)).join('') : '<div class="empty-state">Статьи не найдены.</div>';
  const top = (list, empty) => list.length ? `<ol>${list.map((item) => `<li><a href="/news/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a> <span class="admin-count">${item.count}</span></li>`).join('')}</ol>` : `<p class="summary">${empty}</p>`;
  const categoryOptions = categories.map((category) => optionMarkup(category, category, '')).join('');
  const notices = [statusMessage('telegram', telegramStatus), statusMessage('import', importStatus), statusMessage('article', articleStatus), statusMessage('duplicate', duplicateStatus)].filter(Boolean).map((message) => `<p class="form-message" role="status">${escapeHtml(message)}</p>`).join('');
  const dailyRows = statistics.daily.map((day) => `<tr><th scope="row">${escapeHtml(day.day)}</th><td>${day.articles}</td><td>${day.visitors}</td><td>${day.articleViews}</td><td>${day.comments}</td><td>${day.reactions}</td><td>${day.duplicates}</td></tr>`).join('');
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
    'auth.google_login': 'Вход через Google', 'auth.google_denied': 'Google-вход отклонён',
    'authorization.denied': 'Действие отклонено по роли',
    'auth.logout': 'Выход из редакции',
  };
  const auditMarkup = auditLog.length ? `<div class="admin-table-scroll"><table class="admin-table audit-table"><thead><tr><th>Время</th><th>Редактор</th><th>Действие</th><th>Объект</th><th>Детали</th></tr></thead><tbody>${auditLog.map((entry) => {
    const details = entry.details ? Object.entries(entry.details).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ') : '';
    return `<tr><td>${escapeHtml(formatDate(entry.createdAt))}</td><td>${escapeHtml(entry.actorUsername)} <span class="summary">${escapeHtml(entry.actorRole)}</span></td><td>${escapeHtml(actionLabels[entry.action] || entry.action)}</td><td>${escapeHtml(entry.targetType)}${entry.targetId ? ` #${escapeHtml(entry.targetId)}` : ''}</td><td>${escapeHtml(details)}</td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="summary">Журнал пока пуст.</p>';
  const content = `<div class="admin-wrap">
    <header class="admin-hero"><div><p class="eyebrow">Закрытая зона</p><h1 class="page-heading">Редакция и модерация</h1></div><div class="admin-account"><p>Вошли как <strong>${escapeHtml(currentAccount.displayName || currentAccount.username)}</strong> · ${escapeHtml(currentAccount.role)} · ${escapeHtml(currentAccount.authMethod || 'basic')}</p><form action="/admin/logout" method="post"><button type="submit">Выйти</button></form></div></header>
    ${notices}
    <section class="admin-panel admin-panel--wide"><h2>Статистика</h2>${statisticsFilter}<dl class="admin-stats"><div class="stat-card"><dt>Всего статей</dt><dd>${statistics.articleCount}</dd></div><div class="stat-card"><dt>Статей за период</dt><dd>${statistics.report.articles}</dd></div><div class="stat-card"><dt>Читатели за период</dt><dd>${statistics.report.visitors}</dd></div><div class="stat-card"><dt>Чтения за период</dt><dd>${statistics.report.articleViews}</dd></div><div class="stat-card"><dt>Комментарии</dt><dd>${statistics.report.comments}</dd></div><div class="stat-card"><dt>Реакции</dt><dd>${statistics.report.reactions}</dd></div><div class="stat-card"><dt>Повторы</dt><dd>${statistics.report.duplicates}</dd></div><div class="stat-card"><dt>На модерации</dt><dd>${statistics.pendingComments}</dd></div></dl><div class="admin-table-scroll"><table class="admin-table"><thead><tr><th>Дата</th><th>Статьи</th><th>Читатели</th><th>Чтения</th><th>Комментарии</th><th>Реакции</th><th>Повторы</th></tr></thead><tbody>${dailyRows}</tbody></table></div></section>
    <div class="admin-grid"><section class="admin-panel"><h2>Топ читаемых за период</h2>${top(statistics.topRead, 'Просмотров за период пока нет.')}</section><section class="admin-panel"><h2>Топ комментируемых за период</h2>${top(statistics.topCommented, 'Одобренных комментариев за период пока нет.')}</section><section class="admin-panel"><h2>Импортировать по ссылке</h2>${importProviderConfigured ? '<p class="summary">Страница будет безопасно загружена, проверена на повтор, переведена и сохранена как черновик.</p><form class="admin-form" action="/admin/import" method="post"><label for="import-url">Внешний HTTPS-адрес</label><input id="import-url" name="url" type="url" inputmode="url" placeholder="https://example.com/news" required><button type="submit">Создать черновик</button></form>' : '<p class="summary">Импорт недоступен: настройте провайдер пересказа.</p>'}</section><section class="admin-panel"><h2>Новая ручная новость</h2><form class="admin-form" action="/admin/articles" method="post"><label for="new-title">Заголовок</label><input id="new-title" name="title" maxlength="300" required><label for="new-text">Текст</label><textarea id="new-text" name="text" maxlength="20000" required></textarea><label for="new-category">Категория</label><select id="new-category" name="category" required><option value="">Выберите категорию</option>${categoryOptions}</select><label for="new-status">Редакционная метка</label><select id="new-status" name="editorial_status">${optionMarkup('normal', 'Обычная', 'normal')}${optionMarkup('important', 'Важная', 'normal')}${optionMarkup('urgent', 'Срочная', 'normal')}</select><label for="new-pinned">Показывать в главных до</label><input id="new-pinned" name="pinned_until" type="datetime-local"><label for="new-scheduled">Опубликовать позже</label><input id="new-scheduled" name="scheduled_publish_at" type="datetime-local"><p class="field-hint">Если дата не указана, новость появится сразу.</p><button type="submit">Опубликовать или запланировать</button></form></section></div>
    <section class="admin-panel admin-panel--wide"><h2>Журнал похожих новостей</h2><p class="summary">Автоматически пропущенный материал можно проверить и опубликовать вручную. Повторный AI-пересказ выполняется только после нажатия редактора.</p>${duplicateMarkup}</section>
    <h2 class="section-heading">Комментарии</h2><section class="admin-list">${commentMarkup}</section>
    <h2 class="section-heading" style="margin-top:32px">Статьи</h2><form class="admin-search" action="/admin" method="get"><label for="article-search">Поиск по заголовку</label><input id="article-search" name="q" type="search" value="${escapeHtml(query)}"><button type="submit">Найти</button></form><section class="admin-list">${articleForms}</section>
    <section class="admin-panel admin-panel--wide"><h2>Журнал действий редакторов</h2><p class="summary">Хранятся имя учётной записи, действие, объект и время. Пароли и полный текст материалов в журнал не записываются.</p>${auditMarkup}</section>
  </div>`;
  return documentPage({ title: 'Редакция и модерация — Финские Новости', description: 'Закрытая страница редакции и модерации.', canonicalPath: '/admin', siteUrl, robots: 'noindex', content });
}

function renderAboutPage({ siteUrl }) {
  return documentPage({ title: 'О проекте и конфиденциальность — Финские Новости', description: 'Как «Финские Новости» публикуют русскоязычные пересказы новостей Финляндии.', canonicalPath: '/about', siteUrl, content: `<article class="info-page"><section class="page-top"><p class="eyebrow">О проекте</p><h1 class="page-heading">Новости Финляндии — понятно и с уважением к источникам</h1><p class="page-intro">«Финские Новости» помогают следить за актуальными событиями Финляндии на русском языке.</p></section><section class="info-card"><h2>Как мы работаем</h2><p>Мы собираем открытые RSS-анонсы и публикуем краткие русскоязычные пересказы. У каждой новости указан источник и доступна ссылка на оригинальный материал.</p></section><section class="info-card"><h2>Комментарии</h2><p>Комментарий сначала попадает на премодерацию. После одобрения редакцией его имя и текст становятся видны на странице соответствующей новости.</p></section><section class="info-card"><h2>Конфиденциальность и статистика</h2><p>Сайт учитывает просмотры и реакции с помощью анонимного дневного идентификатора. Мы не храним IP-адреса или User-Agent в открытом виде.</p></section><p class="info-note"><strong>Важно:</strong> это краткое описание работы сайта, а не юридическая консультация.</p></article>` });
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

function renderSitemap({ siteUrl, categorySlugs, articles, archivePageCount = 1 }) {
  const archivePages = Array.from({ length: Math.max(0, archivePageCount - 1) }, (_, index) => ({ path: `/page/${index + 2}` }));
  const urls = [{ path: '/' }, ...archivePages, ...categorySlugs.map((slug) => ({ path: `/category/${encodeURIComponent(slug)}` })), ...articles.map((article) => ({ path: `/news/${encodeURIComponent(article.slug)}`, lastmod: formatLastmod(article.publishedAt) }))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((entry) => `  <url><loc>${escapeXml(`${siteUrl}${entry.path}`)}</loc>${entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
}

function renderRobots({ siteUrl }) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

module.exports = { renderArticlePage, renderAdminPage, renderAdminLoginPage, renderAdminArticleDeletePage, renderAboutPage, renderListPage, renderNotFound, renderRobots, renderSitemap };
