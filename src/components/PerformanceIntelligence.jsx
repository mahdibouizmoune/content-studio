import {
  AlertTriangle,
  BarChart3,
  CalendarCheck2,
  CheckCircle2,
  ExternalLink,
  Pin,
  RefreshCw,
  Search,
  Settings,
  Utensils
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { Button } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { isArticlePublished } from "@/lib/articlePublication.mjs";
import { aggregatePinterestClusters } from "@/lib/pinterestInterestIntelligence.mjs";

const tabs = [
  ["overview", "Overview"],
  ["search", "Google Search"],
  ["pinterest", "Pinterest"],
  ["ghl", "GHL Planner"],
  ["recipes", "Recipe SEO"]
];

function number(value, decimals = 0) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function percent(value, decimals = 1) {
  return `${number(Number(value || 0) * 100, decimals)}%`;
}

function change(value) {
  const amount = Number(value || 0);
  return `${amount > 0 ? "+" : ""}${number(amount, 1)}%`;
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "published") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (value === "failed") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (["scheduled", "pending", "in_progress", "in_review"].includes(value)) return "bg-violet-50 text-violet-700 ring-violet-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="soft-card rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
          {detail ? <div className="mt-1 text-xs font-bold text-slate-500">{detail}</div> : null}
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-violet-50 text-violet-700 ring-1 ring-violet-100"><Icon className="h-4 w-4" /></span>
      </div>
    </div>
  );
}

function EmptyConnection({ title, message, onSettings }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <div className="font-black text-slate-900">{title}</div>
      <div className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500">{message}</div>
      <Button variant="secondary" className="mt-4" onClick={onSettings}><Settings className="h-4 w-4" />Open Settings</Button>
    </div>
  );
}

