const assert = require("node:assert/strict");
const path = require("node:path");
const { createPinWorkspace } = require("../electron/pin-workspace");
async function main() {
  const { chromium } = require(
    process.env.PLAYWRIGHT_MODULE_PATH || "playwright",
  );
  const { createServer } = await import("vite");
  const server = await createServer({
    server: { host: "127.0.0.1", port: 0 },
    optimizeDeps: { entries: ["tests/fixtures/pin-workspace-ui.html"] },
    logLevel: "error",
  });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  });
  try {
    for (const [name, viewport] of [
      ["desktop", { width: 1400, height: 1000 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      let stored;
      const workspace = createPinWorkspace({
        store: {
          get: (_k, f) => (stored ? structuredClone(stored) : f),
          set: (_k, v) => (stored = structuredClone(v)),
        },
        provider: {},
      });
      const data = workspace.get();
      data.accounts = [
        {
          id: "csv:sample",
          username: "Test CSV Profile",
          csvOnly: true,
          boards: [{ id: "1", name: "Recipes", sections: [] }],
        },
      ];
      data.assets = [
        {
          id: "photo",
          kind: "image",
          provenance: "original",
          label: "Test artwork",
          width: 1080,
          height: 1920,
          sha256: "test",
          displayUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGQAAAABJRU5ErkJggg==",
        },
      ];
      workspace.save(data);
      workspace.writeDraft({
        title: "Lemon Chickpea Soup",
        description: "A helpful recipe preview.",
        destination: "https://example.com/soup",
        altText: "Chickpea soup in a bowl",
        accountId: "csv:sample",
        boardId: "1",
        assetId: "photo",
      });
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", (e) => {
        errors.push(e.message);
        console.error("Page error:", e.message);
      });
      await page.exposeFunction("pinCommand", async (action, p) => {
        try {
          return {
            success: true,
            result:
              action === "snapshot" ? workspace.get() : workspace[action](p),
          };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });
      await page.addInitScript(() => {
        window.electronAPI = {
          pinWorkspace: (a, p) => window.pinCommand(a, p),
        };
      });
      await page.goto(`${base}/tests/fixtures/pin-workspace-ui.html`, {
        waitUntil: "commit",
        timeout: 60000,
      });
      await page
        .getByRole("heading", { name: "Pinterest Workspace" })
        .waitFor({ timeout: 60000 });
      await page
        .getByRole("button", { name: "Approve", exact: true })
        .last()
        .click();
      await page.getByText("approved / v1", { exact: true }).waitFor();
      for (const tab of [
        "Review",
        "Schedule",
        "Artwork",
        "Accounts",
        "Research",
        "Stores",
        "API",
      ]) {
        await page
          .getByRole("navigation", { name: "Pinterest workspace views" })
          .getByRole("button", { name: tab, exact: true })
          .click();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 2,
          ),
          false,
          `${name} ${tab} overflow`,
        );
        await page.screenshot({
          path: path.resolve(
            `artifacts/pin-workspace-${tab.toLowerCase()}-${name}.png`,
          ),
          fullPage: true,
        });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(
      "Pin workspace UI passed: real review service, all seven views, desktop/mobile layouts, no page exceptions.",
    );
  } finally {
    await browser.close();
    await server.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
