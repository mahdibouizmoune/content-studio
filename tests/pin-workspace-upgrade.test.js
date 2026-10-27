const test = require("node:test");
const assert = require("node:assert/strict");
const { createPinWorkspace } = require("../electron/pin-workspace");
const {
  schedulePins,
  utcTime,
  canonicalArticle,
} = require("../electron/pin-scheduler");
const {
  extractPhotos,
  cropPhoto,
  inspectSvg,
  mapSvg,
} = require("../electron/pin-assets");
const {
  createPinterestApi,
  providerError,
} = require("../electron/pinterest-api");
const { createCommerce, catalogRows } = require("../electron/pin-commerce");
const {
  authorize,
  scopedSnapshot,
  createPinApiServer,
} = require("../electron/pin-api-server");
const sharp = require("sharp");
test("legacy CSV scheduling respects account minimum intervals without silently changing times", () => {
  const { schedulePinterestPins } = require("../electron/pinterest-schedule");
  const now = Date.parse("2026-10-12T08:00:00Z");
  const pins = [{ id: "one", url: "https://example.com/recipe" }];
  assert.throws(
    () => schedulePinterestPins(pins, { intervalHours: 1, intervalMinutes: 120 }, { now }),
    /account minimum/,
  );
  assert.throws(
    () => schedulePinterestPins(pins, { intervalMinutes: "invalid" }, { now }),
    /Account posting interval/,
  );
  const scheduled = schedulePinterestPins(pins, { intervalHours: 2, intervalMinutes: 120 }, { now });
  assert.equal(scheduled.length, 1);
  assert.ok(Date.parse(scheduled[0].csvPublishDate) > now);
  assert.equal(pins[0].csvPublishDate, undefined);
});
test("live Pinterest demand uses supported uppercase routes and optional authorized volume bands", async () => {
  const store = memory();
  store.set("pinterestConnections", {
    a: {
      access: "token",
      scopes: "user_accounts:read ads:read",
      expiresAt: Date.now() + 600000,
    },
  });
  const routes = [];
  const api = createPinterestApi({
    store,
    encrypt: (x) => x,
    decrypt: (x) => x,
    request: async (r) => {
      routes.push(r);
      return {
        data: r.url.includes("/metrics")
          ? {
              data: [
                { keyword: "soup", metrics: { keyword_query_volume: "1M+" } },
              ],
            }
          : {
              trends: [
                { keyword: "soup", pct_growth_mom: 12, pct_growth_yoy: 40 },
              ],
            },
      };
    },
  });
  const result = await api.research(
    { id: "a" },
    { region: "US", keywords: "soup", adAccountId: "123" },
  );
  assert.equal(result.rows[0].volumeBand, "1M+");
  assert.equal(result.rows[0].monthGrowth, 12);
  assert.match(routes[0].url, /\/US\/top\/monthly$/);
  assert.equal(routes[0].params.include_keywords, "soup");
  assert.equal(routes[1].params.country_code, "US");
});
test("OAuth refresh tokens rotate without exposing them in workspace data", async () => {
  const store = memory();
  store.set("pinterestApplication", {
    clientId: "123",
    clientSecret: "secret",
  });
  store.set("pinterestConnections", {
    a: {
      access: "old",
      refresh: "refresh",
      scopes: "boards:read",
      expiresAt: 0,
    },
  });
  let calls = 0;
  const api = createPinterestApi({
    store,
    encrypt: (x) => `enc:${x}`,
    decrypt: (x) => String(x).replace(/^enc:/, ""),
    request: async (r) => {
      calls++;
      return {
        data: r.url.endsWith("/oauth/token")
          ? { access_token: "new", refresh_token: "rotated", expires_in: 3600 }
          : { items: [] },
      };
    },
  });
  await api.list({ id: "a" }, "/boards");
  assert.equal(calls, 2);
  assert.equal(store.get("pinterestConnections").a.refresh, "enc:rotated");
  api.disconnect("a");
  assert.equal(store.get("pinterestConnections").a, undefined);
});
test("MCP uses the official SDK and respects read-only account scopes", async () => {
  const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
  const {
    StreamableHTTPClientTransport,
  } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const f = fixture(),
    api = createPinApiServer({
      store: f.store,
      snapshot: f.service.get,
      dispatch: async () => ({}),
    });
  const net = require("node:net"),
    listener = net.createServer();
  await new Promise((r) => listener.listen(0, "127.0.0.1", r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  const client = new Client({ name: "contract-test", version: "1.0.0" });
  try {
    await api.start(port);
    const t = api.createToken({ accountIds: ["a"] });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`),
      { requestInit: { headers: { Authorization: `Bearer ${t.token}` } } },
    );
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((t) => t.name === "schedule"));
    const result = await client.callTool({ name: "snapshot", arguments: {} });
    assert.equal(JSON.parse(result.content[0].text).drafts.length, 1);
    const denied = await client.callTool({
      name: "review",
      arguments: { ids: [f.pin.id], action: "approve" },
    });
    assert.equal(denied.isError, true);
  } finally {
    await client.close();
    api.stop();
  }
});
const time = Date.parse("2026-10-12T08:00:00Z");
function memory() {
  const data = new Map();
  return {
    get: (k, f) => (data.has(k) ? structuredClone(data.get(k)) : f),
    set: (k, v) => data.set(k, structuredClone(v)),
  };
}
function fixture(provider = {}) {
  const store = memory();
  let clock = time,
    calls = 0;
  const service = createPinWorkspace({
    store,
    now: () => clock,
    provider: {
      publish: async () => {
        calls++;
        return { id: "123456" };
      },
      ...provider,
    },
  });
  const data = service.get();
  data.accounts = [
    {
      id: "a",
      username: "owner",
      connected: true,
      accessTier: "standard",
      boards: [
        { id: "1", name: "Food", sections: [{ id: "2", name: "Soup" }] },
      ],
      schedule: {
        timezone: "UTC",
        dailyLimit: 10,
        intervalMinutes: 60,
        windows: [{ start: "00:00", end: "23:59" }],
      },
    },
  ];
  data.assets = [
    { id: "img", kind: "image", sha256: "hash", provenance: "original" },
  ];
  service.save(data);
  const pin = service.writeDraft({
    accountId: "a",
    title: "Soup",
    description: "A real soup recipe.",
    destination: "https://example.com/soup?utm_source=pinterest",
    altText: "Bowl of soup",
    assetId: "img",
    boardId: "1",
    sectionId: "2",
  });
  return {
    store,
    service,
    pin,
    setTime: (t) => (clock = t),
    calls: () => calls,
  };
}
test("publishing requires current version approval and board/section IDs", () => {
  const { service, pin } = fixture();
  assert.throws(
    () => service.schedule({ ids: [pin.id], accountId: "a" }),
    /approval/,
  );
  assert.throws(
    () =>
      service.review({
        ids: [pin.id],
        action: "approve",
        expectedVersions: { [pin.id]: 2 },
      }),
    /changed/,
  );
  service.review({
    ids: [pin.id],
    action: "approve",
    expectedVersions: { [pin.id]: 1 },
  });
  const changed = service.writeDraft({ id: pin.id, title: "New title" });
  assert.equal(changed.state, "awaiting_review");
  assert.equal(changed.approval, null);
  service.writeDraft({ id: pin.id, sectionId: "999" });
  assert.throws(
    () => service.review({ ids: [pin.id], action: "approve" }),
    /section/,
  );
});
test("artwork replacement preserves copy and destination but invalidates approval", () => {
  const { service, pin } = fixture();
  service.review({ ids: [pin.id], action: "approve" });
  const changed = service.writeDraft({ id: pin.id, assetId: "replacement" });
  assert.equal(changed.title, pin.title);
  assert.equal(changed.destination, pin.destination);
  assert.equal(changed.state, "awaiting_review");
  assert.equal(changed.version, 2);
});
test("approved publication is persistent and tick cannot duplicate it", async () => {
  const { service, pin, setTime, calls } = fixture();
  service.review({ ids: [pin.id], action: "approve" });
  service.schedule({
    ids: [pin.id],
    accountId: "a",
    startAt: "2026-10-12T09:00:00Z",
  });
  service.setEnabled(true);
  setTime(time + 3600000);
  await service.tick();
  await service.tick();
  assert.equal(calls(), 1);
  assert.equal(service.get().history[0].remotePinId, "123456");
  assert.equal(service.get().drafts[0].state, "published");
});
test("network ambiguity blocks retries and requires exact reconciliation", async () => {
  const { service, pin, setTime } = fixture({
    publish: async () => {
      throw Object.assign(new Error("lost response"), { ambiguous: true });
    },
    reconcile: async () => null,
  });
  service.review({ ids: [pin.id], action: "approve" });
  service.schedule({
    ids: [pin.id],
    accountId: "a",
    startAt: "2026-10-12T09:00:00Z",
  });
  service.setEnabled(true);
  setTime(time + 3600000);
  await service.tick();
  const j = service.get().jobs[0];
  assert.equal(j.status, "reconciling");
  await service.tick();
  assert.equal(service.get().jobs[0].attempts, 1);
  assert.equal((await service.reconcile({ jobId: j.id })).resolved, false);
  assert.throws(
    () => service.review({ ids: [pin.id], action: "recover" }),
    /unresolved/,
  );
});
test("rate limits back off without creating a duplicate publication", async () => {
  let n = 0;
  const f = fixture({
    publish: async () => {
      if (++n === 1)
        throw Object.assign(new Error("rate limit"), {
          status: 429,
          retryAfterMs: 120000,
        });
      return { id: "999" };
    },
  });
  f.service.review({ ids: [f.pin.id], action: "approve" });
  f.service.schedule({
    ids: [f.pin.id],
    accountId: "a",
    startAt: "2026-10-12T09:00:00Z",
  });
  f.service.setEnabled(true);
  f.setTime(time + 3600000);
  await f.service.tick();
  assert.equal(f.service.get().jobs[0].status, "retry_wait");
  f.setTime(time + 3900000);
  await f.service.tick();
  await f.service.tick();
  assert.equal(n, 2);
  assert.equal(f.service.get().history[0].remotePinId, "999");
});
test("restart converts publishing lease to reconciliation, not a repost", () => {
  const { service, pin } = fixture(),
    d = service.get();
  d.jobs = [{ id: "job", draftId: pin.id, status: "publishing" }];
  service.save(d);
  service.recover();
  assert.equal(service.get().jobs[0].status, "reconciling");
});
test("canonical URLs ignore tracking but preserve product identity query", () => {
  assert.equal(
    canonicalArticle("https://x.example/a?utm_source=pin&product=1#top"),
    "https://x.example/a?product=1",
  );
  assert.notEqual(
    canonicalArticle("https://x.example/?product=1"),
    canonicalArticle("https://x.example/?product=2"),
  );
});
test("account-wide daily limits include prior batches, locked times survive random shuffle", () => {
  const pins = [
    {
      id: "1",
      accountId: "a",
      destination: "https://x.example/a",
      lockedTime: true,
      scheduledAt: "2026-10-12T10:00:00Z",
    },
    { id: "2", accountId: "a", destination: "https://x.example/b" },
  ];
  const occupied = [
    {
      id: "old",
      accountId: "a",
      state: "scheduled",
      scheduledAt: "2026-10-12T09:00:00Z",
    },
  ];
  const result = schedulePins(
    pins,
    {
      dailyLimit: 2,
      intervalMinutes: 60,
      windows: [{ start: "08:00", end: "22:00" }],
    },
    { occupied, now: time, mode: "random" },
  );
  assert.equal(
    result.find((p) => p.id === "1").scheduledAt,
    "2026-10-12T10:00:00Z",
  );
  assert.match(result.find((p) => p.id === "2").scheduledAt, /2026-10-13/);
});
test("daylight saving rejects ambiguous and missing local times, handles explicit offsets", () => {
  assert.throws(() => utcTime("2026-11-01T01:30", "America/New_York"));
  assert.throws(() => utcTime("2026-03-08T02:30", "America/New_York"));
  assert.equal(
    utcTime("2026-11-01T01:30-04:00", "America/New_York"),
    "2026-11-01T05:30:00Z",
  );
  if (require('../electron/timezone-data').hasCurrentMoroccoRules()) {
    assert.equal(utcTime('2026-10-12T10:00', 'Africa/Casablanca'), '2026-10-12T10:00:00Z');
  } else {
    assert.throws(() => utcTime('2026-10-12T10:00', 'Africa/Casablanca'), /outdated Morocco timezone rules/);
  }
  assert.equal(utcTime('2026-10-12T10:00Z', 'Africa/Casablanca'), '2026-10-12T10:00:00Z');
  assert.equal(utcTime('2025-10-12T10:00', 'Africa/Casablanca'), '2025-10-12T09:00:00Z');
});
test("overdue queue honors minimum interval rather than burst publishing", async () => {
  const f = fixture();
  const p2 = f.service.writeDraft({
    ...f.pin,
    id: undefined,
    title: "Different soup",
    destination: "https://example.com/soup2",
  });
  f.service.review({ ids: [f.pin.id, p2.id], action: "approve" });
  f.service.schedule({
    ids: [f.pin.id, p2.id],
    accountId: "a",
    startAt: "2026-10-12T09:00:00Z",
  });
  f.service.setEnabled(true);
  f.setTime(time + 4 * 3600000);
  await f.service.tick();
  assert.equal(f.calls(), 1);
  assert.equal(
    f.service.get().jobs.filter((j) => j.status === "retry_wait").length,
    1,
  );
});
test("bulk tracking edits preserve pre-existing campaign parameters and undo requires review", () => {
  const f = fixture();
  f.service.review({ ids: [f.pin.id], action: "approve" });
  f.service.bulkEdit({
    ids: [f.pin.id],
    prefix: "Fresh: ",
    tracking: { utm_campaign: "fall", affiliate: "12" },
  });
  const p = f.service.get().drafts[0],
    u = new URL(p.destination);
  assert.equal(u.searchParams.get("utm_source"), "pinterest");
  assert.equal(u.searchParams.get("affiliate"), "12");
  assert.equal(p.approval, null);
  f.service.undo({ id: f.service.get().undo[0].id });
  assert.equal(f.service.get().drafts[0].description, f.pin.description);
  assert.equal(f.service.get().drafts[0].approval, null);
});
test("live research unavailable remains honest and does not erase simultaneous edits", async () => {
  let finish;
  const f = fixture({
    research: () => new Promise((resolve) => (finish = resolve)),
  });
  const running = f.service.research({ accountId: "a", region: "US" });
  f.service.writeDraft({ id: f.pin.id, title: "Saved during fetch" });
  finish({
    available: true,
    rows: [
      {
        keyword: "soup",
        volumeBand: null,
        monthGrowth: null,
        yearGrowth: null,
      },
    ],
  });
  await running;
  assert.equal(f.service.get().drafts[0].title, "Saved during fetch");
  assert.equal(f.service.get().research[0].rows[0].volumeBand, null);
  const broken = fixture({
    research: async () => {
      throw new Error("denied");
    },
  });
  const result = await broken.service.research({ accountId: "a" });
  assert.equal(result.available, false);
  assert.deepEqual(result.rows, []);
});
test("page-image extraction handles relative lazy URLs and main-content/exclusion selectors", () => {
  const photos = extractPhotos(
    '<header><img src="/logo.png"></header><article><img data-src="../photo.jpg" alt="Soup"><img src="https://x.example/avatar.png"><img src="https://x.example/small.jpg" width="20" height="20"></article>',
    "https://x.example/recipes/soup",
  );
  assert.equal(photos.length, 1);
  assert.equal(photos[0].url, "https://x.example/photo.jpg");
  assert.equal(photos[0].provenance, "original");
  assert.throws(() =>
    extractPhotos('<img src="/a.jpg">', "https://x.example", { selector: "[" }),
  );
});
test("cover and contain produce stable Pinterest dimensions with bounded focal crops", async () => {
  const bytes = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  for (const fit of ["cover", "contain"]) {
    const output = await cropPhoto(sharp, bytes, {
      ratio: "9:16",
      fit,
      focalX: 1,
      focalY: 0,
    });
    const m = await sharp(output).metadata();
    assert.equal(m.width, 1080);
    assert.equal(m.height, 1920);
  }
});
test("Canva SVG mappings preserve layout and reject active/external resources", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><text id="headline" x="10" y="40">Soup</text></svg>';
  assert.equal(inspectSvg(svg).fields[0].id, "headline");
  const mapped = mapSvg(svg, { headline: "Warm <Soup>" });
  assert.match(mapped, /Warm &lt;Soup&gt;/);
  assert.match(mapped, /x="10"/);
  for (const bad of [
    "<script/>",
    '<image href="//evil.test/a.png"/>',
    '<image href="&#x66;ile:///secret"/>',
    "<foreignObject/>",
  ])
    assert.throws(() => inspectSvg(`<svg>${bad}</svg>`));
  assert.throws(() => inspectSvg('<!DOCTYPE svg [<!ENTITY x "xx">]><svg/>'));
});
test("catalog feed validates required fields and reports rejected products", () => {
  const feed = catalogRows([
    {
      id: "1",
      title: "Pan",
      description: "Steel pan",
      destination: "https://x.example/pan",
      photos: ["https://x.example/pan.jpg"],
      price: 20,
      currency: "USD",
      availability: "in stock",
    },
    { id: "2", title: "Broken" },
  ]);
  assert.equal(feed.accepted.length, 1);
  assert.equal(feed.rejected.length, 1);
  assert.match(feed.csv, /20 USD/);
  assert.doesNotMatch(feed.csv, /Broken/);
});
test("failed store sync preserves existing products and exposes credential-free error", async () => {
  const f = fixture(),
    commerce = createCommerce({
      workspace: f.service,
      store: f.store,
      encrypt: (x) => `enc:${x}`,
      decrypt: (x) => x.slice(4),
      request: async () => {
        throw Object.assign(new Error("SECRET-TOKEN"), {
          response: { status: 401 },
        });
      },
    });
  const s = commerce.configure({
    provider: "shopify",
    name: "Store",
    origin: "https://store.myshopify.com",
    token: "SECRET-TOKEN",
  });
  const d = f.service.get();
  d.products = [{ id: "old", storeId: s.id, title: "Old product" }];
  f.service.save(d);
  await assert.rejects(commerce.sync({ storeId: s.id }), /permissions/);
  assert.equal(f.service.get().products.length, 1);
  assert.doesNotMatch(JSON.stringify(f.service.get()), /SECRET-TOKEN/);
});
test("API scopes block other accounts, review bypasses, picker imports and patch-account swaps", () => {
  const f = fixture(),
    s = f.service.get(),
    token = { workspaceId: "local", accountIds: ["a"], write: true };
  assert.throws(
    () => authorize(s, token, "configurePinterest", {}),
    /unavailable/,
  );
  assert.throws(
    () => authorize(s, token, "schedule", { accountId: "b", ids: [f.pin.id] }),
    /denied/,
  );
  assert.throws(
    () =>
      authorize(s, token, "bulkEdit", {
        ids: [f.pin.id],
        patch: { accountId: "b" },
      }),
    /denied/,
  );
  assert.throws(
    () => authorize(s, token, "importAsset", { accountId: "a" }),
    /picker/,
  );
  assert.throws(
    () =>
      authorize(s, { ...token, write: false }, "review", { ids: [f.pin.id] }),
    /Read-only/,
  );
  const scoped = scopedSnapshot(s, { ...token, accountIds: [] });
  assert.equal(scoped.drafts.length, 0);
  assert.equal(scoped.accounts.length, 0);
});
test("Pinterest payload uses exact board IDs, AI disclosure and authenticated original bytes", async () => {
  const store = memory();
  store.set("pinterestConnections", {
    a: {
      access: "token",
      scopes: "pins:write",
      expiresAt: Date.now() + 600000,
    },
  });
  let sent;
  const api = createPinterestApi({
    store,
    encrypt: (x) => x,
    decrypt: (x) => x,
    request: async (r) => {
      sent = r;
      return { data: { id: "123" } };
    },
    assetBytes: async () => Buffer.from("jpeg"),
  });
  await api.publish(
    { id: "a", accessTier: "standard" },
    {
      title: "Soup",
      description: "Soup recipe",
      altText: "Soup",
      destination: "https://x.example/soup",
      boardId: "1",
      sectionId: "2",
      aiDisclosure: true,
    },
    { kind: "image", mime: "image/jpeg" },
    {},
    () => {},
  );
  assert.equal(sent.data.board_section_id, "2");
  assert.equal(sent.data.ai_disclosures.values[0], "AI_MODIFIED");
  assert.equal(sent.data.media_source.source_type, "image_base64");
  assert.equal(sent.headers.Authorization, "Bearer token");
});
test("video resumes processing with saved media ID and never posts before succeeded", async () => {
  const store = memory();
  store.set("pinterestConnections", {
    a: {
      access: "token",
      scopes: "pins:write",
      expiresAt: Date.now() + 600000,
    },
  });
  const routes = [];
  const api = createPinterestApi({
    store,
    encrypt: (x) => x,
    decrypt: (x) => x,
    request: async (r) => {
      routes.push(r.url);
      return { data: { status: "processing" } };
    },
    assetBytes: async () => Buffer.from("video"),
  });
  await assert.rejects(
    api.publish(
      { id: "a", accessTier: "standard" },
      {},
      { kind: "video" },
      { mediaId: "77" },
      () => {},
    ),
    /processing/,
  );
  assert.deepEqual(routes, ["https://api.pinterest.com/v5/media/77"]);
});
test("5xx Pin creation response is ambiguous but rate-limit rejection is safe to back off", () => {
  assert.equal(
    providerError({ response: { status: 503 } }, true).ambiguous,
    true,
  );
  assert.equal(
    providerError(
      { response: { status: 429, headers: { "retry-after": "120" } } },
      true,
    ).ambiguous,
    false,
  );
  assert.equal(
    providerError({
      response: { status: 429, headers: { "retry-after": "120" } },
    }).retryAfterMs,
    120000,
  );
});
test("REST requires scoped bearer token and rejects browser origins", async () => {
  const f = fixture(),
    api = createPinApiServer({
      store: f.store,
      snapshot: f.service.get,
      dispatch: async () => ({}),
    });
  // Choose an available port without mutating live app configuration.
  const net = require("node:net"),
    listener = net.createServer();
  await new Promise((r) => listener.listen(0, "127.0.0.1", r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  try {
    await api.start(port);
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}/v1/workspace`)).status,
      401,
    );
    const t = api.createToken({ accountIds: ["a"] });
    const response = await fetch(`http://127.0.0.1:${port}/v1/workspace`, {
      headers: { Authorization: `Bearer ${t.token}` },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).drafts.length, 1);
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port}/v1/workspace`, {
          headers: {
            Authorization: `Bearer ${t.token}`,
            Origin: "https://evil.example",
          },
        })
      ).status,
      403,
    );
    api.revoke(t.id);
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port}/v1/workspace`, {
          headers: { Authorization: `Bearer ${t.token}` },
        })
      ).status,
      401,
    );
  } finally {
    api.stop();
  }
});
test("restored API accounts sync boards once per session instead of on every tick", async () => {
  const store = memory();
  let clock = time, syncs = 0;
  const account = { id: "pinterest:a", username: "owner", connected: true, accessTier: "standard",
    boards: [{ id: "1", name: "Food", sections: [] }],
    schedule: { timezone: "UTC", dailyLimit: 10, intervalMinutes: 60, windows: [{ start: "00:00", end: "23:59" }] } };
  const first = createPinWorkspace({ store, now: () => clock, provider: {} });
  const data = first.get();
  data.accounts = [account];
  data.assets = [{ id: "img", kind: "image", sha256: "hash", provenance: "original" }];
  first.save(data);
  const pin = first.writeDraft({ accountId: account.id, title: "Soup", description: "A real soup recipe.", destination: "https://example.com/soup", altText: "Soup", assetId: "img", boardId: "1" });
  first.review({ ids: [pin.id], action: "approve" });
  first.schedule({ ids: [pin.id], accountId: account.id, startAt: "2026-10-12T09:00:00Z" });
  // A restart drops session-only boards; the account now returns no boards.
  const restarted = createPinWorkspace({ store, now: () => clock, provider: {
    syncBoards: async () => { syncs++; return { boards: [], sampled: false, syncedAt: new Date(clock).toISOString() }; },
    publish: async () => assert.fail("must not publish without a synchronized board"),
  } });
  assert.equal(restarted.get().accounts[0].boards, undefined);
  restarted.setEnabled(true);
  clock = time + 3600000;
  await restarted.tick();
  await restarted.tick();
  await restarted.tick();
  assert.equal(syncs, 1);
  assert.match(restarted.get().jobs[0].error, /synchronized board/);
});
