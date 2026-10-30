const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('a settings save sends only the keys the screen changed', async () => {
  const { settingsPatch } = await import('../src/lib/settingsPatch.mjs');
  const loaded = { theme: 'light', googleSearchConsoleSites: [], affiliateLinks: [{ id: 'a', url: 'https://example.com' }] };
  const edited = { ...loaded, theme: 'dark' };
  assert.deepEqual(settingsPatch(loaded, edited), { theme: 'dark' });
  assert.deepEqual(settingsPatch(loaded, { ...loaded }), {});
  assert.deepEqual(settingsPatch(loaded, { ...loaded, affiliateLinks: [] }), { affiliateLinks: [] });
  assert.deepEqual(settingsPatch(null, { theme: 'dark' }), { theme: 'dark' });
});

test('a background settings change survives a later save from an older screen copy', async () => {
  const { settingsPatch } = await import('../src/lib/settingsPatch.mjs');
  const screenCopy = { theme: 'light', googleSearchConsoleSites: [] };
  const stored = { ...screenCopy, googleSearchConsoleSites: ['sc-domain:example.com'] };
  const merged = { ...stored, ...settingsPatch(screenCopy, { ...screenCopy, theme: 'dark' }) };
  assert.deepEqual(merged.googleSearchConsoleSites, ['sc-domain:example.com']);
  assert.equal(merged.theme, 'dark');
});

