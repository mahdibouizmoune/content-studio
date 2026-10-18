import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import QualityStudio from '@/components/QualityStudio';
import JobCenter from '@/components/JobCenter';
window.electronAPI.qualityWorkspace = (action, params) => window.qualityFixtureCall(action, params);
window.electronAPI.getJobCenter = () => window.qualityFixtureCall('jobs');
createRoot(document.getElementById('root')).render(<main className="p-4"><QualityStudio /><hr className="my-8" /><JobCenter setActiveScreen={() => {}} /></main>);
