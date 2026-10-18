const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
function buildProvenance({ root = path.resolve(__dirname, '..'), allowDevelopment = process.env.CONTENT_STUDIO_ALLOW_UNSIGNED === '1' } = {}) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const commit = git(['rev-parse', 'HEAD']), dirty = Boolean(git(['status', '--porcelain']));
  const tags = git(['tag', '--points-at', 'HEAD']).split('\n');
  const tag = tags.find(t => t === `v${version}`) || '';
  if (!allowDevelopment && (dirty || !tag)) throw new Error('Release blocked: commit the reviewed source, create a matching version tag, and build from a clean checkout. Use an explicitly labelled unsigned test build for local development.');
  const manifest = { version, commit, tag, verified: !dirty && Boolean(tag), sourceStatus: dirty ? 'Uncommitted development source' : tag ? 'Clean tagged source' : 'Untagged development source', builtAt: new Date().toISOString(), lockSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'package-lock.json'))).digest('hex') };
  fs.writeFileSync(path.join(root, 'electron/assets/release-provenance.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
module.exports = async () => { buildProvenance(); };
module.exports.buildProvenance = buildProvenance;
if (require.main === module) console.log(JSON.stringify(buildProvenance(), null, 2));
