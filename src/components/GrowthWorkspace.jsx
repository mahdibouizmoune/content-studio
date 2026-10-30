import {
  Import,
  ListRestart,
  Save,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { Button, EmptyState, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { buildCalendarRows, buildContentUpdateRecommendations, deriveRunHistory } from "@/lib/growthIntelligence.mjs";
import { MODEL_REGISTRY } from "@/lib/modelRegistry.mjs";

const emptyWorkspace = {
  calendarEntries: [],
  campaigns: [],
  updateQueue: [],
  revenueRecords: [],
  runHistory: []
};

function localDate(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function readableDate(value = "") {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function titleFor(view) {
  return {
    calendar: ["Plan", "Content Calendar", "Plan article, channel, newsletter, and seasonal dates without automatic publishing."],
    campaigns: ["Distribute", "Campaign Records", "Connect every asset and result that belongs to one campaign."],
    updates: ["Measure", "Content Update Queue", "Review evidence-backed refresh opportunities before changing published content."],
    attribution: ["Measure", "Revenue Attribution", "Associate reported revenue with articles and campaigns while keeping source evidence visible."],
    runs: ["System", "Run History", "Inspect generation inputs, steps, failures, costs, and delivery outcomes."],
    models: ["System", "Model Registry", "Review the central catalog used by model selectors and cost guidance."]
  }[view];
}

function FeatureDisabled({ label, onOpenSettings }) {
  return (
    <EmptyState title={`${label} is disabled`}>
      Enable this opt-in feature under Settings, Advanced Features.
      <div className="mt-4"><Button onClick={onOpenSettings}>Open Settings</Button></div>
    </EmptyState>
  );
}

function CalendarView({ articles, settings, workspace, saveRecord }) {
  const [mode, setMode] = useState('deliveries');
  const [filters, setFilters] = useState({ site: "", platform: "", campaign: "", status: "", contentType: "" });
  const rows = useMemo(() => buildCalendarRows(articles, workspace.calendarEntries), [articles, workspace.calendarEntries]);
  const filtered = rows.filter((row) => (
    (!filters.site || row.siteId === filters.site)
    && (!filters.campaign || row.campaignId === filters.campaign)
    && (!filters.status || row.status === filters.status)
    && (!filters.contentType || row.contentType === filters.contentType)
    && (!filters.platform || Boolean(row[filters.platform]))
  ));

  async function saveDate(row, field, value) {
    const current = workspace.calendarEntries.find((entry) => String(entry.articleId) === String(row.articleId)) || {};
    await saveRecord("calendarEntries", {
      ...current,
      id: current.id || `calendar-${row.articleId}`,
      articleId: row.articleId,
      campaignId: row.campaignId || "",
      [field]: value ? new Date(value).toISOString() : ""
    });
  }

  const dateColumns = [
    ["plannedDate", "Planned", true],
    ["generationDate", "Generated", false],
    ["reviewDate", "Review", true],
    ["publicationDate", "Published", false],
    ["pinterestSchedule", "Pinterest", true],
    ["facebookSchedule", "Facebook", true],
    ["instagramSchedule", "Instagram", true],
    ["newsletterDate", "Newsletter", true],
    ["seasonalDeadline", "Seasonal deadline", true]
  ];

  return (
    <>
      <div role="tablist" aria-label="Calendar view" className="mb-4 flex gap-2 border-b border-slate-200 pb-2">{[['deliveries', 'Publishing Agenda'], ['plans', 'Planning Dates']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mode === value} className={`rounded px-3 py-2 text-sm font-semibold ${mode === value ? 'bg-emerald-700 text-white' : 'text-slate-500'}`} onClick={() => setMode(value)}>{label}</button>)}</div>
      {mode === 'deliveries' ? <PublishingAgenda events={workspace.deliveryCalendar || []} /> : <>
      <div className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <select aria-label="Filter calendar by site" className={inputClass} value={filters.site} onChange={(event) => setFilters({ ...filters, site: event.target.value })}>
          <option value="">All sites</option>
          {(settings.wordpressSites || []).map((site) => <option key={site.id || site.url} value={site.id || site.url}>{site.name || site.url}</option>)}
        </select>
        <select aria-label="Filter calendar by platform" className={inputClass} value={filters.platform} onChange={(event) => setFilters({ ...filters, platform: event.target.value })}>
          <option value="">All platforms</option>
          <option value="pinterestSchedule">Pinterest</option>
          <option value="facebookSchedule">Facebook</option>
          <option value="instagramSchedule">Instagram</option>
          <option value="newsletterDate">Newsletter</option>
        </select>
        <select aria-label="Filter calendar by campaign" className={inputClass} value={filters.campaign} onChange={(event) => setFilters({ ...filters, campaign: event.target.value })}>
          <option value="">All campaigns</option>
          {workspace.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select>
        <select aria-label="Filter calendar by status" className={inputClass} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">All statuses</option>
          {[...new Set(rows.map((row) => row.status).filter(Boolean))].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select aria-label="Filter calendar by content type" className={inputClass} value={filters.contentType} onChange={(event) => setFilters({ ...filters, contentType: event.target.value })}>
          <option value="">All content types</option>
          <option value="article">Article</option>
          <option value="listicle">Listicle</option>
        </select>
      </div>
      {!filtered.length ? <EmptyState title="No calendar items">Article dates will appear here as the workflow progresses.</EmptyState> : (
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[1850px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr><th className="sticky left-0 z-10 min-w-72 bg-slate-100 p-3">Article</th><th className="p-3">Status</th>{dateColumns.map(([, label]) => <th key={label} className="min-w-52 p-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.articleId} className="border-t border-slate-100 align-top">
                  <td className="sticky left-0 z-[1] bg-white p-3 font-black text-slate-900">{row.title}</td>
                  <td className="p-3 font-semibold text-slate-600">{row.status}</td>
                  {dateColumns.map(([field, , editable]) => (
                    <td key={field} className="p-2">
                      {editable ? (
                        <input
                          type="datetime-local"
                          aria-label={`${field} for ${row.title}`}
                          className={`${inputClass} py-2 text-xs`}
                          defaultValue={localDate(row[field])}
                          onBlur={(event) => saveDate(row, field, event.target.value)}
                        />
                      ) : <span className="block min-h-[42px] rounded-md bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">{readableDate(row[field])}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>}
    </>
  );
}

function PublishingAgenda({ events }) {
  const [platform, setPlatform] = useState(''), [state, setState] = useState('');
  const [limit, setLimit] = useState(100);
  const filtered = events.filter(e => (!platform || e.platform === platform) && (!state || e.status === state));
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-3"><select aria-label="Agenda platform" className={`${inputClass} max-w-64`} value={platform} onChange={e => { setPlatform(e.target.value); setLimit(100); }}><option value="">All platforms</option>{[...new Set(events.map(e => e.platform))].map(p => <option key={p}>{p}</option>)}</select><select aria-label="Agenda status" className={`${inputClass} max-w-64`} value={state} onChange={e => { setState(e.target.value); setLimit(100); }}><option value="">All results</option>{[...new Set(events.map(e => e.status))].map(s => <option key={s}>{s}</option>)}</select></div>
    {!filtered.length ? <EmptyState title="No delivery records" /> : <div className="overflow-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead><tr><th className="p-3">Date (UTC)</th><th className="p-3">Content</th><th className="p-3">Platform</th><th className="p-3">Result</th><th className="p-3">Evidence</th></tr></thead><tbody>{filtered.slice(0, limit).map(event => <tr key={event.id} className="border-t border-slate-200 align-top"><td className="whitespace-nowrap p-3">{event.date ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(event.date)) : 'Undated / immediate'}</td><td className="max-w-96 break-words p-3 font-semibold">{event.title}</td><td className="p-3">{event.platform}</td><td className="p-3">{event.status}</td><td className="max-w-64 p-3 text-xs text-slate-500">{event.evidence}</td></tr>)}</tbody></table></div>}
    {filtered.length > limit && <Button variant="secondary" onClick={() => setLimit(n => n + 100)}>Show More</Button>}
  </section>;
}

function CampaignsView({ articles, workspace, saveRecord, deleteRecord }) {
  const [draft, setDraft] = useState({ name: "", articleId: "", wordpressPost: "", pinterestPins: "", facebookPost: "", instagramPost: "", video: "", newsletterBlock: "", affiliateLinks: "", trackingLinks: "", performanceData: "" });

  async function saveCampaign() {
    if (!draft.name.trim()) return;
    await saveRecord("campaigns", { ...draft, id: `campaign-${Date.now()}`, publishAutomatically: false });
    setDraft({ name: "", articleId: "", wordpressPost: "", pinterestPins: "", facebookPost: "", instagramPost: "", video: "", newsletterBlock: "", affiliateLinks: "", trackingLinks: "", performanceData: "" });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">New Campaign Record</h2>
        <p className="mt-1 text-sm text-slate-600">This record only links assets. It never publishes them.</p>
        <div className="mt-4 space-y-3">
          <Field label="Campaign name"><input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="Article">
            <select className={inputClass} value={draft.articleId} onChange={(event) => setDraft({ ...draft, articleId: event.target.value })}>
              <option value="">Not linked</option>
              {articles.map((article) => <option key={article.id} value={article.id}>{article.generatedTitle || article.title}</option>)}
            </select>
          </Field>
          {[
            ["wordpressPost", "WordPress post URL"],
            ["pinterestPins", "Pinterest pin IDs or URLs"],
            ["facebookPost", "Facebook post ID or URL"],
            ["instagramPost", "Instagram post ID or URL"],
            ["video", "Video ID or path"],
            ["newsletterBlock", "Newsletter block ID"],
            ["affiliateLinks", "Affiliate link IDs"],
            ["trackingLinks", "Tracking links"],
            ["performanceData", "Performance source or snapshot ID"]
          ].map(([field, label]) => (
            <Field key={field} label={label}><input className={inputClass} value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} /></Field>
          ))}
          <Button onClick={saveCampaign} disabled={!draft.name.trim()}><Save className="h-4 w-4" />Save Campaign</Button>
        </div>
      </section>
      <section>
        {!workspace.campaigns.length ? <EmptyState title="No campaign records">Create one record to connect an article with every channel asset and result.</EmptyState> : (
          <div className="space-y-3">
            {workspace.campaigns.map((campaign) => {
              const article = articles.find((item) => String(item.id) === String(campaign.articleId));
              const linked = ["wordpressPost", "pinterestPins", "facebookPost", "instagramPost", "video", "newsletterBlock", "affiliateLinks", "trackingLinks", "performanceData"].filter((field) => campaign[field]);
              return (
                <article key={campaign.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="font-black text-slate-900">{campaign.name}</h2><p className="mt-1 text-sm text-slate-600">{article?.generatedTitle || article?.title || "No article linked"}</p></div>
                    <Button variant="danger" onClick={() => deleteRecord("campaigns", campaign.id)}><Trash2 className="h-4 w-4" /><span className="sr-only">Delete {campaign.name}</span></Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">{linked.map((field) => <span key={field} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">{field.replace(/([A-Z])/g, " $1")}</span>)}</div>
                  <div className="mt-3 text-xs font-semibold text-slate-500">Automatic publishing: Off</div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function UpdatesView({ articles, workspace, performance, saveRecord }) {
  const suggestions = useMemo(() => buildContentUpdateRecommendations(articles, performance), [articles, performance]);
  const savedMap = new Map(workspace.updateQueue.map((item) => [item.id, item]));
  const rows = suggestions.map((item) => ({ ...item, ...(savedMap.get(item.id) || {}) }));

  async function setStatus(item, status) {
    await saveRecord("updateQueue", { ...item, status });
  }

  if (!rows.length) return <EmptyState title="No evidence-backed updates">No saved article currently meets the local recommendation rules. Refresh performance data to add current search and Pinterest evidence.</EmptyState>;
  return (
    <div className="space-y-3">
      {rows.map((item) => (
        <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-slate-900">{item.type}</h2><span className={`rounded-full px-2 py-0.5 text-xs font-black ${item.priority === "high" ? "bg-red-50 text-red-700" : item.priority === "medium" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{item.priority}</span></div>
              <div className="mt-1 text-sm font-bold text-slate-700">{item.title}</div>
              <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700"><strong>Evidence:</strong> {item.evidence}</div>
              <p className="mt-3 text-sm text-slate-600"><strong>Recommended action:</strong> {item.action}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" onClick={() => setStatus(item, "planned")}>Plan</Button>
              <Button variant="secondary" onClick={() => setStatus(item, "dismissed")}>Dismiss</Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function AttributionView({ articles, workspace, saveRecord }) {
  const [status, setStatus] = useState("");
  const totals = workspace.revenueRecords.reduce((map, record) => {
    if (record.amount === null || record.amount === undefined) return map;
    const key = `${record.currency || "USD"}:${record.source || "Unknown"}`;
    map.set(key, (map.get(key) || 0) + Number(record.amount || 0));
    return map;
  }, new Map());

  async function importCsv() {
    try {
      const result = await electronAPI.importRevenueCsv();
      if (!result?.success) return;
      for (const row of result.rows || []) await saveRecord("revenueRecords", row, false);
      setStatus(`Imported ${result.rows?.length || 0} sourced revenue row${result.rows?.length === 1 ? "" : "s"} from ${result.fileName}. Re-importing the same report updates these rows.`);
    } catch (error) {
      setStatus(error.message || "Could not import the revenue CSV.");
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          {[...totals.entries()].map(([key, amount]) => {
            const [currency, source] = key.split(":");
            return <div key={key} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"><div className="text-xs font-black uppercase text-slate-500">{source}</div><div className="mt-1 text-xl font-black text-slate-950">{currency} {amount.toFixed(2)}</div></div>;
          })}
        </div>
        <Button onClick={importCsv}><Import className="h-4 w-4" />Import Revenue CSV</Button>
      </div>
      {status ? <div className="mb-4 rounded-md bg-violet-50 p-3 text-sm font-bold text-violet-700" role="status">{status}</div> : null}
      {!workspace.revenueRecords.length ? <EmptyState title="No attributed revenue">Import an Impact, Amazon, ad, or other revenue CSV when an API is unavailable. No values are estimated.</EmptyState> : (
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3">Source</th><th className="p-3">Article</th><th className="p-3">Campaign</th><th className="p-3">Traffic</th><th className="p-3">Metric</th><th className="p-3">Amount</th><th className="p-3">Clicks</th><th className="p-3">Last updated</th></tr></thead>
            <tbody>{workspace.revenueRecords.map((record) => {
              const article = articles.find((item) => String(item.id) === String(record.articleId));
              const campaign = workspace.campaigns.find((item) => String(item.id) === String(record.campaignId));
              return <tr key={record.id} className="border-t border-slate-100"><td className="p-3 font-black">{record.source}</td><td className="p-3">{article?.generatedTitle || article?.title || record.articleId || "Unassigned"}</td><td className="p-3">{campaign?.name || record.campaignId || "Unassigned"}</td><td className="p-3">{record.trafficSource || "Unknown"}</td><td className="p-3">{record.metric}</td><td className="p-3 font-black">{record.amount === null ? "Not reported" : `${record.currency} ${Number(record.amount).toFixed(2)}`}</td><td className="p-3">{record.clicks || 0}</td><td className="p-3">{readableDate(record.lastUpdated)}</td></tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

function RunsView({ articles, workspace, saveRecord, openArticlesStage }) {
  const derived = deriveRunHistory(articles);
  const saved = new Map(workspace.runHistory.map((run) => [run.id, run]));
  const runs = derived.map((run) => ({ ...run, ...(saved.get(run.id) || {}) }));
  async function saveSnapshot() {
    for (const run of derived) await saveRecord("runHistory", run, false);
  }
  if (!runs.length) return <EmptyState title="No generation runs">Run history will be reconstructed from saved article checkpoints and outcomes.</EmptyState>;
  return (
    <div>
      <div className="mb-4 flex justify-end"><Button variant="secondary" onClick={saveSnapshot}><Save className="h-4 w-4" />Save Current Snapshot</Button></div>
      <div className="space-y-3">
      {runs.map((run) => (
        <article key={run.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase text-indigo-600">{run.runId}</div>
              <h2 className="mt-1 font-black text-slate-900">{run.title}</h2>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                <span>Started: {readableDate(run.startedAt)}</span><span>Ended: {readableDate(run.endedAt)}</span><span>Status: {run.status}</span><span>Retries: {run.retries}</span>
                <span>Images: {run.imagesGenerated}</span><span>Internal links: {run.internalLinksInserted}</span><span>Affiliate links: {run.affiliateLinksInserted}</span>
                <span>Estimated cost: {run.estimatedCost === null ? "Not recorded" : `$${Number(run.estimatedCost).toFixed(4)}`}</span>
                <span>Actual cost: {run.actualCost === null ? "Unavailable" : `$${Number(run.actualCost).toFixed(4)}`}</span>
              </div>
              {run.errors.length ? <div className="mt-3 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{run.errors.join(" | ")}</div> : null}
            </div>
            {run.safeRetryStep ? <Button variant="secondary" onClick={() => openArticlesStage("errors")}><ListRestart className="h-4 w-4" />Review Safe Retry</Button> : null}
          </div>
        </article>
      ))}
      </div>
    </div>
  );
}

function ModelsView() {
  const [type, setType] = useState("");
  const rows = MODEL_REGISTRY.filter((model) => !type || model.contentType === type);
  return (
    <>
      <div className="mb-4 max-w-xs"><select aria-label="Filter model registry" className={inputClass} value={type} onChange={(event) => setType(event.target.value)}><option value="">All model types</option><option value="text">Text</option><option value="image">Image</option><option value="video">Video</option></select></div>
      <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1200px] text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3">Model</th><th className="p-3">Provider</th><th className="p-3">Endpoint</th><th className="p-3">Type</th><th className="p-3">Estimated cost</th><th className="p-3">Ratios</th><th className="p-3">Context or duration</th><th className="p-3">Recommended use</th><th className="p-3">Fallback</th><th className="p-3">Status</th><th className="p-3">Last verified</th></tr></thead>
          <tbody>{rows.map((model) => <tr key={model.id} className="border-t border-slate-100"><td className="p-3"><div className="font-black text-slate-900">{model.name}</div><div className="text-xs text-slate-500">{model.id}</div></td><td className="p-3">{model.provider}</td><td className="max-w-72 break-words p-3 text-xs">{model.endpoint}</td><td className="p-3">{model.contentType}</td><td className="p-3">{model.cost}</td><td className="p-3">{model.ratios.join(", ") || "Not applicable"}</td><td className="p-3">{model.contextLimit}</td><td className="p-3">{model.uses}</td><td className="p-3">{model.fallback}</td><td className="p-3">{model.enabled ? "Enabled" : "Disabled"}</td><td className="p-3">{model.verifiedAt}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

export default function GrowthWorkspace({ view, settings, articles, setActiveScreen, setSettingsSection, openArticlesStage }) {
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [performance, setPerformance] = useState({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const titles = titleFor(view);
  const flag = {
    calendar: "contentCalendar",
    campaigns: "campaignRecords",
    updates: "contentUpdateQueue",
    attribution: "revenueAttribution",
    runs: "runHistory",
    models: "modelRegistry"
  }[view];

  async function refresh() {
    const [growth, intelligence] = await Promise.all([
      electronAPI.getGrowthWorkspace(),
      electronAPI.getPerformanceIntelligence().catch(() => ({ snapshot: null }))
    ]);
    setWorkspace({ ...emptyWorkspace, ...(growth || {}) });
    setPerformance(intelligence?.snapshot || {});
  }

  useEffect(() => {
    refresh().catch((error) => setNotice(error.message || "Could not load the growth workspace.")).finally(() => setLoading(false));
  }, []);

  async function saveRecord(collection, record, refreshAfter = true) {
    const result = await electronAPI.upsertGrowthRecord({ collection, record });
    setWorkspace((current) => ({ ...current, [collection]: result.records || current[collection] }));
    if (refreshAfter) setNotice("Saved.");
  }

  async function deleteRecord(collection, id) {
    const result = await electronAPI.deleteGrowthRecord({ collection, id });
    setWorkspace((current) => ({ ...current, [collection]: result.records || current[collection] }));
  }

  function openFeatureSettings() {
    setSettingsSection("advanced-features");
    setActiveScreen("settings");
  }

  if (!settings.featureFlags?.[flag]) return <FeatureDisabled label={titles[1]} onOpenSettings={openFeatureSettings} />;
  if (loading) return <div className="rounded-lg bg-white p-6 font-bold text-slate-600 shadow-sm">Loading growth workspace...</div>;

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow={titles[0]} title={titles[1]}>{titles[2]}</SectionHeader>
      {notice ? <div className="mb-4 rounded-md bg-violet-50 p-3 text-sm font-bold text-violet-700" role="status">{notice}</div> : null}
      {view === "calendar" ? <CalendarView articles={articles} settings={settings} workspace={workspace} saveRecord={saveRecord} /> : null}
      {view === "campaigns" ? <CampaignsView articles={articles} workspace={workspace} saveRecord={saveRecord} deleteRecord={deleteRecord} /> : null}
      {view === "updates" ? <UpdatesView articles={articles} workspace={workspace} performance={performance} saveRecord={saveRecord} /> : null}
      {view === "attribution" ? <AttributionView articles={articles} workspace={workspace} saveRecord={saveRecord} /> : null}
      {view === "runs" ? <RunsView articles={articles} workspace={workspace} saveRecord={saveRecord} openArticlesStage={openArticlesStage} /> : null}
      {view === "models" ? <ModelsView /> : null}
    </section>
  );
}