test('the app saves settings as a patch against the last copy it loaded or saved', () => {
  const app = read('src/App.jsx');
  assert.match(app, /settingsPatch\(/);
  assert.doesNotMatch(app, /electronAPI\.saveSettings\(filled\)/);
});

test('backup retention keeps the newest few plus one per day for a week and one per week for a month', () => {
  const { backupsToDelete } = require('../electron/backup-retention');
  const hour = 60 * 60 * 1000;
  const now = Date.UTC(2026, 9, 28, 12);
  // 40 days of backups, one every 6 hours.
  const backups = Array.from({ length: 160 }, (_, index) => ({ filePath: `b${index}`, mtimeMs: now - index * 6 * hour }));
  const removed = new Set(backupsToDelete(backups, { now }).map((backup) => backup.filePath));
  const kept = backups.filter((backup) => !removed.has(backup.filePath));
  assert.ok(kept.length <= 17, `kept ${kept.length}`);
  for (let index = 0; index < 6; index++) assert.ok(!removed.has(`b${index}`), 'newest six kept');
  const oldestKeptDays = (now - Math.min(...kept.map((backup) => backup.mtimeMs))) / (24 * hour);
  assert.ok(oldestKeptDays >= 21, `oldest kept backup is ${oldestKeptDays} days old`);
  assert.ok(removed.has('b159'), 'backups older than four weeks are removed');
});

test('backups are copied to the second folder and pruned there too', () => {
  const os = require('node:os');
  const { mirrorBackup } = require('../electron/backup-retention');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-mirror-'));
  try {
    const source = path.join(dir, 'workspace-2026-10-28T12-00-00-000Z-manual.json');
    fs.writeFileSync(source, '{}');
    const mirrorDir = path.join(dir, 'mirror');
    const result = mirrorBackup(source, mirrorDir);
    assert.equal(result.mirrored, true);
    assert.ok(fs.existsSync(path.join(mirrorDir, path.basename(source))));
    assert.deepEqual(mirrorBackup(source, ''), { mirrored: false });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('both backup paths use tiered retention and only the folder picker sets the second folder', () => {
  const main = read('electron/main.js');
  const worker = read('electron/workspace-backup-worker.js');
  assert.match(worker, /pruneBackups\(dir\)/);
  assert.match(worker, /mirrorBackup\(backupPath, mirrorDir\)/);
  assert.doesNotMatch(main, /backups\.slice\(12\)/);
  assert.match(main, /secureIpcHandle\('choose-backup-mirror-folder'/);
  assert.match(main, /if \(previous\.backupMirrorFolder\) toStore\.backupMirrorFolder = previous\.backupMirrorFolder;/);
});

function memorySettingsStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get(key, fallback) { return Object.hasOwn(state, key) ? state[key] : fallback; },
    set(key, value) { state = { ...state, [key]: value }; listeners.forEach((listener) => listener()); },
    delete(key) { const next = { ...state }; delete next[key]; state = next; },
    has(key) { return Object.hasOwn(state, key); },
    onDidAnyChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get store() { return state; },
    set store(value) { state = value; }
  };
}

test('affiliate links and synced post lists move out of the settings file but read back unchanged', () => {
  const os = require('node:os');
  const { createWorkspaceStore } = require('../electron/workspace-store');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-settings-lists-'));
  const affiliateLinks = [{ id: 'a1', url: 'https://example.com/pan' }];
  const posts = [{ id: 7, title: 'Lemon Rice', link: 'https://site.test/lemon-rice' }];
  const settingsStore = memorySettingsStore({ settings: { theme: 'dark', affiliateLinks, wordpressSites: [{ id: 's1', url: 'https://site.test', internalLinkPosts: posts }] } });
  const workspace = createWorkspaceStore(settingsStore, directory);
  try {
    const slim = settingsStore.get('settings');
    assert.equal(Object.hasOwn(slim, 'affiliateLinks'), false);
    assert.equal(Object.hasOwn(slim.wordpressSites[0], 'internalLinkPosts'), false);
    assert.deepEqual(workspace.get('settings').affiliateLinks, affiliateLinks);
    assert.deepEqual(workspace.get('settings.wordpressSites.0.internalLinkPosts'), posts);

    workspace.set('settings.theme', 'light');
    assert.equal(workspace.get('settings.theme'), 'light');
    assert.deepEqual(workspace.get('settings').affiliateLinks, affiliateLinks, 'a small change keeps the lists');

    workspace.set('settings', { ...workspace.get('settings'), affiliateLinks: [] });
    assert.deepEqual(workspace.get('settings').affiliateLinks, []);

    workspace.delete('settings.theme');
    assert.equal(workspace.get('settings.theme', 'none'), 'none');
    assert.deepEqual(workspace.get('settings.wordpressSites.0.internalLinkPosts'), posts);
  } finally {
    workspace.database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('an older backup that still holds the lists inside settings restores them', () => {
  const os = require('node:os');
  const { createWorkspaceStore } = require('../electron/workspace-store');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-settings-restore-'));
  const settingsStore = memorySettingsStore({ settings: { theme: 'dark', affiliateLinks: [{ id: 'new' }] } });
  const workspace = createWorkspaceStore(settingsStore, directory);
  try {
    workspace.store = { settings: { theme: 'old', affiliateLinks: [{ id: 'old' }] } };
    assert.deepEqual(workspace.get('settings').affiliateLinks, [{ id: 'old' }]);
    assert.equal(Object.hasOwn(settingsStore.get('settings'), 'affiliateLinks'), false);
    const backup = workspace.store;
    workspace.store = { settings: { theme: 'x' } };
    workspace.store = backup;
    assert.deepEqual(workspace.get('settings').affiliateLinks, [{ id: 'old' }], 'a new-style backup round-trips');
  } finally {
    workspace.database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('smart intent picks the matching recipe profile and falls back to quick weeknight', async () => {
  const { inferSmartIntent, smartKeywordRoot } = await import('../src/lib/smartContentEngine.js');
  assert.equal(inferSmartIntent({ title: 'Crispy Air Fryer Chicken Thighs' }).id, 'air-fryer');
  assert.equal(inferSmartIntent({ title: 'Fudgy Chocolate Brownies' }).id, 'dessert-baking');
  assert.equal(inferSmartIntent({ title: 'Sparkling Cranberry Mocktail' }).id, 'drink');
  assert.equal(inferSmartIntent({ title: 'Chicken Soup', type: 'listicle' }).id, 'listicle-roundup');
  assert.equal(inferSmartIntent({ title: 'Braised Lamb Shanks' }).id, 'quick-weeknight');
  assert.equal(smartKeywordRoot('The Best Easy Lemon Garlic Butter Salmon Recipe'), 'lemon garlic butter salmon');
  assert.equal(smartKeywordRoot(''), 'recipe idea');
});

test('smart briefs keep user choices ahead of profile defaults and never claim testing', async () => {
  const { buildSmartArticleDefaults, buildSmartGenerationSettings } = await import('../src/lib/smartContentEngine.js');
  const defaults = buildSmartArticleDefaults({
    title: 'Air Fryer Salmon Bites',
    manual: { targetKeyword: 'salmon bites', articleLength: '600-900', audience: 'Students' },
    preset: { brandVoiceId: 'voice-a' }
  });
  assert.equal(defaults.articleLength, '600-900');
  assert.equal(defaults.brandVoiceId, 'voice-a');
  assert.equal(defaults.seoBrief.targetKeyword, 'salmon bites');
  assert.equal(defaults.seoBrief.audience, 'Students');
  assert.match(defaults.seoBrief.competitorNotes, /Never claim the recipe was personally tested/);
  const generation = buildSmartGenerationSettings({ title: 'Air Fryer Salmon Bites', seoBrief: { secondaryKeywords: 'lemon dill' } }, { recipeCardEnabled: false });
  assert.equal(generation.recipeCardEnabled, false);
  assert.match(generation.seoBrief.secondaryKeywords, /lemon dill/);
});

test('smart board scoring prefers boards that match the recipe profile', async () => {
  const { scoreSmartBoard } = await import('../src/lib/smartContentEngine.js');
  const pin = { title: 'No Bake Chocolate Cheesecake' };
  assert.ok(scoreSmartBoard(pin, 'Dessert Recipes') > scoreSmartBoard(pin, 'Healthy Recipes'));
  assert.equal(scoreSmartBoard(pin, 'Soups & Stews'), 0);
});

test('cluster plans have one pillar, cap the count, and link supports back to the pillar', async () => {
  const { buildClusterPlan } = await import('../src/lib/contentPlanning.js');
  const plan = buildClusterPlan('Chicken Thighs', { defaultAudience: 'Busy parents' }, 5);
  assert.equal(plan.length, 5);
  assert.equal(plan.filter((item) => item.role === 'Pillar').length, 1);
  assert.equal(plan[0].role, 'Pillar');
  for (const support of plan.slice(1)) {
    assert.equal(support.internalLinkTargets[0], plan[0].title);
    assert.match(support.notes, /Link back to the pillar/);
  }
  assert.equal(plan[0].audience, 'Busy parents');
  assert.equal(buildClusterPlan('Soup', {}, 500).length, 10);
  assert.equal(buildClusterPlan('', {}, 0).length, 10, 'no count means the default of 10');
  assert.equal(buildClusterPlan('', {}, -3).length, 1);
  assert.match(buildClusterPlan('', {}, 1)[0].title, /^Easy Recipe Ideas/);
});

function loadAppUpdater(provenance) {
  const { EventEmitter } = require('node:events');
  const fake = Object.assign(new EventEmitter(), {
    calls: [],
    setFeedURL(options) { this.calls.push(['feed', options]); },
    async checkForUpdates() { this.calls.push(['check']); },
    async downloadUpdate() { this.calls.push(['download']); },
    quitAndInstall() { this.calls.push(['install']); }
  });
  const resolved = require.resolve('electron-updater');
  const previous = require.cache[resolved];
  const provenanceModule = require.resolve('../electron/release-provenance');
  const previousProvenance = require.cache[provenanceModule];
  if (provenance) require.cache[provenanceModule] = { id: provenanceModule, filename: provenanceModule, loaded: true, exports: { releaseProvenance: () => provenance } };
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: { autoUpdater: fake } };
  delete require.cache[require.resolve('../electron/app-updater')];
  try {
    return { fake, ...require('../electron/app-updater') };
  } finally {
    if (previous) require.cache[resolved] = previous; else delete require.cache[resolved];
    if (previousProvenance) require.cache[provenanceModule] = previousProvenance; else delete require.cache[provenanceModule];
  }
}

test('updates stay off without a packaged app, a safe https feed, and (on Windows) a signed publisher', () => {
  const { fake, createAppUpdater } = loadAppUpdater();
  const log = { info() {}, warn() {} };
  const dev = createAppUpdater({ app: { isPackaged: false, getVersion: () => '1.6.3' }, log, getFeedUrl: () => 'https://updates.example.com' });
  assert.equal(dev.configure().configured, false);
  const unsafe = createAppUpdater({ app: { isPackaged: true, getVersion: () => '1.6.3' }, log, getFeedUrl: () => 'http://192.168.1.5/feed' });
  assert.equal(unsafe.configure().configured, false);
  const packaged = createAppUpdater({ app: { isPackaged: true, getVersion: () => '1.6.3' }, log, getFeedUrl: () => 'https://updates.example.com/' });
  const state = packaged.configure();
  assert.equal(state.configured, false);
  assert.match(state.message, /verified signed production/);
  assert.equal(fake.calls.length, 0);
});

test('update download and install only run from the matching state', async () => {
  const { fake, createAppUpdater } = loadAppUpdater({ verified: true, releaseMode: 'signed-production', windowsPublisherNames: ['Example Publisher'], updateFeedUrl: 'https://updates.example.com/app' });
  const statuses = [];
  const updater = createAppUpdater({ app: { isPackaged: true, getVersion: () => '1.6.3' }, log: {}, onStatus: (state) => statuses.push(state.status) });
  assert.equal((await updater.check()).success, false);
  assert.equal((await updater.download()).success, false);
  assert.equal(updater.install().success, false);
  updater.configure();
  fake.emit('update-available', { version: '1.6.4' });
  assert.equal(updater.state().availableVersion, '1.6.4');
  assert.equal((await updater.download()).success, true);
  assert.equal(updater.install().success, false, 'cannot install before the download finishes');
  fake.emit('update-downloaded', { version: '1.6.4' });
  assert.equal(updater.install().success, true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(fake.calls.map((call) => call[0]), ['feed', 'download', 'install']);
  fake.emit('error', new Error('x'.repeat(900)));
  assert.equal(updater.state().message.length, 500);
  assert.deepEqual(statuses, ['idle', 'available', 'ready', 'error']);
});

test('unsigned test releases cannot activate update installation through stale updater events', async () => {
  const { fake, createAppUpdater } = loadAppUpdater({ verified: true, releaseMode: 'unsigned-test', windowsPublisherNames: ['Example Publisher'] });
  const updater = createAppUpdater({ app: { isPackaged: true, getVersion: () => '1.6.5' }, log: {}, getFeedUrl: () => 'https://updates.example.com' });
  assert.equal(updater.configure().configured, false);
  fake.emit('update-available', { version: '1.6.6' });
  assert.equal((await updater.download()).success, false);
  fake.emit('update-downloaded', { version: '1.6.6' });
  assert.equal(updater.install().success, false);
  assert.deepEqual(fake.calls, []);
});

test('video handlers live in their own module and deleting a video with a missing file still succeeds', async () => {
  const { registerVideoIpc } = require('../electron/video-ipc');
  let videos = [{ id: 'v1', localPath: path.join(require('node:os').tmpdir(), 'cs-missing-video.mp4') }, { id: 'v2' }];
  const handlers = {};
  const warnings = [];
  registerVideoIpc({
    handle: (channel, fn) => { handlers[channel] = fn; },
    store: { get: () => videos, set: (_key, value) => { videos = value; } },
    log: { warn: (...args) => warnings.push(args) },
    videoRecordWithDisplay: (record) => record
  });
  assert.deepEqual(Object.keys(handlers).sort(), ['delete-generated-video', 'generate-video', 'get-generated-videos']);
  const result = await handlers['delete-generated-video']({}, 'v1');
  assert.equal(result.success, true);
  assert.deepEqual(result.videos.map((video) => video.id), ['v2']);
  assert.equal(warnings.length, 0, 'a file that is already gone is not a warning');
  assert.doesNotMatch(read('electron/main.js'), /secureIpcHandle\('generate-video'/);
});

test('sidebar groups can be hidden, but searching, the icon-only bar and the current screen keep them open', () => {
  const source = read('src/components/Sidebar.jsx');
  const start = source.indexOf('export function sidebarGroupOpen');
  assert.ok(start >= 0, 'sidebarGroupOpen helper exists');
  const helperStart = source.indexOf('function screenIsActive');
  const helpers = source.slice(helperStart, source.indexOf('\n}\n', start) + 2).replace('export function', 'function');
  const sidebarGroupOpen = new Function(`${helpers}; return sidebarGroupOpen;`)();
  const group = { id: 'measure', items: [{ id: 'performance' }] };
  const hidden = ['measure'];
  assert.equal(sidebarGroupOpen(group, { hiddenGroups: hidden, activeScreen: 'articles' }), false);
  assert.equal(sidebarGroupOpen(group, { hiddenGroups: [], activeScreen: 'articles' }), true);
  assert.equal(sidebarGroupOpen(group, { hiddenGroups: hidden, activeScreen: 'performance' }), true);
  assert.equal(sidebarGroupOpen(group, { hiddenGroups: hidden, activeScreen: 'articles', searching: true }), true);
  assert.equal(sidebarGroupOpen(group, { hiddenGroups: hidden, activeScreen: 'articles', collapsed: true }), true);
  assert.match(source, /studio-sidebar-hidden-groups/);
});

test('imports, exports and media uploads read and write files without freezing the app', () => {
  const main = read('electron/main.js');
  const section = (startText, endText) => {
    const start = main.indexOf(startText);
    assert.ok(start >= 0, startText);
    return main.slice(start, main.indexOf(endText, start + startText.length));
  };
  for (const [startText, endText] of [
    ["secureIpcHandle('export-articles'", 'secureIpcHandle('],
    ["secureIpcHandle('import-articles'", 'secureIpcHandle('],
    ["secureIpcHandle('import-revenue-csv'", 'secureIpcHandle('],
    ["secureIpcHandle('import-titles-csv'", 'secureIpcHandle('],
    ['async function uploadMediaToWP', '\n}\n'],
    ['const scheduledUpload = imgbbUploadQueue', '});']
  ]) {
    assert.doesNotMatch(section(startText, endText), /fs\.(readFileSync|writeFileSync|statSync)\(/, startText);
  }
});

const longPinTitle = 'Valentines Brownies Heart Cutouts Swirls with Classic Fudge Texture for Meal Prep Desserts';

test('social posts made from Pins name the dish briefly instead of repeating the whole Pin title', async () => {
  const { socialDishName } = await import('../src/lib/pinSocialCopy.mjs');
  assert.equal(socialDishName(longPinTitle), 'Valentines Brownies Heart Cutouts Swirls');
  assert.equal(socialDishName('**Lemon Rice**: Bright, Fast and Fluffy'), 'Lemon Rice');
  assert.equal(socialDishName('Chicken with Rice'), 'Chicken with Rice', 'a short title stays whole');
  assert.equal(socialDishName(''), 'Recipe idea');
  assert.ok(socialDishName('Supercalifragilistic '.repeat(8)).length <= 70);
});

test('Pin descriptions are shortened at a sentence or word, never mid-word', async () => {
  const { trimAtSentence } = await import('../src/lib/pinSocialCopy.mjs');
  const description = 'These Valentines brownies feature heart cutouts and rich chocolate swirls, perfect for an easy make-ahead dessert. Made with cocoa, butter, and optional espresso powder, they bake in under 30 minutes for a reliable soft texture every time you make them.';
  assert.equal(trimAtSentence(description, 220), 'These Valentines brownies feature heart cutouts and rich chocolate swirls, perfect for an easy make-ahead dessert.');
  const oneLong = 'word '.repeat(80).trim();
  const cut = trimAtSentence(oneLong, 60);
  assert.ok(cut.length <= 60 && cut.endsWith('...') && !/wor\.\.\.$/.test(cut));
  assert.equal(trimAtSentence('Short and sweet.', 220), 'Short and sweet.');
});

test('Pin hashtags are readable: at most three words and 24 letters, no duplicates', async () => {
  const { socialHashtags } = await import('../src/lib/pinSocialCopy.mjs');
  const tags = socialHashtags(['valentines brownies heart cutouts swirls', 'dessert recipe', 'Dessert Recipe', 'baking tips', 'make ahead dessert', 'meal prep baked desserts', 'easy dessert', 'sweet treat', 'chocolate', 'brownies', 'recipe inspiration']);
  assert.deepEqual(tags, ['#DessertRecipe', '#BakingTips', '#MakeAheadDessert', '#EasyDessert', '#SweetTreat', '#Chocolate', '#Brownies', '#RecipeInspiration']);
  assert.ok(tags.every((tag) => tag.length <= 25));
});

test('the Pinterest repurpose card uses the short copy, shows the local image first and wraps long links', () => {
  const view = read('src/components/PinCreatorView.jsx');
  assert.match(view, /socialDishName\(/);
  assert.match(view, /trimAtSentence\(description, 220\)/);
  assert.match(view, /socialHashtags\(/);
  assert.doesNotMatch(view, /is the kind of recipe worth saving before a busy week/);
  assert.match(view, /const image = pack\.imageAssets\?\.\[0\]\?\.fileUrl \|\| pack\.imageAssets\?\.\[0\]\?\.publicUrl/);
  assert.match(view, /min-w-0 space-y-3 break-words/);
});
