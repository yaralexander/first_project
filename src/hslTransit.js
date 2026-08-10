const HSL_API_URL = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';
const STOP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let stopCache = { expiresAt: 0, stops: [] };

class HslTransitError extends Error {
  constructor(message, code = 'hsl_error') {
    super(message);
    this.code = code;
  }
}

async function graphQlRequest(query, variables, { apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new HslTransitError('Ключ Digitransit не настроен.', 'missing_api_key');
  const response = await fetchImpl(HSL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'digitransit-subscription-key': apiKey,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new HslTransitError(`Digitransit вернул ошибку ${response.status}.`, 'api_error');
  const payload = await response.json();
  if (payload.errors?.length) throw new HslTransitError(payload.errors[0].message, 'graphql_error');
  return payload.data || {};
}

async function loadStops(options = {}) {
  if (stopCache.expiresAt > Date.now() && stopCache.stops.length) return stopCache.stops;
  const data = await graphQlRequest(`query HslStops {
    stops { gtfsId name code platformCode lat lon }
  }`, {}, options);
  const stops = Array.isArray(data.stops) ? data.stops.filter((stop) => stop.code) : [];
  stopCache = { expiresAt: Date.now() + STOP_CACHE_TTL_MS, stops };
  return stops;
}

function normalizeStopCode(value) {
  return String(value || '').trim().toLocaleUpperCase('fi-FI').replace(/\s+/g, '');
}

async function findStopByCode(code, options = {}) {
  const wanted = normalizeStopCode(code);
  if (!/^[A-ZÅÄÖ]{0,2}\d{3,7}$/.test(wanted)) return null;
  const stops = await loadStops(options);
  return stops.find((stop) => normalizeStopCode(stop.code) === wanted)
    || stops.find((stop) => normalizeStopCode(stop.gtfsId?.split(':').pop()) === wanted)
    || null;
}

const DEPARTURES_QUERY = `query StopDepartures($id: String!, $count: Int!) {
  stop(id: $id) {
    gtfsId name code platformCode
    stoptimesWithoutPatterns(numberOfDepartures: $count, omitNonPickups: true) {
      serviceDay scheduledDeparture realtimeDeparture realtime realtimeState headsign
      trip { route { shortName mode } }
    }
  }
}`;

async function departuresForStop(stop, options = {}) {
  const data = await graphQlRequest(DEPARTURES_QUERY, { id: stop.gtfsId, count: options.count || 8 }, options);
  return data.stop || null;
}

async function departuresByStopCode(code, options = {}) {
  const stop = await findStopByCode(code, options);
  if (!stop) return null;
  return departuresForStop(stop, options);
}

async function departuresNearLocation(latitude, longitude, options = {}) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new HslTransitError('Некорректная геопозиция.', 'invalid_location');
  const data = await graphQlRequest(`query NearbyStops($lat: Float!, $lon: Float!) {
    stopsByRadius(lat: $lat, lon: $lon, radius: 700, first: 3) {
      edges { node { distance stop { gtfsId name code platformCode lat lon } } }
    }
  }`, { lat, lon }, options);
  const nearby = data.stopsByRadius?.edges || [];
  const results = [];
  for (const edge of nearby) {
    const stop = await departuresForStop(edge.node.stop, { ...options, count: 5 });
    if (stop) results.push({ ...stop, distance: edge.node.distance });
  }
  return results;
}

function departureTimestamp(item) {
  const seconds = item.realtime && Number.isFinite(item.realtimeDeparture)
    ? item.realtimeDeparture : item.scheduledDeparture;
  return (Number(item.serviceDay) + Number(seconds)) * 1000;
}

function formatTime(timestamp, now = new Date()) {
  const date = new Date(timestamp);
  const minutes = Math.max(0, Math.round((timestamp - now.getTime()) / 60000));
  const clock = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
  return minutes < 60 ? `${clock} (через ${minutes} мин)` : clock;
}

function formatStopDepartures(stop, { now = new Date(), includeDistance = false } = {}) {
  const departures = (stop?.stoptimesWithoutPatterns || [])
    .map((item) => ({ ...item, timestamp: departureTimestamp(item) }))
    .filter((item) => Number.isFinite(item.timestamp) && item.timestamp >= now.getTime() - 60000)
    .sort((a, b) => a.timestamp - b.timestamp);
  const heading = `🚏 ${stop.name} · остановка ${stop.code || 'без номера'}${includeDistance && Number.isFinite(stop.distance) ? ` · ${Math.round(stop.distance)} м` : ''}`;
  if (!departures.length) return `${heading}\n\nБлижайшие отправления не найдены.`;
  const lines = departures.map((item) => {
    const route = item.trip?.route?.shortName || '—';
    const realtime = item.realtime ? ' 🟢' : '';
    return `${formatTime(item.timestamp, now)}  ${route} → ${item.headsign || 'направление не указано'}${realtime}`;
  });
  return `${heading}\n\n${lines.join('\n')}\n\n🟢 — время обновлено в реальном времени`;
}

function formatNearbyDepartures(stops, options = {}) {
  if (!stops.length) return 'Рядом не найдено остановок HSL. Попробуйте отправить номер остановки.';
  return stops.map((stop) => formatStopDepartures(stop, { ...options, includeDistance: true })).join('\n\n──────────\n\n');
}

function resetStopCacheForTests() {
  stopCache = { expiresAt: 0, stops: [] };
}

module.exports = {
  HslTransitError,
  departuresByStopCode,
  departuresNearLocation,
  findStopByCode,
  formatNearbyDepartures,
  formatStopDepartures,
  normalizeStopCode,
  resetStopCacheForTests,
};
