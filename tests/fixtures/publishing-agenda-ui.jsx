import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
window.electronAPI = {
  getGrowthWorkspace: () => window.agendaFixture(),
  getPerformanceIntelligence: async () => ({ snapshot: null })
};
const { default: GrowthWorkspace } = await import('@/components/GrowthWorkspace');
createRoot(document.getElementById('root')).render(<main className="p-4"><GrowthWorkspace view="calendar" settings={{ featureFlags: { contentCalendar: true } }} articles={[{ id: 'a', title: 'Lemon Rice' }]} /></main>);
