const DEFAULT_HOURS = [9, 13, 18, 21];

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowDate(row = {}) {
  const raw = row.publishedAt || row.publishDate || row.createdAt || row.date || row.datetime || row.timestamp || '';
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function rowScore(row = {}) {
  const metrics = row.metrics || {};
  return number(row.outboundClicks ?? row.outbound_clicks ?? metrics.OUTBOUND_CLICK) * 5
    + number(row.pinClicks ?? row.pin_clicks ?? metrics.PIN_CLICK) * 2
    + number(row.saves ?? metrics.SAVE) * 2
    + number(row.impressions ?? metrics.IMPRESSION) * 0.01;
}

function buildPerformanceScheduleProfile(rows = []) {
  const hours = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = rowDate(row);
    if (!date) continue;
    const hour = date.getHours();
    const entry = hours.get(hour) || { hour, score: 0, samples: 0 };
    entry.score += rowScore(row);
    entry.samples += 1;
    hours.set(hour, entry);
  }
  const ranked = [...hours.values()]
    .filter((entry) => entry.samples >= 2)
    .sort((a, b) => (b.score / b.samples) - (a.score / a.samples));
  const preferredHours = ranked.slice(0, 4).map((entry) => entry.hour);
  return {
    mode: preferredHours.length >= 2 ? 'account-data' : 'recommended-window',
    preferredHours: preferredHours.length >= 2 ? preferredHours : DEFAULT_HOURS,
    sampleCount: ranked.reduce((sum, entry) => sum + entry.samples, 0),
    generatedAt: new Date().toISOString()
  };
}

function nextPerformanceSlots(count, { start = new Date(), intervalHours = 2, preferredHours = DEFAULT_HOURS, pinsPerDay = 8, maximumDate = null } = {}) {
  const safeCount = Math.max(0, Math.min(1000, Number(count) || 0));
  const hours = [...new Set((preferredHours || DEFAULT_HOURS).map(Number).filter((hour) => hour >= 0 && hour <= 23))].sort((a, b) => a - b);
  const base = new Date(start);
  base.setMinutes(0, 0, 0);
  const slots = [];
  let cursor = new Date(base.getTime() + 60 * 60 * 1000);
  const maximumTimestamp = maximumDate ? new Date(maximumDate).getTime() : Number.POSITIVE_INFINITY;
  let guard = 0;
  while (slots.length < safeCount && guard < 20000) {
    guard += 1;
    if (cursor.getTime() > maximumTimestamp) break;
    const dayKey = cursor.toISOString().slice(0, 10);
    const used = slots.filter((slot) => slot.toISOString().slice(0, 10) === dayKey).length;
    const preferred = hours.includes(cursor.getHours());
    const intervalOk = !slots.length || cursor.getTime() - slots.at(-1).getTime() >= Math.max(1, Number(intervalHours || 2)) * 60 * 60 * 1000;
    if (preferred && intervalOk && used < Math.max(1, Number(pinsPerDay || 8))) slots.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
  }
  return slots;
}

module.exports = { DEFAULT_HOURS, buildPerformanceScheduleProfile, nextPerformanceSlots, rowScore };
