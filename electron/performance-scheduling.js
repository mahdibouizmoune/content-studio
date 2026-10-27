const DEFAULT_HOURS = [9, 13, 18, 21];
const { Temporal } = require('@js-temporal/polyfill');
const { assertTimeZoneData } = require('./timezone-data');

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowDate(row = {}, timezone = 'UTC') {
  const raw = row.publishedAt || row.publishDate || row.createdAt || row.date || row.datetime || row.timestamp || '';
  let date;
  try { date = raw ? new Date(require('./pin-scheduler').utcTime(String(raw), timezone)) : null; } catch { return null; }
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function rowScore(row = {}) {
  const metrics = row.metrics || {};
  return number(row.outboundClicks ?? row.outbound_clicks ?? metrics.OUTBOUND_CLICK) * 5
    + number(row.pinClicks ?? row.pin_clicks ?? metrics.PIN_CLICK) * 2
    + number(row.saves ?? metrics.SAVE) * 2
    + number(row.impressions ?? metrics.IMPRESSION) * 0.01;
}

function buildPerformanceScheduleProfile(rows = [], { timezone = 'UTC', minimumSamples = 5, minimumImpressions = 500 } = {}) {
  Temporal.Now.zonedDateTimeISO(timezone);
  const hours = new Map(), seenPins = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = rowDate(row, timezone);
    if (!date) continue;
    assertTimeZoneData(timezone, date.toISOString());
    const pinId = String(row.pinId || row.id || '');
    if (pinId && seenPins.has(pinId)) continue;
    if (pinId) seenPins.add(pinId);
    const hour = Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timezone).hour;
    const entry = hours.get(hour) || { hour, score: 0, samples: 0, impressions: 0 };
    entry.score += rowScore(row);
    entry.impressions += number(row.impressions ?? row.metrics?.IMPRESSION);
    entry.samples += 1;
    hours.set(hour, entry);
  }
  const ranked = [...hours.values()]
    .filter((entry) => entry.samples >= minimumSamples && entry.impressions >= minimumImpressions)
    .sort((a, b) => (b.score / b.samples) - (a.score / a.samples));
  const preferredHours = ranked.slice(0, 4).map((entry) => entry.hour);
  return {
    mode: preferredHours.length >= 2 ? 'account-data' : 'recommended-window',
    preferredHours: preferredHours.length >= 2 ? preferredHours : DEFAULT_HOURS,
    sampleCount: ranked.reduce((sum, entry) => sum + entry.samples, 0),
    timezone,
    evidence: preferredHours.length >= 2 ? 'Observed account history; not a causal best-time test.' : 'Insufficient measured history; using fallback hours.',
    generatedAt: new Date().toISOString()
  };
}

function nextPerformanceSlots(count, { start = new Date(), intervalHours = 2, preferredHours = DEFAULT_HOURS, pinsPerDay = 8, maximumDate = null, timezone = 'UTC' } = {}) {
  Temporal.Now.zonedDateTimeISO(timezone);
  assertTimeZoneData(timezone, new Date(start).toISOString());
  if (!Number.isFinite(Number(intervalHours)) || Number(intervalHours) < 1 || !Number.isInteger(Number(pinsPerDay)) || pinsPerDay < 1) throw new Error('Choose a positive daily limit and an interval of at least one hour.');
  const safeCount = Math.max(0, Math.min(1000, Number(count) || 0));
  const hours = [...new Set((preferredHours || DEFAULT_HOURS).map(Number).filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23))].sort((a, b) => a - b);
  if (!hours.length) throw new Error('Choose at least one whole preferred hour from 0 to 23.');
  const base = new Date(start);
  if (!Number.isFinite(base.getTime())) throw new Error('Choose a valid start time.');
  const first = Temporal.Instant.fromEpochMilliseconds(base.getTime()).toZonedDateTimeISO(timezone).round({ smallestUnit: 'hour', roundingMode: 'floor' }).add({ hours: 1 });
  const slots = [];
  let cursor = new Date(Number(first.epochMilliseconds));
  const maximumTimestamp = maximumDate ? new Date(maximumDate).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isNaN(maximumTimestamp)) throw new Error('Choose a valid scheduling end date.');
  const dailyCounts = new Map();
  let guard = 0;
  while (slots.length < safeCount && guard < 20000) {
    guard += 1;
    if (cursor.getTime() > maximumTimestamp) break;
    const zoned = Temporal.Instant.fromEpochMilliseconds(cursor.getTime()).toZonedDateTimeISO(timezone);
    const dayKey = zoned.toPlainDate().toString();
    const used = dailyCounts.get(dayKey) || 0;
    const preferred = hours.includes(zoned.hour);
    const intervalOk = !slots.length || cursor.getTime() - slots.at(-1).getTime() >= Math.max(1, Number(intervalHours || 2)) * 60 * 60 * 1000;
    if (preferred && intervalOk && used < Math.max(1, Number(pinsPerDay || 8))) { slots.push(new Date(cursor)); dailyCounts.set(dayKey, used + 1); }
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
  }
  return slots;
}

module.exports = { DEFAULT_HOURS, buildPerformanceScheduleProfile, nextPerformanceSlots, rowScore };
