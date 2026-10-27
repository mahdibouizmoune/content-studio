"use strict";
const { randomBytes, timingSafeEqual } = require("node:crypto");
const http = require("node:http");
const { publicUrl } = require("./pin-assets");
const API = "https://api.pinterest.com/v5";
function providerError(error, ambiguous = false) {
  const status = Number(error.response?.status || error.status || 0);
  const e = new Error(
    status
      ? `Pinterest request failed (${status}). Check account access and provider status.`
      : "Pinterest network request failed.",
  );
  e.status = status;
  e.publicMessage = e.message;
  e.ambiguous = ambiguous && (status >= 500 || status === 0);
  const retry = error.response?.headers?.["retry-after"];
  e.retryAfterMs = /^\d+$/.test(String(retry))
    ? Number(retry) * 1000
    : Math.max(0, Date.parse(retry) - Date.now()) || 0;
  e.transient = status === 429 || status >= 500 || !status;
  return e;
}
function createPinterestApi({
  store,
  encrypt,
  decrypt,
  request,
  openExternal,
  assetBytes,
  verifyArtwork,
}) {
  const refreshes = new Map();
  const credentials = (id) => store.get("pinterestConnections", {})[id] || {};
  function setCredentials(id, value) {
    store.set("pinterestConnections", {
      ...store.get("pinterestConnections", {}),
      [id]: value,
    });
  }
  function config() {
    return store.get("pinterestApplication", {});
  }
  function configure({
    clientId,
    clientSecret,
    redirectUri = "http://127.0.0.1:8786/pinterest/callback",
    accessTier = "trial",
  }) {
    const u = new URL(redirectUri);
    if (
      u.protocol !== "http:" ||
      u.hostname !== "127.0.0.1" ||
      !u.port ||
      u.pathname !== "/pinterest/callback" ||
      u.search ||
      u.hash ||
      Number(u.port) < 1024
    )
      throw new Error(
        "Use http://127.0.0.1:PORT/pinterest/callback as the registered desktop redirect.",
      );
    if (!/^\d+$/.test(String(clientId)))
      throw new Error("Pinterest app ID must be numeric.");
    const existing = config();
    if (
      existing.clientId &&
      existing.clientId !== String(clientId) &&
      Object.keys(store.get("pinterestConnections", {})).length
    )
      throw new Error("Disconnect accounts before changing the Pinterest app.");
    store.set("pinterestApplication", {
      clientId: String(clientId),
      clientSecret: clientSecret
        ? encrypt(clientSecret)
        : existing.clientSecret || "",
      redirectUri,
      accessTier: accessTier === "standard" ? "standard" : "trial",
    });
    return {
      clientId: String(clientId),
      redirectUri,
      accessTier,
      secretConfigured: !!store.get("pinterestApplication").clientSecret,
    };
  }
  async function tokenRequest(body) {
    const c = config();
    if (!c.clientId || !decrypt(c.clientSecret))
      throw new Error("Configure Pinterest app credentials first.");
    try {
      return (
        await request({
          url: `${API}/oauth/token`,
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${c.clientId}:${decrypt(c.clientSecret)}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          data: new URLSearchParams({
            continuous_refresh: "true",
            ...body,
          }).toString(),
        })
      ).data;
    } catch (e) {
      throw providerError(e);
    }
  }
  function storeTokens(id, tokens, old = {}) {
    if (!tokens.access_token)
      throw new Error("Pinterest did not return an access token.");
    setCredentials(id, {
      access: encrypt(tokens.access_token),
      refresh: tokens.refresh_token
        ? encrypt(tokens.refresh_token)
        : old.refresh || "",
      expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
      scopes: String(tokens.scope || old.scopes || ""),
    });
  }
  async function access(id) {
    const c = credentials(id);
    if (!c.access) throw new Error("Reconnect the Pinterest account.");
    if (c.expiresAt > Date.now() + 60000) return decrypt(c.access);
    if (!refreshes.has(id))
      refreshes.set(
        id,
        (async () => {
          const tokens = await tokenRequest({
            grant_type: "refresh_token",
            refresh_token: decrypt(c.refresh),
          });
          if (!credentials(id).access)
            throw new Error("Account disconnected during refresh.");
          storeTokens(id, tokens, c);
          return tokens.access_token;
        })().finally(() => refreshes.delete(id)),
      );
    return refreshes.get(id);
  }
  async function api(a, route, { method = "GET", data, params } = {}) {
    if (!/^\/[a-zA-Z_\d/+]+$/.test(route))
      throw new Error("Invalid Pinterest API route.");
    try {
      return (
        await request({
          url: `${API}${route}`,
          method,
          data,
          params,
          headers: { Authorization: `Bearer ${await access(a.id)}` },
        })
      ).data;
    } catch (e) {
      throw providerError(e, method === "POST" && route === "/pins");
    }
  }
  async function list(a, route, params = {}, limit = 1000) {
    let bookmark = "",
      items = [],
      pages = 0;
    do {
      const result = await api(a, route, {
        params: {
          ...params,
          page_size: Math.min(100, limit),
          ...(bookmark ? { bookmark } : {}),
        },
      });
      items.push(...(result.items || []));
      bookmark = result.bookmark || "";
      pages++;
    } while (bookmark && items.length < limit && pages < 50);
    return {
      items: items.slice(0, limit),
      sampled: !!bookmark,
      totalFetched: items.length,
    };
  }
  async function connect({
    publishing = false,
    researchMetrics = false,
    reconnectId = "",
  } = {}) {
    const c = config();
    if (!c.clientId || !c.clientSecret)
      throw new Error("Configure a Pinterest developer app first.");
    const redirect = new URL(c.redirectUri),
      state = randomBytes(32).toString("hex");
    const scopes = [
      "user_accounts:read",
      "boards:read",
      "pins:read",
      ...(researchMetrics ? ["ads:read"] : []),
      ...(publishing ? ["pins:write", "catalogs:read", "catalogs:write"] : []),
    ];
    return new Promise((resolve, reject) => {
      let consumed = false;
      const timer = setTimeout(() => {
        server.close();
        reject(new Error("Pinterest connection timed out."));
      }, 180000);
      const finish = (error, result) => {
        clearTimeout(timer);
        server.close();
        error ? reject(error) : resolve(result);
      };
      const server = http.createServer(async (req, res) => {
        const u = new URL(req.url || "/", c.redirectUri);
        if (u.pathname !== redirect.pathname) return res.writeHead(404).end();
        const received = u.searchParams.get("state") || "";
        if (
          consumed ||
          Buffer.byteLength(received) !== Buffer.byteLength(state) ||
          !timingSafeEqual(Buffer.from(received), Buffer.from(state))
        )
          return res.writeHead(400).end("Invalid OAuth state.");
        consumed = true;
        try {
          if (u.searchParams.has("error") || !u.searchParams.get("code"))
            throw new Error("Pinterest authorization was declined.");
          const tokens = await tokenRequest({
            grant_type: "authorization_code",
            code: u.searchParams.get("code"),
            redirect_uri: c.redirectUri,
          });
          const profile = (
            await request({
              url: `${API}/user_account`,
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            })
          ).data;
          if (!profile.username)
            throw new Error("Pinterest did not identify this account.");
          // Current user_account responses may identify by username rather than numeric ID.
          const id = `pinterest:${String(profile.id || profile.username).toLowerCase()}`;
          if (reconnectId && reconnectId !== id)
            throw new Error(
              "Reconnect must authorize the same Pinterest account.",
            );
          storeTokens(id, tokens);
          res
            .writeHead(200, { "Content-Type": "text/plain" })
            .end("Pinterest connected. Return to Content Studio.");
          finish(null, {
            id,
            username: profile.username,
            profile,
            connected: true,
            scopes: credentials(id).scopes,
            accessTier: c.accessTier,
          });
        } catch (e) {
          res
            .writeHead(400)
            .end("Connection failed. Return to Content Studio.");
          finish(
            new Error(
              e.publicMessage ||
                "Pinterest connection failed. Check app credentials and registered redirect.",
            ),
          );
        }
      });
      server.once("error", (e) =>
        finish(
          new Error(
            e.code === "EADDRINUSE"
              ? "OAuth callback port is in use. Choose another registered redirect port."
              : "OAuth callback failed.",
          ),
        ),
      );
      server.listen(Number(redirect.port), "127.0.0.1", async () => {
        const u = new URL("https://www.pinterest.com/oauth/");
        u.search = new URLSearchParams({
          client_id: c.clientId,
          redirect_uri: c.redirectUri,
          response_type: "code",
          scope: scopes.join(","),
          state,
        }).toString();
        try {
          await openExternal(u.href);
        } catch {
          finish(new Error("Could not open Pinterest authorization."));
        }
      });
    });
  }
  function disconnect(id) {
    const c = store.get("pinterestConnections", {});
    delete c[id];
    store.set("pinterestConnections", c);
  }
  async function syncBoards(a) {
    const result = await list(a, "/boards");
    const boards = [];
    for (const board of result.items) {
      const sections = await list(a, `/boards/${board.id}/sections`);
      boards.push({
        id: String(board.id),
        name: board.name,
        description: board.description || "",
        pinCount: board.pin_count,
        sections: sections.items.map((s) => ({
          id: String(s.id),
          name: s.name,
        })),
        sectionsSampled: sections.sampled,
      });
    }
    return {
      boards,
      sampled: result.sampled,
      syncedAt: new Date().toISOString(),
    };
  }
  async function publish(a, pin, asset, job, progress) {
    if (!credentials(a.id).scopes.split(/[, ]+/).includes("pins:write"))
      throw new Error(
        "Publishing permission is missing. Reconnect with publishing enabled.",
      );
    if (a.accessTier !== "standard")
      throw new Error(
        "Standard access is required for public distribution. Trial Pins are only visible to the creator.",
      );
    let media;
    if (asset.kind === "video") {
      let mediaId = job.mediaId;
      if (!mediaId) {
        const registration = await api(a, "/media", {
          method: "POST",
          data: { media_type: "video" },
        });
        if (
          !publicUrl(registration.upload_url) ||
          !/^\d+$/.test(String(registration.media_id))
        )
          throw new Error("Pinterest returned invalid media upload details.");
        const bytes = await assetBytes(asset);
        if (bytes.length > 200 * 1024 * 1024)
          throw new Error("Video exceeds the desktop 200 MB upload limit.");
        const form = new FormData();
        for (const [k, v] of Object.entries(
          registration.upload_parameters || {},
        ))
          form.append(k, String(v));
        form.append(
          "file",
          new Blob([bytes], { type: asset.mime || "video/mp4" }),
          "pin-video.mp4",
        );
        try {
          await request({
            url: registration.upload_url,
            method: "POST",
            data: form,
            timeout: 180000,
          });
        } catch (e) {
          throw providerError(e);
        }
        mediaId = registration.media_id;
        progress({ mediaId });
      }
      const status = await api(a, `/media/${mediaId}`);
      progress({ mediaStatus: status.status });
      if (status.status === "failed")
        throw new Error("Pinterest video processing failed.");
      if (status.status !== "succeeded") {
        const e = new Error(
          "Video is processing; publication will resume automatically.",
        );
        e.transient = true;
        throw e;
      }
      media = {
        source_type: "video_id",
        media_id: mediaId,
        cover_image_key_frame_time: 0,
      };
      if (asset.coverAsset)
        media = {
          ...media,
          cover_image_content_type: "image/jpeg",
          cover_image_data: (await assetBytes(asset.coverAsset)).toString(
            "base64",
          ),
        };
    } else {
      const bytes = await assetBytes(asset);
      if (bytes.length > 20 * 1024 * 1024)
        throw new Error("Image exceeds 20 MB.");
      media = {
        source_type: "image_base64",
        content_type: asset.mime || "image/jpeg",
        data: bytes.toString("base64"),
      };
    }
    return api(a, "/pins", {
      method: "POST",
      data: {
        title: pin.title,
        description: pin.description,
        alt_text: pin.altText,
        link: pin.destination,
        board_id: pin.boardId,
        ...(pin.sectionId ? { board_section_id: pin.sectionId } : {}),
        ...(pin.aiDisclosure
          ? { ai_disclosures: { values: ["AI_MODIFIED"] } }
          : {}),
        media_source: media,
      },
    });
  }
  async function reconcile(a, pin, job) {
    const recent = await list(a, `/boards/${pin.boardId}/pins`, {}, 250);
    const matches = recent.items.filter(
      (p) =>
        p.title === pin.title &&
        p.description === pin.description &&
        p.alt_text === pin.altText &&
        p.link === pin.destination &&
        String(p.board_id) === pin.boardId &&
        String(p.board_section_id || "") === pin.sectionId &&
        Math.abs(Date.parse(p.created_at) - Date.parse(job.startedAt)) <
          10 * 60000,
    );
    if (matches.length !== 1 || !verifyArtwork) return null;
    const asset = store
      .get("pinWorkspace", {})
      .assets?.find((a) => a.id === pin.assetId);
    return asset && (await verifyArtwork(asset, matches[0]))
      ? matches[0]
      : null;
  }
  async function research(
    a,
    { region = "US", keywords = "", interests = "", adAccountId = "" },
  ) {
    if (!/^[A-Z+]{2,30}$/.test(region))
      throw new Error("Invalid Pinterest region.");
    const result = await api(a, `/trends/keywords/${region}/top/monthly`, {
      params: {
        limit: 50,
        ...(keywords ? { include_keywords: String(keywords) } : {}),
        ...(interests ? { interests: String(interests) } : {}),
      },
    });
    const rows = (result.trends || []).map((r) => ({
      keyword: r.keyword,
      monthGrowth: Number.isFinite(r.pct_growth_mom) ? r.pct_growth_mom : null,
      weekGrowth: Number.isFinite(r.pct_growth_wow) ? r.pct_growth_wow : null,
      yearGrowth: Number.isFinite(r.pct_growth_yoy) ? r.pct_growth_yoy : null,
      volumeBand: null,
      timeSeries: r.time_series || null,
      predictedTimeSeries: r.predicted_time_series || null,
    }));
    let volumeError = "",
      relatedKeywords = [];
    if (
      adAccountId &&
      /^\d{1,18}$/.test(adAccountId) &&
      /^[A-Z]{2}$/.test(region) &&
      rows.length
    ) {
      try {
        const volumes = await api(
          a,
          `/ad_accounts/${adAccountId}/keywords/metrics`,
          {
            params: {
              country_code: region,
              keywords: rows.map((r) => r.keyword).join(","),
            },
          },
        );
        for (const row of rows)
          row.volumeBand =
            volumes.data?.find((v) => v.keyword === row.keyword)?.metrics
              ?.keyword_query_volume ?? null;
      } catch {
        volumeError =
          "Volume bands unavailable: the ad account needs ads:read permission and authorized metrics access.";
      }
    }
    if (interests && !interests.includes(",") && /^[A-Z]{2}$/.test(region)) {
      try {
        const topics = await api(a, "/trends/topics/featured", {
          params: { region, interest: interests },
        });
        const searches = (Array.isArray(topics) ? topics : [])
          .flatMap((t) => t.trends || t.topics || [])
          .flatMap((t) => t.related_searches || []);
        relatedKeywords = [...new Set(searches)].map((keyword) => ({
          keyword,
          source: "Pinterest featured-topic related search",
          volumeBand: null,
        }));
      } catch {}
    }
    return {
      available: true,
      rows,
      volumeError,
      relatedKeywords,
      suggestedKeywordsAvailable: false,
      relatedKeywordsAvailable: relatedKeywords.length > 0,
    };
  }
  async function audit(a) {
    const profile = await api(a, "/user_account"),
      boards = await syncBoards(a),
      pins = await list(a, "/pins", {}, 500);
    let websites = null,
      performance = null;
    try {
      websites = (await list(a, "/user_account/websites")).items;
    } catch {}
    const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      start = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    try {
      performance = await api(a, "/user_account/analytics", {
        params: {
          start_date: start,
          end_date: end,
          metric_types: "IMPRESSION,SAVE,OUTBOUND_CLICK",
        },
      });
    } catch {}
    const issues = [],
      checks = [];
    const check = (label, passed, recommendation) => {
      checks.push({ label, passed });
      if (passed === false) issues.push(recommendation);
    };
    check("Profile name", !!profile.username, "Complete your profile name.");
    check(
      "Profile description",
      profile.about === undefined ? null : !!profile.about,
      "Add a specific profile description.",
    );
    check(
      "Claimed website",
      websites === null
        ? null
        : websites.some((w) => w.status === "verified" || w.verified === true),
      "Claim your website in Pinterest.",
    );
    check(
      "Board descriptions",
      !boards.boards.some((b) => !b.description),
      "Describe boards with clear topical relevance.",
    );
    check(
      "No empty boards",
      !boards.boards.some((b) => b.pinCount === 0),
      "Review empty boards; no boards were deleted.",
    );
    check(
      "Pin titles and descriptions",
      pins.items.length
        ? pins.items.every((p) => p.title && p.description)
        : null,
      "Improve missing Pin titles/descriptions.",
    );
    check(
      "Alt text",
      pins.items.length ? pins.items.every((p) => p.alt_text) : null,
      "Add descriptive alt text to Pins.",
    );
    const activeBoards = new Set(
      pins.items
        .filter((p) => Date.parse(p.created_at) >= Date.parse(start))
        .map((p) => String(p.board_id)),
    );
    const inactive = boards.boards
      .filter((b) => !activeBoards.has(b.id))
      .map((b) => b.name);
    if (inactive.length)
      issues.push(
        `No recent sampled Pins on: ${inactive.slice(0, 12).join(", ")}. Sampling may omit activity.`,
      );
    const known = checks.filter((c) => c.passed !== null);
    return {
      id: randomBytes(16).toString("hex"),
      accountId: a.id,
      retrievedAt: new Date().toISOString(),
      score: known.length
        ? Math.round(
            (100 * known.filter((c) => c.passed).length) / known.length,
          )
        : null,
      checks,
      issues,
      profile,
      boardCount: boards.boards.length,
      pinsSampled: pins.items.length,
      sampled: pins.sampled || boards.sampled,
      originals: pins.items.filter((p) => !p.parent_pin_id).length,
      repins: pins.items.filter((p) => !!p.parent_pin_id).length,
      recentPins: pins.items.filter(
        (p) => Date.parse(p.created_at) >= Date.parse(start),
      ).length,
      performance,
      limitations:
        "Score counts only available checks equally. Inactivity/cadence/mix describe at most 500 sampled Pins, not the whole account. Unavailable website/profile/analytics fields are not penalized.",
    };
  }
  return {
    configure,
    config,
    connect,
    disconnect,
    syncBoards,
    publish,
    reconcile,
    research,
    audit,
    api,
    list,
  };
}
module.exports = { createPinterestApi, providerError, API };
