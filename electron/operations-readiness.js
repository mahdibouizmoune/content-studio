'use strict';
const { configuredWindowsPublisherNames, normalizeUpdateFeedUrl } = require('./update-security');
function operationsReadiness({ store, metadata = {}, packaged = false, platform = process.platform, updateState = {} }) {
  const settings = store.get('settings', {});
  const batches = store.get('pinterestDelivery.batches', []).filter(b => b.fileStatus !== 'failed');
  const outcomes = batches.flatMap(b => b.rows.map(r => b.outcomes?.[r.number]?.status || 'pending'));
  const wordpress = store.get('performance.wordpressPublishReceipts', []);
  const ghl = store.get('performance.ghlReceipts', []);
  const analytics = store.get('performance.intelligence', null);
  const hasGoogle = Boolean(settings.googleRefreshToken_encrypted);
  const publishers = configuredWindowsPublisherNames(metadata);
  return {
    checkedAt: new Date().toISOString(), paidRequestsSubmitted: 0, liveWritesSubmitted: 0,
    checks: [
      { id: 'release', name: 'Signed releases', status: packaged && (platform !== 'win32' || publishers.length) ? 'requires-signature-verification' : 'setup-required', detail: platform === 'win32' && !publishers.length ? 'A Windows publisher certificate must be configured in the release build. A Windows login PIN is not a signing certificate.' : 'Release artifacts must pass the signing verification gate.' },
      { id: 'updates', name: 'Automatic updates', status: updateState.configured ? 'configured' : 'setup-required', detail: updateState.message || (normalizeUpdateFeedUrl(settings.updateFeedUrl) ? 'Feed saved; a signed production build is required.' : 'Configure a trusted HTTPS update feed and signed build.') },
      { id: 'wordpress', name: 'WordPress', status: wordpress.some(r => r.postId && r.status === 'publish') ? 'recorded-publication' : settings.wordpressSites?.length ? 'configured-unverified' : 'setup-required', detail: `${wordpress.filter(r => r.postId && r.status === 'publish').length} publication receipts; ${wordpress.filter(r => r.status === 'unknown').length} unresolved outcomes. Saved credentials alone do not prove connectivity.` },
      { id: 'pinterest', name: 'Pinterest CSV imports', status: outcomes.includes('confirmed') ? 'user-reported-results' : 'receipt-required', detail: `${outcomes.filter(s => s === 'confirmed').length} reported accepted; ${outcomes.filter(s => s === 'failed').length} reported failed; ${outcomes.filter(s => !['confirmed', 'failed'].includes(s)).length} unconfirmed rows. Import results must be recorded from Pinterest, not inferred from export.` },
      { id: 'ghl', name: 'GoHighLevel', status: ghl.some(r => r.verified === true) ? 'verified-receipt' : ghl.length ? 'recorded-unverified' : 'not-verified', detail: `${ghl.filter(r => r.verified === true).length} verified receipts; ${ghl.filter(r => r.status === 'unknown').length} unresolved outcomes.` },
      { id: 'analytics', name: 'Search Console / Analytics', status: analytics?.generatedAt && !analytics.google?.error && analytics.google?.current ? 'report-recorded' : hasGoogle ? 'configured-unverified' : 'report-access-required', detail: `Last performance snapshot: ${analytics?.generatedAt || 'none'}. A G- tracking code cannot grant report access.` }
    ]
  };
}
module.exports = { operationsReadiness };
