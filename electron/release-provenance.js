'use strict';
const fs = require('node:fs');
const path = require('node:path');
function releaseProvenance(app) {
  try { const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets/release-provenance.json'), 'utf8')); return { ...data, verified: app.isPackaged && data.version === app.getVersion() && data.verified === true, installedVersion: app.getVersion(), packaged: app.isPackaged }; }
  catch { return { installedVersion: app.getVersion(), packaged: app.isPackaged, verified: false, sourceStatus: 'Development checkout; no verified release manifest' }; }
}
module.exports = { releaseProvenance };
