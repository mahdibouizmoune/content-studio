const test = require('node:test');
const assert = require('node:assert/strict');

test('preflight selection excludes invalid and unverified Pins, preserving original row indexes', async () => {
  const { selectPinterestExportRows } = await import('../src/lib/pinterestExportSelection.mjs');
  const qa = { dimensionsVerified: true, publicDimensionsVerified: true, publicIdentityVerified: true, publicUrlVerified: true, overlayVerified: true, safeZoneVerified: true };
  const pins = Array.from({ length: 5 }, (_, index) => ({ id: String(index), title: `Pin ${index}`, imageQa: { ...qa } }));
  const rows = pins.map((pin) => [pin.title]);
  pins[3].imageQa.publicUrlVerified = false;
  const result = selectPinterestExportRows({ rows, pins, errors: ['Row 2: Invalid date'], failedPinIds: ['2'] });
  assert.deepEqual(result.rows, [rows[0], rows[4]]);
  assert.deepEqual(result.pins, [pins[0], pins[4]]);
  assert.deepEqual(result.rejected.map((item) => item.row), [2, 3, 4]);
  assert.equal(rows.length, 5);
  assert.equal(pins.length, 5);
});

test('AI-lettered Pins require verified public images but not local typography checks', async () => {
  const { selectPinterestExportRows } = await import('../src/lib/pinterestExportSelection.mjs');
  const pin = { id: 'ai', generationConfig: { textRenderMode: 'ai' }, imageQa: { dimensionsVerified: true, publicDimensionsVerified: true, publicIdentityVerified: true, publicUrlVerified: true } };
  assert.equal(selectPinterestExportRows({ rows: [['AI Pin']], pins: [pin] }).rows.length, 1);
  pin.imageQa.publicIdentityVerified = false;
  assert.equal(selectPinterestExportRows({ rows: [['AI Pin']], pins: [pin] }).rows.length, 0);
});
