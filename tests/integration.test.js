const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { WorkspaceDatabase, createWorkspaceStore } = require('../electron/workspace-store');
const { createJobCenter } = require('../electron/job-center');
const { postPublishChecks } = require('../electron/post-publish-qa');

function memorySettingsStore(initial = {}) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    get(key, fallback) { return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : fallback; },
    set(key, value) { state = { ...state, [key]: value }; listeners.forEach((listener) => listener()); },
    delete(key) { const next = { ...state }; delete next[key]; state = next; },
    has(key) { return Object.prototype.hasOwnProperty.call(state, key); },
    onDidAnyChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get store() { return state; },
    set store(value) { state = value; }
  };
}

test('published article workflow persists its public QA and completed background job', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'content-studio-integration-'));
  const settings = memorySettingsStore({ settings: { publishStatus: 'publish' } });
  let workspace = createWorkspaceStore(settings, directory);
  const jobs = createJobCenter({ store: workspace });
  const article = { id: 'article-1', title: 'Lemon Soup', queueStatus: 'completed', wordpressPostUrl: 'https://example.com/lemon-soup/' };
  workspace.set('articles', [article]);
  jobs.start('post-publish-qa-article-1', { type: 'qa', workspace: 'performance', sourceId: article.id });

  const html = `<html><head><title>Lemon Soup Recipe</title><meta name="description" content="A complete lemon soup recipe with measured ingredients, timing, doneness cues, storage notes, and practical serving advice."><link rel="canonical" href="${article.wordpressPostUrl}"></head><body><img src="https://example.com/soup.webp"><a href="/recipes/">Recipes</a><a href="/tips/">Tips</a><script type="application/ld+json">{"@type":"Recipe"}</script></body></html>`;
  const qa = postPublishChecks({ html, status: 200, url: article.wordpressPostUrl, recipeAudit: { hasRecipeSchema: true } });
  workspace.set('postPublishQa', [{ ...qa, articleId: article.id }]);
  jobs.finish('post-publish-qa-article-1', 'completed', { result: { score: qa.score } });
  workspace.database.close();

  workspace = createWorkspaceStore(settings, directory);
  assert.equal(workspace.get('articles.0.wordpressPostUrl'), article.wordpressPostUrl);
  assert.equal(workspace.get('postPublishQa.0.score'), 100);
  assert.equal(workspace.get('jobCenterJobs.0.status'), 'completed');
  workspace.database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('a corrupt workspace database fails closed and releases the file for quarantine', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'content-studio-corrupt-db-'));
  const databasePath = path.join(directory, 'workspace.sqlite');
  const quarantinePath = `${databasePath}.invalid.bak`;
  fs.writeFileSync(databasePath, 'not-a-sqlite-database', 'utf8');

  assert.throws(() => new WorkspaceDatabase(databasePath));
  assert.doesNotThrow(() => fs.renameSync(databasePath, quarantinePath));
  assert.equal(fs.existsSync(quarantinePath), true);

  fs.rmSync(directory, { recursive: true, force: true });
});
