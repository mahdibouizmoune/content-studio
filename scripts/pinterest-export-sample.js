'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { PINTEREST_CSV_HEADERS, assertPinterestCsvBytes, serializePinterestCsv, validatePinterestRows } = require('../electron/pinterest-export');

// Read real Pin metadata but deliberately leave this diagnostic sample unscheduled.
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/pinterest-export-sample.js <source.csv>');
const input = parse(fs.readFileSync(source), { columns: true, bom: true });
if (input.length < 3) throw new Error('The sample requires at least three Pins.');
const rows = input.slice(0, 3).map((pin) => PINTEREST_CSV_HEADERS.map((header) => header === 'Publish date' ? '' : pin[header]));
const validation = validatePinterestRows(rows);
const bytes = serializePinterestCsv(rows);
const output = path.join(__dirname, '..', 'artifacts', 'pinterest-export-sample.csv');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, bytes);
const written = fs.readFileSync(output);
assertPinterestCsvBytes(written, 3, { expectedRecords: validation.rows });
const report = {
  valid: true, encoding: 'UTF-8 without BOM', firstFiveBytesHex: written.subarray(0, 5).toString('hex'),
  rowCount: 3, fieldsPerRow: parse(written).map((row) => row.length),
  titleLengths: validation.rows.map((row) => row[0].length),
  descriptionLengths: validation.rows.map((row) => row[4].length),
  blankPublishDates: validation.rows.every((row) => row[6] === ''),
  errors: validation.errors, warnings: validation.warnings,
  mediaAvailability: 'Not checked by this serializer sample; desktop export checks public media before saving.'
};
fs.writeFileSync(output.replace('.csv', '.validation.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ output, ...report, firstTwoLines: written.toString('utf8').split('\r\n').slice(0, 2) }, null, 2));
