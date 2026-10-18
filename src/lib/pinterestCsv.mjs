export const PINTEREST_SAFE_KEYWORD_COUNT = 10;
export const PINTEREST_SAFE_KEYWORD_CHARACTERS = 300;
export const PINTEREST_SCHEDULE_WINDOW_DAYS = 30;
export const PINTEREST_SCHEDULE_WINDOW_MS = PINTEREST_SCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const PINTEREST_MIN_SCHEDULE_SPACING_MS = 15 * 60 * 1000;
export const PINTEREST_SCHEDULE_LEAD_MS = 10 * 60 * 1000;
const PINTEREST_SCHEDULE_SAFETY_MS = 5 * 60 * 1000;

export function isWithinPinterestScheduleWindow(value, now = Date.now()) {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  const current = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(timestamp)
    && Number.isFinite(current)
    && timestamp > current
    && timestamp <= current + PINTEREST_SCHEDULE_WINDOW_MS;
}

export function boundPinterestScheduleDates(values = [], now = Date.now()) {
  const dates = (Array.isArray(values) ? values : []).map((value) => (
    isWithinPinterestScheduleWindow(value, now) ? value : null
  ));
  const scheduledCount = dates.filter(Boolean).length;
  return {
    dates,
    scheduledCount,
    unscheduledCount: dates.length - scheduledCount
  };
}

export function fitPinterestSchedule({ count = 0, start = null, intervalMinutes = 90, now = Date.now() } = {}) {
  const total = Math.max(0, Math.min(2000, Math.floor(Number(count) || 0)));
  const current = now instanceof Date ? now.getTime() : Number(now);
  if (!total || !Number.isFinite(current)) {
    return { dates: [], intervalMinutes: 0, startAdjusted: false, intervalAdjusted: false };
  }
  const earliest = Math.ceil((current + PINTEREST_SCHEDULE_LEAD_MS) / 60000) * 60000;
  const latest = current + PINTEREST_SCHEDULE_WINDOW_MS - PINTEREST_SCHEDULE_SAFETY_MS;
  const requestedInterval = Math.max(PINTEREST_MIN_SCHEDULE_SPACING_MS, Math.round(Number(intervalMinutes || 90) * 60 * 1000));
  const maximumInterval = total > 1
    ? Math.max(PINTEREST_MIN_SCHEDULE_SPACING_MS, Math.floor(((latest - earliest) / (total - 1)) / PINTEREST_MIN_SCHEDULE_SPACING_MS) * PINTEREST_MIN_SCHEDULE_SPACING_MS)
    : requestedInterval;
  const effectiveInterval = Math.min(requestedInterval, maximumInterval);
  const requestedStart = start instanceof Date ? start.getTime() : new Date(start || 0).getTime();
  const latestStart = latest - effectiveInterval * Math.max(0, total - 1);
  const effectiveStart = Number.isFinite(requestedStart) && requestedStart >= earliest && requestedStart <= latestStart
    ? requestedStart
    : earliest;
  return {
    dates: Array.from({ length: total }, (_, index) => new Date(effectiveStart + index * effectiveInterval)),
    intervalMinutes: effectiveInterval / 60000,
    startAdjusted: effectiveStart !== requestedStart,
    intervalAdjusted: effectiveInterval !== requestedInterval
  };
}

export function compactPinterestKeywords(value = "") {
  const seen = new Set();
  const selected = [];
  for (const raw of String(value || "").split(",")) {
    const keyword = raw.replace(/\s+/g, " ").trim();
    const key = keyword.toLowerCase();
    if (!keyword || keyword.length > 40 || seen.has(key)) continue;
    const candidate = [...selected, keyword].join(", ");
    if (selected.length >= PINTEREST_SAFE_KEYWORD_COUNT || candidate.length > PINTEREST_SAFE_KEYWORD_CHARACTERS) break;
    seen.add(key);
    selected.push(keyword);
  }
  return selected.join(", ");
}
