async function createUiTestServer(options) {
  const port = Number(process.env.CONTENT_STUDIO_UI_TEST_PORT);
  if (process.env.CONTENT_STUDIO_UI_TEST_PORT) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local UI test port.');
    return { listen: async () => {}, close: async () => {}, httpServer: { address: () => ({ port }) } };
  }
  const { createServer } = await import('vite');
  return createServer(options);
}
module.exports = { createUiTestServer };
