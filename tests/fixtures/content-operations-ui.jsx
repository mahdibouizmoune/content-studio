import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import ContentOperations from '@/components/ContentOperations';
import PinterestDeliveryHistory from '@/components/PinterestDeliveryHistory';
window.electronAPI.qualityWorkspace = (action, params) => window.contentFixtureCall(action, params);
for (const action of ['getPinterestDelivery', 'savePinterestReceiptDraft', 'importPinterestReceipt', 'suggestPinterestResults', 'savePinterestResults', 'revealPinterestExport']) window.electronAPI[action] = params => window.deliveryFixtureCall(action, params);
createRoot(document.getElementById('root')).render(<main className="p-4"><ContentOperations setActiveScreen={screen => { window.testNavigation = screen; }} refreshArticles={async () => {}} /><div data-testid="delivery" className="mt-10"><PinterestDeliveryHistory onRetry={id => { window.testRetry = id; }} /></div></main>);
