const GROCERY_CHAINS = Object.freeze([
  { id: 'lidl', name: 'Lidl', offersUrl: 'https://www.lidl.fi/c/viikon-tarjoukset/', storesUrl: 'https://www.lidl.fi/c/myymalat/s10019811' },
  { id: 'prisma', name: 'Prisma', offersUrl: 'https://www.s-kaupat.fi/tuotteet/kampanjat', storesUrl: 'https://www.s-kaupat.fi/myymalat/prisma' },
  { id: 'smarket', name: 'S-market', offersUrl: 'https://www.s-kaupat.fi/tuotteet/kampanjat', storesUrl: 'https://www.s-kaupat.fi/myymalat/s-market' },
  { id: 'alepa', name: 'Alepa', offersUrl: 'https://www.s-kaupat.fi/tuotteet/kampanjat', storesUrl: 'https://www.s-kaupat.fi/myymalat/alepa' },
  { id: 'kmarket', name: 'K-Market', offersUrl: 'https://www.k-ruoka.fi/k-market/tarjouslehti', storesUrl: 'https://www.k-ruoka.fi/kauppa' },
  { id: 'ksupermarket', name: 'K-Supermarket', offersUrl: 'https://www.k-ruoka.fi/k-supermarket/tarjouslehti', storesUrl: 'https://www.k-ruoka.fi/kauppa' },
  { id: 'kcitymarket', name: 'K-Citymarket', offersUrl: 'https://www.k-ruoka.fi/kauppa/tarjoushaku', storesUrl: 'https://www.k-ruoka.fi/kauppa' },
]);

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function selectedChains(ids = []) {
  const wanted = new Set(Array.isArray(ids) && ids.length ? ids : GROCERY_CHAINS.map((chain) => chain.id));
  return GROCERY_CHAINS.filter((chain) => wanted.has(chain.id));
}

function mapsUrl(chain, location = {}) {
  const place = location.latitude !== undefined && location.longitude !== undefined
    ? `${location.latitude},${location.longitude}`
    : String(location.city || '').trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${chain.name}${place ? ` near ${place}` : ' Finland'}`)}`;
}

function buildGroceryOffersMessage({ chainIds = [], city = '', latitude, longitude } = {}) {
  const chains = selectedChains(chainIds);
  const location = { city, latitude, longitude };
  const locationLabel = city ? ` для города ${escapeHtml(city)}` : latitude !== undefined ? ' рядом с вашей геопозицией' : '';
  const rows = chains.map((chain) => [
    `<b>${escapeHtml(chain.name)}</b>`,
    `<a href="${chain.offersUrl}">Актуальные предложения</a> · <a href="${chain.storesUrl}">Магазины</a> · <a href="${mapsUrl(chain, location)}">На карте рядом</a>`,
  ].join('\n'));
  return [
    `🛒 <b>Акции продуктовых магазинов${locationLabel}</b>`,
    ...rows,
    'Цены и доступность зависят от выбранного магазина. Персональные купоны Lidl Plus и Plussa открываются только в приложениях соответствующих сетей.',
  ].join('\n\n').slice(0, 4096);
}

function groceryOfferDigest(now = new Date(), profile = {}) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(now);
  const monday = new Date(`${date}T12:00:00Z`);
  const day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - ((day + 6) % 7));
  const weekKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(monday);
  return {
    type: 'offers',
    key: `offers:${weekKey}`,
    text: buildGroceryOffersMessage({ chainIds: profile.groceryChains, city: profile.city }),
  };
}

module.exports = { GROCERY_CHAINS, buildGroceryOffersMessage, groceryOfferDigest, selectedChains };
