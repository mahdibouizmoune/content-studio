"use strict";
const { Temporal } = require("@js-temporal/polyfill");
const { assertTimeZoneData } = require('./timezone-data');

function canonicalArticle(value) {
  const u = new URL(value);
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$|msclkid$)/i.test(key))
      u.searchParams.delete(key);
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/$/, "") || "/";
  return u.href;
}
function utcTime(value, zone = "UTC") {
  if (!value) throw new Error("Choose a posting time.");
  if (/Z$|[+-]\d\d:\d\d$/.test(value))
    return Temporal.Instant.from(value).toString();
  assertTimeZoneData(zone, value);
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(zone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
function configFor(value = {}) {
  const c = {
    timezone: "UTC",
    dailyLimit: 10,
    intervalMinutes: 60,
    windows: [{ start: "08:00", end: "22:00" }],
    ...value,
  };
  Temporal.Now.zonedDateTimeISO(c.timezone);
  assertTimeZoneData(c.timezone);
  if (
    !Number.isInteger(Number(c.dailyLimit)) ||
    c.dailyLimit < 1 ||
    c.dailyLimit > 1000
  )
    throw new Error("Daily limit must be 1 to 1000.");
  if (
    !Number.isFinite(Number(c.intervalMinutes)) ||
    c.intervalMinutes < 1 ||
    c.intervalMinutes > 43200
  )
    throw new Error("Posting interval must be 1 to 43200 minutes.");
  if (!Array.isArray(c.windows) || !c.windows.length || c.windows.length > 12)
    throw new Error("Choose 1 to 12 posting windows.");
  c.windows = c.windows.map((w) => {
    const start = Temporal.PlainTime.from(w.start).toString({
      smallestUnit: "minute",
    });
    const end = Temporal.PlainTime.from(w.end).toString({
      smallestUnit: "minute",
    });
    if (start >= end)
      throw new Error("Split overnight posting windows at midnight.");
    return { start, end };
  });
  return c;
}
function schedulePins(
  pins,
  settings = {},
  {
    occupied = [],
    now = Date.now(),
    startAt,
    mode = "smart",
    random = Math.random,
    horizonDays = 30,
  } = {},
) {
  const c = configFor(settings);
  const interval = Number(c.intervalMinutes) * 60000;
  const ids = new Set(pins.map((p) => p.id));
  const reserved = [
    ...new Map(
      occupied
        .filter(
          (p) =>
            !ids.has(p.id) &&
            p.accountId === pins[0]?.accountId &&
            !["canceled", "rejected", "draft", "awaiting_review"].includes(
              p.state,
            ),
        )
        .map((p) => [p.id, p]),
    ).values(),
  ];
  const result = [];
  const times = reserved
    .filter((p) => p.scheduledAt || p.publishedAt)
    .map((p) => Date.parse(p.scheduledAt || p.publishedAt));
  const dayKey = (time) =>
    Temporal.Instant.fromEpochMilliseconds(time)
      .toZonedDateTimeISO(c.timezone)
      .toPlainDate()
      .toString();
  const counts = new Map();
  for (const t of times)
    counts.set(dayKey(t), (counts.get(dayKey(t)) || 0) + 1);
  const check = (t) => {
    if (!Number.isFinite(t) || t <= now) return "Posting time is in the past.";
    if (t > now + horizonDays * 86400000)
      return `Schedule exceeds the ${horizonDays}-day preparation window.`;
    if ((counts.get(dayKey(t)) || 0) >= c.dailyLimit)
      return "Account-wide daily posting limit reached.";
    if (times.some((x) => Math.abs(t - x) < interval))
      return "Account-wide minimum interval conflict.";
    return "";
  };
  const reserve = (t) => {
    times.push(t);
    counts.set(dayKey(t), (counts.get(dayKey(t)) || 0) + 1);
  };
  for (const pin of pins.filter((p) => p.lockedTime)) {
    const at = utcTime(pin.scheduledAt, c.timezone),
      t = Date.parse(at),
      error = check(t);
    if (error)
      throw new Error(`${pin.title || pin.id}: locked time conflict. ${error}`);
    reserve(t);
    result.push({ ...pin, scheduledAt: at });
  }
  const waiting = pins.filter((p) => !p.lockedTime).map((p) => ({ ...p }));
  if (mode === "random")
    for (let i = waiting.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [waiting[i], waiting[j]] = [waiting[j], waiting[i]];
    }
  let cursor = Math.max(
    now + 60000,
    startAt ? Date.parse(utcTime(startAt, c.timezone)) : now + 60000,
  );
  cursor = Math.ceil(cursor / 60000) * 60000;
  let previous = "";
  while (waiting.length) {
    let found = false;
    while (cursor <= now + horizonDays * 86400000) {
      const local = Temporal.Instant.fromEpochMilliseconds(
        cursor,
      ).toZonedDateTimeISO(c.timezone);
      const clock = local.toPlainTime().toString({ smallestUnit: "minute" });
      if (
        c.windows.some((w) => clock >= w.start && clock <= w.end) &&
        !check(cursor)
      ) {
        found = true;
        break;
      }
      cursor += 60000;
    }
    if (!found)
      throw new Error(
        "The queue does not fit within the scheduling window. Change limits or posting windows; no times were changed.",
      );
    const index =
      mode === "smart"
        ? Math.max(
            0,
            waiting.findIndex(
              (p) => canonicalArticle(p.destination) !== previous,
            ),
          )
        : 0;
    const pin = waiting.splice(index, 1)[0];
    previous = canonicalArticle(pin.destination);
    reserve(cursor);
    result.push({ ...pin, scheduledAt: new Date(cursor).toISOString() });
    cursor += interval;
  }
  return result.sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
  );
}
module.exports = { canonicalArticle, utcTime, configFor, schedulePins };
