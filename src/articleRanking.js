const DEFAULT_PUBLIC_CHANNEL_SCORE = 65;

const IMPORTANCE_SCORES = new Map([
  [1, 10],
  [2, 20],
  [3, 35],
  [4, 55],
  [5, 75],
]);

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function freshnessScore(publishedAt, now) {
  const published = new Date(publishedAt || '');
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(published.getTime()) || Number.isNaN(current.getTime())) return 0;
  const ageHours = (current.getTime() - published.getTime()) / (60 * 60 * 1000);
  if (ageHours < 0 || ageHours > 24) return 0;
  return ageHours <= 6 ? 5 : 2;
}

function corroborationScore(sourceCount) {
  if (sourceCount >= 4) return 35;
  if (sourceCount === 3) return 30;
  if (sourceCount === 2) return 20;
  return 0;
}

function calculateArticleRanking(article, signals = {}, now = new Date()) {
  const importanceLevel = clampInteger(article?.importanceLevel, 1, 5, 1);
  const independentSourceCount = clampInteger(signals.independentSourceCount, 1, 20, 1);
  const reasons = [];
  let score = IMPORTANCE_SCORES.get(importanceLevel);

  reasons.push(`важность ${importanceLevel}/5: +${score}`);

  const corroboration = corroborationScore(independentSourceCount);
  if (corroboration) {
    score += corroboration;
    reasons.push(`${independentSourceCount} независимых источника: +${corroboration}`);
  }

  if (article?.editorialStatus === 'urgent') {
    score += 15;
    reasons.push('метка редакции «Срочно»: +15');
  } else if (article?.editorialStatus === 'important') {
    score += 10;
    reasons.push('метка редакции «Важно»: +10');
  }

  if (article?.regionCode === 'finland') {
    score += 5;
    reasons.push('прямая связь с Финляндией: +5');
  }

  const freshness = freshnessScore(article?.publishedAt, now);
  if (freshness) {
    score += freshness;
    reasons.push(`свежесть новости: +${freshness}`);
  }

  const qualityStatus = String(article?.qualityStatus || 'unchecked');
  const eligible = article?.publicationStatus === 'published'
    && !['manual_review', 'rejected'].includes(qualityStatus);
  if (!eligible) reasons.push('публикация заблокирована проверкой качества');

  const normalizedScore = Math.min(score, 100);
  return {
    score: normalizedScore,
    tier: normalizedScore >= 80 ? 'top' : normalizedScore >= DEFAULT_PUBLIC_CHANNEL_SCORE ? 'important' : 'regular',
    eligible,
    independentSourceCount,
    reasons,
    explanation: reasons.join('; '),
  };
}

function meetsPublicChannelThreshold(ranking, minimumScore = DEFAULT_PUBLIC_CHANNEL_SCORE) {
  const threshold = clampInteger(minimumScore, 0, 100, DEFAULT_PUBLIC_CHANNEL_SCORE);
  return Boolean(ranking?.eligible) && Number(ranking.score || 0) >= threshold;
}

module.exports = {
  DEFAULT_PUBLIC_CHANNEL_SCORE,
  calculateArticleRanking,
  meetsPublicChannelThreshold,
};
