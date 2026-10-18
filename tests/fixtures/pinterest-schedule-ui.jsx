import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
window.electronAPI = Object.fromEntries([
  'getPinCreatorPins', 'getPinQueue', 'savePinCreatorPins', 'getPinterestDelivery',
  'preparePinterestExport', 'validatePinterestExport',
].map((action) => [action, (params) => window.csvFixtureCall(action, params)]));
const { default: PinCreatorView } = await import('/src/components/PinCreatorView.jsx');
const { ConfirmDialogProvider } = await import('/src/components/ConfirmDialog.jsx');
createRoot(document.getElementById('root')).render(<ConfirmDialogProvider><main className="mx-auto max-w-7xl p-4"><PinCreatorView settings={{ boardNames: ['Recipes'], performanceSchedulingEnabled: false }} /></main></ConfirmDialogProvider>);
