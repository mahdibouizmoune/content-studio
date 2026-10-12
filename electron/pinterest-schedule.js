const { schedulePins } = require("./pin-scheduler");
const DEFAULT_PINTEREST_SCHEDULE = Object.freeze({
  enabled: true,
  startAt: "",
  intervalHours: 1,
});
function schedulePinterestPins(
  pins,
  config = {},
  { now = Date.now(), lastScheduled = "", occupied = [] } = {},
) {
  const settings = { ...DEFAULT_PINTEREST_SCHEDULE, ...config };
  if (!settings.enabled) return pins;
  const interval = Number(settings.intervalHours);
  if (!Number.isFinite(interval) || interval < 1 || interval > 720)
    throw new Error("Schedule interval must be between 1 and 720 hours.");
  if (
    settings.intervalMinutes !== undefined &&
    (!Number.isFinite(Number(settings.intervalMinutes)) ||
      Number(settings.intervalMinutes) < 1 ||
      Number(settings.intervalMinutes) > 43200)
  )
    throw new Error("Account posting interval must be 1 to 43200 minutes.");
  if (Number(settings.intervalMinutes || 0) > interval * 60)
    throw new Error(
      `CSV interval conflicts with the account minimum of ${settings.intervalMinutes} minutes. Increase the CSV interval or explicitly change the account policy.`,
    );
  const accountId = settings.accountId || "csv:legacy";
  const normalized = pins
    .filter((p) => !p.csvPublishImmediately)
    .map((p, i) => ({
      ...p,
      id: String(p.id ?? `legacy-${i}`),
      accountId,
      destination: p.url || `https://legacy.invalid/pin/${i}`,
      scheduledAt: p.csvPublishDate || "",
      lockedTime: !!p.csvPublishDate,
    }));
  const minimum = now + 10 * 60000;
  const chosenStart = settings.startAt
    ? Math.max(minimum, Date.parse(settings.startAt))
    : Math.max(
        minimum,
        lastScheduled ? Date.parse(lastScheduled) + interval * 3600000 : 0,
      );
  let slots;
  try {
    slots = schedulePins(
      normalized,
      {
        timezone: settings.timezone || "UTC",
        dailyLimit: Number(settings.dailyLimit || 1000),
        intervalMinutes: interval * 60,
        windows: settings.windows || [{ start: "00:00", end: "23:59" }],
      },
      {
        now,
        startAt: new Date(chosenStart).toISOString(),
        mode: "ordered",
        occupied,
      },
    );
  } catch (e) {
    if (/window|fit/.test(e.message))
      throw new Error(
        "This batch does not fit within Pinterest's 30-day window. No rows were silently dropped.",
      );
    throw e;
  }
  const byId = new Map(slots.map((s) => [s.id, s]));
  let index = 0;
  return pins.map((p) => {
    if (p.csvPublishImmediately) return p;
    const id = String(p.id ?? `legacy-${index}`);
    index++;
    return p.csvPublishDate
      ? p
      : {
          ...p,
          csvPublishDate: byId.get(id).scheduledAt,
          csvPublishImmediately: false,
        };
  });
}
module.exports = { DEFAULT_PINTEREST_SCHEDULE, schedulePinterestPins };
