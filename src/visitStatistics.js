// Keep anonymous daily totals after detailed visitor hashes expire.
function initializeVisitStatistics(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS analytics_daily_visits (
    day TEXT PRIMARY KEY,
    visits INTEGER NOT NULL DEFAULT 0
  )`);
  db.transaction(() => {
    db.exec(`INSERT OR IGNORE INTO analytics_daily_visits (day, visits)
      SELECT viewed_on, COUNT(*) FROM analytics_views WHERE article_id = 0 GROUP BY viewed_on`);
    db.prepare(`INSERT OR IGNORE INTO analytics_settings (key, value)
      VALUES ('visits_filtered_since', date('now'))`).run();
  })();
}

function incrementDailyVisits(db, day) {
  db.prepare(`INSERT INTO analytics_daily_visits (day, visits) VALUES (?, 1)
    ON CONFLICT(day) DO UPDATE SET visits = visits + 1`).run(day);
}

function getVisitOverview(db, today = new Date().toISOString().slice(0, 10)) {
  const first = db.prepare('SELECT MIN(day) AS day FROM analytics_daily_visits').get().day || today;
  const months = db.prepare(`WITH RECURSIVE months(month) AS (
    SELECT date(@first, 'start of month')
    UNION ALL SELECT date(month, '+1 month') FROM months
      WHERE month < date(@today, 'start of month')
  ) SELECT substr(month, 1, 7) AS month, COALESCE(SUM(visits), 0) AS visits
    FROM months LEFT JOIN analytics_daily_visits ON substr(day, 1, 7) = substr(month, 1, 7)
      AND day <= @today
    GROUP BY month ORDER BY month DESC`).all({ first, today });
  const daily = db.prepare(`WITH RECURSIVE days(day) AS (
    SELECT date(@today, '-29 days') UNION ALL
    SELECT date(day, '+1 day') FROM days WHERE day < @today
  ) SELECT days.day, COALESCE(visits, 0) AS visits FROM days
    LEFT JOIN analytics_daily_visits ON analytics_daily_visits.day = days.day ORDER BY days.day`).all({ today });
  return {
    months, daily, firstDay: first, today,
    last30Days: daily.reduce((sum, day) => sum + day.visits, 0),
    filteredSince: db.prepare("SELECT value FROM analytics_settings WHERE key = 'visits_filtered_since'").get()?.value,
  };
}

function shouldCountVisit(req) {
  if (req.method !== 'GET') return false;
  const agent = req.get('user-agent') || '';
  const purpose = `${req.get('purpose') || ''} ${req.get('sec-purpose') || ''}`;
  return Boolean(agent) && !/bot|crawler|spider|slurp|facebookexternalhit|facebot|preview|headless|curl|wget|python-requests|uptime|monitoring/i.test(agent)
    && !/prefetch|prerender/i.test(purpose);
}

module.exports = { initializeVisitStatistics, incrementDailyVisits, getVisitOverview, shouldCountVisit };
