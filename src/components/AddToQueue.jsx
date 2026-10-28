import { AlertTriangle, Download, FileUp, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import BatchImportPreview from "@/components/BatchImportPreview";
import SectionHeader from "@/components/SectionHeader";
import { Button, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { detectCannibalization } from "@/lib/contentPlanning";
import { buildSmartArticleDefaults, inferSmartIntent } from "@/lib/smartContentEngine";
import { resolveArticleGenerationSettings } from "@/lib/articleGenerationSettings.mjs";
import { buildArticleBrief } from "@/lib/articleBrief.mjs";
import { resolveImportRow, validateImportRow } from "@/lib/batchArticleImport.mjs";
import { cleanTitleFromInput, filterArticleIntake } from "../../electron/article-intake.mjs";

function promptName(mode, category) {
  if (mode === "article") return "Classic article prompt";
  return {
    default: "Default listicle prompt",
    food: "Food listicle prompt",
    homedecor: "Home decor listicle prompt",
    fashion: "Fashion listicle prompt"
  }[category] || "Default listicle prompt";
}

export default function AddToQueue({ mode, settings, articles, refreshArticles, setActiveScreen, setArticlesWorkflowStage }) {
  const [titles, setTitles] = useState("");
  const [message, setMessage] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [secondaryKeywords, setSecondaryKeywords] = useState("");
  const [searchIntent, setSearchIntent] = useState(settings.defaultSearchIntent || "informational");
  const [audience, setAudience] = useState(settings.defaultAudience || "");
  const [competitorNotes, setCompetitorNotes] = useState("");
  const [brandVoiceId, setBrandVoiceId] = useState("");
  const [projectPresetId, setProjectPresetId] = useState(settings.projectPresets?.[0]?.id || "preset-default-old-way");
  const [importRows, setImportRows] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const lines = useMemo(() => titles.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), [titles]);
  const duplicateWarnings = useMemo(() => {
    return filterArticleIntake(lines.map((title, index) => ({ id: index, title })), articles || []).skipped;
  }, [lines, articles]);
  const smartPreview = useMemo(() => {
    if (!lines.length) return null;
    const { title } = cleanTitleFromInput(lines[0]);
    return inferSmartIntent({
      title,
      type: mode,
      seoBrief: {
        targetKeyword,
        secondaryKeywords,
        searchIntent,
        audience,
        competitorNotes
      }
    });
  }, [lines, mode, targetKeyword, secondaryKeywords, searchIntent, audience, competitorNotes]);

  function applyPreset(presetId) {
    setProjectPresetId(presetId);
    const preset = settings.projectPresets?.find((item) => item.id === presetId);
    if (!preset) return;
    setBrandVoiceId(preset.brandVoiceId || "");
    setSearchIntent(preset.searchIntent || "informational");
    setAudience(preset.audience || "");
    setSecondaryKeywords(preset.secondaryKeywords || "");
    setCompetitorNotes(preset.competitorNotes || "");
  }

  async function importCsv() {
    const result = await electronAPI.importTitlesCsv();
    if (result?.success && result.rows?.length) {
      setImportRows(result.rows);
      setImportErrors(result.errors || []);
      setMessage(`Loaded ${result.rows.length} row${result.rows.length === 1 ? "" : "s"} from ${result.fileName || "the import file"}.`);
    }
  }

  async function downloadSample() {
    const result = await electronAPI.downloadSampleArticleCsv();
    if (result?.success) setMessage(`Saved sample CSV to ${result.filePath}.`);
  }

  async function addRowsToQueue(rowsToAdd) {
    if (!rowsToAdd.length || submitting) return;
    const selection = filterArticleIntake(rowsToAdd, articles || []);
    const safeRows = selection.accepted;
    if (!safeRows.length) {
      setMessage(`No new articles added. ${selection.skipped.length} duplicate or overlapping titles were excluded.`);
      setTitles("");
      return;
    }
    const invalidRows = safeRows.filter((row) => validateImportRow(row).length);
    if (invalidRows.length) {
      setMessage(`Fix ${invalidRows.length} invalid row${invalidRows.length === 1 ? "" : "s"} before adding this batch.`);
      return;
    }
    setSubmitting(true);
    const now = Date.now();
    try {
      const batch = [];
      // Already-published WordPress posts count as existing coverage; an exact topic match is not queued again.
      const publishedPosts = (settings.wordpressSites || []).flatMap((site) => (site.internalLinkPosts || [])
        .map((post) => ({ id: `wp:${post.id}`, title: post.title, wordpressPostUrl: post.url || post.link || "" })));
      let publishedDuplicates = 0;
      for (const [index, row] of safeRows.entries()) {
        const { title, sourceUrl } = cleanTitleFromInput(row.title);
        const rowSettings = resolveImportRow(row, settings, { projectPresetId, brandVoiceId });
        const rowMode = row.contentType || mode;
        const rowBrief = {
          targetKeyword: row.primaryKeyword || targetKeyword,
          primaryKeyword: row.primaryKeyword || targetKeyword,
          secondaryKeywords: row.secondaryKeywords || secondaryKeywords,
          searchIntent: row.searchIntent || searchIntent,
          audience,
          competitorNotes
        };
        const articleOverrides = {
          title,
          type: rowMode,
          projectPresetId: rowSettings.projectPresetId,
          brandVoiceId: rowSettings.brandVoiceId,
          wordpressSiteId: rowSettings.wordpressSiteId,
          wordpressCategoryId: rowSettings.wordpressCategoryId,
          publishStatus: rowSettings.publishStatusOverride,
          publicationPreference: rowSettings.publishStatusOverride,
          seoBrief: rowBrief,
          ...(rowSettings.articleLength ? { articleLength: rowSettings.articleLength, articleLengthSource: "custom" } : {})
        };
        const smart = buildSmartArticleDefaults({
          title,
          mode: rowMode,
          settings,
          preset: rowSettings.preset,
          manual: {
            ...rowBrief,
            brandVoiceId: rowSettings.brandVoiceId
          }
        });
        const resolved = resolveArticleGenerationSettings({
          article: articleOverrides,
          preset: rowSettings.preset,
          smartRecommendations: smart,
          globalSettings: settings
        });
        const category = rowMode === "listicle" ? (settings.listicleCategory || smart.category) : smart.category;
        const conflicts = detectCannibalization(title, [...(articles || []), ...publishedPosts], { threshold: 62 });
        if (conflicts.some((conflict) => conflict.score === 100 && String(conflict.article.id).startsWith("wp:"))) {
          publishedDuplicates++;
          continue;
        }
        const articleBrief = buildArticleBrief({
          article: { title, type: rowMode, category, seoBrief: resolved.seoBrief },
          resolvedSettings: resolved,
          cannibalizationConflicts: conflicts
        });
        batch.push({
          id: `${now}-${index}`,
          title,
          sourceUrl: row.sourceUrl || sourceUrl,
          generatedTitle: null,
          content: "",
          type: rowMode,
          category,
          workflowStatus: "queued",
          projectPresetId: rowSettings.projectPresetId,
          wordpressSiteId: rowSettings.wordpressSiteId || resolved.wordpressSiteId || "",
          wordpressCategoryId: rowSettings.wordpressCategoryId || resolved.wordpressCategoryId || "",
          brandVoiceId: resolved.brandVoiceId,
          articleLength: resolved.articleLength,
          articleLengthSource: resolved.articleLengthSource,
          publishStatusOverride: rowSettings.publishStatusOverride,
          scheduledAt: rowSettings.scheduledAt,
          recipeCardEnabled: resolved.recipeCardEnabled,
          smartIntentId: smart.smartIntentId,
          smartIntentLabel: smart.smartIntentLabel,
          smartPinStyle: smart.smartPinStyle,
          requireOutlineApproval: resolved.requireOutlineApproval,
          outlineApproved: resolved.outlineApproved,
          outline: "",
          seoBrief: resolved.seoBrief,
          articleBrief,
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
      if (!batch.length) {
        setMessage(`No new articles added. ${selection.skipped.length + publishedDuplicates} titles were excluded${publishedDuplicates ? `, including ${publishedDuplicates} already published on your site` : ""}.`);
        return;
      }
      const result = await electronAPI.queueArticles({ articles: batch });
      if (!result?.success) throw new Error(result?.error || "Could not save the queue.");
      const skipped = selection.skipped.length + (result.skipped?.length || 0) + publishedDuplicates;
      setTitles("");
      setImportRows([]);
      setImportErrors([]);
      setMessage(`Added ${result.addedCount} articles. ${skipped} duplicate or overlapping titles excluded${publishedDuplicates ? `, including ${publishedDuplicates} already published on your site` : ""}.`);
      await refreshArticles();
      setArticlesWorkflowStage?.("queued");
      setActiveScreen("articles");
    } catch (error) {
      setMessage(error.message || "Could not add articles to the queue.");
      await refreshArticles();
    } finally {
      setSubmitting(false);
    }
  }

  async function addToQueue() {
    const manualRows = lines.map((rawTitle, index) => ({
      id: `manual-${index}`,
      selected: true,
      title: rawTitle,
      primaryKeyword: targetKeyword,
      secondaryKeywords,
      searchIntent,
      contentType: mode,
      preset: projectPresetId,
      articleLength: "",
      brandVoice: brandVoiceId,
      site: "",
      category: "",
      publicationPreference: settings.publishStatus || "publish",
      schedule: ""
    }));
    await addRowsToQueue(manualRows);
  }

  return (
    <section className="animate-fade-in">
      <SectionHeader
        eyebrow={mode === "listicle" ? "Listicle queue" : "Article queue"}
        title={mode === "listicle" ? "Add listicles to queue" : "Add articles to queue"}
        action={
          <div className="rounded-md bg-white px-4 py-2 text-sm font-bold text-violet-700 shadow-sm ring-1 ring-slate-200">
            {promptName(mode, settings.listicleCategory)}
          </div>
        }
      >
        Paste one title per line, then attach the SEO brief and workflow defaults for this batch.
      </SectionHeader>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
      <div className="glass rounded-lg p-5 shadow-panel">
        <Field label="Titles">
          <textarea
            value={titles}
            onChange={(event) => setTitles(event.target.value)}
            rows={14}
            className={`${inputClass} min-h-80 resize-y leading-6`}
            placeholder={"10 cozy bedroom ideas\nHow to grow basil indoors\nBest budget cameras for creators"}
          />
        </Field>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-ink/60">{lines.length - duplicateWarnings.length} ready / {duplicateWarnings.length} excluded</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={downloadSample} disabled={submitting}><Download className="h-4 w-4" />Sample CSV</Button>
            <Button variant="secondary" onClick={importCsv} disabled={submitting}><FileUp className="h-4 w-4" />Import CSV</Button>
            <Button onClick={addToQueue} disabled={!lines.length || submitting}><Plus className="h-4 w-4" />{submitting ? "Adding..." : "Add to Queue"}</Button>
          </div>
        </div>
        {message ? <div className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700">{message}</div> : null}
        {smartPreview ? (
          <div className="mt-4 rounded-md bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700 ring-1 ring-indigo-100">
            Smart engine: {smartPreview.label} / {settings.articleLength || "900-1200"} words / {smartPreview.pinStyle?.replace("custom-", "").replace(/-/g, " ")}
          </div>
        ) : null}
        {duplicateWarnings.length ? (
          <div className="mt-4 space-y-2 rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-100">
            <div className="flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4" />Duplicate / Cannibalization Checker</div>
            {duplicateWarnings.slice(0, 4).map((warning) => (
              <div key={warning.id} className="font-semibold">
                Excluded: {warning.title} ({warning.score}% overlap with {warning.matchedTitle})
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="soft-card rounded-lg p-5">
        <div className="mb-4 text-lg font-black text-slate-900">SEO Brief & Workflow</div>
        <div className="space-y-4">
          <Field label="Project preset">
            <select className={inputClass} value={projectPresetId} onChange={(event) => applyPreset(event.target.value)}>
              {(settings.projectPresets || []).map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Primary keyword">
              <input className={inputClass} value={targetKeyword} onChange={(event) => setTargetKeyword(event.target.value)} placeholder="Defaults to each title" />
            </Field>
            <Field label="Search intent">
              <select className={inputClass} value={searchIntent} onChange={(event) => setSearchIntent(event.target.value)}>
                <option value="informational">Informational</option>
                <option value="commercial">Commercial</option>
                <option value="transactional">Transactional</option>
                <option value="navigational">Navigational</option>
              </select>
            </Field>
          </div>
          <Field label="Secondary keywords">
            <input className={inputClass} value={secondaryKeywords} onChange={(event) => setSecondaryKeywords(event.target.value)} placeholder="Comma-separated keywords" />
          </Field>
          <Field label="Audience">
            <input className={inputClass} value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Busy parents, food bloggers, first-time buyers..." />
          </Field>
          <Field label="Competitor notes / angles to cover">
            <textarea className={`${inputClass} min-h-28 resize-y`} value={competitorNotes} onChange={(event) => setCompetitorNotes(event.target.value)} placeholder="Questions to answer, facts to include, gaps in competitor content..." />
          </Field>
          <div className="grid gap-3 md:grid-cols-1">
            <Field label="Brand voice">
              <select className={inputClass} value={brandVoiceId} onChange={(event) => setBrandVoiceId(event.target.value)}>
                <option value="">None</option>
                {(settings.brandVoices || []).map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
              </select>
            </Field>
          </div>
        </div>
      </div>
      </div>
      {importRows.length ? (
        <BatchImportPreview
          rows={importRows}
          settings={settings}
          articles={articles}
          errors={importErrors}
          busy={submitting}
          onRowsChange={setImportRows}
          onSubmit={() => addRowsToQueue(importRows.filter((row) => row.selected))}
          onDownloadSample={downloadSample}
        />
      ) : null}
    </section>
  );
}
