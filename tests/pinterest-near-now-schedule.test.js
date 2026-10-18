const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { schedulePinterestPins } = require('../electron/pinterest-schedule');
const now = Date.parse('2026-10-17T13:51:20Z');
const first = '2026-10-17T14:02:00.000Z';

test('CSV defaults to exact 90-minute spacing in the backend and renderer fallback', async () => {
  const { DEFAULT_PINTEREST_SCHEDULE } = require('../electron/pinterest-schedule');
  const { fitPinterestSchedule } = await import('../src/lib/pinterestCsv.mjs');
  assert.equal(DEFAULT_PINTEREST_SCHEDULE.intervalHours, 1.5);
  const pins = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const backend = schedulePinterestPins(pins, {}, { now });
  const frontend = fitPinterestSchedule({ count: 3, now });
  assert.equal(frontend.intervalMinutes, 90);
  for (let i = 1; i < pins.length; i++) {
    assert.equal(Date.parse(backend[i].csvPublishDate) - Date.parse(backend[i - 1].csvPublishDate), 90 * 60000);
    assert.equal(frontend.dates[i] - frontend.dates[i - 1], 90 * 60000);
  }
  assert.equal(fitPinterestSchedule({ count: 3, intervalMinutes: '', now }).intervalMinutes, 90);
});

test('automatic CSV starts near now instead of appending after a four-day-old export tail', () => {
  const pins = Array.from({ length: 24 }, (_, id) => ({ id }));
  const result = schedulePinterestPins(pins, { intervalHours: 1 }, { now, lastScheduled: '2026-10-21T14:51:00Z' });
  assert.equal(result[0].csvPublishDate, first);
  assert.equal(result.at(-1).csvPublishDate, '2026-10-18T13:02:00.000Z');
  assert.ok(result.every((pin) => pin.csvScheduleOrigin === 'automatic'));
  for (let i = 1; i < result.length; i++) assert.equal(Date.parse(result[i].csvPublishDate) - Date.parse(result[i - 1].csvPublishDate), 3600000);
});

test('saved automatic dates rebase, but deliberate dates, immediate rows and already-exported dates stay unchanged', () => {
  const future = '2026-10-21T14:51:00Z';
  const pins = [
    { id: 'auto', csvPublishDate: future, csvScheduleOrigin: 'automatic' },
    { id: 'manual', csvPublishDate: '2026-10-21T18:00:00Z', csvScheduleOrigin: 'manual' },
    { id: 'legacy', csvPublishDate: '2026-10-22T18:00:00Z' },
    { id: 'exported', csvPublishDate: '2026-10-23T18:00:00Z', csvScheduleOrigin: 'automatic', exportedAt: '2026-10-17T12:00:00Z' },
    { id: 'immediate', csvPublishImmediately: true },
  ];
  const result = schedulePinterestPins(pins, {}, { now });
  assert.equal(result[0].csvPublishDate, first);
  for (let i = 1; i < pins.length; i++) assert.deepEqual(result[i], pins[i]);
  assert.equal(pins[0].csvPublishDate, future);
});

test('selected future start, two-hour spacing and known account reservations remain authoritative', () => {
  const startAt = '2026-10-18T10:00:00Z';
  const result = schedulePinterestPins([{ id: 'a' }, { id: 'b' }], { accountId: 'known', intervalHours: 2, startAt }, {
    now, occupied: [{ id: 'reserved', accountId: 'known', state: 'scheduled', scheduledAt: startAt }],
  });
  assert.equal(result[0].csvPublishDate, '2026-10-18T12:00:00.000Z');
  assert.equal(result[1].csvPublishDate, '2026-10-18T14:00:00.000Z');
});

test('preparation refreshes the start after slow hosting, not before it', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  let handler, currentTime = now, schedules = 0;
  const context = vm.createContext({
    store: { get: () => ({}) },
    secureIpcHandle: (_name, fn) => { handler = fn; },
    schedulePinterestPins: (pins, config, options) => { schedules++; assert.ok(currentTime > now); return schedulePinterestPins(pins, config, { ...options, now: currentTime }); },
    ensureDurablePinImage: async () => { currentTime += 20 * 60000; return { success: true, provider: 'wordpress', url: 'https://example.com/pin.jpg', validation: {} }; },
  });
  const start = source.indexOf("secureIpcHandle('prepare-pinterest-export',");
  const end = source.indexOf("secureIpcHandle('validate-pinterest-export',", start);
  vm.runInContext(source.slice(start, end), context);
  const result = await handler({}, { pins: [{ id: 'p1' }] });
  assert.equal(result.success, true);
  assert.equal(schedules, 1);
  assert.equal(result.pins[0].csvPublishDate, '2026-10-17T14:22:00.000Z');
});

test('unassigned downloads do not reserve a fictitious shared account queue', () => {
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  const batches = [
    { fileStatus: 'ready', rows: [{ pinId: 'unknown', number: 1, cells: ['', '', '', '', '', '', '2026-10-21T12:00:00'] }] },
    { account: 'known', fileStatus: 'ready', outcomes: { 2: { status: 'failed' } }, rows: [
      { pinId: 'assigned', number: 1, cells: ['', '', '', '', '', '', '2026-10-17T14:02:00'] },
      { pinId: 'failed', number: 2, cells: ['', '', '', '', '', '', '2026-10-17T15:02:00'] },
    ] },
  ];
  const context = vm.createContext({ store: { get: () => '' }, pinterestBatches: () => batches });
  const start = source.indexOf('function legacyPinterestQueueReservations()');
  const end = source.indexOf("if (store) require('./pin-workspace-ipc')", start);
  const reserved = vm.runInContext(`${source.slice(start, end)}\nlegacyPinterestQueueReservations()`, context);
  assert.equal(reserved.length, 1);
  assert.equal(reserved[0].accountId, 'known');
  assert.equal(reserved[0].id, 'assigned');
});

test('prepared automatic schedules survive the UI merge without overwriting manual edits', async () => {
  const { mergePreparedPinSchedule } = await import('../src/lib/pinBatch.mjs');
  const current = [
    { id: 1, csvPublishDate: '2026-10-21T12:00:00Z', csvScheduleOrigin: 'automatic', title: 'Keep title' },
    { id: 2, csvPublishDate: '2026-10-22T12:00:00Z', csvScheduleOrigin: 'manual' },
    { id: 3, csvPublishImmediately: true },
    { id: 4, exportedAt: '2026-10-17T12:00:00Z' },
    { id: 5 },
  ];
  const result = mergePreparedPinSchedule(current, current.map((p) => ({ id: p.id, csvPublishDate: first, csvScheduleOrigin: 'automatic' })));
  assert.equal(result[0].csvPublishDate, first);
  assert.equal(result[0].title, 'Keep title');
  assert.deepEqual(result.slice(1, 4), current.slice(1, 4));
  assert.equal(result[4].csvPublishDate, first);
  assert.equal(result[4].csvScheduleOrigin, 'automatic');
});

test('renderer fallback also starts within 11 minutes, with the exact requested spacing', async () => {
  const { fitPinterestSchedule, PINTEREST_SCHEDULE_LEAD_MS } = await import('../src/lib/pinterestCsv.mjs');
  const plan = fitPinterestSchedule({ count: 32, intervalMinutes: 120, now });
  assert.equal(PINTEREST_SCHEDULE_LEAD_MS, 10 * 60000);
  assert.equal(plan.dates[0].toISOString(), first);
  for (let i = 1; i < plan.dates.length; i++) assert.equal(plan.dates[i] - plan.dates[i - 1], 7200000);
});
