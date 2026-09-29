const helsinkiFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit',
});

function helsinkiDay(date = new Date()) {
  const parts = Object.fromEntries(helsinkiFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dailyRssLimit(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 500 ? parsed : 50;
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

module.exports = { helsinkiDay, dailyRssLimit, balancedEntries };
