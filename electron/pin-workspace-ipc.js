"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { createPinWorkspace } = require("./pin-workspace");
const { createPinterestApi } = require("./pinterest-api");
const { createCommerce, catalogRows } = require("./pin-commerce");
const { createPinApiServer } = require("./pin-api-server");
const {
  extractPhotos,
  publicUrl,
  cropPhoto,
  inspectSvg,
  mapSvg,
} = require("./pin-assets");
function registerPinWorkspace(deps) {
  const {
    store,
    handle,
    app,
    sharp,
    dialog,
    fetchPage,
    readMedia,
    displayUrl,
    request,
    encrypt,
    decrypt,
    openExternal,
    notify,
  } = deps;
  let workspace, timer;
  const pinterest = createPinterestApi({
    store,
    encrypt,
    decrypt,
    request,
    openExternal,
    assetBytes: (a) => readMedia(a),
    verifyArtwork: deps.verifyArtwork,
  });
  workspace = createPinWorkspace({
    store,
    provider: pinterest,
    notify,
    reservations: () => deps.legacyReservations?.() || [],
  });
  const commerce = createCommerce({
    workspace,
    store,
    encrypt,
    decrypt,
    request,
    pinterest,
  });
  const apiServer = createPinApiServer({
    store,
    snapshot: workspace.get,
    dispatch: (action, p) => dispatch(action, p),
  });
  const assetDir = () => path.join(deps.mediaDirectory(), "pin-workspace");
  async function asset(
    bytes,
    {
      kind = "image",
      mime = "image/jpeg",
      provenance = "original",
      label = "Photo",
      accountId = "",
      svg = "",
      referenceAssetId = "",
    } = {},
  ) {
    if (bytes.length > 200 * 1024 * 1024)
      throw new Error("Asset exceeds 200 MB.");
    const id = randomUUID();
    await fs.mkdir(assetDir(), { recursive: true });
    const localPath = path.join(
      assetDir(),
      `${id}.${kind === "video" ? "mp4" : "jpg"}`,
    );
    let meta = {};
    if (kind !== "video")
      meta = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
    await fs.writeFile(localPath, bytes, { flag: "wx" });
    const entry = {
      id,
      kind,
      mime,
      provenance,
      label: String(label).slice(0, 150),
      accountId,
      localPath,
      displayUrl: displayUrl(localPath),
      width: meta.width || null,
      height: meta.height || null,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      createdAt: new Date().toISOString(),
      ...(svg
        ? {
            svg,
            svgFields: inspectSvg(svg).fields,
            warnings: inspectSvg(svg).warnings,
          }
        : {}),
      referenceAssetId,
    };
    const data = workspace.get();
    data.assets.unshift(entry);
    workspace.save(data);
    return entry;
  }
  async function importedAsset(p = {}) {
    let bytes,
      filename = p.filename || "photo.jpg";
    if (p.dataBase64) {
      if (
        !/^[a-zA-Z0-9+/=]+$/.test(p.dataBase64) ||
        p.dataBase64.length > 5 * 1024 * 1024
      )
        throw new Error("Upload must be base64 and less than 5 MB.");
      bytes = Buffer.from(p.dataBase64, "base64");
    } else if (p.libraryAssetId) {
      const library = await deps.library();
      const source = library.find((a) => a.id === p.libraryAssetId);
      if (!source) throw new Error("Unknown Image or Video Library asset.");
      bytes = await readMedia(source);
      filename = source.localPath || source.url || filename;
    } else if (p.url) {
      if (!publicUrl(p.url)) throw new Error("Choose a public image URL.");
      bytes = await readMedia({ url: p.url });
    } else {
      const chosen = await dialog.showOpenDialog({
        title: "Import photo, Canva SVG or video",
        properties: ["openFile"],
        filters: [
          {
            name: "Artwork",
            extensions: ["jpg", "jpeg", "png", "webp", "svg", "mp4", "mov"],
          },
        ],
      });
      if (chosen.canceled) return { canceled: true };
      filename = chosen.filePaths[0];
      const size = (await fs.stat(filename)).size;
      if (size > 200 * 1024 * 1024) throw new Error("File exceeds 200 MB.");
      bytes = await fs.readFile(filename);
    }
    if (/\.svg$/i.test(filename) || /<svg[\s>]/i.test(bytes.toString("utf8"))) {
      const svg = bytes.toString("utf8");
      inspectSvg(svg);
      const image = await sharp(Buffer.from(svg), {
        limitInputPixels: 40000000,
      })
        .jpeg({ quality: 90 })
        .toBuffer();
      return asset(image, { ...p, svg, label: path.basename(filename) });
    }
    if (/\.(mp4|mov)$/i.test(filename)) {
      if (!bytes.subarray(0, 64).includes(Buffer.from("ftyp")))
        throw new Error("Video must be an MP4/MOV container.");
      return asset(bytes, {
        ...p,
        kind: "video",
        mime: /\.mov$/i.test(filename) ? "video/quicktime" : "video/mp4",
        label: path.basename(filename),
      });
    }
    const image = await sharp(bytes, { limitInputPixels: 40000000 })
      .rotate()
      .jpeg({ quality: 92 })
      .toBuffer();
    return asset(image, { ...p, label: p.label || path.basename(filename) });
  }
  async function replaceArtwork(p) {
    const data = workspace.get(),
      original = data.assets.find((a) => a.id === p.assetId);
    if (!original) throw new Error("Unknown photo.");
    const bytes = await cropPhoto(sharp, await readMedia(original), p);
    const next = await asset(bytes, {
      provenance: original.provenance,
      label: original.label,
      accountId: original.accountId,
      referenceAssetId: original.id,
    });
    return workspace.writeDraft({ id: p.id, assetId: next.id });
  }
  async function referenceAI(p) {
    const original = workspace
      .get()
      .assets.find((a) => a.id === p.referenceAssetId);
    if (!original || original.kind !== "image")
      throw new Error("Choose an image reference.");
    const current = workspace.get().drafts.find((d) => d.id === p.id);
    if (!current) throw new Error("Choose a draft.");
    const input = await sharp(await readMedia(original))
      .resize({
        width: 1400,
        height: 1400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg()
      .toBuffer();
    const model = "black-forest-labs/flux-kontext-pro";
    const schema = await deps.modelSchema(model);
    if (!schema?.properties?.input_image)
      throw new Error(
        "Provider schema does not confirm input_image support. Reference generation blocked.",
      );
    const prompt = `Create a realistic Pinterest design variation of this reference. ${p.preserveSubject !== false ? "Preserve the exact product or dish, ingredient identity, packaging and distinctive appearance. Do not invent new food or branding." : ""} ${String(p.prompt || "").slice(0, 4000)}`;
    const result = await deps.referenceGenerate(model, {
      input_image: `data:image/jpeg;base64,${input.toString("base64")}`,
      prompt,
      aspect_ratio: "9:16",
      output_format: "jpg",
    });
    const next = await asset(await readMedia({ url: result }), {
      provenance: "ai",
      label: current.title,
      accountId: current.accountId,
      referenceAssetId: original.id,
    });
    return workspace.writeDraft({
      id: current.id,
      assetId: next.id,
      aiDisclosure: true,
    });
  }
  async function importPins({ ids = [] } = {}) {
    const data = workspace.get(),
      pins = deps
        .getLegacyPins()
        .filter((p) => !ids.length || ids.includes(p.id)),
      added = [];
    for (const pin of pins) {
      if (data.drafts.some((d) => d.legacyPinId === pin.id)) continue;
      if (!pin.localPath && !pin.displayUrl && !pin.imageUrl) continue;
      try {
        const photo = await importedAsset({
          libraryAssetId: `pin:${pin.id}`,
          label: pin.title,
        });
        const d = workspace.writeDraft({
          title: pin.title,
          description: pin.description,
          destination: pin.url,
          assetId: photo.id,
          aiDisclosure: pin.imageSourceMode !== "reuse-article",
          altText: pin.overlayText || pin.title,
          keywords: String(pin.csvKeywords || "")
            .split(",")
            .filter(Boolean),
        });
        const latest = workspace.get();
        latest.drafts.find((p) => p.id === d.id).legacyPinId = pin.id;
        latest.assets.find((a) => a.id === photo.id).provenance =
          pin.imageSourceMode === "reuse-article" ? "original" : "ai";
        workspace.save(latest);
        added.push(d.id);
      } catch (e) {
        added.push({ id: pin.id, error: e.message });
      }
    }
    return { added };
  }
  async function dispatch(action, p = {}) {
    if (action === "setCsvDefault") {
      const data = workspace.get();
      if (!data.accounts.some((a) => a.id === p.accountId))
        throw new Error("Unknown CSV account.");
      data.defaultCsvAccountId = p.accountId;
      workspace.save(data);
      return data;
    }
    if (action === "createCatalog") return commerce.createCatalog(p);
    if (action === "clearTimes") return workspace.clearTimes(p);
    if (action === "unlockTimes")
      return workspace.clearTimes({ ...p, unlockOnly: true });
    if (action === "setVideoCover") {
      const data = workspace.get(),
        video = data.assets.find((a) => a.id === p.assetId),
        cover = data.assets.find((a) => a.id === p.coverAssetId);
      if (video?.kind !== "video" || cover?.kind !== "image")
        throw new Error("Choose a video and an image cover.");
      const next = {
        ...video,
        id: randomUUID(),
        coverAsset: cover,
        provenance:
          video.provenance === "ai" || cover.provenance === "ai"
            ? "ai"
            : "original",
      };
      data.assets.unshift(next);
      workspace.save(data);
      return workspace.writeDraft({
        id: p.id,
        assetId: next.id,
        ...(next.provenance === "ai" ? { aiDisclosure: true } : {}),
      });
    }
    const simple = {
      snapshot: () => workspace.get(),
      writeDraft: () => workspace.writeDraft(p),
      review: () =>
        workspace.review({ ...p, actor: p.actor || "Desktop owner" }),
      bulkEdit: () => workspace.bulkEdit(p),
      undo: () => workspace.undo(p),
      schedule: () => workspace.schedule(p),
      reconcile: () => workspace.reconcile(p),
      research: () => workspace.research(p),
      saveAlert: () => workspace.saveAlert(p),
      runAlerts: () => workspace.runAlerts(p),
      setEnabled: () => workspace.setEnabled(p.enabled),
      importAsset: () => importedAsset(p),
      replaceArtwork: () => replaceArtwork(p),
      referenceAI: () => referenceAI(p),
      configureStore: () => commerce.configure(p),
      syncStore: () => commerce.sync(p),
      syncCatalog: () => commerce.syncCatalog(p),
      catalogStatus: () => commerce.catalogStatus(p),
      importPins: () => importPins(p),
      library: () => deps.library(),
      configurePinterest: () => pinterest.configure(p),
      apiStatus: () => apiServer.status(),
      apiStart: () => apiServer.start(Number(p.port)),
      apiStop: () => apiServer.stop(),
      createApiToken: () => apiServer.createToken(p),
      revokeApiToken: () => apiServer.revoke(p.id),
    };
    if (simple[action]) return simple[action]();
    if (action === "connect") {
      const a = await pinterest.connect(p),
        data = workspace.get(),
        old = data.accounts.find((x) => x.id === a.id);
      data.accounts = [
        { ...old, ...a },
        ...data.accounts.filter((x) => x.id !== a.id),
      ];
      workspace.save(data);
      return a;
    }
    if (action === "addCsvProfile") {
      const data = workspace.get(),
        id = `csv:${randomUUID()}`;
      const boards = (p.boards || []).map((name) => ({
        id: randomUUID(),
        name: String(name).slice(0, 200),
        sections: [],
      }));
      if (!boards.length || !String(p.name || "").trim())
        throw new Error("Choose a profile name and saved board names.");
      const a = {
        id,
        username: String(p.name).slice(0, 100),
        connected: false,
        csvOnly: true,
        boards,
      };
      data.accounts.push(a);
      workspace.save(data);
      return a;
    }
    if (action === "disconnect") {
      pinterest.disconnect(p.accountId);
      const data = workspace.get();
      const a = data.accounts.find((a) => a.id === p.accountId);
      if (!a) throw new Error("Unknown account.");
      a.connected = false;
      workspace.save(data);
      return a;
    }
    if (action === "syncBoards") {
      const a = workspace.get().accounts.find((a) => a.id === p.accountId);
      if (!a) throw new Error("Unknown account.");
      const synced = await pinterest.syncBoards(a);
      const data = workspace.get();
      Object.assign(
        data.accounts.find((item) => item.id === a.id),
        synced,
      );
      workspace.save(data);
      return synced;
    }
    if (action === "audit") {
      const a = workspace.get().accounts.find((a) => a.id === p.accountId);
      if (!a) throw new Error("Unknown account.");
      const result = await pinterest.audit(a);
      const data = workspace.get();
      data.audits = [result, ...data.audits].slice(0, 100);
      workspace.save(data);
      return result;
    }
    if (action === "addSource") {
      if (!publicUrl(p.url)) throw new Error("Choose a public source URL.");
      const data = workspace.get(),
        source = {
          id: randomUUID(),
          url: p.url,
          label: String(p.label || p.url).slice(0, 150),
          accountId: p.accountId || "",
          createdAt: new Date().toISOString(),
        };
      data.sources.unshift(source);
      workspace.save(data);
      return source;
    }
    if (action === "extractPhotos") {
      if (!publicUrl(p.url))
        throw new Error(
          "Choose a public HTTPS source page without embedded credentials.",
        );
      const page = await fetchPage(p.url);
      if (page.status < 200 || page.status >= 300)
        throw new Error(`Source page returned ${page.status}.`);
      const candidates = extractPhotos(page.html, page.finalUrl, p),
        photos = [],
        failures = [];
      // Bounded sequential inspection avoids hammering a source's image server.
      for (const photo of candidates.slice(0, 30))
        try {
          const bytes = await readMedia({ url: photo.url });
          if (/<svg[\s>]/i.test(bytes.toString("utf8")))
            throw new Error("Page vectors are not recipe photos.");
          const meta = await sharp(bytes, {
            limitInputPixels: 40000000,
          }).metadata();
          if (meta.width < 300 || meta.height < 300) continue;
          photos.push({ ...photo, width: meta.width, height: meta.height });
        } catch {
          failures.push({
            url: photo.url,
            error: "Photo could not be downloaded or decoded.",
          });
        }
      const result = {
        photos,
        failures,
        sourceUrl: page.finalUrl,
        error: photos.length
          ? ""
          : "No usable main-content photos were found. This page may require JavaScript or block extraction.",
      };
      const data = workspace.get();
      data.sources = [
        {
          id: randomUUID(),
          url: p.url,
          accountId: p.accountId || "",
          retrievedAt: new Date().toISOString(),
          ...result,
        },
        ...data.sources.filter(
          (s) => s.url !== p.url || s.accountId !== p.accountId,
        ),
      ].slice(0, 200);
      workspace.save(data);
      return result;
    }
    if (action === "mapDesign") {
      const original = workspace.get().assets.find((a) => a.id === p.assetId);
      if (!original?.svg) throw new Error("Choose an imported SVG design.");
      const svg = mapSvg(original.svg, p.values),
        image = await sharp(Buffer.from(svg), { limitInputPixels: 40000000 })
          .jpeg({ quality: 90 })
          .toBuffer();
      const next = await asset(image, {
        svg,
        provenance: original.provenance,
        label: original.label,
        accountId: original.accountId,
      });
      if (p.id) workspace.writeDraft({ id: p.id, assetId: next.id });
      return next;
    }
    if (action === "rewriteCopy") {
      const pins = workspace.get().drafts.filter((d) => p.ids.includes(d.id));
      if (!pins.length || pins.length > 30)
        throw new Error("Select 1 to 30 completed Pins.");
      const updates = await deps.rewrite(pins, p.instruction);
      return { preview: updates };
    }
    if (action === "exportCatalog") {
      const feed = catalogRows(
        workspace.get().products.filter((x) => p.productIds.includes(x.id)),
      );
      const chosen = await dialog.showSaveDialog({
        title: "Export product feed",
        defaultPath: "pinterest-products.csv",
      });
      if (chosen.canceled) return { canceled: true };
      await fs.writeFile(chosen.filePath, feed.csv);
      return {
        path: chosen.filePath,
        accepted: feed.accepted.length,
        rejected: feed.rejected,
      };
    }
    if (action === "exportCsv") return deps.exportDraftCsv(workspace, p);
    throw new Error("Unknown Pin workspace operation.");
  }
  handle("pin-workspace", async (_event, { action, params = {} } = {}) => {
    try {
      const result = await dispatch(action, params);
      return { success: true, result };
    } catch (e) {
      return { success: false, error: e.publicMessage || e.message };
    }
  });
  app.whenReady().then(() => {
    workspace.recover();
    timer = setInterval(() => {
      workspace.tick().catch(() => {});
      workspace.runAlerts().catch(() => {});
    }, 30000);
    timer.unref();
  });
  app.on("before-quit", () => {
    clearInterval(timer);
    apiServer.stop();
  });
  return { workspace, dispatch, apiServer };
}
module.exports = { registerPinWorkspace };
