const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const testOnly of [true, false]) {
test(testOnly ? 'single-Pin diagnostic export retains the other saved Pins and exports only the first row' : 'batch preflight skips the bad Pin without deleting it or marking it exported', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/PinCreatorView.jsx'), 'utf8');
  const start = source.indexOf('async function exportPinterestCsv(');
  const end = source.indexOf('async function prepareGhlEditor(', start);
  assert.ok(start > 0 && end > start);
  const pins = [1, 2, 3].map((id) => ({ id, title: `Recipe ${id}`, imageQa: {
    overlayVerified: true, dimensionsVerified: true, publicDimensionsVerified: true,
    publicIdentityVerified: true, safeZoneVerified: true, publicUrlVerified: true
  } }));
  if (!testOnly) pins[1].imageQa.publicUrlVerified = false;
  let saved;
  let skipped;
  let exportedRows;
  const noop = () => {};
  const context = {
    selectPinterestExportRows: (await import('../src/lib/pinterestExportSelection.mjs')).selectPinterestExportRows,
    csvMediaHost: 'auto',
    workingRef: { current: false }, pinsRef: { current: pins }, boardNames: [],
    csvAccount: 'Gourmet Gather', setCsvAccount: noop, setDeliveryRefresh: noop,
    setWorking: noop, setCsvHosting: noop, setStatus: noop, setCsvValidationReport: noop,
    diversifyByInterest: (values) => values,
    repairPinterestCsvData: async (values) => ({
      rows: values.map((pin) => [pin.title]), scheduledPins: values,
      preparedPins: values, validation: { valid: true }, report: { errors: [], warnings: [] }
    }),
    preflightMessage: (value) => value.message,
    savePins: async (values) => { saved = values; },
    confirmAction: async () => true,
    electronAPI: { exportPinterestCsv: async ({ rows, skipRows, pinIds }) => {
      exportedRows = rows;
      skipped = skipRows;
      return { success: true, pinIds: pinIds.filter((_, index) => !skipRows.some((item) => item.row === index + 1)), filePaths: ['test.csv'], validation: { scheduleAudit: { scheduledRows: 0, immediateRows: 1 } } };
    } },
    window: { alert: (message) => { throw new Error(message); } }
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.exportDiagnostic = exportPinterestCsv;`, context);
  await context.exportDiagnostic({ testOnly });
  assert.equal(exportedRows.length, testOnly ? 1 : 3);
  assert.equal(exportedRows[0][0], 'Recipe 1');
  assert.equal(saved.length, 3);
  assert.ok(saved[0].exportedAt);
  assert.equal(saved[1], pins[1]);
  if (testOnly) assert.equal(saved[2], pins[2]);
  else {
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].row, 2);
    assert.ok(saved[2].exportedAt);
    assert.equal(saved[1].exportedAt, undefined);
  }
});
}
