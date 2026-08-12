const assert = require('node:assert/strict');
const test = require('node:test');
const { buildGroceryOffersMessage, groceryOfferDigest, selectedChains } = require('../src/groceryOffers');

test('builds official grocery offer and nearby-store links for selected chains', () => {
  const message = buildGroceryOffersMessage({ chainIds: ['lidl', 'prisma'], city: 'Espoo' });
  assert.match(message, /Lidl/);
  assert.match(message, /Prisma/);
  assert.doesNotMatch(message, /K-Citymarket/);
  assert.match(message, /google\.com\/maps/);
  assert.match(message, /lidl\.fi/);
  assert.match(message, /s-kaupat\.fi/);
  assert.match(message, /s-kaupat\.fi\/tuotteet\/kampanjat/);
});

test('weekly offer digest has a stable week key and defaults to every chain', () => {
  const first = groceryOfferDigest(new Date('2026-08-12T10:00:00Z'), { city: 'Helsinki' });
  const second = groceryOfferDigest(new Date('2026-08-16T10:00:00Z'), { city: 'Helsinki' });
  assert.equal(first.key, second.key);
  assert.equal(selectedChains([]).length, 7);
});

test('uses the official offer pages for every K chain', () => {
  const message = buildGroceryOffersMessage({ chainIds: ['kmarket', 'ksupermarket', 'kcitymarket'] });
  assert.match(message, /k-market\/tarjouslehti/);
  assert.match(message, /k-supermarket\/tarjouslehti/);
  assert.match(message, /kauppa\/tarjoushaku/);
});
