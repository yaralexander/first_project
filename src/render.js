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
    @media (prefers-color-scheme:dark){:root{--bg:#11151c;--surface:#181e27;--ink:#eef3fb;--muted:#aab5c5;--line:#2b3442;--accent:#6caeff;--accent-soft:#1d3452;--shadow:0 10px 30px rgba(0,0,0,.22)}.hero{background:linear-gradient(135deg,#1e67c2,#162f57)}.original-box a{color:#071321}.original-box a:hover{background:#9bc8ff}}
    @media (max-width:760px){.header-inner{min-height:62px;padding:0 18px}.header-link{display:none}.page-shell{padding:30px 18px 52px}.hero{grid-template-columns:1fr;padding:26px;margin-bottom:26px}.hero-aside{display:none}.news-grid,.news-grid--archive{grid-template-columns:1fr;gap:12px}.card{min-height:0;padding:19px}.page-intro{margin-bottom:24px}.original-box{align-items:flex-start;flex-direction:column}.original-box a{width:100%;text-align:center}.pagination a{flex:1;text-align:center}}
    .skip-link{position:absolute;left:14px;top:-48px;z-index:10;padding:9px 12px;border-radius:8px;background:var(--accent);color:#fff;font-weight:750}.skip-link:focus{top:12px;text-decoration:none}.site-header{backdrop-filter:blur(14px);background:color-mix(in srgb,var(--surface) 92%,transparent)}.brand{display:flex;align-items:center}.brand-mark{box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}.header-nav{display:flex;align-items:center;gap:18px}.header-link{position:relative}.header-link:hover{color:var(--accent);text-decoration:none}.header-link::after{content:"";position:absolute;right:0;bottom:-4px;left:0;height:2px;border-radius:2px;background:var(--accent);transform:scaleX(0);transition:transform .18s ease}.header-link:hover::after{transform:scaleX(1)}.page-shell{padding-top:clamp(30px,5vw,60px)}.page-heading{max-width:840px}.page-intro{font-size:1.08rem;line-height:1.65}.category-nav{padding-bottom:4px}.category-pill{transition:border-color .18s ease,background .18s ease,color .18s ease}.hero{position:relative;overflow:hidden}.hero::after{content:"";position:absolute;width:360px;height:360px;right:-160px;top:-230px;border:1px solid rgba(255,255,255,.22);border-radius:50%;box-shadow:0 0 0 34px rgba(255,255,255,.05),0 0 0 68px rgba(255,255,255,.035)}.hero>div{position:relative;z-index:1}.hero-aside strong{display:block;color:#fff;font-size:1.05rem}.section-title{display:flex;align-items:center;gap:12px}.section-title::after{content:"";height:1px;flex:1;background:var(--line)}.card{position:relative}.card::before{content:"";position:absolute;top:0;right:20px;left:20px;height:3px;border-radius:0 0 4px 4px;background:var(--accent);opacity:0;transition:opacity .18s ease}.card:hover::before{opacity:1}.article-page{padding-bottom:24px}.article-page .meta{margin-top:18px}.article-page .article-heading{max-width:760px}.article-page .summary{white-space:pre-line}.article-facts{padding-bottom:18px;border-bottom:1px solid var(--line)}.original-box{box-shadow:0 8px 22px rgba(18,36,64,.05)}.original-box a{transition:transform .18s ease,background .18s ease}.original-box a:hover{transform:translateY(-1px)}.footer-note{margin:46px 0 0;color:var(--muted);font-size:.84rem}.not-found .summary{margin-bottom:26px}
    @media (max-width:760px){.header-nav{gap:12px}.header-link{display:block;font-size:.84rem}.header-link--archive{display:none}.hero::after{right:-220px}.footer-note{margin-top:32px}}
    @media (max-width:390px){.page-shell{padding-left:14px;padding-right:14px}.hero{padding:21px}.page-heading{font-size:2.05rem}.hero h2{font-size:1.75rem}.category-nav{gap:6px}.category-pill{padding:6px 10px}.header-inner{padding:0 14px}.brand{font-size:1.03rem}.brand-mark{width:25px;height:25px;margin-right:6px}}
  </style>
</head>
<body>
  <a class="skip-link" href="#content">Перейти к содержанию</a>
  <header class="site-header"><div class="header-inner"><a class="brand" href="/"><span class="brand-mark">FN</span>Финские Новости</a><nav class="header-nav" aria-label="Основная навигация"><a class="header-link" href="/">Свежие</a><a class="header-link header-link--archive" href="/page/2">Архив</a></nav></div></header>
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

function sourceLink(article) {
  return `<a class="source-link" href="${escapeHtml(safeExternalUrl(article.originalUrl))}" rel="noopener noreferrer" target="_blank">Источник: ${escapeHtml(article.sourceName)} ↗</a>`;
}

function renderArticleCard(article, categoryToSlug) {
  return `<article class="card">
  ${articleMeta(article, categoryToSlug)}
  <h2><a href="/news/${encodeURIComponent(article.slug)}">${escapeHtml(article.titleRu || article.titleFi)}</a></h2>
  <p class="summary">${escapeHtml(article.summaryRu || article.summaryFi || '')}</p>
  ${sourceLink(article)}
</article>`;
}

function renderFeaturedArticle(article, categoryToSlug) {
  return `<article class="hero">
  <div>${articleMeta(article, categoryToSlug)}<h2><a href="/news/${encodeURIComponent(article.slug)}">${escapeHtml(article.titleRu || article.titleFi)}</a></h2><p class="hero-summary">${escapeHtml(article.summaryRu || article.summaryFi || '')}</p></div>
  <div class="hero-aside"><strong>${escapeHtml(article.sourceName)}</strong><br>${escapeHtml(formatDate(article.publishedAt))}<br><br><a class="source-link" href="/news/${encodeURIComponent(article.slug)}">Читать новость →</a></div>
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

function renderArticlePage({ article, siteUrl, categoryToSlug }) {
  const title = article.titleRu || article.titleFi;
  const description = article.summaryRu || article.summaryFi || title;
  return documentPage({
    title: `${title} — Финские Новости`,
    description,
    canonicalPath: `/news/${encodeURIComponent(article.slug)}`,
    siteUrl,
    content: `<article class="article-page"><p class="eyebrow">Новость Финляндии</p>${articleMeta(article, categoryToSlug)}<h1 class="article-heading">${escapeHtml(title)}</h1><div class="article-facts"><span class="fact">${escapeHtml(article.category || 'Новости')}</span><span class="fact">${escapeHtml(article.sourceName)}</span></div><p class="summary">${escapeHtml(article.summaryRu || article.summaryFi || '')}</p><div class="original-box"><p>Полный материал опубликован у первоисточника.</p><a href="${escapeHtml(safeExternalUrl(article.originalUrl))}" rel="noopener noreferrer" target="_blank">Открыть оригинал ↗</a></div></article>`,
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
  renderListPage,
  renderNotFound,
  renderRobots,
  renderSitemap,
};
