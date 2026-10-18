'use strict';

const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { TextDecoder } = require('node:util');
const { toAscii } = require('./ascii.js');
const { isSafeRemoteMediaUrl } = require('./media-security');

const PINTEREST_CSV_HEADERS = Object.freeze(['Title', 'Media URL', 'Pinterest board', 'Thumbnail', 'Description', 'Link', 'Publish date', 'Keywords']);
const PINTEREST_CSV_INDEX = Object.freeze({ title: 0, mediaUrl: 1, board: 2, thumbnail: 3, description: 4, link: 5, publishDate: 6, keywords: 7 });
const SUPPORTED_MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.mp4']);
const PLACEHOLDER = /^(?:null|undefined|nan|\[object Object\]|n\/a|none)$/i;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

function sanitizePinterestCsvValue(value) {
  if (value == null || !['string', 'number', 'boolean'].includes(typeof value)) return '';
  if (typeof value === 'number' && !Number.isFinite(value)) return '';
  const text = String(value).toWellFormed()
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/[\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '').trim();
  return PLACEHOLDER.test(text) ? '' : text;
}

function truncateAtWordBoundary(value, maximum) {
  const text = sanitizePinterestCsvValue(value);
  if (text.length <= maximum) return text;
  // Keep graphemes intact, including emoji sequences and combining marks.
  let candidate = '';
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    if (candidate.length + segment.length > maximum) break;
    candidate += segment;
  }
  const boundary = candidate.search(/\s+\S*$/u);
  return (boundary > 0 ? candidate.slice(0, boundary) : candidate).trimEnd();
}

function normalizePublicUrl(value) {
  return sanitizePinterestCsvValue(value).replace(/&(?:amp;|#0*38;|#x0*26;)/gi, '&');
}

function isPublicUrl(value) {
  if (!/^https?:\/\//i.test(value) || /\s|[\\<>]/u.test(value) || !isSafeRemoteMediaUrl(value)) return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password && url.hostname.includes('.')
      && !url.hostname.endsWith('.localhost') && !url.hostname.endsWith('.internal');
  } catch { return false; }
}

function mediaExtension(value = '') {
  try { return new URL(value).pathname.toLowerCase().match(/(\.[a-z0-9]+)$/)?.[1] || ''; }
  catch { return ''; }
}

function isTemporaryPinterestMediaUrl(value = '') {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'replicate.delivery' || host.endsWith('.replicate.delivery') || host === 'replicate.com' || host.endsWith('.replicate.com');
  } catch { return false; }
}

function normalizePinterestKeywords(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : sanitizePinterestCsvValue(value).split(','))
    .map((item) => toAscii(sanitizePinterestCsvValue(item)))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!key || seen.has(key) || /\b(?:than|with|for|and|the|at|of|to|in|on|by)$/i.test(item)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10).join(', ');
}

