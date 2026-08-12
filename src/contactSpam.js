const crypto = require('crypto');

function createContactFormToken(secret, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`contact:${issuedAt}`)
    .digest('hex');
  return `${issuedAt}.${signature}`;
}

function verifyContactFormToken(token, secret, {
  now = Date.now(),
  minAgeMs = 2000,
  maxAgeMs = 2 * 60 * 60 * 1000,
} = {}) {
  if (typeof token !== 'string' || !/^\d{10,}\.[a-f0-9]{64}$/.test(token)) return false;
  const [issuedAtText, providedSignature] = token.split('.');
  const issuedAtMs = Number.parseInt(issuedAtText, 10) * 1000;
  const ageMs = now - issuedAtMs;
  if (!Number.isFinite(issuedAtMs) || ageMs < minAgeMs || ageMs > maxAgeMs) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`contact:${issuedAtText}`)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(providedSignature, 'hex'),
    Buffer.from(expectedSignature, 'hex'),
  );
}

function normalizeContactText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function countLinks(value) {
  const matches = String(value || '').match(/(?:https?:\/\/|www\.)\S+/gi);
  return matches ? matches.length : 0;
}

function createSlidingWindowRateLimiter({ windowMs, max, maxKeys = 10000 }) {
  const entries = new Map();
  return {
    consume(key, now = Date.now()) {
      if (!entries.has(key) && entries.size >= maxKeys) {
        entries.delete(entries.keys().next().value);
      }
      const recent = (entries.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
      if (recent.length >= max) {
        entries.set(key, recent);
        return false;
      }
      recent.push(now);
      entries.set(key, recent);
      return true;
    },
  };
}

module.exports = {
  countLinks,
  createContactFormToken,
  createSlidingWindowRateLimiter,
  normalizeContactText,
  verifyContactFormToken,
};
