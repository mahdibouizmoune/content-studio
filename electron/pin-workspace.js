"use strict";
const { randomUUID, createHash } = require("node:crypto");
const {
  schedulePins,
  configFor,
  utcTime,
  canonicalArticle,
} = require("./pin-scheduler");
const { publicUrl } = require("./pin-assets");
const ROOT = "pinWorkspace";
const MATERIAL = [
  "title",
  "description",
  "destination",
  "altText",
  "aiDisclosure",
  "assetId",
  "accountId",
  "boardId",
  "sectionId",
];
const ACTIVE = ["scheduled", "publishing", "retry_wait", "reconciling"];
function fingerprint(pin) {
  return createHash("sha256")
    .update(JSON.stringify(MATERIAL.map((k) => pin[k] ?? "")))
    .digest("hex");
}
function initial() {
  return {
    schemaVersion: 1,
    drafts: [],
    assets: [],
    sources: [],
    accounts: [],
    jobs: [],
    history: [],
    alerts: [],
    research: [],
    audits: [],
    stores: [],
    products: [],
    catalogs: [],
    undo: [],
    enabled: false,
  };
}
function createPinWorkspace({
  store,
  provider,
  now = Date.now,
  notify = () => {},
  reservations = () => [],
}) {
  let busy = false,
    alertsBusy = false;
  let session = { accounts: new Map(), research: [], audits: [] };
  const sanitize = data => ({ ...data,
    accounts: data.accounts.map(a => {
      if (a.csvOnly || !String(a.id).startsWith('pinterest:')) return a;
      const local = { ...a };
      for (const key of ['profile', 'boards', 'username', 'syncedAt', 'sampled']) delete local[key];
      return local;
    }), research: [], audits: [] });
  const stored = { ...initial(), ...store.get(ROOT, {}) };
  // API responses are session-only. User-authored drafts, CSV profiles and delivery receipts remain durable.
  if (stored.accounts.some(a => !a.csvOnly && String(a.id).startsWith('pinterest:') && (a.profile || a.boards || a.username)) || stored.research.length || stored.audits.length) store.set(ROOT, sanitize(stored));
  const get = () => {
    const data = { ...initial(), ...store.get(ROOT, {}) };
    return { ...data, accounts: data.accounts.map(a => ({ ...a, ...session.accounts.get(a.id) })), research: session.research, audits: session.audits };
  };
  const save = (data) => {
    session = { accounts: new Map(data.accounts.filter(a => !a.csvOnly && String(a.id).startsWith('pinterest:')).map(a => [a.id, { ...a }])), research: data.research || [], audits: data.audits || [] };
    store.set(ROOT, sanitize(data));
    return data;
  };
  const stamp = () => new Date(now()).toISOString();
  const account = (data, id) => {
    const a = data.accounts.find((a) => a.id === id);
    if (!a) throw new Error("Unknown account.");
    return a;
  };
  const draft = (data, id) => {
    const d = data.drafts.find((d) => d.id === id);
    if (!d) throw new Error("Unknown Pin.");
    return d;
  };
  function validate(data, pin) {
    const a = account(data, pin.accountId);
    if (
      !pin.title?.trim() ||
      pin.title.length > 100 ||
      pin.description.length > 800 ||
      pin.altText.length > 500
    )
      throw new Error(
        "Title, description or alt text does not meet Pinterest limits.",
      );
    if (!publicUrl(pin.destination) || pin.destination.length > 2048)
      throw new Error("Choose a public HTTPS destination.");
    const board = a.boards?.find((b) => b.id === pin.boardId);
    if (
      !board ||
      (pin.sectionId && !board.sections?.some((s) => s.id === pin.sectionId))
    )
      throw new Error(
        "Choose a synchronized board and section from this account.",
      );
    const asset = data.assets.find((a) => a.id === pin.assetId);
    if (!asset) throw new Error("Choose final artwork.");
    if (asset.provenance === "ai" && !pin.aiDisclosure)
      throw new Error("AI artwork must be disclosed.");
    return asset;
  }
  function writeDraft(params) {
    const data = get(),
      old = params.id ? draft(data, params.id) : null;
    if (old && ["published", "publishing", "reconciling", "remote_pending"].includes(old.state))
      throw new Error("Published or unresolved Pins cannot be edited.");
    const pin = {
      id: old?.id || randomUUID(),
      title: "",
      description: "",
      destination: "",
      altText: "",
      aiDisclosure: false,
      keywords: [],
      accountId: "",
      boardId: "",
      sectionId: "",
      assetId: "",
      state: "draft",
      version: 1,
      createdAt: stamp(),
      ...old,
    };
    for (const k of [...MATERIAL, "keywords"])
      if (k in params)
        pin[k] =
          k === "aiDisclosure"
            ? params[k] === true
            : k === "keywords"
              ? Array.isArray(params[k])
                ? params[k].slice(0, 30).map(String)
                : []
              : String(params[k] || "").slice(
                  0,
                  k === "destination" ? 2048 : 2000,
                );
    if (old && fingerprint(old) !== fingerprint(pin)) {
      pin.version++;
      pin.state = "awaiting_review";
      pin.approval = null;
      data.jobs = data.jobs.map((j) =>
        j.draftId === pin.id && ACTIVE.includes(j.status)
          ? {
              ...j,
              status: "canceled",
              error: "Material edit requires renewed approval.",
            }
          : j,
      );
    }
    pin.updatedAt = stamp();
    data.drafts = [pin, ...data.drafts.filter((d) => d.id !== pin.id)];
    save(data);
    return pin;
  }
  function review({
    ids,
    action,
    expectedVersions = {},
    actor = "Desktop owner",
  }) {
    if (!["approve", "reject", "recover", "submit", "cancel"].includes(action))
      throw new Error("Invalid review action.");
    const data = get();
    for (const id of ids) {
      const pin = draft(data, id);
      if (["published", "publishing", "reconciling", "remote_pending"].includes(pin.state))
        throw new Error(
          "This Pin is published or has an unresolved publication.",
        );
      if (
        expectedVersions[id] !== undefined &&
        Number(expectedVersions[id]) !== pin.version
      )
        throw new Error("Pin changed since preview. Refresh before reviewing.");
      if (action === "approve") {
        validate(data, pin);
        pin.approval = {
          actor: String(actor).slice(0, 100),
          at: stamp(),
          version: pin.version,
          fingerprint: fingerprint(pin),
        };
        pin.state = "approved";
      } else {
        pin.approval = null;
        pin.state = {
          reject: "rejected",
          recover: "draft",
          submit: "awaiting_review",
          cancel: "canceled",
        }[action];
      }
      data.jobs = data.jobs.map((j) =>
        j.draftId === id && ACTIVE.includes(j.status)
          ? { ...j, status: "canceled" }
          : j,
      );
    }
    save(data);
    return get();
  }
  function bulkEdit({
    ids,
    patch = {},
    prefix = "",
    suffix = "",
    tracking = {},
    clearTracking = [],
    actor,
  }) {
    const before = get();
    if (!ids.length || ids.length > 500)
      throw new Error("Select 1 to 500 Pins.");
    const allowed = Object.fromEntries(
      Object.entries(patch).filter(([k]) =>
        [...MATERIAL, "keywords"].includes(k),
      ),
    );
    const prepared = ids.map((id) => {
      const d = draft(before, id);
      if (["published", "publishing", "reconciling", "remote_pending"].includes(d.state))
        throw new Error("Selection contains a published or unresolved Pin.");
      const destination = new URL(allowed.destination || d.destination);
      for (const k of clearTracking) destination.searchParams.delete(String(k));
      for (const [k, v] of Object.entries(tracking)) {
        if (String(k).length > 100 || String(v).length > 1000)
          throw new Error("Tracking parameter too long.");
        destination.searchParams.set(k, String(v));
      }
      return {
        id,
        ...allowed,
        destination: destination.href,
        description: `${prefix}${allowed.description ?? d.description}${suffix}`,
      };
    });
    for (const p of prepared) writeDraft(p);
    const data = get();
    data.undo = [
      {
        id: randomUUID(),
        at: stamp(),
        actor,
        drafts: before.drafts.filter((d) => ids.includes(d.id)),
        jobs: before.jobs.filter((j) => ids.includes(j.draftId)),
      },
      ...data.undo,
    ].slice(0, 10);
    save(data);
    return data;
  }
  function undo({ id }) {
    const data = get(),
      entry = data.undo.find((x) => x.id === id);
    if (!entry) throw new Error("Undo is unavailable.");
    if (
      entry.drafts.some((p) =>
        ["published", "publishing", "reconciling", "remote_pending"].includes(
          draft(data, p.id).state,
        ),
      )
    )
      throw new Error("Cannot undo published or unresolved work.");
    const ids = new Set(entry.drafts.map((p) => p.id));
    // Undo restores copy, but never restores approval or automatically re-arms jobs.
    data.drafts = [
      ...entry.drafts.map((p) => ({
        ...p,
        version: draft(data, p.id).version + 1,
        state: "awaiting_review",
        approval: null,
      })),
      ...data.drafts.filter((p) => !ids.has(p.id)),
    ];
    data.jobs = data.jobs.map((j) =>
      ids.has(j.draftId) && ACTIVE.includes(j.status)
        ? { ...j, status: "canceled" }
        : j,
    );
    data.undo = data.undo.filter((x) => x.id !== id);
    return save(data);
  }
  function schedule({
    ids,
    accountId,
    config,
    startAt,
    mode = "smart",
    channel = "direct",
    exact = {},
    moveFollowing = false,
  }) {
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 500 ||
      new Set(ids).size !== ids.length
    )
      throw new Error("Select 1 to 500 distinct Pins.");
    const data = get(),
      a = account(data, accountId);
    if (!["direct", "csv"].includes(channel))
      throw new Error("Unknown publishing channel.");
    let selected = ids.map((id) => draft(data, id));
    if (moveFollowing && ids.length === 1) {
      const first = selected[0];
      selected = data.drafts.filter(
        (d) =>
          d.accountId === accountId &&
          ["approved", "scheduled"].includes(d.state) &&
          (!d.scheduledAt || d.scheduledAt >= first.scheduledAt),
      );
    }
    for (const pin of selected) {
      if (!["approved", "scheduled"].includes(pin.state)) throw new Error('This Pin is published, awaiting approval or owned by another publisher.');
      validate(data, pin);
      if (
        pin.accountId !== accountId ||
        !pin.approval ||
        pin.approval.version !== pin.version ||
        pin.approval.fingerprint !== fingerprint(pin)
      )
        throw new Error(
          "Every selected Pin must have current approval for this account.",
        );
    }
    const policy = configFor(config || a.schedule);
    const planned = selected.map((p) =>
      exact[p.id]
        ? {
            ...p,
            scheduledAt: utcTime(exact[p.id], policy.timezone),
            lockedTime: true,
          }
        : { ...p },
    );
    const occupied = [
      ...reservations(),
      ...data.drafts,
      ...data.history
        .filter((h) => h.status === "published")
        .map((h) => ({ ...h, id: h.draftId, state: "published" })),
    ];
    const slots = schedulePins(planned, policy, {
      occupied,
      now: now(),
      startAt,
      mode,
    });
    a.schedule = policy;
    for (const p of slots) {
      Object.assign(draft(data, p.id), p, { state: "scheduled", channel });
      data.jobs = data.jobs.filter(
        (j) =>
          !(
            j.draftId === p.id &&
            ["scheduled", "retry_wait", "canceled"].includes(j.status)
          ),
      );
      if (channel === "direct")
        data.jobs.push({
          id: randomUUID(),
          draftId: p.id,
          accountId,
          version: p.version,
          fingerprint: fingerprint(p),
          status: "scheduled",
          scheduledAt: p.scheduledAt,
          attempts: 0,
          createdAt: stamp(),
          error: "",
        });
    }
    return save(data);
  }
  function recover() {
    const data = get();
    for (const j of data.jobs)
      if (j.status === "publishing") {
        j.status = "reconciling";
        j.error = "App stopped during publication. Reconcile before retry.";
        const p = data.drafts.find((p) => p.id === j.draftId);
        if (p) p.state = "reconciling";
      }
    save(data);
  }
  async function reconcile({ jobId }) {
    const data = get(),
      job = data.jobs.find((j) => j.id === jobId);
    if (!job || job.status !== "reconciling")
      throw new Error("Choose an unresolved publication job.");
    const pin = draft(data, job.draftId),
      a = account(data, job.accountId);
    const remote = await provider.reconcile(a, pin, job);
    if (!remote)
      return {
        resolved: false,
        message:
          "No unique match in the sampled remote Pins. Publication remains blocked; inspect Pinterest before retrying.",
      };
    complete(jobId, remote);
    return { resolved: true, remotePinId: remote.id };
  }
  function complete(jobId, remote) {
    if (!/^\d+$/.test(String(remote?.id || "")))
      throw new Error("Pinterest did not return a Pin ID.");
    const data = get(),
      j = data.jobs.find((j) => j.id === jobId),
      p = draft(data, j.draftId);
    j.status = "published";
    j.remotePinId = String(remote.id);
    j.publishedAt = stamp();
    j.error = "";
    p.state = "published";
    p.publishedAt = j.publishedAt;
    data.history = [
      {
        id: j.id,
        draftId: p.id,
        artwork: data.assets.find((a) => a.id === p.assetId),
        title: p.title,
        destination: p.destination,
        accountId: p.accountId,
        boardId: p.boardId,
        sectionId: p.sectionId,
        remotePinId: j.remotePinId,
        publishedAt: j.publishedAt,
        status: "published",
        attempts: j.attempts,
        fingerprint: j.fingerprint,
      },
      ...data.history.filter((h) => h.id !== j.id),
    ];
    save(data);
  }
  async function tick() {
    if (busy || !get().enabled) return;
    busy = true;
    try {
      const jobs = get().jobs.filter(
        (j) =>
          ["scheduled", "retry_wait"].includes(j.status) &&
          Date.parse(j.nextAttemptAt || j.scheduledAt) <= now(),
      );
      for (const queued of jobs) {
        const data = get(),
          j = data.jobs.find((x) => x.id === queued.id);
        if (!j || !["scheduled", "retry_wait"].includes(j.status)) continue;
        const pin = draft(data, j.draftId);
        const a = account(data, j.accountId);
        if (!a.connected) {
          j.error = "Reconnect this Pinterest account.";
          save(data);
          continue;
        }
        try {
          // Boards are session-only. Sync once per session; an account that still has no boards
          // must fail validation visibly instead of re-requesting the API on every tick.
          if (!a.csvOnly && String(a.id).startsWith('pinterest:') && !a.boards?.length && !a.syncedAt && provider.syncBoards) {
            const synced = await provider.syncBoards(a), latest = get();
            const current = account(latest, a.id);
            if (!current.connected) continue;
            Object.assign(current, synced); save(latest);
            // Re-enter on the next tick so approval/version checks use the latest workspace.
            continue;
          }
          const asset = validate(data, pin);
          if (
            !pin.approval ||
            pin.approval.fingerprint !== fingerprint(pin) ||
            pin.version !== j.version ||
            j.fingerprint !== fingerprint(pin)
          )
            throw new Error("Current approval is required.");
          const publicationKey = `${a.id}:${asset.sha256}:${canonicalArticle(pin.destination)}:${pin.boardId}`;
          if (
            data.history.some(
              (h) =>
                h.publicationKey === publicationKey && h.status === "published",
            ) ||
            data.jobs.some(
              (other) =>
                other.id !== j.id &&
                other.publicationKey === publicationKey &&
                ["publishing", "published", "reconciling"].includes(
                  other.status,
                ),
            )
          )
            throw new Error(
              "Duplicate or unresolved publication already exists.",
            );
          // Re-check the account policy at execution time. Overdue queues never burst-publish.
          const policy = configFor(a.schedule),
            prior = data.history.filter(
              (h) => h.accountId === a.id && h.status === "published",
            );
          const { Temporal } = require("@js-temporal/polyfill");
          const day = (time) =>
            Temporal.Instant.from(time)
              .toZonedDateTimeISO(policy.timezone)
              .toPlainDate()
              .toString();
          const clock = Temporal.Instant.from(stamp())
            .toZonedDateTimeISO(policy.timezone)
            .toPlainTime()
            .toString({ smallestUnit: "minute" });
          if (
            !policy.windows.some((w) => clock >= w.start && clock <= w.end) ||
            prior.filter((h) => day(h.publishedAt) === day(stamp())).length >=
              policy.dailyLimit ||
            prior.some(
              (h) =>
                now() - Date.parse(h.publishedAt) <
                policy.intervalMinutes * 60000,
            )
          ) {
            j.nextAttemptAt = new Date(
              now() + policy.intervalMinutes * 60000,
            ).toISOString();
            j.status = "retry_wait";
            save(data);
            continue;
          }
          j.status = "publishing";
          j.attempts++;
          j.startedAt = stamp();
          j.publicationKey = publicationKey;
          pin.state = "publishing";
          save(data);
          const remote = await provider.publish(a, pin, asset, j, (patch) => {
            const current = get();
            Object.assign(
              current.jobs.find((x) => x.id === j.id),
              patch,
            );
            save(current);
          });
          complete(j.id, remote);
          const done = get();
          done.history.find((h) => h.id === j.id).publicationKey =
            publicationKey;
          save(done);
        } catch (error) {
          const latest = get(),
            job = latest.jobs.find((x) => x.id === j.id),
            p = draft(latest, job.draftId);
          job.error = String(
            error.publicMessage || error.message || "Publication failed",
          ).slice(0, 800);
          const status = Number(error.status || error.response?.status || 0);
          if (error.ambiguous) job.status = p.state = "reconciling";
          else if (
            (status === 429 || status >= 500 || error.transient) &&
            job.attempts < 6
          ) {
            job.status = "retry_wait";
            p.state = "scheduled";
            const delay = Math.max(
              Number(error.retryAfterMs || 0),
              Math.min(3600000, 30000 * 2 ** job.attempts),
            );
            job.nextAttemptAt = new Date(now() + delay).toISOString();
          } else job.status = p.state = "failed";
          latest.history = [
            {
              id: job.id,
              draftId: p.id,
              artwork: latest.assets.find((a) => a.id === p.assetId),
              title: p.title,
              destination: p.destination,
              accountId: p.accountId,
              boardId: p.boardId,
              at: stamp(),
              status: job.status,
              attempts: job.attempts,
              error: job.error,
            },
            ...latest.history.filter((h) => h.id !== job.id),
          ];
          save(latest);
        }
      }
    } finally {
      busy = false;
    }
  }
  async function research(params) {
    const a = account(get(), params.accountId),
      retrievedAt = stamp();
    let result;
    try {
      result = await provider.research(a, params);
    } catch (e) {
      result = {
        available: false,
        rows: [],
        error:
          e.publicMessage ||
          "Pinterest research is unavailable for this account or region.",
      };
    }
    const record = {
      id: randomUUID(),
      accountId: a.id,
      source: "Pinterest API",
      region: params.region || "US",
      retrievedAt,
      freshUntil: new Date(now() + 7 * 86400000).toISOString(),
      ...result,
      limitations:
        "Search volume and related/suggested keywords are unavailable unless the authorized endpoint returns them. Trends are not your own Pin analytics.",
    };
    const data = get();
    if (data.accounts.find(current => current.id === a.id)?.connected !== a.connected) return { ...record, available: false, rows: [], relatedKeywords: [], error: 'Account connection changed during research. Run it again after reconnecting.' };
    data.research = [record, ...data.research].slice(0, 100);
    save(data);
    return record;
  }
  function saveAlert(params) {
    const data = get();
    account(data, params.accountId);
    if (!["daily", "weekly", "monthly"].includes(params.frequency))
      throw new Error("Choose daily, weekly or monthly.");
    const record = {
      ...data.alerts.find((a) => a.id === params.id),
      id: params.id || randomUUID(),
      accountId: params.accountId,
      keywords: String(params.keywords || "").slice(0, 1000),
      region: String(params.region || "US"),
      interests: String(params.interests || "").slice(0, 500),
      adAccountId: String(params.adAccountId || "").slice(0, 18),
      frequency: params.frequency,
      notify: params.notify !== false,
      enabled: params.enabled !== false,
      nextRunAt: stamp(),
    };
    data.alerts = [record, ...data.alerts.filter((a) => a.id !== record.id)];
    save(data);
    return record;
  }
  async function runAlerts({ id, preview = false } = {}) {
    if (alertsBusy) return [];
    alertsBusy = true;
    try {
      const results = [];
      for (const alert of get().alerts.filter((a) =>
        id ? a.id === id : a.enabled && Date.parse(a.nextRunAt) <= now(),
      )) {
        const result = await research({ ...alert, accountId: alert.accountId });
        results.push(result);
        if (preview) continue;
        const data = get(),
          target = data.alerts.find((a) => a.id === alert.id);
        if (!target) continue;
        const { Temporal } = require("@js-temporal/polyfill");
        target.lastRunAt = stamp();
        target.lastStatus = result.available ? "complete" : "unavailable";
        target.error = result.error || "";
        target.nextRunAt = Temporal.Instant.from(stamp())
          .toZonedDateTimeISO("UTC")
          .add(
            alert.frequency === "monthly"
              ? { months: 1 }
              : { days: alert.frequency === "weekly" ? 7 : 1 },
          )
          .toInstant()
          .toString();
        if (
          target.notify &&
          result.available &&
          result.rows.length &&
          JSON.stringify(result.rows.map((r) => r.keyword)) !==
            target.lastKeywords
        )
          notify(
            "Pinterest trend update",
            `${result.rows.length} matching trends in ${target.region}.`,
          );
        target.lastKeywords = JSON.stringify(result.rows.map((r) => r.keyword));
        save(data);
      }
      return results;
    } finally {
      alertsBusy = false;
    }
  }
  function setEnabled(enabled) {
    const data = get();
    data.enabled = enabled === true;
    return save(data);
  }
  function clearTimes({ ids, unlockOnly = false }) {
    const data = get();
    for (const id of ids) {
      const p = draft(data, id);
      if (["published", "publishing", "reconciling", "remote_pending"].includes(p.state))
        throw new Error("Cannot reset a published or unresolved Pin.");
      p.lockedTime = false;
      if (!unlockOnly) {
        p.scheduledAt = "";
        p.state = p.approval ? "approved" : "draft";
        data.jobs = data.jobs.map((j) =>
          j.draftId === id && ACTIVE.includes(j.status)
            ? { ...j, status: "canceled" }
            : j,
        );
      }
    }
    return save(data);
  }
  return {
    get,
    save,
    writeDraft,
    review,
    bulkEdit,
    undo,
    schedule,
    recover,
    tick,
    reconcile,
    research,
    saveAlert,
    runAlerts,
    setEnabled,
    validate,
    clearTimes,
  };
}
module.exports = { ROOT, MATERIAL, fingerprint, initial, createPinWorkspace };
