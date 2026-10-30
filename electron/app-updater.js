const { autoUpdater } = require('electron-updater');
const packageMetadata = require('../package.json');
const { configuredWindowsPublisherNames, normalizeUpdateFeedUrl } = require('./update-security');
const { releaseProvenance } = require('./release-provenance');

function createAppUpdater({ app, log, getFeedUrl, onStatus = () => {} }) {
  let state = { status: 'disabled', configured: false, version: app.getVersion(), message: 'No update feed is configured.' };
  const publish = (patch) => {
    state = { ...state, ...patch, updatedAt: new Date().toISOString() };
    onStatus(state);
    return state;
  };

  function configure() {
    const provenance = releaseProvenance(app);
    const feedUrl = normalizeUpdateFeedUrl(getFeedUrl?.() || process.env.CONTENT_STUDIO_UPDATE_URL || (provenance.verified ? provenance.updateFeedUrl : '') || '');
    if (['downloading', 'ready', 'checking'].includes(state.status)) return state;
    if (!app.isPackaged || !feedUrl) return publish({ status: 'disabled', configured: false, availableVersion: null, percent: 0, message: !app.isPackaged ? 'Update installation is available in packaged production builds.' : 'No valid HTTPS update feed is configured.' });
    if (!provenance.verified || provenance.releaseMode !== 'signed-production' || (process.platform === 'win32' && configuredWindowsPublisherNames({ ...provenance, ...packageMetadata }).length === 0)) {
      return publish({
        status: 'disabled',
        configured: false,
        message: 'Automatic updates require a verified signed production build and, on Windows, a configured publisher.'
      });
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = log;
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
    publish({ status: 'idle', configured: true, message: 'Update checks are ready.' });
    return state;
  }

  autoUpdater.on('checking-for-update', () => publish({ status: 'checking', message: 'Checking for updates.' }));
  autoUpdater.on('update-available', (info) => publish({ status: 'available', availableVersion: info.version, message: `Version ${info.version} is available.` }));
  autoUpdater.on('update-not-available', () => publish({ status: 'current', message: 'Content Studio is up to date.' }));
  autoUpdater.on('download-progress', (progress) => publish({ status: 'downloading', percent: Math.round(progress.percent || 0), message: 'Downloading the update.' }));
  autoUpdater.on('update-downloaded', (info) => publish({ status: 'ready', availableVersion: info.version, percent: 100, message: 'The update is ready to install.' }));
  autoUpdater.on('error', (error) => publish({ status: 'error', message: String(error.message || 'Update check failed').slice(0, 500) }));

  return {
    configure,
    state: () => state,
    async check() {
      if (!state.configured) return { success: false, state, error: state.message };
      await autoUpdater.checkForUpdates();
      return { success: true, state };
    },
    async download() {
      if (!state.configured || state.status !== 'available') return { success: false, state, error: 'No update is ready to download.' };
      await autoUpdater.downloadUpdate();
      return { success: true, state };
    },
    install() {
      if (!state.configured || state.status !== 'ready') return { success: false, state, error: 'No downloaded update is ready.' };
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 0);
      return { success: true, state };
    }
  };
}

module.exports = { createAppUpdater };