function normalizePinterestPublishDate(value, { selected = true, now = Date.now() } = {}) {
  if (!selected || value == null || (typeof value === 'string' && !value.trim())) return '';
  let date;
  if (value instanceof Date || typeof value === 'number') {
    date = new Date(value);
  } else {
    const text = String(value).trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/);
    if (!match) throw new Error('Use YYYY-MM-DDTHH:mm:ss UTC, or an ISO timestamp with an explicit offset.');
    const [, year, month, day, hour, minute, second, fraction, zone] = match;
    const calendar = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 19) !== `${year}-${month}-${day}T${hour}:${minute}:${second}`) {
      throw new Error('Publish date contains an invalid calendar date or time.');
    }
    date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction ? `.${fraction}` : ''}${zone || 'Z'}`);
  }
  if (!Number.isFinite(date.getTime())) throw new Error('Publish date is invalid.');
  const output = date.toISOString().slice(0, 19);
  const timestamp = Date.parse(`${output}Z`);
  if (timestamp <= Number(now)) throw new Error('Publish date is in the past. Select a future time or clear the schedule.');
  if (timestamp > Number(now) + 30 * 86400000) throw new Error('Publish date cannot be more than 30 days ahead.');
  return output;
}

function normalizePinterestRow(row = [], options = {}) {
  const cells = Array.isArray(row) ? row : PINTEREST_CSV_HEADERS.map((header) => row?.[header]);
  const mediaUrl = normalizePublicUrl(cells[1]);
  return [
    truncateAtWordBoundary(toAscii(sanitizePinterestCsvValue(cells[0])), 100), mediaUrl, toAscii(sanitizePinterestCsvValue(cells[2])),
    mediaExtension(mediaUrl) === '.mp4' ? normalizePublicUrl(cells[3]) : '',
    truncateAtWordBoundary(toAscii(sanitizePinterestCsvValue(cells[4])), 500), normalizePublicUrl(cells[5]),
    options.deferDate ? cells[6] : normalizePinterestPublishDate(cells[6], options),
    normalizePinterestKeywords(cells[7])
  ];
}

function validatePinterestRows(rows = [], boardNames = [], options = {}) {
  const errors = [];
  const warnings = [];
  const now = Number(options.now ?? Date.now());
  const inputRows = Array.isArray(rows) ? rows : [];
  const boards = new Set(boardNames.map((name) => toAscii(sanitizePinterestCsvValue(name))));
  const seenMedia = new Map();
  const issue = (index, row, field, rule, message, level = 'error') => ({
    row: index + 1, rowIndex: index + 1, title: row[0], field, rule, message, level
  });
  const normalizedRows = inputRows.map((input, index) => {
    const row = normalizePinterestRow(input, { deferDate: true });
    const add = (field, rule, message) => errors.push(issue(index, row, field, rule, message));
    if (!Array.isArray(input) || input.length !== 8) add('row', 'column_count', 'Expected exactly 8 columns.');
    if (!row[0]) add('Title', 'required', 'Title is required.');
    if (!row[2]) add('Pinterest board', 'required', 'Pinterest board is required.');
    else if (boards.size && !boards.has(row[2])) add('Pinterest board', 'exact_board_match', 'Select an exact board from the saved account board list.');
    if (!isPublicUrl(row[1])) add('Media URL', 'public_https', 'Media URL must be a public HTTP or HTTPS URL without spaces or credentials.');
    const extension = mediaExtension(row[1]);
    if (!SUPPORTED_MEDIA_EXTENSIONS.has(extension)) add('Media URL', 'supported_extension', 'Use a direct .png, .jpg, .jpeg, or .mp4 media file, not a gallery or page URL.');
    if (isTemporaryPinterestMediaUrl(row[1])) {
      if (!options.allowTemporary) add('Media URL', 'durable_url', 'Select Replicate original explicitly to use temporary links.');
      else {
        warnings.push(issue(index, row, 'Media URL', 'temporary_url', 'Replicate output normally expires after one hour. Import immediately; acceptance is not guaranteed.', 'warning'));
        if (row[6]) add('Publish date', 'temporary_schedule', 'Replicate links cannot be used for scheduled CSV rows. Choose WordPress or ImgBB, or explicitly select Publish immediately.');
      }
    }
    if (extension === '.mp4' && !(/^(?:\d+(?:\.\d+)?|\d+:[0-5]\d)$/.test(row[3]) || isPublicUrl(row[3]))) {
      add('Thumbnail', 'video_thumbnail', 'Video requires a public thumbnail URL, seconds, or mm:ss.');
    }
    if (row[5] && !isPublicUrl(row[5])) add('Link', 'public_https', 'Destination Link must be a public HTTP or HTTPS URL when provided.');
    try { row[6] = normalizePinterestPublishDate(row[6], { now }); }
    catch (error) {
      add('Publish date', 'invalid_schedule', error.message);
      row[6] = sanitizePinterestCsvValue(input?.[6]);
    }
    if (row[1] && seenMedia.has(row[1])) add('Media URL', 'duplicate_media', `Media URL duplicates row ${seenMedia.get(row[1])}.`);
    else if (row[1]) seenMedia.set(row[1], index + 1);
    row.forEach((cell, columnIndex) => {
      const nonAscii = String(cell).match(/[^\x00-\x7f]/u)?.[0];
      if (nonAscii) add(PINTEREST_CSV_HEADERS[columnIndex], 'non_ascii', `Non-ASCII character ${JSON.stringify(nonAscii)} U+${nonAscii.codePointAt(0).toString(16).toUpperCase()} must be encoded upstream.`);
      if (CONTROL.test(cell)) add(PINTEREST_CSV_HEADERS[columnIndex], 'control_character', 'Unexpected control character survived normalization.');
    });
    return row;
  });
  if (!inputRows.length) errors.push({ row: null, rowIndex: null, field: 'rows', rule: 'empty', message: 'No Pins to export.' });
  if (inputRows.length > 200) warnings.push({ rowIndex: null, field: 'rows', rule: 'row_limit', message: 'Pinterest accepts at most 200 rows per CSV. Export will split larger batches.', level: 'warning' });
  const dates = normalizedRows.map((row) => row[6]).filter(Boolean).map((value) => Date.parse(`${value}Z`)).filter(Number.isFinite);
  return {
    valid: errors.length === 0, rowCount: inputRows.length, errors, warnings, rows: normalizedRows,
    scheduleAudit: {
      totalRows: inputRows.length, scheduledRows: dates.length,
      immediateRows: normalizedRows.filter((row) => !row[6]).length,
      earliestUtc: dates.length ? new Date(Math.min(...dates)).toISOString() : '',
      latestUtc: dates.length ? new Date(Math.max(...dates)).toISOString() : ''
    }
  };
}

function assertPinterestCsvBytes(bytes, expectedRows, options = {}) {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw new Error('Pinterest CSV must not contain a BOM.');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.split('\r\n')[0] !== PINTEREST_CSV_HEADERS.join(',')) throw new Error('Pinterest CSV headers changed.');
  if (/(^|[^\r])\n/.test(text) || /\r(?!\n)/.test(text)) throw new Error('Pinterest CSV must use CRLF line endings.');
  const records = parse(text, { bom: false, relax_quotes: false, relax_column_count: false });
  if (records.length - 1 !== expectedRows) throw new Error(`Pinterest CSV row count mismatch: expected ${expectedRows}, read ${records.length - 1}.`);
  const data = records.slice(1);
  data.forEach((row, index) => row.forEach((cell, column) => {
    const character = cell.match(/[^\x00-\x7f]/u)?.[0];
    if (character) throw new Error(`Row ${index + 1} ${PINTEREST_CSV_HEADERS[column]}: non-ASCII ${JSON.stringify(character)} U+${character.codePointAt(0).toString(16).toUpperCase()}`);
  }));
  const validation = validatePinterestRows(data, [], options);
  if (!validation.valid) throw new Error(`Pinterest CSV validation failed: ${validation.errors.map((error) => `Row ${error.rowIndex} ${error.field}: ${error.message}`).join('\n')}`);
  if (JSON.stringify(data) !== JSON.stringify(validation.rows)) throw new Error('Pinterest CSV contains unnormalized field values.');
  if (options.expectedRecords && JSON.stringify(data) !== JSON.stringify(options.expectedRecords)) throw new Error('Pinterest CSV values changed during serialization.');
  return true;
}

function serializePinterestCsv(rows = [], options = {}) {
  const validation = validatePinterestRows(rows, [], options);
  if (!validation.valid) {
    const error = new Error(validation.errors.map((item) => `Row ${item.rowIndex} "${item.title || ''}" ${item.field}: ${item.message}`).join('\n'));
    error.validation = validation;
    throw error;
  }
  const bytes = Buffer.from(stringify([PINTEREST_CSV_HEADERS, ...validation.rows], { bom: false, record_delimiter: '\r\n', eof: true }), 'utf8');
  assertPinterestCsvBytes(bytes, validation.rowCount, { ...options, expectedRecords: validation.rows });
  return bytes;
}

function pinterestCsvFilename(now = new Date()) {
  const iso = now.toISOString();
  return `pinterest-bulk-upload-${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}.csv`;
}

function splitPinterestRows(rows = [], maximum = 200) {
  const size = Math.max(1, Math.min(200, Math.floor(Number(maximum) || 200)));
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
}

module.exports = { PINTEREST_CSV_HEADERS, PINTEREST_CSV_INDEX, assertPinterestCsvBytes, isTemporaryPinterestMediaUrl, mediaExtension, normalizePinterestKeywords, normalizePinterestPublishDate, normalizePinterestRow, pinterestCsvFilename, sanitizePinterestCsvValue, serializePinterestCsv, splitPinterestRows, truncateAtWordBoundary, validatePinterestRows };
