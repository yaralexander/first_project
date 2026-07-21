const dns = require('dns').promises;
const https = require('https');
const net = require('net');

const MAX_REDIRECTS = 3;
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 10000;

function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const parts = address.split('.').map(Number);
    return parts[0] === 0
      || parts[0] === 10
      || parts[0] === 127
      || parts[0] >= 224
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && (parts[1] === 0 || parts[1] === 168))
      || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || parts[1] === 51))
      || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113);
  }
  if (family === 6) {
    const value = address.toLowerCase();
    const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
    const mappedHexIpv4 = mappedHex
      ? `${Number.parseInt(mappedHex[1], 16) >> 8}.${Number.parseInt(mappedHex[1], 16) & 255}.${Number.parseInt(mappedHex[2], 16) >> 8}.${Number.parseInt(mappedHex[2], 16) & 255}`
      : null;
    return value === '::' || value === '::1' || value.startsWith('fe80:')
      || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('ff')
      || value.startsWith('2001:db8:') || Boolean(mappedIpv4 && isBlockedAddress(mappedIpv4[1]))
      || Boolean(mappedHexIpv4 && isBlockedAddress(mappedHexIpv4));
  }
  return true;
}

function parseExternalUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value)) throw new Error('invalid_url');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('invalid_url');
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('invalid_url');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost')
    || (net.isIP(hostname) && isBlockedAddress(hostname))) {
    throw new Error('blocked_url');
  }
  return url;
}

async function resolveSafeHost(hostname) {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isBlockedAddress(record.address))) {
    throw new Error('blocked_url');
  }
  return normalizePinnedAddress(records[0]);
}

function normalizePinnedAddress(record) {
  const address = record && typeof record.address === 'string' ? record.address : '';
  const family = record && Number(record.family);
  if ((family !== 4 && family !== 6) || net.isIP(address) !== family || isBlockedAddress(address)) {
    throw new Error('blocked_url');
  }
  return { address, family };
}

function createPinnedLookup(record) {
  const address = normalizePinnedAddress(record);
  return (_hostname, options, callback) => {
    const done = typeof options === 'function' ? options : callback;
    const lookupOptions = typeof options === 'function' ? {} : options;
    const result = { address: address.address, family: address.family };

    // Node 20+ may request all addresses when autoSelectFamily is enabled.
    // Return the matching callback shape while still exposing only this pinned address.
    if (lookupOptions && lookupOptions.all) return done(null, [result]);
    return done(null, result.address, result.family);
  };
}

function requestHtml(url, address) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      headers: { 'User-Agent': 'FinskieNovostiImporter/1.0', Accept: 'text/html,application/xhtml+xml' },
      // The importer deliberately connects to one verified DNS address. Disable
      // Node's multi-address auto-selection so lookup keeps the standard
      // (address, family) callback contract in Node 20 and Node 24.
      autoSelectFamily: false,
      lookup: createPinnedLookup(address),
      timeout: TIMEOUT_MS,
    }, (response) => {
      const chunks = [];
      let size = 0;
      const contentLength = Number.parseInt(response.headers['content-length'] || '0', 10);
      if (contentLength > MAX_BYTES) {
        response.destroy();
        reject(new Error('response_too_large'));
        return;
      }
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          response.destroy();
          reject(new Error('response_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        statusCode: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('timeout', () => request.destroy(new Error('request_timeout')));
    request.on('error', () => reject(new Error('request_failed')));
    request.end();
  });
}

async function fetchExternalHtml(value, { resolver = resolveSafeHost, requester = requestHtml } = {}) {
  let url = parseExternalUrl(value);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const address = await resolver(url.hostname);
    const response = await requester(url, address);
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      if (!response.headers.location || redirectCount === MAX_REDIRECTS) throw new Error('redirect_failed');
      url = parseExternalUrl(new URL(response.headers.location, url).href);
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error('request_failed');
    const contentType = response.headers['content-type'] || '';
    if (!/^text\/html(?:;|$)/i.test(contentType)) throw new Error('not_html');
    return { url: url.href, html: response.body };
  }
  throw new Error('redirect_failed');
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function textFromHtml(value) {
  return decodeHtml(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function extractArticleContent(html) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const mainMatch = html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const title = textFromHtml(titleMatch ? titleMatch[1] : '').slice(0, 300);
  const text = textFromHtml(mainMatch ? mainMatch[1] : (bodyMatch ? bodyMatch[1] : html)).slice(0, 12000);
  if (!title || !text) throw new Error('empty_content');
  return { title, text };
}

module.exports = {
  createPinnedLookup,
  extractArticleContent,
  fetchExternalHtml,
  isBlockedAddress,
  parseExternalUrl,
  requestHtml,
};
