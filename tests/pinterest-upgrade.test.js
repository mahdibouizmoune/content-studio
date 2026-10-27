const test = require('node:test');
const assert = require('node:assert/strict');
const { toAscii } = require('../electron/ascii.js');
const { serializePinterestCsv, validatePinterestRows, normalizePinterestKeywords } = require('../electron/pinterest-export');
const { schedulePinterestPins } = require('../electron/pinterest-schedule');
const { verifyPinterestLink } = require('../electron/pinterest-link-check');
const { canonicalBoardMatch } = require('../electron/pinterest-board-rules.js');
const { hasPinterestDimensions } = require('../electron/pinterest-delivery');
const { parse } = require('csv-parse/sync');
const row = (media = 'https://example.com/pin.jpg') => ['Cafe recipe', media, 'Recipes', '', 'It\u2019s saut\u00e9ed, en cro\u00fbte \u2014 yummy \ud83c\udf4b', 'https://example.com/recipe', '', 'cafe, Cafe, better than, meal prep'];

test('CSV boundary preserves UTF-8 text and encodes URL paths without corrupting destinations', async () => {
  const bytes = serializePinterestCsv([row()]);
  assert.ok(bytes.includes(Buffer.from('\u00e9')));
  assert.ok(!bytes.includes(Buffer.from([0xef, 0xbb, 0xbf])));
  assert.doesNotMatch(bytes.toString(), /(?<!\r)\n/);
  assert.equal(parse(bytes)[1].length, 8);
  assert.equal(parse(bytes)[1][4], row()[4]);
  assert.equal(normalizePinterestKeywords(row()[7]), 'cafe, meal prep');
  assert.equal(toAscii('caf\u00e9 latte'), 'cafe latte');
  const { slugify } = await import('../src/lib/articlePostProcess.mjs');
  assert.equal(slugify('caf\u00e9 latte'), 'cafe-latte');
  const encoded = validatePinterestRows([row('https://example.com/caf\u00e9.jpg')]);
  assert.equal(encoded.valid, true); assert.equal(encoded.rows[0][1], 'https://example.com/caf%C3%A9.jpg');
});

test('Replicate requires explicit opt-in and cannot carry delayed schedules', () => {
  const cells = row('https://replicate.delivery/a/pin.png');
  assert.equal(validatePinterestRows([cells]).valid, false);
  assert.equal(validatePinterestRows([cells], [], { allowTemporary: true }).valid, true);
  cells[6] = new Date(Date.now() + 86400000).toISOString().slice(0, 19);
  assert.ok(validatePinterestRows([cells], [], { allowTemporary: true }).errors.some((error) => error.rule === 'temporary_schedule'));
});

test('the editor exposes a verified native Replicate original only with opt-in', async () => {
  const { selectPinterestPublicImage } = await import('../src/lib/pinterestSource.mjs');
  const url = 'https://replicate.delivery/a/pin.png';
  const pin = { csvMediaUrl: url, imageQa: { publicUrlVerified: true, publicDimensionsVerified: true, publicIdentityVerified: true, publicAssetKind: 'finished-pinterest-pin', publicWidth: 832, publicHeight: 1248, publicValidatedUrl: url } };
  assert.equal(selectPinterestPublicImage(pin), '');
  assert.equal(selectPinterestPublicImage(pin, { allowTemporary: true }), url);
  pin.imageQa.publicIdentityVerified = false;
  assert.equal(selectPinterestPublicImage(pin, { allowTemporary: true }), '');
});

test('native 832 x 1248 Replicate images are accepted only by the explicit original-ratio path', () => {
  assert.equal(hasPinterestDimensions({ width: 832, height: 1248 }), false);
  assert.equal(hasPinterestDimensions({ width: 832, height: 1248 }, true), true);
  assert.equal(hasPinterestDimensions({ width: 500, height: 750 }, true), false);
  assert.equal(hasPinterestDimensions({ width: 832, height: 1200 }, true), false);
});

