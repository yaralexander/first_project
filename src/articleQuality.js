const CRITICAL_TERMS = [
  'экстренн', 'срочно', 'опасност', 'эвакуац', 'теракт', 'стрельб', 'пожар',
  'onnettomuus', 'hätä', 'evakuointi', 'ampuminen', 'tulipalo',
];

const HIGH_IMPORTANCE_TERMS = [
  'правительств', 'парламент', 'президент', 'министр', 'закон', 'границ',
  'безработиц', 'инфляц', 'забастовк', 'hallitus', 'eduskunta', 'presidentti',
  'ministeri', 'laki', 'raja', 'työttömyys', 'inflaatio', 'lakko',
];

const LOW_IMPORTANCE_TERMS = [
  'гороскоп', 'рецепт', 'знаменитост', 'светская хроника',
  'horoskooppi', 'resepti', 'julkkis', 'viihde',
];

function normalize(value) {
  return String(value || '').toLocaleLowerCase('ru-RU');
}

function matchedTerms(text, terms) {
  return terms.filter((term) => text.includes(term));
}

function assessImportance(article) {
  const text = normalize([
    article.titleRu,
    article.summaryRu,
    article.titleFi,
    article.summaryFi,
  ].filter(Boolean).join(' '));
  const criticalMatches = matchedTerms(text, CRITICAL_TERMS);
  const highMatches = matchedTerms(text, HIGH_IMPORTANCE_TERMS);
  const lowMatches = matchedTerms(text, LOW_IMPORTANCE_TERMS);

  if (article.editorialStatus === 'urgent' || article.isUrgent) {
    return { level: 5, reason: 'Редакционная метка «Срочно» требует максимального приоритета.' };
  }
  if (criticalMatches.length) {
    return {
      level: 5,
      reason: `Обнаружены признаки экстренного события: ${criticalMatches.slice(0, 3).join(', ')}.`,
    };
  }
  if (article.editorialStatus === 'important') {
    return { level: 4, reason: 'Редакционная метка «Важно» повышает приоритет материала.' };
  }
  if (highMatches.length >= 2) {
    return {
      level: 4,
      reason: `Материал затрагивает значимую общественную тему: ${highMatches.slice(0, 3).join(', ')}.`,
    };
  }
  if (highMatches.length === 1 || ['Политика', 'Экономика', 'Россия'].includes(article.category)) {
    return {
      level: 3,
      reason: 'Материал относится к общественно значимой теме, но не имеет признаков экстренности.',
    };
  }
  if (lowMatches.length) {
    return {
      level: 1,
      reason: `Материал относится к лёгкой повседневной тематике: ${lowMatches.slice(0, 3).join(', ')}.`,
    };
  }
  return {
    level: 2,
    reason: 'Обычная новость без признаков срочного или критического события.',
  };
}

function assessArticleQuality(article, classification) {
  const issues = [];
  let confidence = 0.96;
  const titleRu = String(article.titleRu || '').trim();
  const summaryRu = String(article.summaryRu || '').trim();
  const method = String(article.translationMethod || '').trim();
  const classificationConfidence = Number(classification?.confidence || 0);

  if (!titleRu) {
    issues.push('нет русского заголовка');
    confidence -= 0.45;
  }
  if (!summaryRu) {
    issues.push('нет русского текста');
    confidence -= 0.45;
  } else if (summaryRu.length < 80) {
    issues.push('русский текст слишком короткий');
    confidence -= 0.2;
  }
  if (method === 'fallback-original') {
    issues.push('использован оригинал вместо перевода');
    confidence -= 0.45;
  }
  if (method === 'mock' || titleRu.startsWith('[RU]') || summaryRu.startsWith('[RU]')) {
    issues.push('тестовый перевод');
    confidence -= 0.35;
  }
  if (classificationConfidence < 0.55) {
    issues.push(`низкая уверенность классификатора (${Math.round(classificationConfidence * 100)}%)`);
    confidence -= 0.25;
  }

  confidence = Number(Math.max(0.05, Math.min(0.99, confidence)).toFixed(2));
  const status = issues.length ? 'manual_review' : 'passed';
  const importance = assessImportance(article);
  return {
    status,
    confidence,
    reason: issues.length
      ? `Нужна проверка редактора: ${issues.join('; ')}.`
      : 'Русский заголовок и текст заполнены, перевод и классификация прошли автоматические проверки.',
    issues,
    importanceLevel: importance.level,
    importanceReason: importance.reason,
  };
}

module.exports = {
  assessArticleQuality,
  assessImportance,
};
