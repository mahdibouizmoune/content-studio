const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cs-wp-proof-'));
  try {
    const child = spawn(process.execPath, [path.join(__dirname, 'test-wordpress-playground.cjs')], { env: { ...process.env, CS_WP_TEST_OUTPUT: dir }, stdio: 'inherit', windowsHide: true });
    const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    assert.equal(exit.code, 0, `WordPress child failed: ${exit.signal || exit.code}`);
    const proof = JSON.parse(await fs.readFile(path.join(dir, 'passed.json'), 'utf8'));
    assert.deepEqual(proof, { mediaOutage: true, mediaRecovered: true, recipePreserved: true, noDuplicate: true, unauthorizedBlocked: true, analyticsDefaultOff: true });
    console.log('Verified WordPress PHP assertion receipt: 6 real staging checks passed.');
  } finally {
    const target = await fs.realpath(dir);
    assert.equal(path.dirname(target), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('cs-wp-proof-'));
    await fs.rm(target, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
