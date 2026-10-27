'use strict';
// IANA 2026c changes Morocco/Western Sahara to UTC on 2026-09-20.
// Refuse stale runtime rules instead of silently moving an approved publication by an hour.
function hasCurrentMoroccoRules() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date('2026-10-12T10:00:00Z'));
  return parts.find(p => p.type === 'hour')?.value === '10';
}
function assertTimeZoneData(zone, value = new Date().toISOString()) {
  if (['Africa/Casablanca', 'Africa/El_Aaiun'].includes(zone) && String(value).slice(0, 10) >= '2026-09-20' && !hasCurrentMoroccoRules()) {
    throw new Error('This runtime has outdated Morocco timezone rules. Choose UTC with an explicit time, or update the app/runtime before scheduling in Africa/Casablanca or Africa/El_Aaiun. Existing UTC dates were not changed.');
  }
}
module.exports = { assertTimeZoneData, hasCurrentMoroccoRules };
