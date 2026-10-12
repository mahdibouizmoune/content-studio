"use strict";
const { randomUUID } = require("node:crypto");
const { stringify } = require("csv-stringify/sync");
const sanitize = require("sanitize-html");
const { publicUrl } = require("./pin-assets");
function productIssues(p) {
  const issues = [];
  for (const k of ["id", "title", "description"])
    if (!String(p[k] || "").trim()) issues.push(`${k} is missing`);
  if (!publicUrl(p.destination)) issues.push("Public product URL is missing");
  if (!publicUrl(p.photos?.[0])) issues.push("Public product photo is missing");
  if (
    !Number.isFinite(Number(p.price)) ||
    Number(p.price) <= 0 ||
    !/^[A-Z]{3}$/.test(p.currency || "")
  )
    issues.push("Positive price and currency are required");
  if (!["in stock", "out of stock", "preorder"].includes(p.availability))
    issues.push("Availability is missing");
  return issues;
}
function catalogRows(products) {
  const accepted = [],
    rejected = [];
  for (const p of products) {
    const errors = productIssues(p);
    if (errors.length) rejected.push({ id: p.id, title: p.title, errors });
    else accepted.push(p);
  }
  const headers = [
    "id",
    "title",
    "description",
    "link",
    "image_link",
    "price",
    "availability",
    "condition",
  ];
  return {
    accepted,
    rejected,
    csv: stringify(
      [
        headers,
        ...accepted.map((p) => [
          p.id,
          p.title,
          p.description,
          p.destination,
          p.photos[0],
          `${p.price} ${p.currency}`,
          p.availability,
          "new",
        ]),
      ],
      { record_delimiter: "\r\n" },
    ),
  };
}
function createCommerce({
  workspace,
  store,
  encrypt,
  decrypt,
  request,
  pinterest,
}) {
  function configure(params) {
    if (!["shopify", "etsy", "woocommerce"].includes(params.provider))
      throw new Error("Choose a supported store.");
    const id = params.id || randomUUID(),
      existing = workspace.get().stores.find((s) => s.id === id);
    if (existing && existing.provider !== params.provider)
      throw new Error("Create a new connection to change store provider.");
    let origin = "";
    if (params.provider !== "etsy") {
      origin = publicUrl(params.origin);
      if (!origin || new URL(origin).pathname !== "/" || new URL(origin).search)
        throw new Error("Choose the HTTPS store origin only.");
      origin = new URL(origin).origin;
    }
    if (
      params.provider === "shopify" &&
      !/^[a-z0-9-]+\.myshopify\.com$/.test(new URL(origin).hostname)
    )
      throw new Error("Use the store myshopify.com domain.");
    if (
      params.provider === "etsy" &&
      !/^\d+$/.test(String(params.shopId || ""))
    )
      throw new Error("Use the numeric Etsy shop ID.");
    const all = store.get("pinStoreCredentials", {}),
      prior = all[id] || {},
      secrets = { ...prior };
    for (const k of ["token", "key", "secret", "refreshToken"])
      if (params[k]) secrets[k] = encrypt(String(params[k]));
    all[id] = secrets;
    store.set("pinStoreCredentials", all);
    const data = workspace.get(),
      entry = {
        id,
        provider: params.provider,
        name: String(params.name || params.provider).slice(0, 100),
        origin,
        shopId: String(params.shopId || ""),
        currency: String(params.currency || "").toUpperCase(),
        status: "configured",
        updatedAt: new Date().toISOString(),
      };
    data.stores = [entry, ...data.stores.filter((s) => s.id !== id)];
    workspace.save(data);
    return entry;
  }
  async function sync({ storeId }) {
    const data = workspace.get(),
      connection = data.stores.find((s) => s.id === storeId);
    if (!connection) throw new Error("Unknown store.");
    const encrypted = store.get("pinStoreCredentials", {})[storeId] || {},
      c = Object.fromEntries(
        Object.entries(encrypted).map(([k, v]) => [k, decrypt(v)]),
      );
    const products = [];
    let sampled = false;
    try {
      if (connection.provider === "shopify") {
        let after = null;
        for (let page = 0; page < 20; page++) {
          const response = (
            await request({
              url: `${connection.origin}/admin/api/2026-10/graphql.json`,
              method: "POST",
              headers: { "X-Shopify-Access-Token": c.token },
              data: {
                query:
                  "query Products($after:String){ shop { currencyCode } products(first:100,after:$after){ nodes { id title description onlineStoreUrl status featuredMedia { preview { image { url } } } images(first:10){nodes{url}} variants(first:1){nodes{price availableForSale}} } pageInfo{hasNextPage endCursor} } }",
                variables: { after },
              },
            })
          ).data;
          if (response.errors)
            throw new Error(
              "Shopify denied the product query. Check read_products scope.",
            );
          const result = response.data.products;
          for (const p of result.nodes) {
            const v = p.variants.nodes[0];
            products.push({
              externalId: p.id,
              title: p.title,
              description: p.description,
              destination: p.onlineStoreUrl || "",
              photos: p.images.nodes.map((i) => i.url),
              price: v?.price,
              currency: response.data.shop.currencyCode,
              availability:
                p.status === "ACTIVE" && v?.availableForSale
                  ? "in stock"
                  : "out of stock",
            });
          }
          after = result.pageInfo.endCursor;
          sampled = result.pageInfo.hasNextPage;
          if (!sampled) break;
        }
      } else if (connection.provider === "woocommerce") {
        for (let page = 1; page <= 20; page++) {
          const result = await request({
            url: `${connection.origin}/wp-json/wc/v3/products`,
            params: { per_page: 100, page, status: "publish" },
            headers: {
              Authorization: `Basic ${Buffer.from(`${c.key}:${c.secret}`).toString("base64")}`,
            },
          });
          if (!Array.isArray(result.data))
            throw new Error("Invalid WooCommerce response.");
          for (const p of result.data)
            products.push({
              externalId: String(p.id),
              title: p.name,
              description: sanitize(p.description || "", {
                allowedTags: [],
                allowedAttributes: {},
              }),
              destination: p.permalink,
              photos: (p.images || []).map((i) => i.src),
              price: p.price,
              currency: connection.currency,
              availability:
                p.stock_status === "instock"
                  ? "in stock"
                  : p.stock_status === "onbackorder"
                    ? "preorder"
                    : "out of stock",
            });
          sampled = result.data.length === 100;
          if (!sampled) break;
        }
      } else {
        if (!c.key || !c.secret || !c.token)
          throw new Error(
            "Etsy requires an app key, shared secret and authorized OAuth token.",
          );
        for (let offset = 0; offset < 2000; offset += 100) {
          let response;
          const call = () =>
            request({
              url: `https://api.etsy.com/v3/application/shops/${connection.shopId}/listings/active`,
              params: { limit: 100, offset, includes: "Images" },
              headers: {
                "x-api-key": `${c.key}:${c.secret}`,
                Authorization: `Bearer ${c.token}`,
              },
            });
          try {
            response = await call();
          } catch (e) {
            if (e.response?.status !== 401 || !c.refreshToken) throw e;
            const tokens = (
              await request({
                url: "https://api.etsy.com/v3/public/oauth/token",
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                data: new URLSearchParams({
                  grant_type: "refresh_token",
                  client_id: c.key,
                  refresh_token: c.refreshToken,
                }).toString(),
              })
            ).data;
            if (!tokens.access_token)
              throw new Error("Etsy token refresh failed.");
            c.token = tokens.access_token;
            c.refreshToken = tokens.refresh_token || c.refreshToken;
            const latest = store.get("pinStoreCredentials", {});
            latest[storeId] = {
              ...encrypted,
              token: encrypt(c.token),
              refreshToken: encrypt(c.refreshToken),
            };
            store.set("pinStoreCredentials", latest);
            response = await call();
          }
          const result = response.data;
          for (const p of result.results || [])
            products.push({
              externalId: String(p.listing_id),
              title: p.title,
              description: p.description,
              destination: p.url,
              photos: (p.images || []).map((i) => i.url_fullxfull),
              price: p.price ? p.price.amount / p.price.divisor : null,
              currency: p.price?.currency_code,
              availability: p.quantity > 0 ? "in stock" : "out of stock",
            });
          sampled = offset + 100 < result.count;
          if (!sampled) break;
        }
      }
      const normalized = products.map((p) => ({
        ...p,
        id: `${storeId}:${p.externalId}`,
        storeId,
        photos: (p.photos || []).filter((u) => publicUrl(u)),
        syncedAt: new Date().toISOString(),
        provenance: "original",
      }));
      const latest = workspace.get();
      latest.products = [
        ...normalized,
        ...latest.products.filter((p) => p.storeId !== storeId),
      ];
      Object.assign(
        latest.stores.find((s) => s.id === storeId),
        {
          status: "synced",
          syncedAt: new Date().toISOString(),
          productCount: normalized.length,
          sampled,
          error: "",
        },
      );
      workspace.save(latest);
      return { count: normalized.length, sampled };
    } catch (e) {
      const latest = workspace.get(),
        entry = latest.stores.find((s) => s.id === storeId);
      entry.status = "failed";
      entry.error = `${connection.provider} synchronization failed${e.response?.status ? ` (${e.response.status})` : ""}. Check store credentials, permissions and currency.`;
      workspace.save(latest);
      throw new Error(entry.error);
    }
  }
  async function syncCatalog({
    accountId,
    catalogId,
    country = "US",
    language = "en",
    productIds,
    confirm = false,
  }) {
    if (!confirm)
      throw new Error(
        "Explicit confirmation is required to modify a live catalog.",
      );
    if (!/^\d+$/.test(String(catalogId)))
      throw new Error("Choose a live catalog ID.");
    if (!/^[A-Z]{2}$/.test(country) || !/^[a-z]{2}$/.test(language))
      throw new Error("Choose ISO country/language codes.");
    const data = workspace.get(),
      a = data.accounts.find((a) => a.id === accountId);
    if (!a?.connected || a.accessTier !== "standard")
      throw new Error("Connect a Standard-access Pinterest merchant account.");
    const selected = data.products.filter((p) => productIds.includes(p.id)),
      feed = catalogRows(selected);
    if (!feed.accepted.length) throw new Error("No valid catalog items.");
    const record = {
      id: randomUUID(),
      accountId,
      catalogId,
      country,
      language,
      createdAt: new Date().toISOString(),
      rejected: feed.rejected,
      batches: [],
      status: "submitting",
    };
    data.catalogs.unshift(record);
    workspace.save(data);
    for (let i = 0; i < feed.accepted.length; i += 1000) {
      try {
        const result = await pinterest.api(a, "/catalogs/items/batch", {
          method: "POST",
          data: {
            catalog_type: "RETAIL",
            catalog_id: catalogId,
            country,
            language,
            items: feed.accepted.slice(i, i + 1000).map((p) => ({
              item_id: p.id,
              operation: "UPSERT",
              attributes: {
                title: p.title,
                description: p.description,
                link: p.destination,
                image_link: p.photos[0],
                price: `${p.price} ${p.currency}`,
                availability: p.availability,
                condition: "new",
              },
            })),
          },
        });
        const latest = workspace.get(),
          r = latest.catalogs.find((r) => r.id === record.id);
        r.batches.push({
          id: result.batch_id,
          status: result.status || "processing",
        });
        workspace.save(latest);
      } catch (e) {
        const latest = workspace.get(),
          r = latest.catalogs.find((r) => r.id === record.id);
        r.status = "failed";
        r.error =
          e.publicMessage ||
          "Catalog submission failed. Inspect remote items before resubmitting.";
        workspace.save(latest);
        throw new Error(r.error);
      }
    }
    const latest = workspace.get();
    latest.catalogs.find((r) => r.id === record.id).status = "processing";
    workspace.save(latest);
    return latest.catalogs.find((r) => r.id === record.id);
  }
  async function catalogStatus({ id }) {
    const data = workspace.get(),
      r = data.catalogs.find((r) => r.id === id);
    if (!r) throw new Error("Unknown catalog job.");
    const a = data.accounts.find((a) => a.id === r.accountId);
    if (!r.batches.length) {
      if (r.feedId) {
        const response = await pinterest.list(
          a,
          `/catalogs/feeds/${r.feedId}/processing_results`,
          {},
          100,
        );
        const latest = workspace.get(),
          record = latest.catalogs.find((c) => c.id === id);
        record.processingResults = response.items;
        record.status = "feed-configured";
        workspace.save(latest);
        return record;
      }
      return r;
    }
    for (const b of r.batches) {
      const result = await pinterest.api(a, `/catalogs/items/batch/${b.id}`);
      b.status = result.status;
      b.items = result.items || [];
    }
    r.status = r.batches.every((b) => b.status === "COMPLETED")
      ? "complete"
      : "processing";
    workspace.save(data);
    return r;
  }
  async function createCatalog({
    accountId,
    name,
    feedUrl = "",
    country = "US",
    language = "en",
    confirm = false,
  }) {
    if (!confirm)
      throw new Error(
        "Explicit confirmation is required to create live merchant resources.",
      );
    if (!String(name || "").trim() || String(name).length > 100)
      throw new Error("Choose a catalog name of 1 to 100 characters.");
    if (feedUrl && !publicUrl(feedUrl))
      throw new Error(
        "The feed must have a public HTTPS location. Export and host the product feed first.",
      );
    if (!/^[A-Z]{2}$/.test(country) || !/^[a-z]{2}$/.test(language))
      throw new Error("Choose ISO country and language codes.");
    const data = workspace.get(),
      a = data.accounts.find((a) => a.id === accountId);
    if (!a?.connected || a.accessTier !== "standard")
      throw new Error("A Standard-access merchant account is required.");
    if (
      data.catalogs.some(
        (c) =>
          c.accountId === accountId &&
          c.name === name &&
          ["creating", "unresolved"].includes(c.status),
      )
    )
      throw new Error(
        "Previous catalog creation is unresolved. Inspect Pinterest before creating another.",
      );
    const record = {
      id: randomUUID(),
      accountId,
      name,
      kind: "catalog-creation",
      createdAt: new Date().toISOString(),
      status: "creating",
      rejected: [],
      batches: [],
    };
    data.catalogs.unshift(record);
    workspace.save(data);
    try {
      const catalog = await pinterest.api(a, "/catalogs", {
        method: "POST",
        data: { name, catalog_type: "RETAIL" },
      });
      if (!/^\d+$/.test(String(catalog.id)))
        throw new Error("Pinterest did not return a catalog ID.");
      const latest = workspace.get(),
        r = latest.catalogs.find((r) => r.id === record.id);
      r.catalogId = String(catalog.id);
      r.status = "created";
      workspace.save(latest);
      if (feedUrl) {
        const feed = await pinterest.api(a, "/catalogs/feeds", {
          method: "POST",
          data: {
            name,
            catalog_type: "RETAIL",
            catalog_id: r.catalogId,
            location: feedUrl,
            format: "CSV",
            default_country: country,
            default_locale: `${language}-${country}`,
          },
        });
        if (!/^\d+$/.test(String(feed.id)))
          throw new Error("Pinterest did not return a feed ID.");
        const saved = workspace.get(),
          f = saved.catalogs.find((c) => c.id === record.id);
        f.feedId = String(feed.id);
        f.feedUrl = feedUrl;
        workspace.save(saved);
      }
      return workspace.get().catalogs.find((c) => c.id === record.id);
    } catch (e) {
      const latest = workspace.get(),
        r = latest.catalogs.find((r) => r.id === record.id);
      r.status = e.status && e.status < 500 ? "failed" : "unresolved";
      r.error =
        e.publicMessage ||
        "Catalog/feed creation failed. Inspect Pinterest before retrying.";
      workspace.save(latest);
      throw new Error(r.error);
    }
  }
  return { configure, sync, syncCatalog, catalogStatus, createCatalog };
}
module.exports = { createCommerce, catalogRows, productIssues };
