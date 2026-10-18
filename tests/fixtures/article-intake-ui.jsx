import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { filterArticleIntake } from '/electron/article-intake.mjs';

const initial = [{ id: 'existing', title: 'Apple Ginger Kombucha' }];
window.intakeTestArticles = [...initial, { id: 'hidden', title: 'Homemade Banana Syrup' }];
window.electronAPI = {
  queueArticles: async ({ articles }) => {
    const selection = filterArticleIntake(articles, window.intakeTestArticles);
    window.intakeTestArticles.push(...selection.accepted);
    return { success: true, addedCount: selection.accepted.length, skipped: selection.skipped };
  }
};
const { default: AddToQueue } = await import('/src/components/AddToQueue.jsx');
function Fixture() {
  return <main style={{ maxWidth: 1200, margin: 'auto', padding: 16 }}><AddToQueue mode="article" articles={initial}
    settings={{ projectPresets: [{ id: 'preset-default-old-way', name: 'Default' }], articleLength: '900-1200' }}
    refreshArticles={async () => {}} setActiveScreen={() => { document.body.dataset.queued = 'true'; }} /></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
