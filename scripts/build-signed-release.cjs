'use strict';
const pkg = require('../package.json');
const { normalizeUpdateFeedUrl } = require('../electron/update-security');
function signedReleaseConfig(env = process.env, platform = process.platform) {
  if (env.CONTENT_STUDIO_ALLOW_UNSIGNED === '1') throw new Error('Production signing command cannot use the unsigned-test override.');
  const feed = normalizeUpdateFeedUrl(env.CONTENT_STUDIO_UPDATE_URL);
  if (!feed) throw new Error('Set CONTENT_STUDIO_UPDATE_URL to the approved HTTPS update directory.');
  const publisherName = String(env.CONTENT_STUDIO_WINDOWS_PUBLISHER || '').trim();
  if (platform === 'win32' && (!publisherName || !(env.CSC_LINK || env.WIN_CSC_LINK))) throw new Error('Configure a signing certificate and its exact publisher name before building a Windows release.');
  if (platform === 'darwin' && !(env.CSC_LINK && env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID)) throw new Error('Configure Mac signing and notarization credentials before building a release.');
  if (!['win32', 'darwin'].includes(platform)) throw new Error('Build production artifacts on Windows or macOS.');
  return { ...pkg.build, forceCodeSigning: true, publish: [{ provider: 'generic', url: feed }],
    ...(platform === 'win32' ? { win: { ...pkg.build.win, publisherName, verifyUpdateCodeSignature: true } } : {}) };
}
if (require.main === module) {
  Promise.resolve().then(() => require('electron-builder').build({ config: signedReleaseConfig(), publish: 'never' })).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { signedReleaseConfig };
