const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
async function main() {
  const { build, preview } = await import('vite');
  const outDir = path.resolve('.codex-tools/app-audit-ui');
  const relative = path.relative(process.cwd(), outDir);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('UI output must stay inside the workspace.');
  await build({ logLevel: 'warn', build: { outDir, emptyOutDir: true, target: 'esnext', rollupOptions: { input: ['tests/fixtures/pinterest-schedule-ui.html', 'tests/fixtures/content-operations-ui.html', 'tests/fixtures/quality-studio-ui.html', 'tests/fixtures/analytics-meta-ui.html', 'tests/fixtures/article-intake-ui.html', 'tests/fixtures/publishing-agenda-ui.html'] } } });
  await fs.mkdir(path.join(outDir, 'artifacts'), { recursive: true });
  await require('sharp')({ create: { width: 1080, height: 1920, channels: 3, background: '#41765b' } }).jpeg().toFile(path.join(outDir, 'artifacts/exact-template-test.jpg'));
  const server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  try {
    for (const script of ['test-pinterest-schedule-ui.cjs', 'test-content-operations-ui.cjs', 'test-quality-studio-ui.cjs', 'test-recipe-reader-ui.cjs', 'test-analytics-meta-ui.cjs', 'test-pasted-queue-ui.cjs', 'test-publishing-agenda-ui.cjs']) {
      console.log(`UI checks: ${script}`);
      const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', windowsHide: true, env: { ...process.env, ...(process.platform === 'win32' && !process.env.PLAYWRIGHT_CHANNEL ? { PLAYWRIGHT_CHANNEL: 'msedge' } : {}), CONTENT_STUDIO_UI_TEST_PORT: String(server.httpServer.address().port) } });
        const timeout = setTimeout(() => { child.kill(); reject(new Error(`${script} exceeded five minutes.`)); }, 300000);
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.once('exit', code => { clearTimeout(timeout); resolve(code); });
      });
      if (code !== 0) throw new Error(`${script} failed.`);
    }
  } finally { await new Promise(resolve => server.httpServer.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
