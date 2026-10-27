// Launches the built app against an empty isolated profile, opens every sidebar screen
// (and every Content Pipeline / Quality Studio tab), and records renderer errors.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const project = process.argv[2];
const { _electron } = require(path.join(project, 'node_modules/playwright'));
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'content-studio-claude-sweep-'));
  console.log('PROFILE', profile);
  const env = { ...process.env, CONTENT_STUDIO_USER_DATA_DIR: profile };
  delete env.VITE_DEV_SERVER_URL; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ cwd: project, args: [project], env });
  const problems = [];
  app.process().stderr?.on('data', d => { const s = String(d); if (/error|exception|unhandled/i.test(s)) problems.push(`main-stderr: ${s.trim().slice(0, 400)}`); });
  const page = await app.firstWindow();
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 400)}`); });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  const labels = await page.$$eval('nav[aria-label="Main navigation"] button[aria-label]', bs => bs.map(b => b.getAttribute('aria-label')));
  console.log('SCREENS', labels.join(' | '));
  for (const label of labels) {
    const before = problems.length;
    await page.click(`nav[aria-label="Main navigation"] button[aria-label="${label}"]`);
    await page.waitForTimeout(1500);
    const tabs = await page.$$eval('[role=tablist] [role=tab]', ts => ts.map(t => t.textContent.trim())).catch(() => []);
    for (const t of tabs) {
      const tab = page.locator('[role=tablist] [role=tab]', { hasText: t }).first();
      if (await tab.isVisible().catch(() => false)) { await tab.click().catch(e => problems.push(`tab-click ${label}/${t}: ${e.message.split('\n')[0]}`)); await page.waitForTimeout(700); }
    }
    const boundary = await page.locator('text=/Something went wrong|crashed|failed to render/i').count();
    if (boundary) problems.push(`error-boundary visible on ${label}`);
    console.log(`${label}: tabs=${tabs.length} newProblems=${problems.length - before}`);
    for (const p of problems.slice(before)) console.log('   ', p);
  }
  await page.screenshot({ path: path.join(os.tmpdir(), 'content-studio-sweep-last.png') });
  await app.close();
  console.log('TOTAL_PROBLEMS', problems.length);
  fs.rmSync(profile, { recursive: true, force: true });
})().catch(e => { console.error('SWEEP_FAILED', e); process.exitCode = 1; });
