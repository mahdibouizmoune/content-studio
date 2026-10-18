import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';

const website = { configured: true, stale: false, snapshot: { fetchedAt: '2026-10-11T12:00:00Z', range: { current: { startDate: '2026-09-12', endDate: '2026-10-09' } }, timeZone: 'UTC' }, recommendations: [{ articleId: 'a', title: 'Lemon Chickpea Salad', topic: 'lemon chickpea salad', url: 'https://food.example/salad', sessions: 100, engagedSessions: 75, engagementRate: 0.75, averageEngagementSeconds: 40, pinterestSessions: 35, growthPercent: 50, reason: '75 engaged sessions. Expand related cooking needs without duplicating this recipe.' }] };
window.electronAPI = {
  getGoogleAnalyticsWorkspace: async () => website,
  refreshGoogleAnalytics: async () => ({ success: true, ...website }),
  getTrendWorkspace: async () => ({ analytics: null, history: [] }),
  getPinterestClusterWorkspace: async () => ({ success: true, history: [] }),
  getRepurposePacks: async () => ({ success: true, packs: [] }),
  getSettings: async () => ({ googleAnalyticsMeasurementId: 'G-ABCD1234' }),
  openExternalUrl: async () => ({ success: true })
};
const { ConfirmDialogProvider } = await import('/src/components/ConfirmDialog.jsx');
const { default: Trends } = await import('/src/components/TrendsResearch.jsx');
const { default: Clusters } = await import('/src/components/ClusterPlanner.jsx');
const { default: Settings } = await import('/src/components/Settings.jsx');
function Fixture() {
  const [screen, setScreen] = useState('trends');
  const settings = { googleAnalyticsMeasurementId: 'G-ABCD1234', googleAnalyticsPropertyId: '123456', googleAnalyticsSiteUrl: 'https://food.example', projectPresets: [], wordpressSites: [], pinCreator: {} };
  const props = { settings, articles: [], refreshArticles: async () => {}, setActiveScreen: setScreen };
  return <ConfirmDialogProvider><main style={{ maxWidth: 1300, margin: 'auto', padding: 16 }}><nav className="mb-6 flex gap-4">{['trends', 'clusters', 'settings'].map((name) => <button key={name} onClick={() => setScreen(name)} className="text-sm font-bold capitalize">{name}</button>)}</nav>{screen === 'settings' ? <Settings {...props} initialOpenSection="analytics" saveSettings={async () => ({ success: true })} /> : screen === 'clusters' ? <Clusters {...props} /> : <Trends {...props} />}</main></ConfirmDialogProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
