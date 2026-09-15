import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';

let batch = { id: 'test-batch', account: 'Test Recipes', createdAt: '2026-09-14T12:00:00Z', revision: 0, fileStatus: 'ready', outcomes: {},
  rows: Array.from({ length: 18 }, (_, index) => ({ number: index + 1, cells: [`Curry Pumpkin Soup with Coconut Milk ${index + 1}`, '', 'Quick Weeknight Meals'] })) };
window.electronAPI = {
  getPinterestDelivery: async () => ({ batches: [batch] }),
  suggestPinterestResults: async () => ({ updates: [{ number: 2, status: 'failed' }], ambiguous: 0 }),
  savePinterestResults: async ({ updates }) => {
    batch = { ...batch, revision: batch.revision + 1, outcomes: { ...batch.outcomes, ...Object.fromEntries(updates.map((u) => [u.number, { status: u.status }])) } };
    return batch;
  },
  revealPinterestExport: async () => ({ success: true })
};
const { default: History } = await import('/src/components/PinterestDeliveryHistory.jsx');
createRoot(document.getElementById('root')).render(<main style={{ maxWidth: 1200, margin: 'auto', padding: 16 }}><History refreshKey={0} onRetry={() => { document.body.dataset.retry = 'test-batch'; }} /></main>);
