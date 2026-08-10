const test = require('node:test');
const assert = require('node:assert/strict');
const {
  departuresByStopCode,
  departuresNearLocation,
  formatNearbyDepartures,
  formatStopDepartures,
  normalizeStopCode,
  resetStopCacheForTests,
} = require('../src/hslTransit');

function jsonResponse(data) {
  return { ok: true, json: async () => ({ data }) };
}

test('finds an HSL stop by its public code and formats realtime departures', async () => {
  resetStopCacheForTests();
  const now = new Date('2026-08-10T09:00:00.000Z');
  const serviceDay = Math.floor(new Date('2026-08-10T00:00:00.000Z').getTime() / 1000);
  const fetchImpl = async (_url, options) => {
    const { query } = JSON.parse(options.body);
    if (query.includes('query HslStops')) return jsonResponse({ stops: [{ gtfsId: 'HSL:1234', name: 'Kamppi', code: 'H1234' }] });
    return jsonResponse({ stop: {
      gtfsId: 'HSL:1234', name: 'Kamppi', code: 'H1234',
      stoptimesWithoutPatterns: [{
        serviceDay, scheduledDeparture: 32700, realtimeDeparture: 33000, realtime: true,
        headsign: 'Pasila', trip: { route: { shortName: '7', mode: 'TRAM' } },
      }],
    } });
  };
  const stop = await departuresByStopCode(' h1234 ', { apiKey: 'test-key', fetchImpl });
  const text = formatStopDepartures(stop, { now });
  assert.equal(normalizeStopCode(' h 1234 '), 'H1234');
  assert.match(text, /Kamppi · остановка H1234/);
  assert.match(text, /7 → Pasila 🟢/);
});

test('uses coordinates to return nearby HSL stops', async () => {
  const fetchImpl = async (_url, options) => {
    const { query } = JSON.parse(options.body);
    if (query.includes('stopsByRadius')) return jsonResponse({ stopsByRadius: { edges: [{ node: { distance: 85, stop: { gtfsId: 'HSL:2', name: 'Asema', code: 'E1001' } } }] } });
    return jsonResponse({ stop: { gtfsId: 'HSL:2', name: 'Asema', code: 'E1001', stoptimesWithoutPatterns: [] } });
  };
  const stops = await departuresNearLocation(60.17, 24.94, { apiKey: 'test-key', fetchImpl });
  assert.equal(stops[0].distance, 85);
  assert.match(formatNearbyDepartures(stops), /85 м/);
});
