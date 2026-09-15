const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const WORKSPACE_ROOTS = new Set([
  'articles',
  'generatedVideos',
  'growthWorkspace',
  'metaBulkGhlDraft',
  'metaStudioProjects',
  'performance',
  'pinCreatorPins',
  'pinterestDelivery',
  'pinPredictionHistory',
  'pinPredictionJobs',
  'repurposePacks',
  'trendResearch',
  'jobCenterJobs',
  'postPublishQa'
]);

function splitKey(key = '') {
  const parts = String(key || '').split('.').filter(Boolean);
  return { root: parts.shift() || '', parts };
}

function nestedGet(value, parts, fallback) {
  let current = value;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return fallback;
    current = current[part];
  }
  return current === undefined ? fallback : current;
}

function nestedSet(value, parts, nextValue) {
  if (!parts.length) return nextValue;
  const root = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  let cursor = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    cursor[part] = cursor[part] && typeof cursor[part] === 'object' && !Array.isArray(cursor[part])
      ? { ...cursor[part] }
      : {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = nextValue;
  return root;
}

function nestedDelete(value, parts) {
  if (!parts.length) return undefined;
  const root = value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value) : {};
  let cursor = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = cursor?.[parts[index]];
    if (!cursor || typeof cursor !== 'object') return root;
  }
  delete cursor[parts[parts.length - 1]];
  return root;
}

class WorkspaceDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.listeners = new Set();
    this.db = new DatabaseSync(filePath);
    try {
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS workspace_values (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      const integrity = this.db.prepare('PRAGMA quick_check').get();
      const integrityResult = String(Object.values(integrity || {})[0] || '').toLowerCase();
      if (integrityResult && integrityResult !== 'ok') {
        throw new Error(`Workspace database integrity check failed: ${integrityResult}`);
      }
      this.readStatement = this.db.prepare('SELECT value FROM workspace_values WHERE key = ?');
      this.writeStatement = this.db.prepare(`
        INSERT INTO workspace_values (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `);
      this.deleteStatement = this.db.prepare('DELETE FROM workspace_values WHERE key = ?');
    } catch (error) {
      try { this.db.close(); } catch {}
      throw error;
    }
  }

  get(key, fallback) {
    const row = this.readStatement.get(String(key));
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return fallback; }
  }

  set(key, value) {
    const safeValue = value === undefined ? null : value;
    this.writeStatement.run(String(key), JSON.stringify(safeValue), new Date().toISOString());
    this.emit();
    return safeValue;
  }

  delete(key) {
    this.deleteStatement.run(String(key));
    this.emit();
  }

  entries() {
    return Object.fromEntries(this.db.prepare('SELECT key, value FROM workspace_values').all().map((row) => {
      try { return [row.key, JSON.parse(row.value)]; } catch { return [row.key, null]; }
    }));
  }

  replace(values = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('DELETE FROM workspace_values');
      for (const [key, value] of Object.entries(values)) this.set(key, value);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.emit();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener();
  }

  close() {
    try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
    this.db.close();
  }
}

function createWorkspaceStore(settingsStore, userDataPath) {
  const database = new WorkspaceDatabase(path.join(userDataPath, 'workspace.sqlite'));
  let migrationChanged = false;
  for (const root of WORKSPACE_ROOTS) {
    if (!settingsStore.has(root)) continue;
    // A restored settings snapshot must not replace newer authoritative data.
    if (database.get(root, undefined) === undefined) database.set(root, settingsStore.get(root));
    settingsStore.delete(root);
    migrationChanged = true;
  }

  const isWorkspaceKey = (key) => WORKSPACE_ROOTS.has(splitKey(key).root);
  const facade = {
    database,
    migrationChanged,
    get(key, fallback) {
      const { root, parts } = splitKey(key);
      if (!WORKSPACE_ROOTS.has(root)) return settingsStore.get(key, fallback);
      return nestedGet(database.get(root, undefined), parts, fallback);
    },
    set(key, value) {
      const { root, parts } = splitKey(key);
      if (!WORKSPACE_ROOTS.has(root)) return settingsStore.set(key, value);
      return database.set(root, nestedSet(database.get(root, undefined), parts, value));
    },
    delete(key) {
      const { root, parts } = splitKey(key);
      if (!WORKSPACE_ROOTS.has(root)) return settingsStore.delete(key);
      if (!parts.length) return database.delete(root);
      return database.set(root, nestedDelete(database.get(root, undefined), parts));
    },
    has(key) {
      const marker = Symbol('missing');
      return facade.get(key, marker) !== marker;
    },
    onDidAnyChange(listener) {
      const unsubscribeDb = database.onChange(listener);
      const unsubscribeSettings = settingsStore.onDidAnyChange(listener);
      return () => {
        unsubscribeDb?.();
        unsubscribeSettings?.();
      };
    },
    get store() {
      return { ...settingsStore.store, ...database.entries() };
    },
    set store(values) {
      const settings = {};
      const workspace = {};
      for (const [key, value] of Object.entries(values || {})) {
        if (isWorkspaceKey(key)) workspace[key] = value;
        else settings[key] = value;
      }
      settingsStore.store = settings;
      database.replace(workspace);
    }
  };
  return facade;
}

module.exports = {
  WORKSPACE_ROOTS,
  WorkspaceDatabase,
  createWorkspaceStore
};
