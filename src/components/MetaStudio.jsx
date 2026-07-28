import { AlertCircle, BarChart3, CheckCircle2, Download, Facebook, Image as ImageIcon, Instagram, RefreshCw, Save, Search, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { Button, EmptyState, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { scoreMetaContent } from "@/lib/metaQuality.mjs";

const goals = [
  ["traffic", "Website Traffic"],
  ["saves", "Saves"],
  ["engagement", "Conversation"],
  ["seasonal", "Seasonal Reach"]
];

const countries = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["MA", "Morocco"]
];

const imageSources = [
  ["auto", "Auto"],
  ["pin", "Pin Creator Image"],
  ["article-featured", "Article Featured Image"],
  ["article-inline", "Article In-Text Image"]
];

function parseScheduleDate(value) {
  const text = String(value || "").trim();
  const date = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? new Date(Date.now() + 30 * 60 * 1000) : date;
}

function formatScheduleDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
}

function formatDateTimeLocal(value) {
  const date = parseScheduleDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function hashtagsToText(value) {
  return Array.isArray(value) ? value.join(" ") : String(value || "");
}

function parseHashtags(value, limit) {
  return String(value || "")
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.startsWith("#") ? tag : `#${tag}`)
    .slice(0, limit);
}

function TextField({ label, value, onChange, rows = 4, hint = "" }) {
  return (
    <Field label={label} hint={hint}>
      <textarea className={`${inputClass} resize-y leading-6`} rows={rows} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function projectPack({ projectId, article, goal, content, imageAssets }) {
  const title = article?.generatedTitle || article?.title || content?.campaignTitle || "Meta campaign";
  return {
    id: projectId || `meta-${article?.id || Date.now()}`,
    articleId: article?.id || "",
    articleTitle: title,
    sourceUrl: article?.wordpressPostUrl || article?.sourceUrl || "",
    campaignStyle: `meta-${goal}`,
    platforms: ["instagram", "facebook"],
    createdAt: new Date().toISOString(),
    content: {
      instagram: content?.instagram ? {
        caption: content.instagram.feedCaption || "",
        hashtags: content.instagram.hashtags || [],
        altText: content.instagram.imageAltText || "",
        carouselSlides: content.instagram.carouselSlides || [],
        reelScript: {
          hook: content.instagram.reelHook || "",
          scenes: content.instagram.reelScenes || [],
          voiceover: content.instagram.reelVoiceover || "",
          caption: content.instagram.reelCaption || "",
          cta: content.instagram.cta || ""
        }
      } : null,
      facebook: content?.facebook ? {
        pagePost: content.facebook.primaryPost || "",
        shortPost: content.facebook.shortPost || "",
        groupPost: content.facebook.groupPost || "",
        reelCaption: content.facebook.reelCaption || "",
        cta: content.facebook.cta || "",
        hashtags: content.facebook.hashtags || [],
        altText: content.facebook.imageAltText || ""
      } : null
    },
    imageAssets: imageAssets || []
  };
}

export default function MetaStudio({ articles, settings }) {
  const confirmAction = useConfirmDialog();
  const completedArticles = useMemo(() => articles.filter((article) => article.queueStatus === "completed"), [articles]);
  const [query, setQuery] = useState("");
  const [articleId, setArticleId] = useState("");
  const [geo, setGeo] = useState("US");
  const [goal, setGoal] = useState("traffic");
  const [activePlatform, setActivePlatform] = useState("facebook");
  const [research, setResearch] = useState(null);
  const [content, setContent] = useState(null);
  const [imageAssets, setImageAssets] = useState([]);
  const [imageSource, setImageSource] = useState("auto");
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [ghlHeaders, setGhlHeaders] = useState([]);
  const [ghlRows, setGhlRows] = useState([]);
  const [showGhlEditor, setShowGhlEditor] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [intervalHours, setIntervalHours] = useState(String(Math.max(1, Math.round(Number(settings?.pinCreator?.postInterval || 120) / 60))));

  useEffect(() => {
    electronAPI.getMetaProjects?.().then((result) => {
      if (result?.success) setProjects(result.projects || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!articleId && completedArticles.length) setArticleId(completedArticles[0].id);
  }, [articleId, completedArticles]);

  const filteredArticles = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return completedArticles;
    return completedArticles.filter((article) => [article.title, article.generatedTitle, article.wordpressPostUrl, article.sourceUrl].join(" ").toLowerCase().includes(value));
  }, [completedArticles, query]);
  const article = completedArticles.find((item) => item.id === articleId) || null;

  function clearOutputForArticle(nextArticleId) {
    setArticleId(nextArticleId);
    setProjectId("");
    setResearch(null);
    setContent(null);
    setImageAssets([]);
    setGhlRows([]);
    setShowGhlEditor(false);
  }

  async function researchTrends() {
    if (!article) return setStatus("Choose a completed article first.");
    setWorking(true);
    setStatus("Loading live trend signals and ranking useful angles...");
    try {
      const result = await electronAPI.researchMetaTrends?.({ article, geo, goal, settings, jobKey: `meta-trends-${Date.now()}` });
      if (!result?.success) throw new Error(result?.error || "Trend research failed.");
      setResearch(result.research);
      setStatus(result.warning ? `Research ready with note: ${result.warning}` : "Trend research ready.");
    } catch (error) {
      setStatus(error.message || "Trend research failed.");
    } finally {
      setWorking(false);
    }
  }

  async function generateContent() {
    if (!article) return setStatus("Choose a completed article first.");
    setWorking(true);
    setStatus("Creating dedicated Facebook and Instagram content...");
    try {
      let currentResearch = research;
      if (!currentResearch) {
        const trendResult = await electronAPI.researchMetaTrends?.({ article, geo, goal, settings, jobKey: `meta-trends-${Date.now()}` });
        if (trendResult?.success) {
          currentResearch = trendResult.research;
          setResearch(currentResearch);
        }
      }
      const result = await electronAPI.generateMetaContent?.({ article, research: currentResearch || {}, goal, settings, jobKey: `meta-content-${Date.now()}` });
      if (!result?.success) throw new Error(result?.error || "Meta content generation failed.");
      setContent(result.content);
      setStatus("Facebook and Instagram content is ready to edit.");
    } catch (error) {
      setStatus(error.message || "Meta content generation failed.");
    } finally {
      setWorking(false);
    }
  }

  function updateFacebook(field, value) {
    setContent((current) => ({ ...current, facebook: { ...(current?.facebook || {}), [field]: value } }));
    setGhlRows([]);
    setShowGhlEditor(false);
  }

  function updateInstagram(field, value) {
    setContent((current) => ({ ...current, instagram: { ...(current?.instagram || {}), [field]: value } }));
    setGhlRows([]);
    setShowGhlEditor(false);
  }

  function updateStrategy(field, value) {
    setContent((current) => ({ ...current, strategy: { ...(current?.strategy || {}), [field]: value } }));
    setGhlRows([]);
    setShowGhlEditor(false);
  }

  function updateCarousel(index, field, value) {
    const slides = [...(content?.instagram?.carouselSlides || [])];
    slides[index] = { ...(slides[index] || {}), [field]: value };
    updateInstagram("carouselSlides", slides);
  }

  function addCarouselSlide() {
    updateInstagram("carouselSlides", [...(content?.instagram?.carouselSlides || []), { heading: "", body: "" }].slice(0, 8));
  }

  function removeCarouselSlide(index) {
    updateInstagram("carouselSlides", (content?.instagram?.carouselSlides || []).filter((_, itemIndex) => itemIndex !== index));
  }

  async function reuseImage() {
    if (!article || !content) return setStatus("Generate Meta content first.");
    setWorking(true);
    setStatus("Finding and resizing an existing article or pin image...");
    try {
      const pinResult = await electronAPI.getPinCreatorPins?.();
      const pack = projectPack({ projectId, article, goal, content, imageAssets });
      const result = await electronAPI.createRepurposeImageVariants?.({
        packs: [pack],
        pins: pinResult?.pins || [],
        articles,
        platforms: ["instagram", "facebook"],
        imageSource
      });
      if (!result?.success) throw new Error(result?.error || "Could not reuse an image.");
      const nextAssets = result.packs?.[0]?.imageAssets || [];
      setImageAssets(nextAssets);
      setStatus(nextAssets.length ? "Shared Facebook and Instagram image is ready." : "No reusable image was found for this article.");
    } catch (error) {
      setStatus(error.message || "Could not reuse an image.");
    } finally {
      setWorking(false);
    }
  }

  async function saveProject() {
    if (!article || !content) return setStatus("Generate content before saving the campaign.");
    setWorking(true);
    try {
      const result = await electronAPI.saveMetaProject?.({
        id: projectId,
        articleId: article.id,
        articleTitle: article.generatedTitle || article.title,
        sourceUrl: article.wordpressPostUrl || article.sourceUrl || "",
        geo,
        goal,
        research,
        content,
        imageAssets,
        createdAt: projects.find((item) => item.id === projectId)?.createdAt || new Date().toISOString()
      });
      if (!result?.success) throw new Error(result?.error || "Could not save Meta campaign.");
      setProjectId(result.project.id);
      setProjects(result.projects || []);
      setStatus("Meta campaign saved.");
    } catch (error) {
      setStatus(error.message || "Could not save Meta campaign.");
    } finally {
      setWorking(false);
    }
  }

  function loadProject(project) {
    setProjectId(project.id);
    setArticleId(project.articleId || "");
    setGeo(project.geo || "US");
    setGoal(project.goal || "traffic");
    setResearch(project.research || null);
    setContent(project.content || null);
    setImageAssets(project.imageAssets || []);
    setGhlRows([]);
    setShowGhlEditor(false);
    setStatus("Saved Meta campaign loaded.");
  }

  async function deleteProject(id) {
    if (!await confirmAction({
      title: "Delete Meta campaign",
      message: "This saved Meta campaign will be removed from local storage.",
      confirmLabel: "Delete",
      tone: "danger"
    })) return;
    const result = await electronAPI.deleteMetaProject?.(id);
    if (result?.success) {
      setProjects(result.projects || []);
      if (projectId === id) setProjectId("");
      setStatus("Meta campaign deleted.");
    }
  }

  async function prepareGhl() {
    if (!article || !content) return setStatus("Generate content before preparing GHL.");
    if (quality.score < 70 && !await confirmAction({
      title: "Prepare lower-quality content",
      message: `Meta quality is ${quality.score}/100. Prepare the GHL rows anyway?`,
      confirmLabel: "Prepare Anyway"
    })) return;
    setWorking(true);
    setStatus("Preparing dedicated Facebook and Instagram GHL rows...");
    try {
      const pack = projectPack({ projectId, article, goal, content, imageAssets });
      const result = await electronAPI.prepareRepurposeGhlRows?.({ packs: [pack] });
      if (!result?.success) throw new Error(result?.error || "Could not prepare GHL rows.");
      setGhlHeaders(result.headers || []);
      setGhlRows(result.rows || []);
      setStartTime(formatDateTimeLocal(result.rows?.[0]?.[0]));
      setShowGhlEditor(true);
      const missing = result.missingImageCount ? ` ${result.missingImageCount} row${result.missingImageCount === 1 ? "" : "s"} need an image URL.` : "";
      setStatus(`GHL editor ready with ${result.rows?.length || 0} platform-specific rows.${missing}`);
    } catch (error) {
      setStatus(error.message || "Could not prepare GHL rows.");
    } finally {
      setWorking(false);
    }
  }

  function applySchedule() {
    const start = parseScheduleDate(startTime);
    const intervalMs = Math.max(1, Number(intervalHours) || 1) * 60 * 60 * 1000;
    setGhlRows((rows) => rows.map((row, index) => {
      const next = [...row];
      next[0] = formatScheduleDate(new Date(start.getTime() + index * intervalMs));
      return next;
    }));
    setStatus("Schedule applied to the Facebook and Instagram rows.");
  }

  function updateGhlCell(rowIndex, columnIndex, value) {
    setGhlRows((rows) => rows.map((row, index) => {
      if (index !== rowIndex) return row;
      const next = [...row];
      next[columnIndex] = value;
      return next;
    }));
  }

  async function exportGhl() {
    if (!ghlRows.length) return setStatus("Prepare the GHL editor first.");
    const result = await electronAPI.exportRepurposeGhlRows?.({ headers: ghlHeaders, rows: ghlRows });
    setStatus(result?.success ? `GHL CSV saved: ${result.filePath}` : result?.error || "GHL export canceled.");
  }

  async function uploadGhl() {
    if (!ghlRows.length) return setStatus("Prepare the GHL editor first.");
    setWorking(true);
    try {
      const result = await electronAPI.uploadRepurposeGhlRows?.({ headers: ghlHeaders, rows: ghlRows });
      if (result?.success) {
        const count = result.createdCount || ghlRows.length;
        const verificationNote = result.unverifiedCount
          ? ` ${result.verifiedCount || 0} verified; ${result.unverifiedCount} accepted but not yet confirmed.`
          : ` ${result.verifiedCount || count} verified in the planner.`;
        setStatus(`Scheduled ${count} Meta post${count === 1 ? "" : "s"} in GHL.${verificationNote}`);
      } else {
        setStatus(result?.error || "GHL upload failed.");
      }
    } catch (error) {
      setStatus(error.message || "GHL upload failed.");
    } finally {
      setWorking(false);
    }
  }

  const activeImage = imageAssets.find((asset) => asset.fileUrl || asset.publicUrl || asset.imgbbUrl || asset.remoteImageUrl);
  const quality = useMemo(() => scoreMetaContent(content || {}, {
    sourceUrl: article?.wordpressPostUrl || article?.sourceUrl || "",
    imageAssets
  }), [article, content, imageAssets]);

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="Facebook and Instagram" title="Meta Studio">
        Build original Facebook and Instagram campaigns from a finished article, then check every post before scheduling.
      </SectionHeader>

      <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_370px]">
        <div className="soft-card rounded-lg p-4">
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_240px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} h-11 pl-12`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter completed articles..." />
            </label>
            <select className={inputClass} value={articleId} onChange={(event) => clearOutputForArticle(event.target.value)}>
              {!filteredArticles.length ? <option value="">No completed articles</option> : null}
              {filteredArticles.map((item) => <option key={item.id} value={item.id}>{item.generatedTitle || item.title}</option>)}
            </select>
          </div>

          {article ? (
            <div className="rounded-md bg-slate-50 p-4 ring-1 ring-slate-100">
              <div className="text-xs font-black uppercase text-indigo-600">Selected article</div>
              <h2 className="mt-1 text-lg font-black text-slate-900">{article.generatedTitle || article.title}</h2>
              <p className="mt-1 truncate text-sm font-semibold text-slate-500">{article.wordpressPostUrl || article.sourceUrl || "Local article"}</p>
            </div>
          ) : <EmptyState title="No completed articles">Complete an article first, then use it as the source for Meta content.</EmptyState>}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Trend Country">
              <select className={inputClass} value={geo} onChange={(event) => setGeo(event.target.value)}>{countries.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </Field>
            <Field label="Content Goal">
              <select className={inputClass} value={goal} onChange={(event) => setGoal(event.target.value)}>{goals.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={researchTrends} disabled={working || !article}><BarChart3 className="h-4 w-4" />Research Trends</Button>
            <Button onClick={generateContent} disabled={working || !article}><Sparkles className="h-4 w-4" />Generate Meta Content</Button>
            <Button variant="secondary" onClick={saveProject} disabled={working || !content}><Save className="h-4 w-4" />Save Campaign</Button>
          </div>
          {status ? <div className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{status}</div> : null}
        </div>

        <div className="soft-card rounded-lg p-4">
          <h2 className="text-lg font-black text-slate-900">Campaign Library</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Saved independently from Repurpose Studio.</p>
          <div className="mt-4 max-h-[390px] space-y-2 overflow-auto pr-1">
            {!projects.length ? <p className="rounded-md bg-slate-50 p-3 text-sm font-semibold text-slate-500">No saved Meta campaigns yet.</p> : projects.map((project) => (
              <div key={project.id} className={`rounded-md p-3 ring-1 ${projectId === project.id ? "bg-violet-50 ring-violet-200" : "bg-white ring-slate-200"}`}>
                <button type="button" className="w-full text-left" onClick={() => loadProject(project)}>
                  <div className="truncate text-sm font-black text-slate-900">{project.articleTitle || project.content?.campaignTitle}</div>
                  <div className="mt-1 text-xs font-bold uppercase text-slate-500">{project.geo || "US"} / {project.goal || "traffic"}</div>
                </button>
                <Button variant="danger" className="mt-2 h-8 px-2" onClick={() => deleteProject(project.id)}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {research ? (
        <div className="mb-5 soft-card rounded-lg p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase text-indigo-600">{research.sourceLabel || "Trend research"} / {research.geo}</div>
              <h2 className="mt-1 text-lg font-black text-slate-900">Trend Brief</h2>
              <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-slate-600">{research.summary}</p>
            </div>
            <Button variant="secondary" onClick={researchTrends} disabled={working}><RefreshCw className="h-4 w-4" />Refresh</Button>
          </div>
          <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold">
            <span className={`rounded-full px-3 py-1 ${research.evidenceSummary?.confidence === "medium" || research.evidenceSummary?.confidence === "high" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{research.evidenceSummary?.confidence || "low"} confidence</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{research.evidenceSummary?.freshness || "Freshness unavailable"}</span>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">{research.evidenceSummary?.method || "Evidence-aware planning"}</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-sm font-black text-slate-900">Relevant Live Signals</div>
              <div className="mt-2 space-y-2 text-sm text-slate-600">{research.relevantTrends?.length ? research.relevantTrends.map((trend, index) => <div key={index}><strong>{trend.trend}</strong><br />{trend.angle} <span className="font-bold text-indigo-600">{trend.confidence}</span></div>) : <p>No direct live match. Use seasonal or evergreen angles.</p>}</div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-sm font-black text-slate-900">Facebook Angles</div>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">{(research.facebookAngles || []).map((angle, index) => <li key={index}>{angle}</li>)}</ul>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-sm font-black text-slate-900">Instagram Angles</div>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">{(research.instagramAngles || []).map((angle, index) => <li key={index}>{angle}</li>)}</ul>
            </div>
          </div>
          {research.liveTrends?.length ? <p className="mt-3 text-xs font-semibold text-slate-500">Live source headlines loaded: {research.liveTrends.map((trend) => trend.title).join(", ")}</p> : null}
        </div>
      ) : null}

      {content ? (
        <>
          <div className="mb-5 soft-card rounded-lg p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Dedicated Content</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Each platform keeps its own copy and CTA.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-black ${quality.score >= 85 ? "bg-emerald-100 text-emerald-700" : quality.score >= 70 ? "bg-violet-100 text-violet-700" : "bg-rose-100 text-rose-700"}`}>
                  {quality.score >= 85 ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  Quality {quality.score}/100
                </div>
                <div className="inline-flex rounded-md bg-slate-100 p-1">
                  <button type="button" onClick={() => setActivePlatform("facebook")} className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-black ${activePlatform === "facebook" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}><Facebook className="h-4 w-4" />Facebook {quality.facebookScore}</button>
                  <button type="button" onClick={() => setActivePlatform("instagram")} className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-black ${activePlatform === "instagram" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}><Instagram className="h-4 w-4" />Instagram {quality.instagramScore}</button>
                </div>
              </div>
            </div>

            <div className="mb-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-2">
                <TextField label="Content Pillar" value={content.strategy?.contentPillar} onChange={(value) => updateStrategy("contentPillar", value)} rows={2} />
                <TextField label="Audience Intent" value={content.strategy?.audienceIntent} onChange={(value) => updateStrategy("audienceIntent", value)} rows={2} />
                <TextField label="Originality Angle" value={content.strategy?.originalityAngle} onChange={(value) => updateStrategy("originalityAngle", value)} rows={3} />
                <TextField label="Recommended Format" value={content.strategy?.recommendedFormat} onChange={(value) => updateStrategy("recommendedFormat", value)} rows={3} />
              </div>
              <div className="rounded-md bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3"><h3 className="font-black text-slate-900">Preflight</h3><span className="text-xs font-black uppercase text-slate-500">{quality.level}</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-gradient-to-r from-indigo-600 to-violet-500" style={{ width: `${quality.score}%` }} /></div>
                <div className="mt-3 space-y-2">
                  {quality.failed.slice(0, 6).map((check) => <div key={check.id} className="flex items-start gap-2 text-xs font-semibold text-slate-600"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />{check.label}</div>)}
                  {!quality.failed.length ? <div className="flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Ready to schedule</div> : null}
                </div>
              </div>
            </div>

            {activePlatform === "facebook" ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <TextField label="Facebook Page Post" value={content.facebook?.primaryPost} onChange={(value) => updateFacebook("primaryPost", value)} rows={8} />
                <TextField label="Short Post" value={content.facebook?.shortPost} onChange={(value) => updateFacebook("shortPost", value)} rows={5} />
                <TextField label="Group Post" value={content.facebook?.groupPost} onChange={(value) => updateFacebook("groupPost", value)} rows={7} />
                <TextField label="Facebook Reel Caption" value={content.facebook?.reelCaption} onChange={(value) => updateFacebook("reelCaption", value)} rows={5} />
                <TextField label="Link Headline" value={content.facebook?.linkHeadline} onChange={(value) => updateFacebook("linkHeadline", value)} rows={2} />
                <TextField label="CTA" value={content.facebook?.cta} onChange={(value) => updateFacebook("cta", value)} rows={2} />
                <TextField label="Hashtags" value={hashtagsToText(content.facebook?.hashtags)} onChange={(value) => updateFacebook("hashtags", parseHashtags(value, 2))} rows={2} hint="Maximum 2." />
                <div className="lg:col-span-2"><TextField label="Image Alt Text" value={content.facebook?.imageAltText} onChange={(value) => updateFacebook("imageAltText", value)} rows={2} /></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <TextField label="Instagram Feed Caption" value={content.instagram?.feedCaption} onChange={(value) => updateInstagram("feedCaption", value)} rows={8} />
                  <TextField label="Instagram Reel Caption" value={content.instagram?.reelCaption} onChange={(value) => updateInstagram("reelCaption", value)} rows={6} />
                  <TextField label="Reel Hook" value={content.instagram?.reelHook} onChange={(value) => updateInstagram("reelHook", value)} rows={2} />
                  <TextField label="Reel Voiceover" value={content.instagram?.reelVoiceover} onChange={(value) => updateInstagram("reelVoiceover", value)} rows={5} />
                  <TextField label="Reel Scenes" value={(content.instagram?.reelScenes || []).join("\n")} onChange={(value) => updateInstagram("reelScenes", value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 6))} rows={6} hint="One 9:16 scene per line. Use 3 to 6 scenes." />
                  <TextField label="Reel Production Notes" value={content.instagram?.reelProductionNotes} onChange={(value) => updateInstagram("reelProductionNotes", value)} rows={5} hint="Cover audio, captions, safe zones, and watermark use." />
                  <TextField label="CTA" value={content.instagram?.cta} onChange={(value) => updateInstagram("cta", value)} rows={2} />
                  <TextField label="Hashtags" value={hashtagsToText(content.instagram?.hashtags)} onChange={(value) => updateInstagram("hashtags", parseHashtags(value, 8))} rows={2} hint="Use 5 to 8 specific hashtags." />
                  <div className="lg:col-span-2"><TextField label="Image Alt Text" value={content.instagram?.imageAltText} onChange={(value) => updateInstagram("imageAltText", value)} rows={2} /></div>
                </div>
                <div className="rounded-md bg-slate-50 p-4 ring-1 ring-slate-100">
                  <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-black text-slate-900">Carousel Slides</h3><Button variant="secondary" className="h-9 px-3" onClick={addCarouselSlide}>Add Slide</Button></div>
                  <div className="grid gap-3 lg:grid-cols-2">{(content.instagram?.carouselSlides || []).map((slide, index) => (
                    <div key={index} className="rounded-md bg-white p-3 ring-1 ring-slate-200">
                      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-black uppercase text-slate-500">Slide {index + 1}</span><button type="button" title="Delete slide" onClick={() => removeCarouselSlide(index)} className="text-slate-400 hover:text-slate-700"><Trash2 className="h-4 w-4" /></button></div>
                      <input className={inputClass} value={slide.heading || ""} onChange={(event) => updateCarousel(index, "heading", event.target.value)} placeholder="Heading" />
                      <textarea className={`${inputClass} mt-2 resize-y`} rows={3} value={slide.body || ""} onChange={(event) => updateCarousel(index, "body", event.target.value)} placeholder="Slide body" />
                    </div>
                  ))}</div>
                </div>
              </div>
            )}
          </div>

          <div className="mb-5 grid gap-4 lg:grid-cols-[360px_1fr]">
            <div className="soft-card rounded-lg p-4">
              <h2 className="text-lg font-black text-slate-900">Shared Meta Image</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Reuse one image URL for both platforms.</p>
              <select className={`${inputClass} mt-4`} value={imageSource} onChange={(event) => setImageSource(event.target.value)}>{imageSources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <Button className="mt-3 w-full" onClick={reuseImage} disabled={working}><ImageIcon className="h-4 w-4" />Reuse Existing Image</Button>
              {activeImage ? <img src={activeImage.fileUrl || activeImage.publicUrl || activeImage.imgbbUrl || activeImage.remoteImageUrl} alt={activeImage.label || "Meta campaign"} className="mt-4 aspect-[4/5] w-full rounded-md bg-slate-100 object-cover" /> : null}
            </div>
            <div className="soft-card rounded-lg p-4">
              <h2 className="text-lg font-black text-slate-900">Schedule and Export</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Creates one Facebook row and one Instagram row with dedicated copy.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={prepareGhl} disabled={working}><Download className="h-4 w-4" />Prepare GHL</Button>
                <Button variant="secondary" onClick={saveProject} disabled={working}><Save className="h-4 w-4" />Save Campaign</Button>
              </div>
              {showGhlEditor ? (
                <div className="mt-4">
                  <div className="mb-3 flex flex-wrap items-end gap-2">
                    <Field label="Start Time"><input type="datetime-local" className={`${inputClass} w-56`} value={startTime} onChange={(event) => setStartTime(event.target.value)} /></Field>
                    <Field label="Interval Hours"><input type="number" min="1" className={`${inputClass} w-32`} value={intervalHours} onChange={(event) => setIntervalHours(event.target.value)} /></Field>
                    <Button variant="secondary" onClick={applySchedule}>Apply Time</Button>
                    <Button variant="secondary" onClick={exportGhl}><Download className="h-4 w-4" />Export CSV</Button>
                    <Button onClick={uploadGhl} disabled={working}><UploadCloud className="h-4 w-4" />Upload to GHL</Button>
                  </div>
                  <div className="max-h-[480px] overflow-auto rounded-md border border-slate-200">
                    <table className="min-w-max border-collapse text-sm">
                      <thead className="sticky top-0 bg-slate-50"><tr>{ghlHeaders.map((header, index) => <th key={`${header}-${index}`} className="border-b px-3 py-2 text-left text-xs font-black uppercase text-slate-500">{header}</th>)}</tr></thead>
                      <tbody>{ghlRows.map((row, rowIndex) => <tr key={rowIndex} className="border-b align-top">{ghlHeaders.map((header, columnIndex) => <td key={`${rowIndex}-${columnIndex}`} className="p-2">{/content|comment/i.test(header) ? <textarea className={`${inputClass} h-28 min-w-[340px]`} value={row[columnIndex] || ""} onChange={(event) => updateGhlCell(rowIndex, columnIndex, event.target.value)} /> : <input className={`${inputClass} min-w-[180px]`} value={row[columnIndex] || ""} onChange={(event) => updateGhlCell(rowIndex, columnIndex, event.target.value)} />}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
