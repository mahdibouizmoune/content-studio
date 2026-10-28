const fs = require('fs');
const path = require('path');

const BACKUP_NAME = /^workspace-\d{4}-\d{2}-\d{2}T.*\.json$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION = Object.freeze({ recent: 6, daily: 7, weekly: 4 });

// Keeps the newest few backups, then the newest one from each of the last
// `daily` days and each of the last `weekly` weeks, so a mistake noticed a
// week or a month later can still be undone. Input is sorted newest first.
function backupsToDelete(backups = [], { now = Date.now(), recent = DEFAULT_RETENTION.recent, daily = DEFAULT_RETENTION.daily, weekly = DEFAULT_RETENTION.weekly } = {}) {
  const keep = new Set();
  const sorted = [...backups].sort((a, b) => b.mtimeMs - a.mtimeMs);
  sorted.slice(0, Math.max(1, recent)).forEach((backup) => keep.add(backup));
  const days = new Set();
  const weeks = new Set();
  for (const backup of sorted) {
    const age = Math.max(0, now - backup.mtimeMs);
    const day = Math.floor(age / DAY_MS);
    const week = Math.floor(age / (7 * DAY_MS));
    if (day < daily && !days.has(day)) { days.add(day); keep.add(backup); }
    if (week < weekly && !weeks.has(week)) { weeks.add(week); keep.add(backup); }
  }
  return sorted.filter((backup) => !keep.has(backup));
}

function listBackups(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => BACKUP_NAME.test(name))
    .map((name) => ({ filePath: path.join(dir, name), mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs }));
}

function pruneBackups(dir, options = {}) {
  for (const backup of backupsToDelete(listBackups(dir), options)) {
    try { fs.unlinkSync(backup.filePath); } catch { /* a locked file is retried on the next backup */ }
  }
}

// Copies a finished backup into the user's chosen second folder (for example a
// OneDrive folder) and applies the same retention there. Failures never block
// the main backup; the caller logs the returned error.
function mirrorBackup(backupPath, mirrorDir, options = {}) {
  if (!mirrorDir) return { mirrored: false };
  try {
    fs.mkdirSync(mirrorDir, { recursive: true });
    const target = path.join(mirrorDir, path.basename(backupPath));
    fs.copyFileSync(backupPath, `${target}.tmp`);
    fs.renameSync(`${target}.tmp`, target);
    pruneBackups(mirrorDir, options);
    return { mirrored: true, filePath: target };
  } catch (error) {
    return { mirrored: false, error: error.message };
  }
}

module.exports = { BACKUP_NAME, DEFAULT_RETENTION, backupsToDelete, listBackups, pruneBackups, mirrorBackup };
