const STOP_WORDS = new Set([
  'että', 'ja', 'tai', 'kun', 'kuin', 'myös', 'oli', 'on', 'ovat', 'sekä', 'joka', 'jotka',
  'tämä', 'tämän', 'sillä', 'hän', 'he', 'sen', 'nyt', 'uusi', 'uutiset', 'suomi', 'suomen',
  'для', 'как', 'что', 'это', 'или', 'при', 'его', 'она', 'они', 'также', 'уже', 'после',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'news', 'new',
]);

function normalizeText(value = '') {
  return String(value)
    .normalize('NFKC')
    .toLocaleLowerCase('fi-FI')
    .replace(/\[ru\]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(value = '') {
  return new Set(normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)));
}

function tokensEquivalent(left, right) {
  if (left === right) return true;
  const shortest = Math.min(left.length, right.length);
  if (shortest < 7) return false;
  let prefix = 0;
  while (prefix < shortest && left[prefix] === right[prefix]) prefix += 1;
  return prefix >= 6 && prefix / shortest >= 0.68;
}

function tokenMetrics(left, right) {
  if (!left.size || !right.size) return { overlap: 0, containment: 0, dice: 0 };
  let overlap = 0;
  const unmatchedRight = [...right];
  for (const token of left) {
    const matchIndex = unmatchedRight.findIndex((candidate) => tokensEquivalent(token, candidate));
    if (matchIndex >= 0) {
      overlap += 1;
      unmatchedRight.splice(matchIndex, 1);
    }
  }
  return {
    overlap,
    containment: overlap / Math.min(left.size, right.size),
    dice: (2 * overlap) / (left.size + right.size),
  };
}

function compareArticles(left, right) {
  const leftTitle = normalizeText(left.title || '');
  const rightTitle = normalizeText(right.title || '');
  const exactTitle = leftTitle.length >= 18 && leftTitle === rightTitle;
  const titleMetrics = tokenMetrics(meaningfulTokens(left.title), meaningfulTokens(right.title));
  const contentMetrics = tokenMetrics(
    meaningfulTokens(`${left.title || ''} ${left.summary || ''}`),
    meaningfulTokens(`${right.title || ''} ${right.summary || ''}`),
  );
  const titleMatch = titleMetrics.overlap >= 3
    && titleMetrics.containment >= 0.68
    && titleMetrics.dice >= 0.55;
  const contentMatch = titleMetrics.overlap >= 2
    && contentMetrics.overlap >= 6
    && contentMetrics.containment >= 0.72
    && contentMetrics.dice >= 0.55;
  const score = exactTitle
    ? 1
    : Math.max(titleMetrics.containment * 0.65 + titleMetrics.dice * 0.35, contentMetrics.containment * 0.6 + contentMetrics.dice * 0.4);
  return {
    isDuplicate: exactTitle || titleMatch || contentMatch,
    score: Number(score.toFixed(4)),
    titleOverlap: titleMetrics.overlap,
    contentOverlap: contentMetrics.overlap,
  };
}

module.exports = { compareArticles, meaningfulTokens, normalizeText };
