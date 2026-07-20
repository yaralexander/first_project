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

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Helsinki',
  }).format(date);
}

function documentPage({ title, description, canonicalPath, siteUrl, content, robots }) {
  const canonical = `${siteUrl}${canonicalPath}`;
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${robots ? `<meta name="robots" content="${escapeHtml(robots)}">` : ''}
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <style>
    :root{color-scheme:light dark;--bg:#f4f5f7;--surface:#fff;--ink:#172033;--muted:#687386;--line:#e3e7ed;--accent:#0b63ce;--accent-soft:#e8f1ff;--shadow:0 10px 30px rgba(18,36,64,.08);--radius:18px}
    *{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}.site-header{background:var(--surface);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:2}.header-inner{max-width:1180px;margin:auto;min-height:70px;padding:0 28px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{font-size:1.15rem;font-weight:800;letter-spacing:-.03em;white-space:nowrap}.brand-mark{display:inline-grid;place-items:center;width:28px;height:28px;margin-right:8px;border-radius:9px;background:var(--accent);color:#fff;font-size:.85rem}.header-link{color:var(--muted);font-size:.92rem;font-weight:650}.page-shell{max-width:1180px;margin:0 auto;padding:46px 28px 72px}.eyebrow{margin:0 0 10px;color:var(--accent);font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.page-heading{max-width:720px;margin:0;font-size:clamp(2rem,5vw,4rem);line-height:1.03;letter-spacing:-.055em}.page-intro{max-width:650px;margin:16px 0 30px;color:var(--muted);font-size:1.05rem}.category-nav{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 32px}.category-pill{padding:7px 12px;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--muted);font-size:.88rem;font-weight:700}.category-pill:hover{border-color:var(--accent);color:var(--accent);text-decoration:none}.hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(230px,.8fr);gap:28px;padding:clamp(24px,5vw,52px);margin:0 0 34px;border-radius:var(--radius);background:linear-gradient(135deg,#0b63ce,#174782);color:#fff;box-shadow:var(--shadow)}.hero .meta,.hero .source-link{color:#dfeeff}.hero h2{max-width:720px;margin:12px 0 16px;font-size:clamp(1.8rem,4vw,3.35rem);line-height:1.08;letter-spacing:-.045em}.hero h2 a:hover,.hero .source-link:hover{color:#fff}.hero-summary{max-width:680px;margin:0;font-size:1.05rem;white-space:pre-line}.hero-aside{align-self:end;border-left:1px solid rgba(255,255,255,.27);padding-left:24px;color:#dfeeff;font-size:.95rem}.section-title{margin:0 0 16px;font-size:1.3rem;letter-spacing:-.025em}.news-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.news-grid--archive{grid-template-columns:repeat(2,minmax(0,1fr))}.card{display:flex;flex-direction:column;min-height:230px;padding:22px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:0 1px 0 rgba(18,36,64,.02);transition:transform .18s ease,box-shadow .18s ease}.card:hover{transform:translateY(-2px);box-shadow:var(--shadow)}.meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0;color:var(--muted);font-size:.79rem;font-weight:650}.meta-separator{color:#a1aab8}.category-link{color:var(--accent)}.card h2{margin:14px 0 10px;font-size:1.18rem;line-height:1.24;letter-spacing:-.025em}.card h2 a:hover{color:var(--accent);text-decoration:none}.summary{margin:0;color:var(--muted);white-space:pre-line}.card .summary{font-size:.93rem;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.source-link{margin-top:auto;padding-top:18px;color:var(--accent);font-size:.86rem;font-weight:750}.source-link:hover{text-decoration:none;color:#084c9c}.pagination{display:flex;justify-content:space-between;gap:12px;margin:36px 0 0}.pagination a{padding:11px 16px;border:1px solid var(--line);border-radius:10px;background:var(--surface);font-weight:750}.pagination a:hover{border-color:var(--accent);color:var(--accent);text-decoration:none}.article-page{max-width:780px;margin:0 auto}.article-page .article-heading{margin:14px 0 20px;font-size:clamp(2rem,5vw,4.25rem);line-height:1.04;letter-spacing:-.055em}.article-page .summary{max-width:700px;font-family:ui-serif,Georgia,serif;font-size:clamp(1.1rem,2.4vw,1.32rem);line-height:1.72;color:var(--ink)}.article-facts{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 28px}.fact{padding:7px 10px;border-radius:8px;background:var(--accent-soft);color:var(--accent);font-size:.86rem;font-weight:700}.original-box{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:34px 0 0;padding:20px 22px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.original-box p{margin:0;color:var(--muted);font-size:.92rem}.original-box a{flex:0 0 auto;padding:10px 14px;border-radius:9px;background:var(--accent);color:#fff;font-weight:750}.original-box a:hover{background:#084c9c;text-decoration:none}.empty-state{padding:40px;border:1px dashed var(--line);border-radius:14px;background:var(--surface);color:var(--muted)}.not-found{max-width:600px;padding:clamp(28px,6vw,68px);border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow)}.not-found h1{margin:0 0 10px;font-size:clamp(2rem,5vw,4rem);letter-spacing:-.055em}.not-found a{color:var(--accent);font-weight:750}
    .comments{margin:48px 0 0;padding-top:32px;border-top:1px solid var(--line)}.comments h2{margin:0 0 18px;font-size:1.45rem;letter-spacing:-.025em}.comment{padding:18px 0;border-bottom:1px solid var(--line)}.comment:last-child{border-bottom:0}.comment-author{margin:0 0 4px;font-weight:800}.comment-date{color:var(--muted);font-size:.83rem}.comment-body{margin:10px 0 0;white-space:pre-line}.comment-form{margin-top:26px;padding:22px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.comment-form h3{margin:0 0 14px}.comment-form label,.admin-form label,.admin-search label{display:block;margin:14px 0 6px;font-weight:750}.comment-form input,.comment-form textarea,.admin-form input,.admin-form textarea,.admin-form select,.admin-search input{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--ink);font:inherit}.comment-form textarea,.admin-form textarea{min-height:130px;resize:vertical}.comment-form button,.admin-actions button,.admin-form>button,.admin-search button{margin-top:16px;padding:10px 14px;border:0;border-radius:9px;background:var(--accent);color:#fff;font:inherit;font-weight:750;cursor:pointer}.comment-form button:hover,.admin-actions button:hover,.admin-form>button:hover,.admin-search button:hover{filter:brightness(.92)}.form-message{margin:0 0 16px;padding:11px 12px;border-radius:9px;background:var(--accent-soft);color:var(--accent);font-weight:650}.honeypot{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}.admin-list{display:grid;gap:16px}.admin-comment{padding:20px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.admin-comment h2{margin:0 0 7px;font-size:1.1rem}.admin-actions{display:flex;gap:8px;flex-wrap:wrap}.admin-actions form{margin:0}.admin-actions button{margin-top:12px}.admin-actions .reject{background:#7c4c16}.admin-actions .delete{background:#a33a3a}
    @media (prefers-color-scheme:dark){:root{--bg:#11151c;--surface:#181e27;--ink:#eef3fb;--muted:#aab5c5;--line:#2b3442;--accent:#6caeff;--accent-soft:#1d3452;--shadow:0 10px 30px rgba(0,0,0,.22)}.hero{background:linear-gradient(135deg,#1e67c2,#162f57)}.original-box a{color:#071321}.original-box a:hover{background:#9bc8ff}}
    @media (max-width:760px){.header-inner{min-height:62px;padding:0 18px}.header-link{display:none}.page-shell{padding:30px 18px 52px}.hero{grid-template-columns:1fr;padding:26px;margin-bottom:26px}.hero-aside{display:none}.news-grid,.news-grid--archive{grid-template-columns:1fr;gap:12px}.card{min-height:0;padding:19px}.page-intro{margin-bottom:24px}.original-box{align-items:flex-start;flex-direction:column}.original-box a{width:100%;text-align:center}.pagination a{flex:1;text-align:center}}
    .skip-link{position:absolute;left:14px;top:-48px;z-index:10;padding:9px 12px;border-radius:8px;background:var(--accent);color:#fff;font-weight:750}.skip-link:focus{top:12px;text-decoration:none}.site-header{backdrop-filter:blur(14px);background:color-mix(in srgb,var(--surface) 92%,transparent)}.brand{display:flex;align-items:center}.brand-mark{box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}.header-nav{display:flex;align-items:center;gap:18px}.header-link{position:relative}.header-link:hover{color:var(--accent);text-decoration:none}.header-link::after{content:"";position:absolute;right:0;bottom:-4px;left:0;height:2px;border-radius:2px;background:var(--accent);transform:scaleX(0);transition:transform .18s ease}.header-link:hover::after{transform:scaleX(1)}.page-shell{padding-top:clamp(30px,5vw,60px)}.page-heading{max-width:840px}.page-intro{font-size:1.08rem;line-height:1.65}.category-nav{padding-bottom:4px}.category-pill{transition:border-color .18s ease,background .18s ease,color .18s ease}.hero{position:relative;overflow:hidden}.hero::after{content:"";position:absolute;width:360px;height:360px;right:-160px;top:-230px;border:1px solid rgba(255,255,255,.22);border-radius:50%;box-shadow:0 0 0 34px rgba(255,255,255,.05),0 0 0 68px rgba(255,255,255,.035)}.hero>div{position:relative;z-index:1}.hero-aside strong{display:block;color:#fff;font-size:1.05rem}.section-title{display:flex;align-items:center;gap:12px}.section-title::after{content:"";height:1px;flex:1;background:var(--line)}.card{position:relative}.card::before{content:"";position:absolute;top:0;right:20px;left:20px;height:3px;border-radius:0 0 4px 4px;background:var(--accent);opacity:0;transition:opacity .18s ease}.card:hover::before{opacity:1}.article-page{padding-bottom:24px}.article-page .meta{margin-top:18px}.article-page .article-heading{max-width:760px}.article-page .summary{white-space:pre-line}.article-facts{padding-bottom:18px;border-bottom:1px solid var(--line)}.original-box{box-shadow:0 8px 22px rgba(18,36,64,.05)}.original-box a{transition:transform .18s ease,background .18s ease}.original-box a:hover{transform:translateY(-1px)}.footer-note{margin:46px 0 0;color:var(--muted);font-size:.84rem}.not-found .summary{margin-bottom:26px}.info-page{max-width:780px}.info-page h2{margin:36px 0 12px;font-size:1.35rem;letter-spacing:-.025em}.info-page p,.info-page li{color:var(--muted)}.info-page strong{color:var(--ink)}.info-card{margin-top:18px;padding:22px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.info-card h2{margin-top:0}.info-card ul{margin:12px 0 0;padding-left:22px}.info-card li+li{margin-top:8px}.info-note{margin-top:24px;padding:16px 18px;border-left:3px solid var(--accent);background:var(--accent-soft);color:var(--ink)}
    @media (max-width:760px){.header-nav{gap:12px}.header-link{display:block;font-size:.84rem}.header-link--archive{display:none}.hero::after{right:-220px}.footer-note{margin-top:32px}}
    .editorial-badges{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}.editorial-badge{display:inline-flex;align-items:center;min-height:25px;padding:3px 8px;border:1px solid transparent;border-radius:999px;font-size:.73rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.editorial-badge--urgent{background:#fff0ef;border-color:#efb4ae;color:#a52d25}.editorial-badge--important{background:#fff7df;border-color:#e8cd7e;color:#795500}.editorial-badge--pinned{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 32%,var(--line));color:var(--accent)}.hero .editorial-badge--urgent{background:#7c2422;border-color:#f0aaa2;color:#fff}.hero .editorial-badge--important{background:#6b5414;border-color:#e7cb78;color:#fff}.hero .editorial-badge--pinned{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.35);color:#fff}.card-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:18px}.card-actions a{padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:.84rem;font-weight:750}.card-actions .read-more{border-color:var(--accent);background:var(--accent);color:#fff}.card-actions .comment-link{color:var(--accent)}.card-actions a:hover{text-decoration:none;filter:brightness(.96)}.hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}.hero-actions a{padding:9px 12px;border-radius:9px;font-size:.9rem;font-weight:750}.hero-actions .read-more{background:#fff;color:#104a90}.hero-actions .comment-link{border:1px solid rgba(255,255,255,.5);color:#fff}.editorial-note{margin:34px 0 0;padding:16px 18px;border-left:3px solid var(--line);background:var(--surface);color:var(--muted);font-size:.94rem}.reaction-totals{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 0;color:var(--muted);font-size:.88rem;font-weight:700}.reactions{max-width:780px;margin:34px auto 0;padding:22px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.reactions h2{margin:0;font-size:1.2rem}.reactions form{display:flex;gap:8px;margin-top:14px}.reactions button{min-width:48px;padding:9px;border:1px solid var(--line);border-radius:9px;background:var(--bg);font:inherit;cursor:pointer}.reactions button:hover{border-color:var(--accent)}.admin-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:16px 0 22px}.stat-card{padding:14px;border:1px solid var(--line);border-radius:11px;background:var(--bg)}.stat-card dt{color:var(--muted);font-size:.79rem;font-weight:700}.stat-card dd{margin:4px 0 0;font-size:1.55rem;font-weight:800;letter-spacing:-.04em}.admin-ranking{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:6px}.admin-ranking h3{margin:0 0 10px;font-size:1rem}.admin-ranking ol{display:grid;gap:7px;margin:0;padding-left:22px}.admin-ranking a{color:var(--accent);font-weight:700}.admin-ranking li{padding-left:2px}.admin-count{color:var(--muted);font-size:.84rem;white-space:nowrap}.admin-form{display:grid;gap:0}.admin-form textarea{min-height:190px}.admin-form select{appearance:auto}.admin-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end;margin:0 0 16px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.admin-search label{grid-column:1/-1;margin:0}.admin-search button{margin:0}.admin-delete-link{align-self:center;margin-top:12px;color:#a33a3a;font-weight:750}.admin-form .admin-actions{margin-top:4px}
    @media (prefers-color-scheme:dark){.editorial-badge--urgent{background:#542223;border-color:#944442;color:#ffd9d5}.editorial-badge--important{background:#554719;border-color:#8d782e;color:#ffebac}}
    @media (max-width:760px){.admin-stats,.admin-ranking{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-search{grid-template-columns:1fr}.admin-search button{width:100%}}
    @media (max-width:390px){.page-shell{padding-left:14px;padding-right:14px}.hero{padding:21px}.page-heading{font-size:2.05rem}.hero h2{font-size:1.75rem}.category-nav{gap:6px}.category-pill{padding:6px 10px}.header-inner{padding:0 14px}.brand{font-size:1.03rem}.brand-mark{width:25px;height:25px;margin-right:6px}.admin-stats,.admin-ranking{grid-template-columns:1fr}.card-actions{display:grid;grid-template-columns:1fr 1fr}.card-actions a{text-align:center}}
  </style>
</head>
<body>
  <a class="skip-link" href="#content">Перейти к содержанию</a>
  <header class="site-header"><div class="header-inner"><a class="brand" href="/"><span class="brand-mark">FN</span>Финские Новости</a><nav class="header-nav" aria-label="Основная навигация"><a class="header-link" href="/">Свежие</a><a class="header-link header-link--archive" href="/page/2">Архив</a><a class="header-link" href="/about">О проекте</a></nav></div></header>
  <main class="page-shell" id="content">${content}</main>
</body>
</html>`;
}

function categoryMarkup(article, categoryToSlug) {
  const categorySlug = categoryToSlug(article.category);
  return categorySlug
    ? `<a class="category-link" href="/category/${encodeURIComponent(categorySlug)}">${escapeHtml(article.category)}</a>`
    : escapeHtml(article.category || '');
}

function articleMeta(article, categoryToSlug) {
  return `<p class="meta">${categoryMarkup(article, categoryToSlug)}<span class="meta-separator">•</span><span>${escapeHtml(article.sourceName)}</span><span class="meta-separator">•</span><time datetime="${escapeHtml(article.publishedAt || '')}">${escapeHtml(formatDate(article.publishedAt))}</time></p>`;
}

function isPinned(article) {
  const pinnedUntil = new Date(article.pinnedUntil);
  return !Number.isNaN(pinnedUntil.getTime()) && pinnedUntil.getTime() > Date.now();
}

function editorialBadges(article) {
  const badges = [];
  if (isPinned(article)) badges.push('<span class="editorial-badge editorial-badge--pinned">Главное</span>');
  if (article.editorialStatus === 'urgent') badges.push('<span class="editorial-badge editorial-badge--urgent">Срочно</span>');
  if (article.editorialStatus === 'important') badges.push('<span class="editorial-badge editorial-badge--important">Важно</span>');
  return badges.length ? `<div class="editorial-badges" aria-label="Редакционные метки">${badges.join('')}</div>` : '';
}

function articleUrl(article) {
  return `/news/${encodeURIComponent(article.slug)}`;
}

function reactionTotalsMarkup(article) {
  const totals = article.reactionTotals || { like: 0, important: 0, sad: 0 };
  return `<p class="reaction-totals" aria-label="Реакции: нравится ${totals.like}, важно ${totals.important}, грустно ${totals.sad}"><span>👍 ${totals.like}</span><span>❗ ${totals.important}</span><span>😔 ${totals.sad}</span></p>`;
}

function reactionForm(article, reactionMessage) {
  return `<section class="reactions" aria-labelledby="reactions-heading"><h2 id="reactions-heading">Реакции</h2>${reactionTotalsMarkup(article)}${reactionMessage ? `<p class="form-message" role="status">${escapeHtml(reactionMessage)}</p>` : ''}<form action="/news/${encodeURIComponent(article.slug)}/reactions" method="post"><button type="submit" name="reaction" value="like" aria-label="Нравится">👍</button><button type="submit" name="reaction" value="important" aria-label="Важно">❗</button><button type="submit" name="reaction" value="sad" aria-label="Грустно">😔</button></form></section>`;
}

function sourceLink(article) {
  return `<a class="source-link" href="${escapeHtml(safeExternalUrl(article.originalUrl))}" rel="noopener noreferrer" target="_blank">Источник: ${escapeHtml(article.sourceName)} ↗</a>`;
}

function renderArticleCard(article, categoryToSlug) {
  return `<article class="card">
  ${editorialBadges(article)}
  ${articleMeta(article, categoryToSlug)}
  <h2><a href="${articleUrl(article)}">${escapeHtml(article.titleRu || article.titleFi)}</a></h2>
  <p class="summary">${escapeHtml(article.summaryRu || article.summaryFi || '')}</p>
  ${article.sourceName !== 'Редакция Финские Новости' ? sourceLink(article) : ''}
  ${reactionTotalsMarkup(article)}
  <div class="card-actions"><a class="read-more" href="${articleUrl(article)}">Читать далее</a><a class="comment-link" href="${articleUrl(article)}#comment-form">Комментировать</a></div>
</article>`;
}

function renderFeaturedArticle(article, categoryToSlug) {
  return `<article class="hero">
  <div>${editorialBadges(article)}${articleMeta(article, categoryToSlug)}<h2><a href="${articleUrl(article)}">${escapeHtml(article.titleRu || article.titleFi)}</a></h2><p class="hero-summary">${escapeHtml(article.summaryRu || article.summaryFi || '')}</p>${reactionTotalsMarkup(article)}<div class="hero-actions"><a class="read-more" href="${articleUrl(article)}">Читать далее</a><a class="comment-link" href="${articleUrl(article)}#comment-form">Комментировать</a></div></div>
  <div class="hero-aside"><strong>${escapeHtml(article.sourceName)}</strong><br>${escapeHtml(formatDate(article.publishedAt))}</div>
</article>`;
}

function renderCategoryNavigation(articles, categoryToSlug) {
  const links = [...new Map(articles
    .map((article) => [categoryToSlug(article.category), article.category])
    .filter(([slug]) => slug)).entries()]
    .map(([slug, category]) => `<a class="category-pill" href="/category/${encodeURIComponent(slug)}">${escapeHtml(category)}</a>`)
    .join('');
  return links ? `<nav class="category-nav" aria-label="Категории">${links}</nav>` : '';
}

function renderListPage({ title, description, canonicalPath, siteUrl, articles, page, total, pagePath, categoryToSlug }) {
  const isHome = canonicalPath === '/';
  const featured = isHome ? articles[0] : null;
  const visibleArticles = featured ? articles.slice(1) : articles;
  const cards = visibleArticles.length
    ? visibleArticles.map((article) => renderArticleCard(article, categoryToSlug)).join('\n')
    : '<div class="empty-state">Новостей пока нет.</div>';
  const previousPath = page > 1 ? pagePath(page - 1) : null;
  const nextPath = page * 50 < total ? pagePath(page + 1) : null;
  const navigation = previousPath || nextPath
    ? `<nav class="pagination" aria-label="Навигация по страницам">${previousPath ? `<a href="${previousPath}">← Новее</a>` : '<span></span>'}${nextPath ? `<a href="${nextPath}">Старее →</a>` : '<span></span>'}</nav>`
    : '';
  const content = `${isHome ? '<p class="eyebrow">Новости Финляндии на русском</p>' : '<p class="eyebrow">Архив новостей</p>'}<h1 class="page-heading">${escapeHtml(title)}</h1><p class="page-intro">${escapeHtml(description)}</p>${renderCategoryNavigation(articles, categoryToSlug)}${featured ? renderFeaturedArticle(featured, categoryToSlug) : ''}<section aria-labelledby="feed-heading"><h2 class="section-title" id="feed-heading">${featured ? 'Ещё в ленте' : 'Новости'}</h2><div class="news-grid ${featured ? '' : 'news-grid--archive'}">${cards}</div></section>${navigation}<p class="footer-note">Материалы пересказываются на русском. Для полного текста переходите к первоисточнику.</p>`;
  return documentPage({ title, description, canonicalPath, siteUrl, content });
}

function renderAboutPage({ siteUrl }) {
  return documentPage({
    title: 'О проекте и конфиденциальность — Финские Новости',
    description: 'Как «Финские Новости» публикуют русскоязычные пересказы новостей Финляндии и обрабатывают комментарии и статистику.',
    canonicalPath: '/about',
    siteUrl,
    content: `<article class="info-page"><p class="eyebrow">О проекте</p><h1 class="page-heading">Новости Финляндии на русском — с уважением к первоисточникам</h1><p class="page-intro">«Финские Новости» помогают следить за актуальными событиями Финляндии. Мы собираем открытые RSS-анонсы и публикуем краткие русскоязычные пересказы, чтобы читателю было проще понять суть новости.</p><section class="info-card"><h2>Как мы работаем</h2><p>Материалы на сайте — это краткие пересказы, а не полные переводы оригинальных статей. У каждой новости мы указываем источник и даём ссылку на оригинал: для полного контекста рекомендуем перейти к первоисточнику.</p></section><section class="info-card"><h2>Комментарии</h2><p>Комментарий сначала попадает на премодерацию. После одобрения редакцией его имя и текст становятся видны посетителям на странице соответствующей новости.</p></section><section class="info-card"><h2>Конфиденциальность и статистика</h2><p>Для понимания интереса к материалам сайт учитывает просмотры и реакции с помощью анонимного дневного идентификатора. Мы не храним IP-адреса или User-Agent в открытом виде. Срок хранения статистики определяется политикой сайта.</p><p>Не указывайте в комментариях лишние персональные или чувствительные данные.</p></section><section class="info-card"><h2>Контакты</h2><p>Контактные данные будут опубликованы до запуска.</p></section><p class="info-note"><strong>Важно:</strong> эта страница кратко описывает работу сайта и не является юридической гарантией или консультацией.</p></article>`,
  });
}

function renderComments({ article, comments, commentMessage }) {
  const commentList = comments.length
    ? comments.map((comment) => `<article class="comment"><p class="comment-author">${escapeHtml(comment.authorName)}</p><time class="comment-date" datetime="${escapeHtml(comment.createdAt || '')}">${escapeHtml(formatDate(comment.createdAt))}</time><p class="comment-body">${escapeHtml(comment.body)}</p></article>`).join('')
    : '<p class="summary">Пока нет одобренных комментариев.</p>';
  return `<section class="comments" aria-labelledby="comments-heading"><h2 id="comments-heading">Комментарии</h2>${commentList}<form class="comment-form" id="comment-form" action="/news/${encodeURIComponent(article.slug)}/comments" method="post"><h3>Оставить комментарий</h3>${commentMessage ? `<p class="form-message" role="status">${escapeHtml(commentMessage)}</p>` : ''}<label class="honeypot" for="website">Сайт</label><input class="honeypot" id="website" name="website" type="text" autocomplete="off" tabindex="-1" aria-hidden="true"><label for="author_name">Имя</label><input id="author_name" name="author_name" type="text" maxlength="80" required><label for="body">Комментарий</label><textarea id="body" name="body" maxlength="1500" required></textarea><button type="submit">Отправить на модерацию</button></form></section>`;
}

function renderArticlePage({ article, siteUrl, categoryToSlug, comments = [], commentMessage = '', reactionMessage = '' }) {
  const title = article.titleRu || article.titleFi;
  const description = article.summaryRu || article.summaryFi || title;
  return documentPage({
    title: `${title} — Финские Новости`,
    description,
    canonicalPath: `/news/${encodeURIComponent(article.slug)}`,
    siteUrl,
    content: `<article class="article-page"><p class="eyebrow">Новость Финляндии</p>${editorialBadges(article)}${articleMeta(article, categoryToSlug)}<h1 class="article-heading">${escapeHtml(title)}</h1><div class="article-facts"><span class="fact">${escapeHtml(article.category || 'Новости')}</span><span class="fact">${escapeHtml(article.sourceName)}</span></div><p class="summary">${escapeHtml(article.summaryRu || article.summaryFi || '')}</p>${article.sourceName === 'Редакция Финские Новости' ? '<p class="editorial-note">Материал подготовлен редакцией.</p>' : `<div class="original-box"><p>Полный материал опубликован у первоисточника.</p><a href="${escapeHtml(safeExternalUrl(article.originalUrl))}" rel="noopener noreferrer" target="_blank">Открыть оригинал ↗</a></div>`}</article>${reactionForm(article, reactionMessage)}${renderComments({ article, comments, commentMessage })}`,
  });
}

function optionMarkup(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function toDateTimeLocal(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function renderTelegramControl(article, telegramConfigured) {
  if (article.telegramPublication) {
    return `<p class="form-message" role="status">Отправлено в Telegram: ${escapeHtml(formatDate(article.telegramPublication.sentAt))}.</p>`;
  }
  if (!telegramConfigured) {
    return '<p class="summary">Telegram не настроен: укажите переменные на сервере.</p>';
  }
  return `<form action="/admin/articles/${article.id}/telegram" method="post"><button type="submit">Отправить в Telegram</button></form>`;
}

function renderAdminArticleForm(article, categories, telegramConfigured) {
  const categoryOptions = categories.map((category) => optionMarkup(category, category, article.category)).join('');
  const statusOptions = [
    optionMarkup('normal', 'Обычная', article.editorialStatus),
    optionMarkup('important', 'Важная', article.editorialStatus),
    optionMarkup('urgent', 'Срочная', article.editorialStatus),
  ].join('');
  const draftControl = article.publicationStatus === 'draft'
    ? `<p class="form-message">Черновик: статья ещё не видна публично.</p><form action="/admin/articles/${article.id}/publish" method="post"><button type="submit">Опубликовать черновик</button></form>`
    : renderTelegramControl(article, telegramConfigured);
  return `<article class="admin-comment"><h2>${article.publicationStatus === 'draft' ? 'Черновик: ' : ''}<a href="/news/${encodeURIComponent(article.slug)}">${escapeHtml(article.titleRu || article.titleFi)}</a></h2><form class="admin-form" action="/admin/articles/${article.id}" method="post"><label for="title-${article.id}">Заголовок</label><input id="title-${article.id}" name="title" type="text" maxlength="300" required value="${escapeHtml(article.titleRu || article.titleFi || '')}"><label for="text-${article.id}">Текст</label><textarea id="text-${article.id}" name="text" maxlength="20000" required>${escapeHtml(article.summaryRu || article.summaryFi || '')}</textarea><label for="category-${article.id}">Категория</label><select id="category-${article.id}" name="category" required>${categoryOptions}</select><label for="status-${article.id}">Редакционная метка</label><select id="status-${article.id}" name="editorial_status">${statusOptions}</select><label for="pinned-${article.id}">Закрепить до</label><input id="pinned-${article.id}" name="pinned_until" type="datetime-local" value="${escapeHtml(toDateTimeLocal(article.pinnedUntil))}"><div class="admin-actions"><button type="submit">Сохранить</button><a class="admin-delete-link" href="/admin/articles/${article.id}/delete">Удалить статью</a></div></form><div class="admin-actions">${draftControl}</div></article>`;
}

function telegramStatusMessage(status) {
  if (status === 'sent') return 'Новость отправлена в Telegram.';
  if (status === 'already-sent') return 'Эта новость уже была отправлена в Telegram.';
  if (status === 'error') return 'Не удалось отправить новость в Telegram. Попробуйте позже.';
  return '';
}

function importStatusMessage(status) {
  if (status === 'draft-created') return 'Черновик импортированной статьи создан.';
  if (status === 'published') return 'Черновик опубликован.';
  if (status === 'duplicate') return 'Статья с этим источником уже существует.';
  if (status === 'error') return 'Не удалось импортировать страницу. Проверьте ссылку и попробуйте позже.';
  return '';
}

function renderAdminPage({ pendingComments, articles, query, statistics, categories, telegramConfigured, telegramStatus, importProviderConfigured, importStatus, siteUrl }) {
  const comments = pendingComments.length
    ? pendingComments.map((comment) => `<article class="admin-comment"><h2><a href="/news/${encodeURIComponent(comment.articleSlug)}">${escapeHtml(comment.articleTitle)}</a></h2><p class="comment-author">${escapeHtml(comment.authorName)}</p><time class="comment-date" datetime="${escapeHtml(comment.createdAt || '')}">${escapeHtml(formatDate(comment.createdAt))}</time><p class="comment-body">${escapeHtml(comment.body)}</p><div class="admin-actions"><form action="/admin/comments/${comment.id}/approve" method="post"><button type="submit">Одобрить</button></form><form action="/admin/comments/${comment.id}/reject" method="post"><button class="reject" type="submit">Отклонить</button></form><form action="/admin/comments/${comment.id}/delete" method="post"><button class="delete" type="submit">Удалить</button></form></div></article>`).join('')
    : '<div class="empty-state">Комментариев, ожидающих модерации, нет.</div>';
  const articleForms = articles.length
    ? articles.map((article) => renderAdminArticleForm(article, categories, telegramConfigured)).join('')
    : '<div class="empty-state">Статьи не найдены.</div>';
  const topRead = statistics.topRead.length
    ? `<ol>${statistics.topRead.map((article) => `<li><a href="/news/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a> <span class="admin-count">${article.count}</span></li>`).join('')}</ol>`
    : '<p class="summary">Просмотров сегодня пока нет.</p>';
  const topCommented = statistics.topCommented.length
    ? `<ol>${statistics.topCommented.map((article) => `<li><a href="/news/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a> <span class="admin-count">${article.count}</span></li>`).join('')}</ol>`
    : '<p class="summary">Комментариев пока нет.</p>';
  const categoryOptions = categories.map((category) => optionMarkup(category, category, '')).join('');
  return documentPage({
    title: 'Редакция и модерация — Финские Новости',
    description: 'Закрытая страница редакции и модерации.',
    canonicalPath: '/admin',
    siteUrl,
    robots: 'noindex',
    content: `<p class="eyebrow">Администрирование</p><h1 class="page-heading">Редакция и модерация</h1>${telegramStatusMessage(telegramStatus) ? `<p class="form-message" role="status">${escapeHtml(telegramStatusMessage(telegramStatus))}</p>` : ''}${importStatusMessage(importStatus) ? `<p class="form-message" role="status">${escapeHtml(importStatusMessage(importStatus))}</p>` : ''}<section class="admin-list"><article class="admin-comment"><h2>Статистика за сегодня</h2><dl class="admin-stats"><div class="stat-card"><dt>Всего статей</dt><dd>${statistics.articleCount}</dd></div><div class="stat-card"><dt>Сегодня</dt><dd>${statistics.publishedToday}</dd></div><div class="stat-card"><dt>На модерации</dt><dd>${statistics.pendingComments}</dd></div><div class="stat-card"><dt>Просмотры</dt><dd>${statistics.siteViewsToday}</dd></div><div class="stat-card"><dt>Реакции</dt><dd>${statistics.reactionCount}</dd></div></dl><div class="admin-ranking"><section aria-labelledby="top-read-heading"><h3 id="top-read-heading">Топ читаемых</h3>${topRead}</section><section aria-labelledby="top-commented-heading"><h3 id="top-commented-heading">Топ комментируемых</h3>${topCommented}</section></div></article><article class="admin-comment"><h2>Импортировать по ссылке</h2>${importProviderConfigured ? '<form class="admin-form" action="/admin/import" method="post"><label for="import-url">Внешний HTTPS-адрес</label><input id="import-url" name="url" type="url" inputmode="url" placeholder="https://example.com/news" required><button type="submit">Создать черновик</button></form>' : '<p class="summary">Импорт недоступен: настройте провайдер пересказа.</p>'}</article><article class="admin-comment"><h2>Новая ручная новость</h2><form class="admin-form" action="/admin/articles" method="post"><label for="new-title">Заголовок</label><input id="new-title" name="title" type="text" maxlength="300" required><label for="new-text">Текст</label><textarea id="new-text" name="text" maxlength="20000" required></textarea><label for="new-category">Категория</label><select id="new-category" name="category" required><option value="">Выберите категорию</option>${categoryOptions}</select><label for="new-status">Редакционная метка</label><select id="new-status" name="editorial_status">${optionMarkup('normal', 'Обычная', 'normal')}${optionMarkup('important', 'Важная', 'normal')}${optionMarkup('urgent', 'Срочная', 'normal')}</select><label for="new-pinned">Закрепить до</label><input id="new-pinned" name="pinned_until" type="datetime-local"><button type="submit">Опубликовать</button></form></article></section><h2 class="section-title">Комментарии на модерации</h2><section class="admin-list">${comments}</section><h2 class="section-title">Статьи</h2><form class="admin-search" action="/admin" method="get"><label for="article-search">Поиск по заголовку</label><input id="article-search" name="q" type="search" value="${escapeHtml(query)}"><button type="submit">Найти</button></form><section class="admin-list">${articleForms}</section>`,
  });
}

function renderAdminArticleDeletePage({ article, siteUrl }) {
  const title = article.titleRu || article.titleFi;
  return documentPage({
    title: 'Подтверждение удаления — Финские Новости',
    description: 'Подтверждение удаления статьи.',
    canonicalPath: `/admin/articles/${article.id}/delete`,
    siteUrl,
    robots: 'noindex',
    content: `<section class="not-found"><p class="eyebrow">Подтверждение</p><h1>Удалить статью?</h1><p class="summary">${escapeHtml(title)}</p><p>Будут удалены и все связанные комментарии.</p><form action="/admin/articles/${article.id}/delete" method="post"><input type="hidden" name="confirm_delete" value="delete"><button class="delete" type="submit">Удалить без возможности восстановления</button></form><p><a href="/admin">Отмена</a></p></section>`,
  });
}

function renderNotFound({ siteUrl }) {
  return documentPage({
    title: 'Страница не найдена — Финские Новости',
    description: 'Запрошенная страница не найдена.',
    canonicalPath: '/404',
    siteUrl,
    robots: 'noindex',
    content: '<section class="not-found"><p class="eyebrow">Ошибка 404</p><h1>Страница не найдена</h1><p class="summary">Возможно, ссылка устарела или адрес введён с ошибкой.</p><p><a href="/">Вернуться к свежим новостям →</a></p></section>',
  });
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatLastmod(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function renderSitemap({ siteUrl, categorySlugs, articles }) {
  const urls = [
    { path: '/' },
    ...categorySlugs.map((slug) => ({ path: `/category/${encodeURIComponent(slug)}` })),
    ...articles.map((article) => ({
      path: `/news/${encodeURIComponent(article.slug)}`,
      lastmod: formatLastmod(article.publishedAt),
    })),
  ];
  const entries = urls.map((entry) => `  <url><loc>${escapeXml(`${siteUrl}${entry.path}`)}</loc>${entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

function renderRobots({ siteUrl }) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

module.exports = {
  renderArticlePage,
  renderAdminPage,
  renderAdminArticleDeletePage,
  renderAboutPage,
  renderListPage,
  renderNotFound,
  renderRobots,
  renderSitemap,
};
