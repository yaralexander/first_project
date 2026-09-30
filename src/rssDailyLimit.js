const helsinkiFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function helsinkiParts(date = new Date()) {
  return Object.fromEntries(helsinkiFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
}

function helsinkiDay(date = new Date()) {
  const parts = helsinkiParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dailyRssLimit(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 500 ? parsed : 50;
}

function rssDailyAllowance(limit, date = new Date()) {
  const safeLimit = dailyRssLimit(limit);
  if (safeLimit === 0) return 0;
  const parts = helsinkiParts(date);
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const start = 8 * 60;
  const end = 20 * 60;
  if (minute < start || minute >= end) return 0;
  return Math.min(safeLimit, Math.floor((minute - start) * safeLimit / (end - start)) + 1);
}

function isRssEntryFromDay(entry, day) {
  const value = entry.isoDate || entry.pubDate;
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && helsinkiDay(date) === day;
}

function* balancedEntries(feeds) {
  let index = 0;
  while (feeds.some(({ entries }) => index < entries.length)) {
    for (const { source, entries } of feeds) {
      if (index < entries.length) yield { source, entry: entries[index] };
    }
    index += 1;
  }
}

module.exports = { helsinkiDay, dailyRssLimit, rssDailyAllowance, isRssEntryFromDay, balancedEntries };
