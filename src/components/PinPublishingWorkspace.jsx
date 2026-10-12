import { useEffect, useState, useCallback } from "react";
import {
  Check,
  X,
  Upload,
  Download,
  RefreshCw,
  CalendarDays,
  ImagePlus,
  Link,
  Undo2,
  Play,
  Pause,
  Search,
  Save,
  Plus,
  Trash2,
} from "lucide-react";
import { electronAPI } from "@/lib/electron";
const empty = {
  drafts: [],
  assets: [],
  accounts: [],
  jobs: [],
  history: [],
  sources: [],
  research: [],
  alerts: [],
  audits: [],
  stores: [],
  products: [],
  catalogs: [],
  undo: [],
  enabled: false,
};
const tabs = [
  "Review",
  "Schedule",
  "Artwork",
  "Accounts",
  "Research",
  "Stores",
  "API",
];
const input =
  "w-full min-w-0 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const button =
  "inline-flex items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50";
function Field({ label, children }) {
  return (
    <label className="block min-w-0 text-sm font-semibold">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
function Command({ icon: Icon, children, ...props }) {
  return (
    <button type="button" className={button} {...props}>
      {Icon && <Icon size={16} />} {children}
    </button>
  );
}
function Photo({ asset }) {
  return asset?.kind === "video" ? (
    <video
      src={asset.displayUrl || asset.url}
      controls
      className="h-64 w-full object-contain bg-slate-100"
    />
  ) : (
    <img
      src={asset?.displayUrl || asset?.url}
      alt={asset?.label || "Pin artwork"}
      className="h-64 w-full object-contain bg-slate-100"
    />
  );
}
export default function PinPublishingWorkspace({ settings, setActiveScreen, initialTab='Review' }) {
  const [data, setData] = useState(empty),
    [tab, setTab] = useState(initialTab),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState([]),
    [editing, setEditing] = useState(null);
  const [bulk, setBulk] = useState({
    title: "",
    description: "",
    destination: "",
    prefix: "",
    suffix: "",
    tracking: "",
    altText: "",
    keywords: "",
    aiDisclosure: false,
    boardId: "",
    sectionId: "",
  });
  const [rewrite, setRewrite] = useState(""),
    [rewritePreview, setRewritePreview] = useState([]);
  const [accountId, setAccountId] = useState(""),
    [config, setConfig] = useState({
      timezone: "UTC",
      dailyLimit: 10,
      intervalMinutes: 60,
      windows: [{ start: "08:00", end: "22:00" }],
    }),
    [startAt, setStartAt] = useState(""),
    [mode, setMode] = useState("smart"),
    [channel, setChannel] = useState("direct"),
    [calendar, setCalendar] = useState(false),
    [calendarMonth, setCalendarMonth] = useState(
      new Date().toISOString().slice(0, 7),
    ),
    [following, setFollowing] = useState(false),
    [exact, setExact] = useState("");
  const [source, setSource] = useState({
      url: "",
      selector: "",
      excludeSelector: "nav,header,footer,aside",
      exclusions: "logo,avatar,icon,tracking,pixel",
    }),
    [photos, setPhotos] = useState([]),
    [failures, setFailures] = useState([]),
    [assetId, setAssetId] = useState(""),
    [crop, setCrop] = useState({
      ratio: "9:16",
      fit: "cover",
      focalX: 0.5,
      focalY: 0.5,
    }),
    [library, setLibrary] = useState([]),
    [reference, setReference] = useState({ prompt: "", preserveSubject: true }),
    [svgValues, setSvgValues] = useState({});
  const [videoCover, setVideoCover] = useState("");
  const [application, setApplication] = useState({
      clientId: "",
      clientSecret: "",
      redirectUri: "http://127.0.0.1:8786/pinterest/callback",
      accessTier: "trial",
    }),
    [publishingPermission, setPublishingPermission] = useState(false);
  const [researchPermission, setResearchPermission] = useState(false);
  const [query, setQuery] = useState({
      keywords: "",
      region: "US",
      interests: "",
      adAccountId: "",
      frequency: "weekly",
      notify: true,
    }),
    [research, setResearch] = useState(null);
  const [storeForm, setStoreForm] = useState({
      provider: "shopify",
      name: "",
      origin: "",
      shopId: "",
      token: "",
      key: "",
      secret: "",
      refreshToken: "",
      currency: "USD",
    }),
    [products, setProducts] = useState([]),
    [catalog, setCatalog] = useState({
      catalogId: "",
      country: "US",
      language: "en",
      name: "",
      feedUrl: "",
    });
  const [api, setApi] = useState({ running: false, tokens: [] }),
    [apiPort, setApiPort] = useState(8787),
    [apiToken, setApiToken] = useState(""),
    [apiWrite, setApiWrite] = useState(false);
  const load = useCallback(async () => {
    if (!electronAPI.pinWorkspace) {
      setMessage("Launch the desktop app for this workspace.");
      return;
    }
    const result = await electronAPI.pinWorkspace("snapshot");
    if (result.success) setData(result.result);
    else setMessage(result.error);
  }, []);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);
  async function run(action, params = {}, after) {
    if (!electronAPI.pinWorkspace) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await electronAPI.pinWorkspace(action, params);
      if (!result.success) throw new Error(result.error);
      if (after) after(result.result);
      await load();
      setMessage(
        result.result?.error ||
          result.result?.message ||
          (result.result?.canceled ? "Canceled." : "Saved."),
      );
      return result.result;
    } catch (e) {
      setMessage(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const chosenAsset = data.assets.find((a) => a.id === assetId),
    chosen = data.drafts.filter((d) => selected.includes(d.id));
  const versions = Object.fromEntries(chosen.map((d) => [d.id, d.version]));
  function toggle(id) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }
  async function applyBulk() {
    let tracking = {};
    try {
      tracking = bulk.tracking
        ? Object.fromEntries(new URLSearchParams(bulk.tracking))
        : {};
    } catch {
      setMessage("Invalid tracking parameters.");
      return;
    }
    const patch = Object.fromEntries(
      Object.entries(bulk).filter(
        ([k, v]) =>
          !["prefix", "suffix", "tracking"].includes(k) &&
          v !== "" &&
          v !== false,
      ),
    );
    if (patch.keywords)
      patch.keywords = patch.keywords.split(",").map((x) => x.trim());
    await run("bulkEdit", {
      ids: selected,
      patch,
      prefix: bulk.prefix,
      suffix: bulk.suffix,
      tracking,
    });
  }
  function edit(d) {
    setEditing({ ...d });
    setSelected([d.id]);
    setAssetId(d.assetId);
    setAccountId(d.accountId);
  }
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Command
        icon={Check}
        disabled={busy || !selected.length}
        onClick={() =>
          run("review", {
            ids: selected,
            action: "approve",
            expectedVersions: versions,
          })
        }
      >
        Approve
      </Command>
      <Command
        icon={Upload}
        disabled={busy || !selected.length}
        onClick={() => run("review", { ids: selected, action: "submit" })}
      >
        Send for Review
      </Command>
      <Command
        icon={X}
        disabled={busy || !selected.length}
        onClick={() => run("review", { ids: selected, action: "reject" })}
      >
        Reject
      </Command>
      <Command
        icon={RefreshCw}
        disabled={busy || !selected.length}
        onClick={() => run("review", { ids: selected, action: "recover" })}
      >
        Recover Drafts
      </Command>
      <Command
        icon={Trash2}
        disabled={busy || !selected.length}
        onClick={() => run("review", { ids: selected, action: "cancel" })}
      >
        Cancel Selected
      </Command>
    </div>
  );
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Pinterest Workspace</h1>
          <p className="text-sm text-slate-500">
            Local queue. Keep Content Studio running for direct publishing and
            alerts.
          </p>
        </div>
        <Command icon={RefreshCw} disabled={busy} onClick={load}>
          Refresh
        </Command>
      </header>
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200"
        aria-label="Pinterest workspace views"
      >
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-3 text-sm font-bold border-b-2 ${tab === t ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500"}`}
          >
            {t}
          </button>
        ))}
      </nav>
      {message && (
        <div
          role="status"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-slate-900 break-words"
        >
          {message}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Account">
          <select
            className={input}
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              const a = data.accounts.find((a) => a.id === e.target.value);
              if (a?.schedule) setConfig(a.schedule);
            }}
          >
            <option value="">Choose account</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username}
                {a.csvOnly ? " (CSV only)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <span className="text-sm text-slate-500">
          {selected.length} selected
        </span>
        <Command
          icon={Check}
          onClick={() =>
            setSelected(
              data.drafts
                .filter(
                  (d) =>
                    !["published", "publishing", "reconciling"].includes(
                      d.state,
                    ),
                )
                .map((d) => d.id),
            )
          }
        >
          Select Drafts
        </Command>
        <Command icon={X} onClick={() => setSelected([])}>
          Clear
        </Command>
      </div>
      {tab === "Review" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Command
              icon={Upload}
              disabled={busy}
              onClick={() => run("importPins")}
            >
              Import Pin Creator Artwork
            </Command>
            <Command
              icon={Plus}
              onClick={() =>
                setEditing({
                  title: "",
                  description: "",
                  destination: "",
                  altText: "",
                  keywords: [],
                  assetId: "",
                  accountId,
                  boardId: "",
                  sectionId: "",
                  aiDisclosure: false,
                })
              }
            >
              New Draft
            </Command>
            {data.undo[0] && (
              <Command
                icon={Undo2}
                disabled={busy}
                onClick={() => run("undo", { id: data.undo[0].id })}
              >
                Undo Last Bulk Edit
              </Command>
            )}
          </div>
          {actions}
          {editing && (
            <div className="border-y border-slate-200 py-4 space-y-3">
              <h2 className="text-lg font-bold">
                {editing.id ? "Edit Pin" : "New Pin"}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {["title", "destination", "altText"].map((k) => (
                  <Field
                    key={k}
                    label={
                      {
                        title: "Title",
                        destination: "Destination URL",
                        altText: "Alt Text",
                      }[k]
                    }
                  >
                    <input
                      className={input}
                      value={editing[k]}
                      onChange={(e) =>
                        setEditing({ ...editing, [k]: e.target.value })
                      }
                    />
                  </Field>
                ))}
                <Field label="Description">
                  <textarea
                    className={input}
                    rows={3}
                    value={editing.description}
                    onChange={(e) =>
                      setEditing({ ...editing, description: e.target.value })
                    }
                  />
                </Field>
                <Field label="Account">
                  <select
                    className={input}
                    value={editing.accountId}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        accountId: e.target.value,
                        boardId: "",
                        sectionId: "",
                      })
                    }
                  >
                    <option value="">Choose account</option>
                    {data.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.username}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Board">
                  <select
                    className={input}
                    value={editing.boardId}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        boardId: e.target.value,
                        sectionId: "",
                      })
                    }
                  >
                    <option value="">Choose board</option>
                    {data.accounts
                      .find((a) => a.id === editing.accountId)
                      ?.boards?.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Section">
                  <select
                    className={input}
                    value={editing.sectionId}
                    onChange={(e) =>
                      setEditing({ ...editing, sectionId: e.target.value })
                    }
                  >
                    <option value="">No section</option>
                    {data.accounts
                      .find((a) => a.id === editing.accountId)
                      ?.boards?.find((b) => b.id === editing.boardId)
                      ?.sections?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Artwork">
                  <select
                    className={input}
                    value={editing.assetId}
                    onChange={(e) =>
                      setEditing({ ...editing, assetId: e.target.value })
                    }
                  >
                    <option value="">Choose artwork</option>
                    {data.assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} ({a.provenance}) {a.width}x{a.height}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Keywords">
                  <input
                    className={input}
                    value={editing.keywords.join(", ")}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        keywords: e.target.value
                          .split(",")
                          .map((s) => s.trim()),
                      })
                    }
                  />
                </Field>
                <label className="flex gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={editing.aiDisclosure}
                    onChange={(e) =>
                      setEditing({ ...editing, aiDisclosure: e.target.checked })
                    }
                  />
                  AI-generated or modified
                </label>
              </div>
              <Command
                icon={Save}
                disabled={busy}
                onClick={() =>
                  run("writeDraft", editing, (p) => {
                    setEditing(null);
                    setSelected([p.id]);
                  })
                }
              >
                Save Draft
              </Command>
              <Command icon={X} onClick={() => setEditing(null)}>
                Close
              </Command>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.drafts.map((d) => (
              <article
                key={d.id}
                className={`min-w-0 rounded border ${selected.includes(d.id) ? "border-emerald-500" : "border-slate-200"} bg-white overflow-hidden`}
              >
                <Photo asset={data.assets.find((a) => a.id === d.assetId)} />
                <div className="p-3 space-y-2 text-slate-900">
                  <label className="flex items-start gap-2 font-bold">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.includes(d.id)}
                      onChange={() => toggle(d.id)}
                    />
                    <span className="break-words">
                      {d.title || "Untitled Pin"}
                    </span>
                  </label>
                  <p className="text-xs font-bold text-emerald-700">
                    {d.state.replace(/_/g, " ")} / v{d.version}
                  </p>
                  <p className="text-sm break-words">{d.description}</p>
                  <p className="text-xs break-all">{d.destination}</p>
                  <p className="text-xs">
                    Alt: {d.altText || "Missing"} ·{" "}
                    {d.aiDisclosure ? "AI disclosed" : "Original"}
                  </p>
                  <p className="text-xs">
                    {data.accounts.find((a) => a.id === d.accountId)
                      ?.username || "No account"}{" "}
                    /{" "}
                    {data.accounts
                      .find((a) => a.id === d.accountId)
                      ?.boards?.find((b) => b.id === d.boardId)?.name ||
                      "No board"}{" "}
                    /{" "}
                    {d.sectionId
                      ? data.accounts
                          .find((a) => a.id === d.accountId)
                          ?.boards?.find((b) => b.id === d.boardId)
                          ?.sections?.find((s) => s.id === d.sectionId)?.name
                      : "No section"}
                  </p>
                  <p className="text-xs">
                    {d.scheduledAt ? `${d.scheduledAt} (UTC)` : "Not scheduled"}
                  </p>
                  {d.approval && (
                    <p className="text-xs">
                      Approved by {d.approval.actor}, {d.approval.at}, version{" "}
                      {d.approval.version}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Command icon={Save} onClick={() => edit(d)}>
                      Edit
                    </Command>
                    <Command
                      icon={Check}
                      disabled={busy}
                      onClick={() =>
                        run("review", {
                          ids: [d.id],
                          action: "approve",
                          expectedVersions: { [d.id]: d.version },
                        })
                      }
                    >
                      Approve
                    </Command>
                    <Command
                      icon={X}
                      disabled={busy}
                      onClick={() =>
                        run("review", { ids: [d.id], action: "reject" })
                      }
                    >
                      Reject
                    </Command>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <details className="border-t pt-3">
            <summary className="font-bold cursor-pointer">
              Bulk Edit ({selected.length})
            </summary>
            <p className="my-2 text-sm break-words">
              {chosen.map((d) => d.title).join(" / ")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.keys(bulk)
                .filter((k) => k !== "aiDisclosure")
                .map((k) => (
                  <Field key={k} label={k}>
                    <input
                      className={input}
                      value={bulk[k]}
                      onChange={(e) =>
                        setBulk({ ...bulk, [k]: e.target.value })
                      }
                    />
                  </Field>
                ))}
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={bulk.aiDisclosure}
                  onChange={(e) =>
                    setBulk({ ...bulk, aiDisclosure: e.target.checked })
                  }
                />
                Disclose AI artwork
              </label>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Command
                icon={Save}
                disabled={busy || !selected.length}
                onClick={applyBulk}
              >
                Apply to Selected
              </Command>
              <Command
                icon={X}
                disabled={busy || !selected.length}
                onClick={() =>
                  run("bulkEdit", {
                    ids: selected,
                    clearTracking: [
                      "utm_source",
                      "utm_medium",
                      "utm_campaign",
                      "utm_content",
                    ],
                  })
                }
              >
                Clear UTM Overrides
              </Command>
            </div>
            <Field label="AI Rewrite Instructions">
              <textarea
                className={`${input} mt-3`}
                value={rewrite}
                onChange={(e) => setRewrite(e.target.value)}
              />
            </Field>
            <Command
              icon={RefreshCw}
              disabled={busy || !selected.length}
              onClick={() =>
                run(
                  "rewriteCopy",
                  { ids: selected, instruction: rewrite },
                  (r) => setRewritePreview(r.preview),
                )
              }
            >
              Generate Copy Preview (Paid)
            </Command>
            {rewritePreview.length > 0 && (
              <div className="space-y-2">
                {rewritePreview.map((r) => (
                  <p key={r.id} className="text-sm">
                    <strong>{r.title}</strong> {r.description}
                  </p>
                ))}
                <Command
                  icon={Save}
                  disabled={busy}
                  onClick={async () => {
                    for (const r of rewritePreview) await run("writeDraft", r);
                    setRewritePreview([]);
                  }}
                >
                  Apply Reviewed Copy
                </Command>
              </div>
            )}
          </details>
        </>
      )}
      {tab === "Schedule" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Account Timezone">
              <input
                className={input}
                value={config.timezone}
                onChange={(e) =>
                  setConfig({ ...config, timezone: e.target.value })
                }
              />
            </Field>
            <Field label="Daily Pin Limit">
              <input
                className={input}
                type="number"
                min="1"
                value={config.dailyLimit}
                onChange={(e) =>
                  setConfig({ ...config, dailyLimit: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Minimum Interval (Minutes)">
              <input
                className={input}
                type="number"
                min="1"
                value={config.intervalMinutes}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    intervalMinutes: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Start (Account Local Time)">
              <input
                className={input}
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </Field>
            <Field label="Order">
              <select
                className={input}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="smart">Balance Articles</option>
                <option value="random">Random Shuffle</option>
                <option value="ordered">Current Order</option>
              </select>
            </Field>
            <Field label="Channel">
              <select
                className={input}
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="direct">Direct Pinterest</option>
                <option value="csv">CSV Preparation</option>
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            {config.windows.map((w, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  aria-label={`Window ${i + 1} start`}
                  className={input}
                  type="time"
                  value={w.start}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      windows: config.windows.map((x, j) =>
                        j === i ? { ...x, start: e.target.value } : x,
                      ),
                    })
                  }
                />
                <span>to</span>
                <input
                  aria-label={`Window ${i + 1} end`}
                  className={input}
                  type="time"
                  value={w.end}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      windows: config.windows.map((x, j) =>
                        j === i ? { ...x, end: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Command
                  icon={X}
                  title="Remove window"
                  onClick={() =>
                    setConfig({
                      ...config,
                      windows: config.windows.filter((_, j) => j !== i),
                    })
                  }
                />
              </div>
            ))}
            <Command
              icon={Plus}
              onClick={() =>
                setConfig({
                  ...config,
                  windows: [
                    ...config.windows,
                    { start: "08:00", end: "10:00" },
                  ],
                })
              }
            >
              Posting Window
            </Command>
          </div>
          <div className="flex flex-wrap gap-2">
            <Command
              icon={CalendarDays}
              disabled={busy || !selected.length || !accountId}
              onClick={() =>
                run("schedule", {
                  ids: selected,
                  accountId,
                  config,
                  startAt,
                  mode,
                  channel,
                })
              }
            >
              Schedule Selected
            </Command>
            <Command
              icon={Download}
              disabled={busy || !selected.length}
              onClick={() => run("exportCsv", { ids: selected })}
            >
              Export Selected CSV
            </Command>
            <Command
              icon={data.enabled ? Pause : Play}
              disabled={busy}
              onClick={() => run("setEnabled", { enabled: !data.enabled })}
            >
              {data.enabled ? "Pause Direct Queue" : "Enable Direct Queue"}
            </Command>
            <Command icon={CalendarDays} onClick={() => setCalendar(!calendar)}>
              {calendar ? "Queue View" : "Calendar View"}
            </Command>
            <Command
              icon={X}
              disabled={busy || !selected.length}
              onClick={() => run("clearTimes", { ids: selected })}
            >
              Reset Selected Times
            </Command>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <Field label="Exact Time (Account Local)">
              <input
                className={input}
                type="datetime-local"
                value={exact}
                onChange={(e) => setExact(e.target.value)}
              />
            </Field>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={following}
                onChange={(e) => setFollowing(e.target.checked)}
              />
              Move following Pins
            </label>
            <Command
              icon={Save}
              disabled={busy || selected.length !== 1 || !exact}
              onClick={() =>
                run("schedule", {
                  ids: selected,
                  accountId,
                  config,
                  channel,
                  exact: { [selected[0]]: exact },
                  startAt: exact,
                  moveFollowing: following,
                })
              }
            >
              Set and Lock Time
            </Command>
            <Command
              icon={X}
              disabled={busy || !selected.length}
              onClick={() => run("unlockTimes", { ids: selected })}
            >
              Unlock Selected
            </Command>
          </div>
          {calendar && (
            <div className="space-y-3">
              <Field label="Calendar Month (UTC)">
                <input
                  type="month"
                  className={input}
                  value={calendarMonth}
                  onChange={(e) => setCalendarMonth(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-px border bg-slate-200">
                {Array.from(
                  {
                    length: new Date(
                      Date.UTC(
                        Number(calendarMonth.slice(0, 4)),
                        Number(calendarMonth.slice(5, 7)),
                        0,
                      ),
                    ).getUTCDate(),
                  },
                  (_, i) => {
                    const day = `${calendarMonth}-${String(i + 1).padStart(2, "0")}`;
                    return (
                      <div
                        key={day}
                        className="min-h-28 min-w-0 bg-white p-2 text-slate-900"
                      >
                        <strong className="text-xs">{day}</strong>
                        {data.drafts
                          .filter(
                            (d) =>
                              d.scheduledAt?.startsWith(day) &&
                              (!accountId || d.accountId === accountId),
                          )
                          .map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              className="block w-full text-left text-xs my-2 border-l-2 border-emerald-500 pl-2 break-words"
                              onClick={() => {
                                setSelected([d.id]);
                                setAccountId(d.accountId);
                              }}
                            >
                              {d.scheduledAt.slice(11, 16)}{" "}
                              {d.lockedTime ? "(Locked)" : ""}
                              <br />
                              {d.title}
                            </button>
                          ))}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm [&_th]:px-2 [&_td]:px-2">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Pin</th>
                  <th>State</th>
                  <th>
                    {calendar
                      ? "Calendar Date (UTC)"
                      : "Exact Posting Time (UTC)"}
                  </th>
                  <th>Lock</th>
                  <th>Channel</th>
                </tr>
              </thead>
              <tbody>
                {data.drafts
                  .filter((p) => p.scheduledAt)
                  .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
                  .map((d) => (
                    <tr key={d.id} className="border-b">
                      <td className="py-3 max-w-64">
                        <label className="flex gap-2">
                          <input
                            type="checkbox"
                            checked={selected.includes(d.id)}
                            onChange={() => toggle(d.id)}
                          />
                          {d.title}
                        </label>
                      </td>
                      <td>{d.state}</td>
                      <td className="whitespace-nowrap px-2">
                        {calendar ? d.scheduledAt.slice(0, 10) : d.scheduledAt}
                      </td>
                      <td>{d.lockedTime ? "Locked" : "Flexible"}</td>
                      <td>{d.channel}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <h2 className="font-bold">Publication Jobs and History</h2>
          {data.jobs.map((j) => (
            <div
              key={j.id}
              className="border-b py-2 flex flex-wrap gap-3 items-center"
            >
              <span className="font-semibold">
                {data.drafts.find((d) => d.id === j.draftId)?.title}
              </span>
              <span>
                {j.status} / {j.attempts} attempts
              </span>
              <span className="text-sm break-words">{j.error}</span>
              {j.remotePinId && (
                <a
                  href={`https://www.pinterest.com/pin/${j.remotePinId}/`}
                  className="underline"
                >
                  Pin {j.remotePinId}
                </a>
              )}
              {j.status === "reconciling" && (
                <Command
                  icon={RefreshCw}
                  disabled={busy}
                  onClick={() =>
                    run("reconcile", { jobId: j.id }, (r) =>
                      setMessage(r.message || `Remote Pin: ${r.remotePinId}`),
                    )
                  }
                >
                  Reconcile
                </Command>
              )}
            </div>
          ))}
          {data.history.map((h) => (
            <div key={h.id} className="flex gap-3 border-b py-3 text-sm">
              <img
                src={h.artwork?.displayUrl}
                alt="Published artwork"
                className="w-16 h-24 object-contain"
              />
              <div className="min-w-0 break-words">
                <strong>{h.title}</strong>
                <p>{h.destination}</p>
                <p>
                  {h.accountId} / board {h.boardId} / {h.publishedAt || h.at} /{" "}
                  {h.status} / {h.attempts} attempts
                </p>
                <p>{h.remotePinId || h.error}</p>
              </div>
            </div>
          ))}
        </>
      )}
      {tab === "Artwork" && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(source).map(([k, v]) => (
              <Field
                key={k}
                label={
                  {
                    url: "Source Page URL",
                    selector: "Main Content CSS Selector",
                    excludeSelector: "Excluded CSS Selectors",
                    exclusions: "Excluded URL / Alt Keywords",
                  }[k]
                }
              >
                <input
                  className={input}
                  value={v}
                  onChange={(e) =>
                    setSource({ ...source, [k]: e.target.value })
                  }
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Command
              icon={Search}
              disabled={busy || !source.url}
              onClick={() =>
                run("extractPhotos", { ...source, accountId }, (r) => {
                  setPhotos(r.photos);
                  setFailures(r.failures);
                })
              }
            >
              Extract Photos
            </Command>
            <Command
              icon={Upload}
              disabled={busy}
              onClick={() =>
                run("importAsset", { accountId }, (a) => setAssetId(a.id || ""))
              }
            >
              Upload Image / Canva SVG / Video
            </Command>
            <Command
              icon={ImagePlus}
              disabled={busy}
              onClick={() => run("library", {}, setLibrary)}
            >
              Open Image and Video Library
            </Command>
          </div>
          {failures.map((f) => (
            <p key={f.url} className="text-xs break-all text-amber-700">
              {f.url}: {f.error}
            </p>
          ))}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {photos.map((p) => (
              <article key={p.url} className="rounded border overflow-hidden">
                <Photo asset={p} />
                <div className="p-2 text-sm">
                  <p>
                    {p.width} x {p.height} / Original
                  </p>
                  <Command
                    icon={Plus}
                    disabled={busy}
                    onClick={() =>
                      run(
                        "importAsset",
                        { url: p.url, label: p.label, accountId },
                        (a) => setAssetId(a.id),
                      )
                    }
                  >
                    Use Photo
                  </Command>
                </div>
              </article>
            ))}
            {library.map((a) => (
              <button
                type="button"
                key={a.id}
                className="rounded border text-left overflow-hidden"
                disabled={busy}
                onClick={() =>
                  run("importAsset", { libraryAssetId: a.id, accountId }, (p) =>
                    setAssetId(p.id),
                  )
                }
              >
                <Photo asset={a} />
                <span className="block p-2 text-xs break-words">{a.label}</span>
              </button>
            ))}
          </div>
          <Field label="Saved Artwork">
            <select
              className={input}
              value={assetId}
              onChange={(e) => {
                setAssetId(e.target.value);
                setSvgValues({});
              }}
            >
              <option value="">Choose artwork</option>
              {data.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} / {a.provenance} / {a.width} x {a.height}
                </option>
              ))}
            </select>
          </Field>
          {chosenAsset && (
            <>
              <Photo asset={chosenAsset} />
              {chosenAsset.kind === "video" && (
                <div className="flex flex-wrap gap-3 items-end">
                  <Field label="Video Cover Artwork">
                    <select
                      className={input}
                      value={videoCover}
                      onChange={(e) => setVideoCover(e.target.value)}
                    >
                      <option value="">Choose cover</option>
                      {data.assets
                        .filter((a) => a.kind === "image")
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Command
                    icon={ImagePlus}
                    disabled={busy || selected.length !== 1 || !videoCover}
                    onClick={() =>
                      run("setVideoCover", {
                        id: selected[0],
                        assetId,
                        coverAssetId: videoCover,
                      })
                    }
                  >
                    Set Video Cover
                  </Command>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Aspect Ratio">
                  <select
                    className={input}
                    value={crop.ratio}
                    onChange={(e) =>
                      setCrop({ ...crop, ratio: e.target.value })
                    }
                  >
                    {["9:16", "2:3", "4:5", "1:1"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Display">
                  <select
                    className={input}
                    value={crop.fit}
                    onChange={(e) => setCrop({ ...crop, fit: e.target.value })}
                  >
                    <option value="cover">Cover / Focal Crop</option>
                    <option value="contain">Contain / Full Image</option>
                  </select>
                </Field>
                {["focalX", "focalY"].map((k) => (
                  <Field
                    key={k}
                    label={
                      k === "focalX"
                        ? "Horizontal Focal Point"
                        : "Vertical Focal Point"
                    }
                  >
                    <input
                      className="w-full"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={crop[k]}
                      onChange={(e) =>
                        setCrop({ ...crop, [k]: Number(e.target.value) })
                      }
                    />
                  </Field>
                ))}
              </div>
              <Command
                icon={ImagePlus}
                disabled={
                  busy || selected.length !== 1 || chosenAsset.kind === "video"
                }
                onClick={() =>
                  run("replaceArtwork", { id: selected[0], assetId, ...crop })
                }
              >
                Replace Selected Pin Artwork
              </Command>
              <Command
                icon={ImagePlus}
                disabled={busy || selected.length !== 1}
                onClick={() => run("writeDraft", { id: selected[0], assetId })}
              >
                Use Artwork Without Cropping
              </Command>
              <Field label="Reference Variation Prompt">
                <textarea
                  className={input}
                  value={reference.prompt}
                  onChange={(e) =>
                    setReference({ ...reference, prompt: e.target.value })
                  }
                />
              </Field>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={reference.preserveSubject}
                  onChange={(e) =>
                    setReference({
                      ...reference,
                      preserveSubject: e.target.checked,
                    })
                  }
                />
                Preserve exact subject / product
              </label>
              <Command
                icon={RefreshCw}
                disabled={busy || selected.length !== 1 || !reference.prompt}
                onClick={() =>
                  run("referenceAI", {
                    id: selected[0],
                    referenceAssetId: assetId,
                    ...reference,
                  })
                }
              >
                Generate Reference Variation (Paid)
              </Command>
              {chosenAsset.svg && (
                <div className="space-y-3">
                  <h2 className="font-bold">Canva Dynamic Fields</h2>
                  {chosenAsset.warnings?.map((w) => (
                    <p key={w} className="text-sm text-amber-700">
                      {w}
                    </p>
                  ))}
                  {chosenAsset.svgFields.map((f) => (
                    <Field key={f.id} label={`${f.id} (${f.type})`}>
                      <input
                        className={input}
                        value={svgValues[f.id] ?? f.value}
                        onChange={(e) =>
                          setSvgValues({ ...svgValues, [f.id]: e.target.value })
                        }
                      />
                    </Field>
                  ))}
                  <Command
                    icon={Save}
                    disabled={busy}
                    onClick={() =>
                      run(
                        "mapDesign",
                        {
                          assetId,
                          values: svgValues,
                          id: selected.length === 1 ? selected[0] : undefined,
                        },
                        (a) => setAssetId(a.id),
                      )
                    }
                  >
                    Render Mapped Design
                  </Command>
                </div>
              )}
            </>
          )}
        </>
      )}
      {tab === "Accounts" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {["clientId", "clientSecret", "redirectUri"].map((k) => (
              <Field
                key={k}
                label={
                  {
                    clientId: "Pinterest App ID",
                    clientSecret: "App Secret",
                    redirectUri: "Registered Redirect URI",
                  }[k]
                }
              >
                <input
                  type={k === "clientSecret" ? "password" : "text"}
                  className={input}
                  value={application[k]}
                  onChange={(e) =>
                    setApplication({ ...application, [k]: e.target.value })
                  }
                />
              </Field>
            ))}
            <Field label="Verified App Access Tier">
              <select
                className={input}
                value={application.accessTier}
                onChange={(e) =>
                  setApplication({ ...application, accessTier: e.target.value })
                }
              >
                <option value="trial">Trial (Private Test Pins)</option>
                <option value="standard">Approved Standard Access</option>
              </select>
            </Field>
          </div>
          <p className="text-sm text-amber-700">
            Public direct publishing requires approved Standard access.
            Selecting it here does not grant provider approval.
          </p>
          <div className="flex flex-wrap gap-2">
            <Command
              icon={Save}
              disabled={busy}
              onClick={() =>
                run("configurePinterest", application, () =>
                  setApplication({ ...application, clientSecret: "" }),
                )
              }
            >
              Save App Configuration
            </Command>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={publishingPermission}
                onChange={(e) => setPublishingPermission(e.target.checked)}
              />
              Request publishing and catalog permissions
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={researchPermission}
                onChange={(e) => setResearchPermission(e.target.checked)}
              />
              Request read-only ad keyword metrics
            </label>
            <Command
              icon={Link}
              disabled={busy}
              onClick={() =>
                run("connect", {
                  publishing: publishingPermission,
                  researchMetrics: researchPermission,
                })
              }
            >
              Connect Pinterest Account
            </Command>
            <Command
              icon={Plus}
              disabled={busy}
              onClick={() =>
                run("addCsvProfile", {
                  name: "CSV Profile",
                  boards: settings?.pinCreator?.boards ||
                    settings?.pinterestBoards || ["Recipes"],
                })
              }
            >
              Add CSV-Only Profile
            </Command>
          </div>
          {data.accounts.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap gap-3 items-center border-b py-3"
            >
              <strong>{a.username}</strong>
              <span>
                {a.connected
                  ? "Connected"
                  : a.csvOnly
                    ? "CSV only"
                    : "Disconnected"}
              </span>
              <span className="text-xs break-words">{a.scopes}</span>
              {!a.csvOnly && (
                <>
                  <Command
                    icon={RefreshCw}
                    disabled={busy}
                    onClick={() =>
                      run("connect", {
                        reconnectId: a.id,
                        publishing: publishingPermission,
                        researchMetrics: researchPermission,
                      })
                    }
                  >
                    Reconnect
                  </Command>
                  <Command
                    icon={X}
                    disabled={busy}
                    onClick={() => run("disconnect", { accountId: a.id })}
                  >
                    Disconnect
                  </Command>
                  <Command
                    icon={RefreshCw}
                    disabled={busy}
                    onClick={() => run("syncBoards", { accountId: a.id })}
                  >
                    Sync Boards and Sections
                  </Command>
                </>
              )}
              <span className="text-xs">
                {a.boards?.length || 0} boards /{" "}
                {a.syncedAt || "Not synchronized"}
              </span>
              <Command
                icon={Check}
                disabled={busy}
                onClick={() => run("setCsvDefault", { accountId: a.id })}
              >
                {data.defaultCsvAccountId === a.id
                  ? "Existing CSV Default"
                  : "Use For Existing CSV"}
              </Command>
            </div>
          ))}
        </>
      )}
      {tab === "Research" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {["keywords", "region", "interests", "adAccountId"].map((k) => (
              <Field key={k} label={k}>
                <input
                  className={input}
                  value={query[k]}
                  onChange={(e) => setQuery({ ...query, [k]: e.target.value })}
                />
              </Field>
            ))}
            <Field label="Alert Frequency">
              <select
                className={input}
                value={query.frequency}
                onChange={(e) =>
                  setQuery({ ...query, frequency: e.target.value })
                }
              >
                {["daily", "weekly", "monthly"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={query.notify}
                onChange={(e) =>
                  setQuery({ ...query, notify: e.target.checked })
                }
              />
              Notify on matching trend changes
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Command
              icon={Search}
              disabled={busy || !accountId}
              onClick={() =>
                run("research", { ...query, accountId }, setResearch)
              }
            >
              Live Pinterest Research
            </Command>
            <Command
              icon={Save}
              disabled={busy || !accountId}
              onClick={() => run("saveAlert", { ...query, accountId })}
            >
              Save Alert
            </Command>
            <Command
              icon={Search}
              disabled={busy || !accountId}
              onClick={() => run("audit", { accountId })}
            >
              Audit Pinterest Profile
            </Command>
          </div>
          {(research || data.research[0]) && (
            <div className="text-sm space-y-2">
              <p>
                {(research || data.research[0]).source} /{" "}
                {(research || data.research[0]).region} /{" "}
                {(research || data.research[0]).retrievedAt}
              </p>
              <p className="text-amber-700">
                {(research || data.research[0]).error ||
                  (research || data.research[0]).limitations}
              </p>
              {(research || data.research[0]).volumeError && (
                <p className="text-amber-700">
                  {(research || data.research[0]).volumeError}
                </p>
              )}
              {(research || data.research[0]).relatedKeywords?.length > 0 && (
                <p>
                  Related Pinterest searches:{" "}
                  {(research || data.research[0]).relatedKeywords
                    .map((k) => k.keyword)
                    .join(", ")}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left">
                      <th>Keyword</th>
                      <th>Volume Band</th>
                      <th>MoM</th>
                      <th>YoY</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(research || data.research[0]).rows.map((r) => (
                      <tr key={r.keyword} className="border-b">
                        <td className="py-2">{r.keyword}</td>
                        <td>{r.volumeBand ?? "Unavailable"}</td>
                        <td>
                          {r.monthGrowth === null
                            ? "Unavailable"
                            : `${r.monthGrowth}%`}
                        </td>
                        <td>
                          {r.yearGrowth === null
                            ? "Unavailable"
                            : `${r.yearGrowth}%`}
                        </td>
                        <td>
                          <Command
                            icon={Plus}
                            onClick={() => {
                              setEditing({
                                title: r.keyword,
                                description: "",
                                destination: "",
                                altText: "",
                                keywords: [r.keyword],
                                assetId: "",
                                accountId,
                                boardId: "",
                                sectionId: "",
                                aiDisclosure: false,
                              });
                              setTab("Review");
                            }}
                          >
                            Create Pin Draft
                          </Command>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {data.alerts.map((a) => (
            <div key={a.id} className="border-b py-3 flex flex-wrap gap-3">
              <span>
                {a.keywords || "All trends"} / {a.region} / {a.frequency} /{" "}
                {a.lastStatus || "Not run"}
              </span>
              <span className="text-xs">Next: {a.nextRunAt} (UTC)</span>
              <Command
                icon={Play}
                disabled={busy}
                onClick={() =>
                  run("runAlerts", { id: a.id, preview: true }, (r) =>
                    setResearch(r[0]),
                  )
                }
              >
                Test Preview
              </Command>
              <Command
                icon={a.enabled ? Pause : Play}
                onClick={() => run("saveAlert", { ...a, enabled: !a.enabled })}
              >
                {a.enabled ? "Pause" : "Resume"}
              </Command>
              <span>{a.error}</span>
            </div>
          ))}
          {data.audits.map((a) => (
            <div key={a.id} className="border-t py-3 space-y-2">
              <h2 className="font-bold">
                Profile Score: {a.score ?? "Unavailable"} / 100
              </h2>
              <p className="text-sm">
                {a.pinsSampled} sampled Pins / {a.boardCount} boards /{" "}
                {a.recentPins} recent Pins / {a.originals} originals /{" "}
                {a.repins} repins
              </p>
              {a.checks.map((c) => (
                <p key={c.label} className="text-sm">
                  {c.label}:{" "}
                  {c.passed === null
                    ? "Unavailable"
                    : c.passed
                      ? "Pass"
                      : "Needs attention"}
                </p>
              ))}
              {a.issues.map((i) => (
                <p key={i} className="text-sm text-amber-700">
                  {i}
                </p>
              ))}
              <p className="text-xs">{a.limitations}</p>
            </div>
          ))}
          <Command icon={Search} onClick={() => setActiveScreen("trends")}>
            Existing Trends and Performance
          </Command>
        </>
      )}
      {tab === "Stores" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Provider">
              <select
                className={input}
                value={storeForm.provider}
                onChange={(e) =>
                  setStoreForm({ ...storeForm, provider: e.target.value })
                }
              >
                {["shopify", "etsy", "woocommerce"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
            {Object.keys(storeForm)
              .filter((k) => k !== "provider")
              .map((k) => (
                <Field
                  key={k}
                  label={
                    {
                      origin: "Store Origin (Shopify: myshopify.com)",
                      token: "Authorized Access Token",
                      key: "App / Consumer Key",
                      secret: "App / Consumer Secret",
                      refreshToken: "Etsy Refresh Token",
                      shopId: "Etsy Shop ID",
                      currency: "WooCommerce Currency",
                    }[k] || k
                  }
                >
                  <input
                    type={
                      ["token", "key", "secret", "refreshToken"].includes(k)
                        ? "password"
                        : "text"
                    }
                    className={input}
                    value={storeForm[k]}
                    onChange={(e) =>
                      setStoreForm({ ...storeForm, [k]: e.target.value })
                    }
                  />
                </Field>
              ))}
          </div>
          <Command
            icon={Save}
            disabled={busy}
            onClick={() =>
              run("configureStore", storeForm, () =>
                setStoreForm({
                  ...storeForm,
                  token: "",
                  key: "",
                  secret: "",
                  refreshToken: "",
                }),
              )
            }
          >
            Save Store Connection
          </Command>
          {data.stores.map((s) => (
            <div key={s.id} className="border-b py-3 flex flex-wrap gap-3">
              <strong>{s.name}</strong>
              <span>
                {s.provider} / {s.status} / {s.productCount || 0} products
              </span>
              <Command
                icon={RefreshCw}
                disabled={busy}
                onClick={() => run("syncStore", { storeId: s.id })}
              >
                Sync Products
              </Command>
              <span className="text-sm text-amber-700">{s.error}</span>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.products.map((p) => (
              <article key={p.id} className="rounded border overflow-hidden">
                <Photo asset={{ url: p.photos[0], label: p.title }} />
                <div className="p-3 text-sm">
                  <label className="flex gap-2 font-bold">
                    <input
                      type="checkbox"
                      checked={products.includes(p.id)}
                      onChange={() =>
                        setProducts((ids) =>
                          ids.includes(p.id)
                            ? ids.filter((id) => id !== p.id)
                            : [...ids, p.id],
                        )
                      }
                    />
                    {p.title}
                  </label>
                  <p>
                    {p.price} {p.currency} / {p.availability}
                  </p>
                  <p className="break-all">{p.destination}</p>
                  <Command
                    icon={Plus}
                    disabled={busy}
                    onClick={async () => {
                      const a = await run("importAsset", {
                        url: p.photos[0],
                        label: p.title,
                        accountId,
                      });
                      if (a)
                        await run("writeDraft", {
                          title: p.title.slice(0, 100),
                          description: p.description.slice(0, 800),
                          destination: p.destination,
                          assetId: a.id,
                          accountId,
                          altText: p.title,
                        });
                      setTab("Review");
                    }}
                  >
                    Create Product Pin
                  </Command>
                </div>
              </article>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries(catalog).map(([k, v]) => (
              <Field key={k} label={k}>
                <input
                  className={input}
                  value={v}
                  onChange={(e) =>
                    setCatalog({ ...catalog, [k]: e.target.value })
                  }
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Command
              icon={Download}
              disabled={busy || !products.length}
              onClick={() => run("exportCatalog", { productIds: products })}
            >
              Export Product Feed
            </Command>
            <Command
              icon={Plus}
              disabled={busy || !accountId || !catalog.name}
              onClick={() => {
                if (
                  confirm(
                    "Create this live Pinterest catalog and optional hosted feed?",
                  )
                )
                  run(
                    "createCatalog",
                    { ...catalog, accountId, confirm: true },
                    (r) =>
                      setCatalog({
                        ...catalog,
                        catalogId: r.catalogId || catalog.catalogId,
                      }),
                  );
              }}
            >
              Create Live Catalog / Feed
            </Command>
            <Command
              icon={Upload}
              disabled={busy || !products.length || !accountId}
              onClick={() => {
                if (
                  confirm(
                    "Update these selected products in your live Pinterest catalog?",
                  )
                )
                  run("syncCatalog", {
                    ...catalog,
                    accountId,
                    productIds: products,
                    confirm: true,
                  });
              }}
            >
              Update Live Catalog
            </Command>
          </div>
          {data.catalogs.map((c) => (
            <div key={c.id} className="border-b py-3 text-sm">
              <p>
                Catalog {c.catalogId} / {c.status} / {c.error}
              </p>
              {c.rejected.map((r) => (
                <p key={r.id}>
                  {r.title}: {r.errors.join(", ")}
                </p>
              ))}
              {c.batches.map((b) => (
                <p key={b.id}>
                  Batch {b.id}: {b.status} {JSON.stringify(b.items || [])}
                </p>
              ))}
              {c.processingResults && (
                <p className="break-words">
                  {JSON.stringify(c.processingResults)}
                </p>
              )}
              <Command
                icon={RefreshCw}
                disabled={busy}
                onClick={() => run("catalogStatus", { id: c.id })}
              >
                Check Processing
              </Command>
            </div>
          ))}
        </>
      )}
      {tab === "API" && (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <Field label="Local API Port">
              <input
                className={input}
                type="number"
                value={apiPort}
                onChange={(e) => setApiPort(e.target.value)}
              />
            </Field>
            <Command
              icon={Play}
              disabled={busy}
              onClick={() => run("apiStart", { port: apiPort }, setApi)}
            >
              Start REST / MCP
            </Command>
            <Command
              icon={Pause}
              disabled={busy}
              onClick={() => run("apiStop", {}, setApi)}
            >
              Stop
            </Command>
            <Command
              icon={RefreshCw}
              onClick={() => run("apiStatus", {}, setApi)}
            >
              Refresh Status
            </Command>
          </div>
          <p className="text-sm">
            {api.running
              ? `${api.address}/v1/workspace · ${api.address}/mcp`
              : "API stopped"}
          </p>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={apiWrite}
              onChange={(e) => setApiWrite(e.target.checked)}
            />
            Allow changes for the selected account (approval still required)
          </label>
          <Command
            icon={Plus}
            disabled={busy || !accountId}
            onClick={() =>
              run(
                "createApiToken",
                { accountIds: [accountId], write: apiWrite },
                (r) => {
                  setApiToken(r.token);
                  run("apiStatus", {}, setApi);
                },
              )
            }
          >
            Create Scoped Token
          </Command>
          {apiToken && (
            <Field label="New Token (Shown Once)">
              <input readOnly className={input} value={apiToken} />
            </Field>
          )}
          {api.tokens.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap gap-3 items-center border-b py-3 text-sm"
            >
              <span>
                {t.label} / {t.write ? "Read and write" : "Read only"} /{" "}
                {t.accountIds.join(", ")}
              </span>
              <Command
                icon={X}
                onClick={() =>
                  run("revokeApiToken", { id: t.id }, () =>
                    run("apiStatus", {}, setApi),
                  )
                }
              >
                Revoke
              </Command>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
