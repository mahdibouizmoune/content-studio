const MAX_GHL_CSV_ROWS = 90;

function chunkRows(rows = [], limit = MAX_GHL_CSV_ROWS) {
  const size = Math.max(1, Number(limit) || MAX_GHL_CSV_ROWS);
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
}

function numberedCsvPath(filePath, part, total) {
  if (total <= 1) return filePath;
  const suffix = String(part + 1).padStart(2, '0');
  return filePath.replace(/\.csv$/i, '') + `-part-${suffix}-of-${String(total).padStart(2, '0')}.csv`;
}

module.exports = { MAX_GHL_CSV_ROWS, chunkRows, numberedCsvPath };
