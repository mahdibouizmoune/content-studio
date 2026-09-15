import { createRequire } from 'node:module';
const base = createRequire(import.meta.url)('../../vite.config.js');
export default { ...base, optimizeDeps: { entries: ['tests/fixtures/pinterest-delivery-ui.html'] } };