test('recipe postprocessing never invents a placeholder card and always requests a real recipe', async () => {
  const { ensureRecipeCard, preparePrompt } = await import('../src/lib/articlePostProcess.mjs');
  assert.equal(ensureRecipeCard('<p>Draft</p>'), '<p>Draft</p>');
  assert.match(preparePrompt('Write a recipe', { recipeCardEnabled: false }), /complete, reader-friendly recipe card/);
});

test('interval schedule respects the selected start and never lets prior history push it forward', () => {
  const now = Date.parse('2026-09-16T08:00:00Z');
  const pins = Array.from({ length: 20 }, (_, id) => ({ id }));
  const startAt = '2026-09-16T12:00:00.000Z';
  const scheduled = schedulePinterestPins(pins, { startAt, intervalHours: 2 }, {
    now,
    lastScheduled: '2026-09-25T21:00:00.000Z'
  });
  assert.equal(scheduled[0].csvPublishDate, startAt);
  assert.equal(scheduled.at(-1).csvPublishDate, '2026-09-18T02:00:00.000Z');
  scheduled.slice(1).forEach((pin, index) => {
    assert.equal(Date.parse(pin.csvPublishDate) - Date.parse(scheduled[index].csvPublishDate), 2 * 60 * 60 * 1000);
  });
  assert.throws(() => schedulePinterestPins(Array.from({ length: 800 }, () => ({})), { startAt, intervalHours: 2 }, { now }), /30-day/);
  assert.deepEqual(schedulePinterestPins(pins, { enabled: false }, { now }), pins);
});

test('interval scheduler preserves manual and immediate rows while filling only blanks', () => {
  const now = Date.parse('2026-09-16T08:00:00Z');
  const pins = [
    { id: 1, csvPublishDate: '2026-09-16T12:00:00.000Z' },
    { id: 2 },
    { id: 3, csvPublishImmediately: true },
    { id: 4 }
  ];
  const scheduled = schedulePinterestPins(pins, { startAt: '2026-09-16T12:00:00.000Z', intervalHours: 2 }, { now });
  assert.equal(scheduled[0].csvPublishDate, pins[0].csvPublishDate);
  assert.equal(scheduled[1].csvPublishDate, '2026-09-16T14:00:00.000Z');
  assert.equal(scheduled[2].csvPublishImmediately, true);
  assert.equal(scheduled[3].csvPublishDate, '2026-09-16T16:00:00.000Z');
});

test('canonical routing uses saved exact names and rejects off-list boards', () => {
  const boards = ['Breakfast', 'Holiday Recipes', 'Healthy Recipes & Meal Prep', 'Recipes'];
  assert.equal(canonicalBoardMatch({ title: 'Pear Brie Appetizers for Holiday Parties' }, boards).board, 'Holiday Recipes');
  assert.equal(canonicalBoardMatch({ title: 'Pear Butter Breakfast Yogurt Parfaits' }, boards).board, 'Breakfast');
  assert.equal(canonicalBoardMatch({ title: 'Quinoa Chicken Berry Salad for Lunch' }, boards).board, 'Healthy Recipes & Meal Prep');
  assert.equal(canonicalBoardMatch({ title: 'Something uncertain' }, boards).fallback, true);
  const cells = row(); cells[2] = 'Invented board';
  assert.equal(validatePinterestRows([cells], boards).valid, false);
});

test('destination verification records redirects and retries transient failures only', async () => {
  let calls = 0;
  const result = await verifyPinterestLink('https://example.com/old', async () => {
    if (++calls < 3) throw Object.assign(new Error('Unavailable'), { status: 503 });
    return { status: 200, request: { res: { responseUrl: 'https://example.com/new' } } };
  }, async () => {});
  assert.equal(calls, 3);
  assert.equal(result.finalUrl, 'https://example.com/new');
  assert.equal(result.networkChecked, true);
  calls = 0;
  const missing = await verifyPinterestLink('https://example.com/missing', async () => { calls++; return { status: 404 }; });
  assert.equal(missing.valid, false);
  assert.equal(calls, 1);
});
