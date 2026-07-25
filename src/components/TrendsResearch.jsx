import { BarChart3, Download, FilePlus2, Search, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { Button, EmptyState, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { buildSmartArticleDefaults } from "@/lib/smartContentEngine";

const countries = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["MA", "Morocco"]
];

const goals = [
  ["traffic", "Website Traffic"],
  ["pinterest", "Pinterest Growth"],
  ["seasonal", "Seasonal Opportunities"],
  ["authority", "Topical Authority"]
];

function number(value) {
  return new Intl.NumberFormat("en-US", { notation: Number(value) >= 100000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function scoreTone(score) {
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 60) return "bg-violet-100 text-violet-700";
  return "bg-slate-100 text-slate-600";
}

function normalizedTitle(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export default function TrendsResearch({ settings, articles, refreshArticles, setActiveScreen, setArticlesWorkflowStage }) {
  const [seed, setSeed] = useState("");
  const [geo, setGeo] = useState("US");
  const [goal, setGoal] = useState("traffic");
  const [analytics, setAnalytics] = useState(null);
  const [history, setHistory] = useState([]);
  const [research, setResearch] = useState(null);
  const [selected, setSelected] = useState([]);
  const [working, setWorking] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("opportunity");
  const [intentFilter, setIntentFilter] = useState("all");
  const [evidenceFilter, setEvidenceFilter] = useState("all");
  const [hideOverlap, setHideOverlap] = useState(false);

  async function loadWorkspace() {
    const workspace = await electronAPI.getTrendWorkspace?.();
    setAnalytics(workspace?.analytics || null);
    setHistory(workspace?.history || []);
  }

  useEffect(() => {
    loadWorkspace().catch((error) => setStatus(error.message || "Could not load trend research."));
  }, []);

  const keywords = research?.keywords || [];
  const summary = analytics?.summary || {};
  const selectedKeywords = useMemo(() => selected.map((index) => keywords[index]).filter(Boolean), [selected, keywords]);
  const visibleKeywordRows = useMemo(() => keywords
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => intentFilter === "all" || (item.intent || "informational") === intentFilter)
    .filter(({ item }) => evidenceFilter === "all" || (item.evidenceConfidence || "low") === evidenceFilter)
    .filter(({ item }) => !hideOverlap || !item.cannibalization?.title)
    .sort((left, right) => {
      if (sortBy === "pinterest") {
        const score = (entry) => Number(entry.pinterestEvidence?.outboundClicks || 0) * 8 + Number(entry.pinterestEvidence?.pinClicks || 0) * 4 + Number(entry.pinterestEvidence?.saves || 0) * 3;
        return score(right.item) - score(left.item);
      }
      if (sortBy === "freshness") {
        const rank = { combined: 4, live_search: 3, pinterest_performance: 2, seasonal_inference: 1, evergreen_inference: 0 };
        return (rank[right.item.evidenceType] || 0) - (rank[left.item.evidenceType] || 0);
      }
      if (sortBy === "low-competition") {
        const rank = { low: 3, medium: 2, unknown: 1, high: 0 };
        return (rank[right.item.competition] || 0) - (rank[left.item.competition] || 0) || right.item.opportunityScore - left.item.opportunityScore;
      }
      return right.item.opportunityScore - left.item.opportunityScore;
    }), [keywords, sortBy, intentFilter, evidenceFilter, hideOverlap]);

  async function importPinterestData() {
    setWorking("import");
    setStatus("Importing Pinterest Analytics...");
    try {
      const result = await electronAPI.importPinterestAnalytics?.();
      if (result?.canceled) {
        setStatus("");
        return;
      }
      if (!result?.success) throw new Error(result?.error || "Pinterest Analytics import failed.");
      setAnalytics(result.analytics);
      setStatus(`Imported ${number(result.analytics?.summary?.rowCount)} Pins from ${result.analytics?.fileName}.`);
    } catch (error) {
      setStatus(error.message || "Pinterest Analytics import failed.");
    } finally {
      setWorking("");
    }
  }

  async function clearPinterestData() {
    if (!analytics || !window.confirm("Remove the imported Pinterest Analytics data? Saved keyword research will stay available.")) return;
    await electronAPI.clearPinterestAnalytics?.();
    setAnalytics(null);
    setStatus("Pinterest Analytics data removed.");
  }

  async function runResearch() {
    if (!seed.trim()) {
      setStatus("Enter a seed topic or keyword first.");
      return;
    }
    const jobKey = `keyword-research-${Date.now()}`;
    setWorking(jobKey);
    setStatus("Ranking live trends and Pinterest click evidence...");
    try {
      const result = await electronAPI.researchKeywords?.({
        seed: seed.trim(),
        geo,
        goal,
        settings,
        existingTitles: articles.map((article) => article.generatedTitle || article.title).filter(Boolean),
        jobKey
      });
      if (!result?.success) throw new Error(result?.error || "Keyword research failed.");
      setResearch(result.research);
      setHistory(result.history || []);
      setSelected((result.research?.keywords || []).map((_, index) => index).filter((index) => index < 5));
      setStatus(result.warning ? `Research ready with note: ${result.warning}` : "Keyword research ready.");
    } catch (error) {
      setStatus(error.message || "Keyword research failed.");
    } finally {
      setWorking("");
    }
  }

  async function cancelResearch() {
    if (!working.startsWith("keyword-research-")) return;
    await electronAPI.cancelJob?.(working);
    setWorking("");
    setStatus("Keyword research canceled.");
  }

  async function exportResearch() {
    if (!research) return;
    setWorking("export");
    try {
      const result = await electronAPI.exportKeywordResearch?.(research);
      if (result?.success) setStatus(`Saved ${result.rowCount} keywords to ${result.filePath}`);
      else if (!result?.canceled) setStatus(result?.error || "Keyword export failed.");
    } finally {
      setWorking("");
    }
  }

  function toggleSelected(index) {
    setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
  }

  function loadResearch(item) {
    setResearch(item);
    setSeed(item.seed || "");
    setGeo(item.geo || "US");
    setGoal(item.goal || "traffic");
    setSelected([]);
    setStatus("Saved research loaded.");
  }

  async function deleteResearch(item) {
    const result = await electronAPI.deleteKeywordResearch?.(item.id);
    setHistory(result?.history || []);
    if (research?.id === item.id) {
      setResearch(null);
      setSelected([]);
    }
  }

  async function queueArticles() {
    if (!selectedKeywords.length) {
      setStatus("Select at least one keyword first.");
      return;
    }
    const conflicts = selectedKeywords.filter((item) => item.cannibalization?.title);
    if (conflicts.length && !window.confirm(`${conflicts.length} selected idea${conflicts.length === 1 ? "" : "s"} may overlap an existing article. Queue them anyway?`)) return;
    setWorking("queue");
    try {
      const existing = new Set(articles.map((article) => normalizedTitle(article.generatedTitle || article.title)));
      const unique = selectedKeywords.filter((item) => !existing.has(normalizedTitle(item.suggestedTitle)));
      const preset = settings.projectPresets?.find((item) => item.id === "preset-pinterest-recipe-traffic") || {};
      const now = Date.now();
      for (const [index, item] of unique.entries()) {
        const smart = buildSmartArticleDefaults({
          title: item.suggestedTitle,
          mode: item.contentType === "listicle" ? "listicle" : "article",
          settings,
          preset,
          manual: {
            targetKeyword: item.keyword,
            secondaryKeywords: "",
            searchIntent: item.intent || "informational",
            audience: "Recipe readers searching for practical, reliable cooking ideas",
            competitorNotes: [item.rationale, item.evidenceLabel ? `Evidence: ${item.evidenceLabel} (${item.evidenceConfidence || "low"} confidence)` : "", item.readerProblem ? `Reader problem: ${item.readerProblem}` : "", item.uniqueValue ? `Unique value: ${item.uniqueValue}` : "", item.publishWindow ? `Publish window: ${item.publishWindow}` : ""].filter(Boolean).join("\n"),
            brandVoiceId: preset.brandVoiceId || ""
          }
        });
        await electronAPI.saveArticle({
          id: `trend-${now}-${index}`,
          title: item.suggestedTitle,
          generatedTitle: null,
          content: "",
          type: item.contentType === "listicle" ? "listicle" : "article",
          category: smart.category,
          workflowStatus: "draft-generated",
          projectPresetId: preset.id || "",
          wordpressSiteId: preset.wordpressSiteId || "",
          brandVoiceId: smart.brandVoiceId,
          articleLength: smart.articleLength,
          recipeCardEnabled: smart.recipeCardEnabled,
          smartIntentId: smart.smartIntentId,
          smartIntentLabel: smart.smartIntentLabel,
          smartPinStyle: smart.smartPinStyle,
          requireOutlineApproval: false,
          outlineApproved: true,
          outline: "",
          seoBrief: smart.seoBrief,
          keywordResearchId: research.id,
          keywordOpportunityScore: item.opportunityScore,
          recommendedPinterestBoard: item.board || "",
          metaTitle: "",
          metaDescription: "",
          slug: "",
          excerpt: "",
          tags: [],
          seoScore: null,
          seoChecks: [],
          publishHistory: [],
          featuredImageAlt: "",
          featuredImage: "",
          featuredImageLocalPath: "",
          featuredImagePrompt: "",
          images: [],
          queueStatus: "pending",
          errorMessage: ""
        });
      }
      await refreshArticles();
      setStatus(`Added ${unique.length} research-backed article idea${unique.length === 1 ? "" : "s"} to the queue.`);
      setArticlesWorkflowStage?.("queued");
      setActiveScreen("articles");
    } catch (error) {
      setStatus(error.message || "Could not queue article ideas.");
    } finally {
      setWorking("");
    }
  }

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="Search intelligence" title="Trends Research">
        Separate live search surges from proven Pinterest clicks and evergreen ideas before building the article queue.
      </SectionHeader>

      <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="glass rounded-lg p-5 shadow-panel">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.5fr_0.8fr_0.9fr]">
            <Field label="Seed Topic">
              <input className={inputClass} value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="high protein chicken dinners" onKeyDown={(event) => event.key === "Enter" && !working && runResearch()} />
            </Field>
            <Field label="Country">
              <select className={inputClass} value={geo} onChange={(event) => setGeo(event.target.value)}>{countries.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </Field>
            <Field label="Research Goal">
              <select className={inputClass} value={goal} onChange={(event) => setGoal(event.target.value)}>{goals.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={runResearch} disabled={!!working || !seed.trim()}><Search className="h-4 w-4" />Research Keywords</Button>
            {working.startsWith("keyword-research-") ? <Button variant="secondary" onClick={cancelResearch}>Cancel</Button> : null}
            <Button variant="secondary" onClick={importPinterestData} disabled={!!working}><Upload className="h-4 w-4" />Import Pinterest CSV</Button>
            <Button variant="secondary" onClick={exportResearch} disabled={!!working || !research}><Download className="h-4 w-4" />Export Research</Button>
          </div>
          {status ? <div className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{status}</div> : null}
        </div>

        <div className="soft-card rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-indigo-600">Pinterest Evidence</div>
              <h2 className="mt-1 truncate text-base font-black text-slate-900">{analytics?.fileName || "No CSV imported"}</h2>
            </div>
            {analytics ? <button type="button" className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100" title="Remove Pinterest data" onClick={clearPinterestData}><Trash2 className="h-4 w-4" /></button> : null}
          </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
            {[["Pins", summary.rowCount], ["Pin Clicks", summary.pinClicks], ["Outbound", summary.outboundClicks], ["Saves", summary.saves]].map(([label, value]) => (
              <div key={label} className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-100"><div className="text-lg font-black text-slate-900">{number(value)}</div><div className="text-xs font-bold text-slate-500">{label}</div></div>
            ))}
          </div>
        </div>
      </div>

      {research ? (
        <>
          <div className="mb-5 soft-card rounded-lg p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase text-indigo-600">{research.sourceLabel}</div>
                <h2 className="mt-1 text-xl font-black text-slate-900">{research.seed}</h2>
                <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">{research.summary}</p>
              </div>
              <Button onClick={queueArticles} disabled={!!working || !selectedKeywords.length}><FilePlus2 className="h-4 w-4" />Queue Selected Articles</Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-md bg-violet-50 p-4 ring-1 ring-violet-100">
                <div className="text-xs font-black uppercase text-violet-700">Seasonal Opportunities</div>
                <div className="mt-2 flex flex-wrap gap-2">{(research.seasonalOpportunities || []).map((item) => <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-violet-100">{item}</span>)}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-4 ring-1 ring-slate-100">
                <div className="text-xs font-black uppercase text-slate-600">Priority Plan</div>
                <ol className="mt-2 space-y-1 text-sm font-semibold text-slate-600">{(research.contentPlan || []).slice(0, 5).map((item, index) => <li key={`${item}-${index}`}>{index + 1}. {item}</li>)}</ol>
              </div>
            </div>
          </div>

          <div className="mb-5 overflow-hidden rounded-lg bg-white shadow-panel ring-1 ring-slate-200">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div><h2 className="font-black text-slate-900">Keyword Opportunities</h2><p className="text-xs font-semibold text-slate-500">{selectedKeywords.length} selected / {visibleKeywordRows.length} shown / {keywords.length} total</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                  <select className={`${inputClass} h-9 w-44 py-1 text-xs`} value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="opportunity">Best opportunity</option><option value="pinterest">Most Pinterest clicks</option><option value="freshness">Freshest evidence</option><option value="low-competition">Lowest competition</option></select>
                  <select className={`${inputClass} h-9 w-36 py-1 text-xs`} value={intentFilter} onChange={(event) => setIntentFilter(event.target.value)}><option value="all">All intents</option><option value="informational">Informational</option><option value="commercial">Commercial</option><option value="transactional">Transactional</option><option value="navigational">Navigational</option></select>
                  <select className={`${inputClass} h-9 w-36 py-1 text-xs`} value={evidenceFilter} onChange={(event) => setEvidenceFilter(event.target.value)}><option value="all">All confidence</option><option value="high">High confidence</option><option value="medium">Medium confidence</option><option value="low">Low confidence</option></select>
                  <label className="flex h-9 items-center gap-2 rounded-md bg-slate-50 px-3 text-xs font-bold text-slate-600 ring-1 ring-slate-200"><input type="checkbox" checked={hideOverlap} onChange={(event) => setHideOverlap(event.target.checked)} />Hide overlap</label>
                  <button type="button" className="text-sm font-black text-indigo-600" onClick={() => {
                    const visibleIndexes = visibleKeywordRows.map((row) => row.index);
                    const allSelected = visibleIndexes.length && visibleIndexes.every((index) => selected.includes(index));
                    setSelected((current) => allSelected ? current.filter((index) => !visibleIndexes.includes(index)) : [...new Set([...current, ...visibleIndexes])]);
                  }}>{visibleKeywordRows.length && visibleKeywordRows.every((row) => selected.includes(row.index)) ? "Clear Shown" : "Select Shown"}</button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="w-12 px-4 py-3"></th><th className="px-3 py-3">Keyword and Article</th><th className="px-3 py-3">Score</th><th className="px-3 py-3">Intent and Cluster</th><th className="px-3 py-3">Pinterest Evidence</th><th className="px-3 py-3">Evidence and Timing</th><th className="px-3 py-3">Board</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleKeywordRows.map(({ item, index }) => (
                    <tr key={`${item.keyword}-${index}`} className={selected.includes(index) ? "bg-violet-50/50" : "bg-white"}>
                      <td className="px-4 py-4 align-top"><input type="checkbox" checked={selected.includes(index)} onChange={() => toggleSelected(index)} aria-label={`Select ${item.keyword}`} /></td>
                      <td className="max-w-md px-3 py-4 align-top"><div className="font-black text-slate-900">{item.keyword}</div><div className="mt-1 font-semibold text-slate-600">{item.suggestedTitle}</div><div className="mt-1 text-xs leading-5 text-slate-500">{item.rationale}</div>{item.cannibalization?.title ? <div className="mt-2 rounded-md bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">Possible overlap: {item.cannibalization.title}</div> : null}</td>
                      <td className="px-3 py-4 align-top"><span className={`inline-flex min-w-12 justify-center rounded-full px-2.5 py-1 text-xs font-black ${scoreTone(item.opportunityScore)}`}>{item.opportunityScore}</span><div className="mt-2 text-xs font-bold text-slate-500">{item.competition || "unknown"} competition</div></td>
                      <td className="px-3 py-4 align-top font-bold text-slate-600">{item.intent || "informational"}<div className="mt-1 text-xs text-slate-500">{item.contentType || "article"}</div><div className="mt-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.cluster || research.seed}</div></td>
                      <td className="px-3 py-4 align-top"><div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><span className="text-slate-500">Outbound</span><strong>{number(item.pinterestEvidence?.outboundClicks)}</strong><span className="text-slate-500">Pin clicks</span><strong>{number(item.pinterestEvidence?.pinClicks)}</strong><span className="text-slate-500">Saves</span><strong>{number(item.pinterestEvidence?.saves)}</strong><span className="text-slate-500">Views</span><strong>{number(item.pinterestEvidence?.impressions)}</strong></div></td>
                      <td className="max-w-56 px-3 py-4 align-top text-xs font-semibold leading-5 text-slate-600"><span className={`inline-flex rounded-full px-2 py-1 font-black ${item.evidenceConfidence === "high" ? "bg-emerald-100 text-emerald-700" : item.evidenceConfidence === "medium" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{item.evidenceLabel || item.trendSignal || "Inferred"} / {item.evidenceConfidence || "low"}</span><div className="mt-2">{item.freshnessLabel || "Evidence date unavailable"}</div><div className="mt-1 font-bold text-indigo-600">{item.publishWindow || item.seasonalTiming}</div></td>
                      <td className="max-w-44 px-3 py-4 align-top font-semibold text-slate-600">{item.board || "Auto match"}</td>
                    </tr>
                  ))}
                  {!visibleKeywordRows.length ? <tr><td colSpan="7" className="px-4 py-10 text-center text-sm font-bold text-slate-500">No opportunities match these filters.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : <EmptyState title="No keyword research yet">Enter a seed topic, then run research to build the first opportunity plan.</EmptyState>}

      {history.length ? (
        <div className="mt-5 soft-card rounded-lg p-4">
          <div className="mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-600" /><h2 className="font-black text-slate-900">Saved Research</h2></div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{history.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-md bg-white p-3 ring-1 ring-slate-200">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadResearch(item)}><div className="truncate text-sm font-black text-slate-900">{item.seed}</div><div className="mt-1 text-xs font-bold text-slate-500">{item.geo} / {item.keywords?.length || 0} keywords / {new Date(item.researchedAt).toLocaleDateString()}</div></button>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" title="Delete research" onClick={() => deleteResearch(item)}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}</div>
        </div>
      ) : null}
    </section>
  );
}