export default function PerformanceIntelligence({ articles = [], refreshArticles, setActiveScreen, setSettingsSection }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [days, setDays] = useState(28);
  const [snapshot, setSnapshot] = useState(null);
  const [ghlReceipts, setGhlReceipts] = useState([]);
  const [recipeAudits, setRecipeAudits] = useState([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const publishedArticles = useMemo(
    () => articles.filter((article) => isArticlePublished(article) && article.wordpressPostUrl),
    [articles]
  );
  const auditsByUrl = useMemo(() => new Map(recipeAudits.map((audit) => [audit.url, audit])), [recipeAudits]);
  const ghlCounts = useMemo(() => ghlReceipts.reduce((counts, receipt) => {
    const status = String(receipt.status || "unknown");
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {}), [ghlReceipts]);
  const pinterestClusters = useMemo(() => aggregatePinterestClusters(snapshot?.pinterest?.topPins || []), [snapshot?.pinterest?.topPins]);

  async function load() {
    try {
      const result = await electronAPI.getPerformanceIntelligence();
      setSnapshot(result?.snapshot || null);
      setGhlReceipts(result?.ghlReceipts || []);
      setRecipeAudits(result?.recipeAudits || []);
    } catch (error) {
      setNotice(error.message || "Could not load performance data.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function refreshAll() {
    setBusy("refresh");
    setNotice("Refreshing connected performance data...");
    try {
      const result = await electronAPI.refreshPerformanceIntelligence({ days });
      setSnapshot(result?.snapshot || null);
      setGhlReceipts(result?.ghlReceipts || []);
      setRecipeAudits(result?.recipeAudits || []);
      const problems = [result?.snapshot?.google?.error, result?.snapshot?.pinterest?.error].filter(Boolean);
      setNotice(problems.length ? problems.join(" ") : "Performance data refreshed.");
    } catch (error) {
      setNotice(error.message || "Performance refresh failed.");
    } finally {
      setBusy("");
    }
  }

  async function refreshGhl() {
    setBusy("ghl");
    setNotice("Checking GoHighLevel planner status...");
    try {
      const result = await electronAPI.refreshGhlPublishingStatus();
      if (!result?.success) throw new Error(result?.error || "GHL status refresh failed.");
      setGhlReceipts(result.receipts || []);
      setNotice(`Checked ${result.receipts?.length || 0} GHL posts.`);
    } catch (error) {
      setNotice(error.message || "GHL status refresh failed.");
    } finally {
      setBusy("");
    }
  }

  async function auditArticle(article) {
    setBusy(`audit-${article.id}`);
    setNotice(`Auditing ${article.generatedTitle || article.title}...`);
    try {
      const result = await electronAPI.auditRecipeSeo({ articleId: article.id, url: article.wordpressPostUrl });
      if (!result?.success) throw new Error(result?.error || "Recipe audit failed.");
      setRecipeAudits((current) => [result.audit, ...current.filter((item) => item.url !== result.audit.url)]);
      await refreshArticles?.();
      setNotice(`Recipe SEO score: ${result.audit.score}/100.`);
    } catch (error) {
      setNotice(error.message || "Recipe audit failed.");
    } finally {
      setBusy("");
    }
  }

  async function auditAll() {
    setBusy("audit-all");
    let completed = 0;
    let failed = 0;
    for (const article of publishedArticles) {
      setNotice(`Auditing recipe ${completed + failed + 1} of ${publishedArticles.length}...`);
      try {
        const result = await electronAPI.auditRecipeSeo({ articleId: article.id, url: article.wordpressPostUrl });
        if (!result?.success) throw new Error(result?.error || "Audit failed.");
        setRecipeAudits((current) => [result.audit, ...current.filter((item) => item.url !== result.audit.url)]);
        completed += 1;
      } catch {
        failed += 1;
      }
    }
    await refreshArticles?.();
    setNotice(`Audited ${completed} recipes${failed ? `. ${failed} could not be checked.` : "."}`);
    setBusy("");
  }

  const google = snapshot?.google || {};
  const pinterest = snapshot?.pinterest || {};
  const pinterestSummary = pinterest.summary || {};
  const openAnalyticsSettings = () => {
    setSettingsSection?.("analytics");
    setActiveScreen("settings");
  };

  return (
    <section className="animate-fade-in">
      <SectionHeader
        eyebrow="Measurement"
        title="Performance Intelligence"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700" value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value={7}>7 days</option>
              <option value={28}>28 days</option>
              <option value={90}>90 days</option>
            </select>
            <Button onClick={refreshAll} disabled={!!busy}><RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />Refresh</Button>
            <Button onClick={()=>setActiveScreen('pin-publishing-research')}><Search className="h-4 w-4" />Pinterest Profile Audit</Button>
          </div>
        }
      >
        Search performance, Pinterest results, publishing delivery, and live recipe health.
      </SectionHeader>

      {notice ? <div className="mb-4 rounded-md bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{notice}</div> : null}

      <div className="mb-5 flex overflow-x-auto rounded-md bg-slate-100 p-1">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)} className={`min-w-max flex-1 rounded-md px-4 py-2 text-sm font-black ${activeTab === id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Google Clicks" value={number(google.current?.clicks)} detail={google.changes ? `${change(google.changes.clicks)} vs prior period` : "Connect Search Console"} icon={Search} />
            <Metric label="Pinterest Outbound" value={number(pinterestSummary.outboundClicks)} detail={pinterest.source === "csv" ? "Imported analytics CSV" : "Pinterest API"} icon={Pin} />
            <Metric label="GHL Published" value={number(ghlCounts.published)} detail={`${number(ghlCounts.scheduled)} scheduled, ${number(ghlCounts.failed)} failed`} icon={CalendarCheck2} />
            <Metric label="Recipe Audits" value={number(recipeAudits.length)} detail={`${recipeAudits.filter((audit) => audit.score >= 75).length} healthy pages`} icon={Utensils} />
          </div>

          <div className="soft-card rounded-lg p-5">
            <div className="mb-4 flex items-center gap-2 text-lg font-black text-slate-950"><BarChart3 className="h-5 w-5 text-violet-600" />Priority Opportunities</div>
            {google.opportunities?.length ? (
              <div className="divide-y divide-slate-100">
                {google.opportunities.slice(0, 8).map((item) => (
                  <div key={`${item.type}-${item.key}`} className="grid gap-2 py-3 md:grid-cols-[150px_1fr_auto] md:items-center">
                    <span className="w-fit rounded-md bg-violet-50 px-2 py-1 text-xs font-black text-violet-700 ring-1 ring-violet-100">{item.type}</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">{item.key}</div>
                      <div className="mt-1 text-xs font-medium text-slate-500">{item.recommendation}</div>
                    </div>
                    <div className="text-xs font-black text-slate-600">{number(item.impressions)} impressions</div>
                  </div>
                ))}
              </div>
            ) : <div className="text-sm font-medium text-slate-500">Refresh Search Console data to build prioritized opportunities.</div>}
          </div>
        </div>
      ) : null}

      {activeTab === "search" ? (
        <div className="space-y-5">
          {!google.connected ? <EmptyConnection title="Connect Google Search Console" message="Add a Desktop OAuth client in Settings to measure clicks, impressions, rankings, and index status." onSettings={openAnalyticsSettings} /> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Clicks" value={number(google.current?.clicks)} detail={change(google.changes?.clicks)} icon={Search} />
                <Metric label="Impressions" value={number(google.current?.impressions)} detail={change(google.changes?.impressions)} icon={BarChart3} />
                <Metric label="CTR" value={percent(google.current?.ctr)} detail={change(google.changes?.ctr)} icon={CheckCircle2} />
                <Metric label="Average Position" value={number(google.current?.position, 1)} detail={`${number(snapshot?.days || days)} day window`} icon={Search} />
              </div>
              {google.error ? <div className="rounded-md bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 ring-1 ring-rose-100">{google.error}</div> : null}
              <div className="soft-card overflow-hidden rounded-lg">
                <div className="border-b border-slate-100 px-4 py-3 font-black text-slate-900">Top Search Queries</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500"><tr><th className="px-4 py-3">Query</th><th className="px-4 py-3">Clicks</th><th className="px-4 py-3">Impressions</th><th className="px-4 py-3">CTR</th><th className="px-4 py-3">Position</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{(google.queries || []).slice(0, 50).map((row) => <tr key={row.key}><td className="max-w-xl px-4 py-3 font-bold text-slate-900">{row.key}</td><td className="px-4 py-3">{number(row.clicks)}</td><td className="px-4 py-3">{number(row.impressions)}</td><td className="px-4 py-3">{percent(row.ctr)}</td><td className="px-4 py-3">{number(row.position, 1)}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {activeTab === "pinterest" ? (
        <div className="space-y-5">
          {!pinterest.connected && !pinterest.summary ? <EmptyConnection title="Connect Pinterest Analytics" message="Add a Pinterest analytics token in Settings, or import Pinterest analytics in Trends." onSettings={openAnalyticsSettings} /> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Impressions" value={number(pinterestSummary.impressions)} detail={pinterest.source === "csv" ? "Imported CSV" : "Pinterest API"} icon={BarChart3} />
                <Metric label="Pin Clicks" value={number(pinterestSummary.pinClicks)} icon={Pin} />
                <Metric label="Outbound Clicks" value={number(pinterestSummary.outboundClicks)} icon={ExternalLink} />
                <Metric label="Saves" value={number(pinterestSummary.saves)} icon={CheckCircle2} />
              </div>
              {pinterest.error ? <div className="rounded-md bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 ring-1 ring-rose-100">{pinterest.error}</div> : null}
              <div className="soft-card overflow-hidden rounded-lg">
                <div className="border-b border-slate-100 px-4 py-3"><div className="font-black text-slate-900">Interest Cluster Performance</div><div className="mt-1 text-xs font-semibold text-slate-500">Performance is grouped by the specific use case each Pin serves, not only by broad recipe category.</div></div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500"><tr><th className="px-4 py-3">Use case</th><th className="px-4 py-3">Pins</th><th className="px-4 py-3">Impressions</th><th className="px-4 py-3">Save rate</th><th className="px-4 py-3">Outbound rate</th><th className="px-4 py-3">Habit score</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {pinterestClusters.slice(0, 30).map((cluster) => <tr key={cluster.id}><td className="px-4 py-3 font-black text-slate-900">{cluster.label}</td><td className="px-4 py-3">{number(cluster.pins)}</td><td className="px-4 py-3">{number(cluster.impressions)}</td><td className="px-4 py-3">{percent(cluster.saveRate)}</td><td className="px-4 py-3">{percent(cluster.outboundRate)}</td><td className="px-4 py-3 font-black text-violet-700">{number(cluster.habitScore)}</td></tr>)}
                      {!pinterestClusters.length ? <tr><td colSpan="6" className="px-4 py-8 text-center font-medium text-slate-500">Import or refresh Pin-level analytics to build cluster performance.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="soft-card overflow-hidden rounded-lg">
                <div className="border-b border-slate-100 px-4 py-3 font-black text-slate-900">Top Pins</div>
                <div className="divide-y divide-slate-100">
                  {(pinterest.topPins || []).slice(0, 50).map((pin, index) => (
                    <div key={pin.pin_id || pin.id || index} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_repeat(4,90px)]">
                      <div className="truncate font-bold text-slate-900">{pin.title || pin.pin_id || pin.id || pin.keyword || `Pin ${index + 1}`}</div>
                      <div className="text-xs font-bold text-slate-500">{number(pin.metrics?.IMPRESSION ?? pin.impressions)} views</div>
                      <div className="text-xs font-bold text-slate-500">{number(pin.metrics?.PIN_CLICK ?? pin.pinClicks)} clicks</div>
                      <div className="text-xs font-bold text-slate-500">{number(pin.metrics?.OUTBOUND_CLICK ?? pin.outboundClicks)} outbound</div>
                      <div className="text-xs font-bold text-slate-500">{number(pin.metrics?.SAVE ?? pin.saves)} saves</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {activeTab === "ghl" ? (
        <div className="space-y-4">
          <div className="flex justify-end"><Button variant="secondary" onClick={refreshGhl} disabled={!!busy}><RefreshCw className={`h-4 w-4 ${busy === "ghl" ? "animate-spin" : ""}`} />Check Planner Status</Button></div>
          <div className="soft-card overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500"><tr><th className="px-4 py-3">Post</th><th className="px-4 py-3">Platform</th><th className="px-4 py-3">Scheduled</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Verified</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {ghlReceipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td className="max-w-md px-4 py-3"><div className="truncate font-bold text-slate-900">{receipt.caption || `GHL post ${receipt.postId || receipt.row}`}</div>{receipt.verificationError || receipt.error ? <div className="mt-1 text-xs font-bold text-rose-600">{receipt.verificationError || receipt.error}</div> : null}</td>
                      <td className="px-4 py-3 font-bold capitalize">{receipt.platform || "social"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{receipt.scheduleDate ? new Date(receipt.scheduleDate).toLocaleString() : "Not available"}</td>
                      <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs font-black capitalize ring-1 ${statusTone(receipt.status)}`}>{String(receipt.status || "unknown").replaceAll("_", " ")}</span></td>
                      <td className="px-4 py-3">{receipt.verified ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}</td>
                    </tr>
                  ))}
                  {!ghlReceipts.length ? <tr><td colSpan="5" className="px-4 py-10 text-center font-medium text-slate-500">GHL upload receipts will appear here after direct upload.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "recipes" ? (
        <div className="space-y-4">
          <div className="flex justify-end"><Button onClick={auditAll} disabled={!!busy || !publishedArticles.length}><Utensils className="h-4 w-4" />{busy === "audit-all" ? "Auditing..." : "Audit All Published Recipes"}</Button></div>
          <div className="soft-card overflow-hidden rounded-lg">
            <div className="divide-y divide-slate-100">
              {publishedArticles.map((article) => {
                const audit = auditsByUrl.get(article.wordpressPostUrl) || article.postPublishSeoAudit;
                return (
                  <div key={article.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_110px_160px_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="truncate font-black text-slate-900">{article.generatedTitle || article.title}</div>
                      <div className="mt-1 truncate text-xs font-medium text-slate-500">{article.wordpressPostUrl}</div>
                      {audit?.google?.coverageState ? <div className="mt-1 text-xs font-bold text-slate-600">Google: {audit.google.coverageState}</div> : null}
                    </div>
                    <div>{audit ? <span className={`rounded-md px-2 py-1 text-xs font-black ring-1 ${audit.score >= 75 ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-amber-50 text-amber-700 ring-amber-100"}`}>{audit.score}/100</span> : <span className="text-xs font-bold text-slate-400">Not audited</span>}</div>
                    <div className="text-xs font-bold text-slate-500">{audit ? `${audit.recipeFound ? "Recipe schema found" : "Recipe schema missing"}${audit.missingAltImages ? `, ${audit.missingAltImages} missing alt` : ""}` : ""}</div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => auditArticle(article)} disabled={!!busy}><RefreshCw className={`h-4 w-4 ${busy === `audit-${article.id}` ? "animate-spin" : ""}`} />Audit</Button>
                      <Button variant="ghost" onClick={() => electronAPI.openExternalUrl(article.wordpressPostUrl)}><ExternalLink className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })}
              {!publishedArticles.length ? <div className="px-4 py-10 text-center font-medium text-slate-500">Published WordPress recipes will appear here.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
