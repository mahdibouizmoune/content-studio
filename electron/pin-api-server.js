"use strict";
const http = require("node:http");
const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const TOOLS = [
  "snapshot",
  "writeDraft",
  "review",
  "bulkEdit",
  "undo",
  "schedule",
  "reconcile",
  "research",
  "audit",
  "addSource",
  "extractPhotos",
  "replaceArtwork",
  "importAsset",
  "rewriteCopy",
  "clearTimes",
  "unlockTimes",
];
function tokenHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function authorize(snapshot, token, action, payload) {
  if (token.workspaceId !== "local")
    throw new Error("Workspace access denied.");
  if (!TOOLS.includes(action))
    throw new Error("Operation unavailable through external interfaces.");
  if (action !== "snapshot" && !token.write)
    throw new Error("Read-only token.");
  const ids = [
    payload.accountId,
    payload.patch?.accountId,
    ...(payload.ids || []).map(
      (id) => snapshot.drafts.find((p) => p.id === id)?.accountId,
    ),
    payload.id && snapshot.drafts.find((p) => p.id === payload.id)?.accountId,
    payload.jobId &&
      snapshot.jobs.find((p) => p.id === payload.jobId)?.accountId,
  ].filter(Boolean);
  if (ids.some((id) => !token.accountIds.includes(id)))
    throw new Error("Account access denied.");
  if (action !== "snapshot" && action !== "undo" && !ids.length)
    throw new Error("An authorized account is required.");
  if (action === "importAsset" && !payload.dataBase64 && !payload.url)
    throw new Error(
      "External imports require public URL or base64 data, not a desktop picker.",
    );
  for (const assetId of [payload.assetId,payload.patch?.assetId].filter(Boolean)) if (
    !snapshot.assets.some(
      (a) =>
        a.id === assetId &&
        (token.accountIds.includes(a.accountId) ||
          snapshot.drafts.some(
            (d) => d.assetId === a.id && token.accountIds.includes(d.accountId),
          )),
    )
  )
    throw new Error("Asset access denied.");
  if (action === "undo") {
    const undo = snapshot.undo.find((u) => u.id === payload.id);
    if (
      !undo ||
      undo.drafts.some((d) => !token.accountIds.includes(d.accountId))
    )
      throw new Error("Undo account access denied.");
  }
}
function scopedSnapshot(s, token) {
  const ids = new Set(token.accountIds);
  const drafts = s.drafts.filter((d) => ids.has(d.accountId));
  const assetIds = new Set(drafts.map((d) => d.assetId));
  return {
    schemaVersion: s.schemaVersion,
    accounts: s.accounts.filter((a) => ids.has(a.id)),
    drafts,
    assets: s.assets
      .filter((a) => assetIds.has(a.id))
      .map(({ localPath: _localPath, ...a }) => a),
    jobs: s.jobs.filter((j) => ids.has(j.accountId)),
    history: s.history
      .filter((h) => ids.has(h.accountId))
      .map(({ artwork, ...h }) => ({
        ...h,
        artwork: artwork
          ? { id: artwork.id, displayUrl: artwork.displayUrl }
          : null,
      })),
    research: s.research.filter((r) => ids.has(r.accountId)),
    audits: s.audits.filter((r) => ids.has(r.accountId)),
    sources: s.sources.filter((r) => ids.has(r.accountId)),
  };
}
function createPinApiServer({ store, snapshot, dispatch }) {
  let server = null;
  function createToken({
    accountIds = [],
    write = false,
    label = "API client",
  }) {
    const known = new Set(snapshot().accounts.map((a) => a.id));
    if (accountIds.some((id) => !known.has(id)))
      throw new Error("Unknown token account scope.");
    const secret = randomBytes(32).toString("base64url"),
      id = randomBytes(16).toString("hex");
    const record = {
      id,
      label: String(label).slice(0, 100),
      hash: tokenHash(secret),
      workspaceId: "local",
      accountIds,
      write: write === true,
      createdAt: new Date().toISOString(),
    };
    store.set("pinApiTokens", [record, ...store.get("pinApiTokens", [])]);
    return { id, token: secret };
  }
  function revoke(id) {
    store.set(
      "pinApiTokens",
      store.get("pinApiTokens", []).filter((t) => t.id !== id),
    );
  }
  function status() {
    return {
      running: !!server,
      address: server ? `http://127.0.0.1:${server.address().port}` : "",
      tokens: store.get("pinApiTokens", []).map(({ hash: _hash, ...t }) => t),
    };
  }
  async function invoke(token, action, payload) {
    authorize(snapshot(), token, action, payload);
    if (action === "snapshot") return scopedSnapshot(snapshot(), token);
    const result = await dispatch(action, {
      ...payload,
      actor: `API client: ${token.label}`,
    });
    const safeResult = [
      "review",
      "bulkEdit",
      "undo",
      "schedule",
      "clearTimes",
      "unlockTimes",
    ].includes(action)
      ? scopedSnapshot(snapshot(), token)
      : JSON.parse(
          JSON.stringify(result, (key, value) =>
            [
              "localPath",
              "clientSecret",
              "access",
              "refresh",
              "token",
              "secret",
            ].includes(key)
              ? undefined
              : value,
          ),
        );
    return { result: safeResult, workspace: scopedSnapshot(snapshot(), token) };
  }
  async function start(port = 8787) {
    if (server) throw new Error("API server already running.");
    if (
      !Number.isInteger(Number(port)) ||
      Number(port) < 1024 ||
      Number(port) > 65535
    )
      throw new Error("API port must be 1024 to 65535.");
    const pending = new Set();
    server = http.createServer(async (req, res) => {
      try {
        if (pending.size >= 20) {
          res.writeHead(429).end();
          return;
        }
        const host = req.headers.host || "";
        if (
          ![`127.0.0.1:${port}`, `localhost:${port}`].includes(host) ||
          req.headers.origin
        ) {
          res.writeHead(403).end();
          return;
        }
        const secret = String(req.headers.authorization || "").replace(
          /^Bearer /,
          "",
        );
        const hash = tokenHash(secret);
        const token = store
          .get("pinApiTokens", [])
          .find(
            (t) =>
              t.hash.length === hash.length &&
              timingSafeEqual(Buffer.from(t.hash), Buffer.from(hash)),
          );
        if (!token) {
          res.writeHead(401).end();
          return;
        }
        pending.add(req);
        let size = 0,
          chunks = [];
        for await (const part of req) {
          size += part.length;
          if (size > 2 * 1024 * 1024) throw new Error("Request exceeds 2 MB.");
          chunks.push(part);
        }
        const body = chunks.length
          ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
          : {};
        if (req.url === "/mcp" && req.method === "POST") {
          const mcp = new Server(
            { name: "content-studio", version: "1.0.0" },
            { capabilities: { tools: {} } },
          );
          mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: TOOLS.map((name) => ({
              name,
              description: `Content Studio ${name}. Approval and account rules apply.`,
              inputSchema: { type: "object", additionalProperties: true },
            })),
          }));
          mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
              const result = await invoke(
                token,
                request.params.name,
                request.params.arguments || {},
              );
              return {
                content: [{ type: "text", text: JSON.stringify(result) }],
              };
            } catch (e) {
              return {
                isError: true,
                content: [{ type: "text", text: e.publicMessage || e.message }],
              };
            }
          });
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
          });
          res.once("close", () => {
            transport.close();
            mcp.close();
          });
          await mcp.connect(transport);
          await transport.handleRequest(req, res, body);
        } else if (req.url === "/v1/workspace" && req.method === "GET") {
          res
            .writeHead(200, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            })
            .end(JSON.stringify(await invoke(token, "snapshot", {})));
        } else if (
          req.url?.startsWith("/v1/actions/") &&
          req.method === "POST"
        ) {
          const action = req.url.slice("/v1/actions/".length);
          const result = await invoke(token, action, body);
          res
            .writeHead(200, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            })
            .end(JSON.stringify({ success: true, result }));
        } else res.writeHead(404).end();
      } catch (e) {
        if (!res.headersSent)
          res
            .writeHead(400, { "Content-Type": "application/json" })
            .end(
              JSON.stringify({
                success: false,
                error: e.publicMessage || e.message,
              }),
            );
      } finally {
        pending.delete(req);
      }
    });
    server.requestTimeout = 60000;
    server.headersTimeout = 10000;
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(Number(port), "127.0.0.1", resolve);
      });
    } catch (e) {
      server = null;
      throw e;
    }
    return status();
  }
  function stop() {
    server?.closeAllConnections();
    server?.close();
    server = null;
    return status();
  }
  return { createToken, revoke, start, stop, status };
}
module.exports = { createPinApiServer, authorize, scopedSnapshot, tokenHash };
