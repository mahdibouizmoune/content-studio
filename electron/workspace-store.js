const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const WORKSPACE_ROOTS = new Set([
  'contentOperations',
  'qualityWorkspace',
  'generationSpending',
  'pinWorkspace',
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
  'postPublishQa',
  'settingsLists'
]);

// The affiliate library and each site's synced post list are most of the
// settings file. They live in the database so every small settings change no
// longer rewrites them; readers still see one combined settings object.
const SETTINGS_LISTS_KEY = 'settingsLists';

function siteListKey(site, index) {
  return String(site?.id || site?.url || `index-${index}`);
}

function splitSettingsLists(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return { settings, lists: null };
  const slim = { ...settings };
  const lists = { affiliateLinks: undefined, internalLinkPosts: {} };
  if (Object.hasOwn(slim, 'affiliateLinks')) {
    lists.affiliateLinks = slim.affiliateLinks;
    delete slim.affiliateLinks;
  }
  if (Array.isArray(slim.wordpressSites)) {
    slim.wordpressSites = slim.wordpressSites.map((site, index) => {
      if (!site || typeof site !== 'object' || !Object.hasOwn(site, 'internalLinkPosts')) return site;
      const { internalLinkPosts, ...rest } = site;
      lists.internalLinkPosts[siteListKey(site, index)] = internalLinkPosts;
      return rest;
    });
  }
  return { settings: slim, lists };
}

function joinSettingsLists(settings, lists) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || !lists) return settings;
  const full = { ...settings };
  if (lists.affiliateLinks !== undefined && !Object.hasOwn(full, 'affiliateLinks')) full.affiliateLinks = lists.affiliateLinks;
  if (Array.isArray(full.wordpressSites)) {
    full.wordpressSites = full.wordpressSites.map((site, index) => {
      const posts = lists.internalLinkPosts?.[siteListKey(site, index)];
      if (!site || typeof site !== 'object' || posts === undefined || Object.hasOwn(site, 'internalLinkPosts')) return site;
      return { ...site, internalLinkPosts: posts };
    });
  }
  return full;
}

function splitKey(key = '') {
  const parts = String(key || '').split('.').filter(Boolean);
  if (parts.some(part => ['__proto__', 'constructor', 'prototype'].includes(part))) throw new Error('Unsafe workspace key.');
  return { root: parts.shift() || '', parts };
}

function nestedGet(value, parts, fallback) {
  let current = value;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, part)) return fallback;
    current = current[part];
  }
  return current === undefined ? fallback : current;
}

function nestedSet(value, parts, nextValue) {
  if (!parts.length) return nextValue;
  const copy = (value, nextPart) => Array.isArray(value) ? [...value] : value && typeof value === 'object' ? { ...value } : /^(0|[1-9]\d*)$/.test(nextPart) ? [] : {};
  const root = copy(value, parts[0]);
  let cursor = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    cursor[part] = copy(Object.hasOwn(cursor, part) ? cursor[part] : undefined, parts[index + 1]);
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = nextValue;
  return root;
}

function nestedDelete(value, parts) {
  if (!parts.length) return undefined;
  const root = value && typeof value === 'object' ? structuredClone(value) : {};
  let cursor = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = cursor && Object.hasOwn(cursor, parts[index]) ? cursor[parts[index]] : undefined;
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
    if (!this.replacing) this.emit();
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

  replace(values = {}, beforeCommit = () => {}) {
    this.db.exec('BEGIN IMMEDIATE');
    this.replacing = true;
    try {
      this.db.exec('DELETE FROM workspace_values');
      for (const [key, value] of Object.entries(values)) this.set(key, value);
      beforeCommit();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally { this.replacing = false; }
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

  let savedListsJson = JSON.stringify(database.get(SETTINGS_LISTS_KEY, null));
  const readSettings = () => joinSettingsLists(settingsStore.get('settings', undefined), database.get(SETTINGS_LISTS_KEY, null));
  const writeSettings = (full) => {
    const { settings, lists } = splitSettingsLists(full);
    settingsStore.set('settings', settings);
    const listsJson = JSON.stringify(lists);
    if (lists && listsJson !== savedListsJson) {
      database.set(SETTINGS_LISTS_KEY, lists);
      savedListsJson = listsJson;
    }
    return full;
  };
  const storedSettings = settingsStore.get('settings', undefined);
  const initialSplit = splitSettingsLists(storedSettings);
  if (initialSplit.lists && (initialSplit.lists.affiliateLinks !== undefined || Object.keys(initialSplit.lists.internalLinkPosts).length)) {
    writeSettings(readSettings());
    migrationChanged = true;
  }

  const isWorkspaceKey = (key) => WORKSPACE_ROOTS.has(splitKey(key).root);
  let restoring = false;
  const listeners = new Set();
  const facade = {
    database,
    migrationChanged,
    get(key, fallback) {
      const { root, parts } = splitKey(key);
      if (root === 'settings') {
        const settings = readSettings();
        return settings === undefined ? fallback : nestedGet(settings, parts, fallback);
      }
      if (!WORKSPACE_ROOTS.has(root)) return settingsStore.get(key, fallback);
      return nestedGet(database.get(root, undefined), parts, fallback);
    },
    set(key, value) {
      const { root, parts } = splitKey(key);
      if (root === 'settings') return writeSettings(parts.length ? nestedSet(readSettings() || {}, parts, value) : value);
      if (!WORKSPACE_ROOTS.has(root)) return settingsStore.set(key, value);
      return database.set(root, nestedSet(database.get(root, undefined), parts, value));
    },
    delete(key) {
      const { root, parts } = splitKey(key);
      if (root === 'settings') {
        if (!parts.length) { database.delete(SETTINGS_LISTS_KEY); savedListsJson = 'null'; return settingsStore.delete('settings'); }
        return writeSettings(nestedDelete(readSettings() || {}, parts));
      }
      if (!WORKSPACE_ROOTS.has(root)) return settingsStore.delete(key);
      if (!parts.length) return database.delete(root);
      return database.set(root, nestedDelete(database.get(root, undefined), parts));
    },
    has(key) {
      const marker = Symbol('missing');
      return facade.get(key, marker) !== marker;
    },
    onDidAnyChange(listener) {
      const notify = () => { if (!restoring) listener(); };
      listeners.add(listener);
      const unsubscribeDb = database.onChange(notify);
      const unsubscribeSettings = settingsStore.onDidAnyChange(notify);
      return () => {
        listeners.delete(listener);
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
      const previousSettings = settingsStore.store;
      let settingsTouched = false;
      restoring = true;
      try {
        database.replace(workspace, () => { settingsTouched = true; settingsStore.store = settings; });
      } catch (error) {
        if (settingsTouched) {
          try { settingsStore.store = previousSettings; }
          catch { throw new Error('Workspace restore failed and previous settings could not be restored. Keep the backup for recovery.', { cause: error }); }
        }
        throw error;
      } finally { restoring = false; }
      savedListsJson = JSON.stringify(database.get(SETTINGS_LISTS_KEY, null));
      // Backups made before the lists moved keep them inside settings.
      const restoredLists = splitSettingsLists(settingsStore.get('settings', undefined)).lists;
      if (restoredLists && (restoredLists.affiliateLinks !== undefined || Object.keys(restoredLists.internalLinkPosts).length)) writeSettings(readSettings());
      for (const listener of listeners) listener();
    }
  };
  return facade;
}

module.exports = {
  WORKSPACE_ROOTS,
  WorkspaceDatabase,
  createWorkspaceStore
};
