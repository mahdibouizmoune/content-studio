const fs = require('fs');
const path = require('path');
const { parentPort, workerData } = require('worker_threads');
const { DatabaseSync } = require('node:sqlite');
const { pruneBackups, mirrorBackup } = require('./backup-retention');

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function workspaceValues(userDataPath) {
  const filePath = path.join(userDataPath, 'workspace.sqlite');
  if (!fs.existsSync(filePath)) return {};
  const db = new DatabaseSync(filePath, { readOnly: true });
  try {
    return Object.fromEntries(db.prepare('SELECT key, value FROM workspace_values').all().map((row) => {
      try { return [row.key, JSON.parse(row.value)]; }
      catch { return [row.key, null]; }
    }));
  } finally {
    db.close();
  }
}

function createBackup({ userDataPath, reason = 'automatic', mirrorDir = '' }) {
  const dir = path.join(userDataPath, 'workspace-backups');
  fs.mkdirSync(dir, { recursive: true });
  const settings = readJson(path.join(userDataPath, 'config.json'));
  const recipeMoneyMaker = readJson(path.join(userDataPath, 'recipe-money-maker.json'), null);
  const snapshot = { ...settings, ...workspaceValues(userDataPath), ...(recipeMoneyMaker ? { __recipeMoneyMaker: recipeMoneyMaker } : {}) };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeReason = String(reason || 'automatic').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const backupPath = path.join(dir, `workspace-${stamp}-${safeReason}.json`);
  const tempPath = `${backupPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2), 'utf8');
  fs.renameSync(tempPath, backupPath);

  pruneBackups(dir);
  const mirror = mirrorBackup(backupPath, mirrorDir);
  return { backupPath, mirrorError: mirror.error || '' };
}

try {
  const result = createBackup(workerData || {});
  parentPort.postMessage({ success: true, filePath: result.backupPath, mirrorError: result.mirrorError });
} catch (error) {
  parentPort.postMessage({ success: false, error: error.message });
}
