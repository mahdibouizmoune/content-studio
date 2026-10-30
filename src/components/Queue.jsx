import { Ban, Check, Clock3, Pause, Play, Plus, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { Button, EmptyState } from "@/components/ui";
import { electronAPI, isElectronApp } from "@/lib/electron";
import {
  buildMetadata,
  buildSeoImageAlt,
  buildSeoImageFilename,
  buildRankMathMeta,
  buildRecipeSchema,
  finalizeArticleContent,
  buildOutlinePrompt,
  insertArticleImages,
  preparePrompt,
  qaArticleImages,
  sanitizeTitleText,
  scoreArticle
} from "@/lib/articlePostProcess.mjs";
import { applyInternalLinksToHtml, buildInternalLinkSuggestions, resolveArticleSite } from "@/lib/internalLinks";
import { buildSmartGenerationSettings } from "@/lib/smartContentEngine";
import { resolveArticleGenerationSettings } from "@/lib/articleGenerationSettings.mjs";
import { articleGenerationEntryAction, deriveLegacyQueueStatus, workflowStatusForGenerationStep } from "@/lib/articleWorkflow.mjs";
import { appendOutlineSection, outlineSectionCount, removeLastOutlineSection } from "@/lib/articleOutline.mjs";
import { usesCompactRecipeCollection } from "@/lib/recipeTitle.mjs";
import { applyAffiliateLinksToArticle } from "@/lib/affiliateLinks.mjs";
import { buildListiclePrompt, parseItemCountFromTitle, parsePromisedRecipeCount } from "@/prompts";
import { buildArticleBrief } from "@/lib/articleBrief.mjs";
import { buildArticleQualityReport } from "@/lib/articleQuality.mjs";
import { checkpointArticleDraft, checkpointParallelTasks, completeGenerationMetadata } from "@/lib/generationCheckpoint.mjs";
import { detectCannibalization } from "@/lib/contentPlanning";
import { applyReaderRetentionElements } from "@/lib/readerRetention.mjs";

function isAuthError(error) {
  return /401|403|api token|unauthorized|forbidden/i.test(error?.message || "");
}

async function saveStatus(article, patch) {
  return electronAPI.saveArticle({ ...article, ...patch, updatedAt: new Date().toISOString() });
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(Number(value || 0));
}

function OutlineReviewCard({ article, busy, onSave, onApprove, onRegenerate, onCancel }) {
  const [outline, setOutline] = useState(article.outline || "");

  useEffect(() => {
    setOutline(article.outline || "");
  }, [article.id, article.outline]);

  return (
    <div className="border-b border-amber-200 bg-amber-50/70 px-5 py-5">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-black text-amber-950">Outline approval required</div>
          <div className="mt-1 text-sm font-semibold text-amber-800">
            Review and edit this outline. The full article will not generate until you approve it.
          </div>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-200">
          {outlineSectionCount(outline)} sections
        </span>
      </div>
      <textarea
        value={outline}
        onChange={(event) => setOutline(event.target.value)}
        rows={12}
        className="w-full resize-y rounded-md border border-amber-200 bg-white px-3 py-3 text-sm font-medium leading-6 text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        aria-label={`Outline for ${article.title}`}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => setOutline(appendOutlineSection(outline))}><Plus className="h-4 w-4" />Add Section</Button>
        <Button variant="secondary" disabled={busy || outlineSectionCount(outline) === 0} onClick={() => setOutline(removeLastOutlineSection(outline))}>Remove Last</Button>
        <Button variant="secondary" disabled={busy} onClick={() => onSave(article, outline)}><Save className="h-4 w-4" />Save Outline</Button>
        <Button variant="secondary" disabled={busy} onClick={() => onRegenerate(article)}><RefreshCw className="h-4 w-4" />Regenerate</Button>
        <Button disabled={busy || outlineSectionCount(outline) < 3} onClick={() => onApprove(article, outline)}><Check className="h-4 w-4" />Approve and Continue</Button>
        <Button variant="danger" disabled={busy} onClick={() => onCancel(article)}><Ban className="h-4 w-4" />Cancel Article</Button>
      </div>
    </div>
  );
}

export default function Queue({ articles, settings, refreshArticles, setActiveScreen, setArticlesWorkflowStage, embedded = false, rowStatusFilter = "all" }) {
  const confirmAction = useConfirmDialog();
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState("");
  const pausedRef = useRef(false);
  const runningRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const internalLinkPostsCacheRef = useRef(new Map());
  const [batchProgress, setBatchProgress] = useState({
    active: false,
    baseCompleted: 0,
    finishedInRun: 0,
    unitsDone: 0,
    unitsTotal: 1
  });
  const [estimate, setEstimate] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState("");
  const [outlineWorkingId, setOutlineWorkingId] = useState("");
  const articleSettings = useCallback((article) => {
    const smartRecommendations = buildSmartGenerationSettings(article, settings);
    const selectedPreset = settings.projectPresets?.find((preset) => preset.id === article.projectPresetId);
    const resolved = resolveArticleGenerationSettings({
      article,
      preset: selectedPreset,
      smartRecommendations,
      globalSettings: settings
    });
    const brandVoiceId = resolved.brandVoiceId || smartRecommendations.smartIntent?.brandVoiceId || "";
    const brandVoice = settings.brandVoices?.find((voice) => voice.id === brandVoiceId);
    const articleBrief = buildArticleBrief({
      article,
      resolvedSettings: resolved,
      cannibalizationConflicts: detectCannibalization(
        article.generatedTitle || article.title,
        articles.filter((candidate) => candidate.id !== article.id),
        { threshold: 62 }
      )
    });
    return {
      ...resolved,
      brandVoice,
      outline: article.outlineApproved ? article.outline : "",
      articleBrief
    };
  }, [articles, settings]);
  const pending = useMemo(() => articles.filter((article) => article.queueStatus === "pending"), [articles]);
  const extraCollectionTextCalls = useMemo(() => pending.reduce((total, article) => {
    const count = parsePromisedRecipeCount(article.title);
    const articleLength = articleSettings(article).articleLength;
    return count >= 6 && !usesCompactRecipeCollection(count, articleLength)
      ? total + Math.ceil(count / 5)
      : total;
  }, 0), [pending, articleSettings]);
  const outlineCalls = useMemo(() => pending.filter((article) => {
    const resolved = articleSettings(article);
    return articleGenerationEntryAction(article, resolved) === "generate-outline";
  }).length, [pending, articleSettings]);
  const completed = articles.filter((article) => article.queueStatus === "completed");
  const failed = articles.filter((article) => article.queueStatus === "error");
  const activeRowsAll = articles.filter((article) => ["pending", "generating", "outline-review", "error", "completed", "cancelled"].includes(article.queueStatus));
  const allowedStatuses = Array.isArray(rowStatusFilter) ? rowStatusFilter : rowStatusFilter === "all" ? null : [rowStatusFilter];
  const activeRows = allowedStatuses ? activeRowsAll.filter((article) => allowedStatuses.includes(article.queueStatus)) : activeRowsAll;
  const savedProgressPercent = activeRowsAll.length ? Math.round((completed.length / activeRowsAll.length) * 100) : 0;
  const liveArticleFraction = batchProgress.unitsTotal
    ? Math.min(1, Math.max(0, batchProgress.unitsDone / batchProgress.unitsTotal))
    : 0;
  const progressPercent = batchProgress.active && activeRowsAll.length
    ? Math.min(100, Math.round(((batchProgress.baseCompleted + batchProgress.finishedInRun + liveArticleFraction) / activeRowsAll.length) * 100))
    : savedProgressPercent;

  useEffect(() => {
    if (!pending.length) {
      setEstimate(null);
      setEstimateError("");
      setEstimateLoading(false);
      return;
    }
    let active = true;
    setEstimateLoading(true);
    setEstimateError("");
    electronAPI.estimateCost({
      articleCount: pending.length,
      settings,
      extraTextCalls: extraCollectionTextCalls,
      outlineCalls
    }).then((result) => {
      if (active) setEstimate(result);
    }).catch((error) => {
      if (!active) return;
      setEstimate(null);
      setEstimateError(error.message || "Could not calculate the approximate cost.");
    }).finally(() => {
      if (active) setEstimateLoading(false);
    });
    return () => {
      active = false;
    };
  }, [pending.length, extraCollectionTextCalls, outlineCalls, settings]);

  async function retryCostEstimate() {
    setEstimateLoading(true);
    setEstimateError("");
    try {
      const result = await electronAPI.estimateCost({
        articleCount: pending.length,
        settings,
        extraTextCalls: extraCollectionTextCalls,
        outlineCalls
      });
      setEstimate(result);
    } catch (error) {
      setEstimate(null);
      setEstimateError(error.message || "Could not calculate the approximate cost.");
    } finally {
      setEstimateLoading(false);
    }
  }

  useEffect(() => {
    const unsubscribe = electronAPI.onImageProgress((event) => {
      setProgress(`Image generation ${event.status} (${event.attempt}/${event.maxAttempts})`);
      setBatchProgress((current) => {
        if (!current.active) return current;
        const baseUnit = Math.floor(current.unitsDone);
        const attempt = Number(event.attempt || 0);
        const maxAttempts = Math.max(1, Number(event.maxAttempts || 30));
        const imageUnitProgress = Math.min(0.9, Math.max(0.15, (attempt / maxAttempts) * 0.9));
        return {
          ...current,
          unitsDone: Math.min(current.unitsTotal, Math.max(current.unitsDone, baseUnit + imageUnitProgress))
        };
      });
    });
    return unsubscribe;
  }, []);

  function setGenerationStage(message, stage, totalStages) {
    const unitsTotal = Math.max(1, Number(totalStages || 1));
    setProgress(message);
    setBatchProgress((current) => ({
      ...current,
      unitsDone: Math.min(unitsTotal, Math.max(0, Number(stage || 1) - 0.75)),
      unitsTotal
    }));
  }

  async function waitWhilePaused(savePauseCheckpoint) {
    let checkpointSaved = false;
    while (pausedRef.current) {
      if (!checkpointSaved && savePauseCheckpoint) {
        await savePauseCheckpoint();
        checkpointSaved = true;
      }
      setProgress("Paused at a safe checkpoint. Click Resume to continue.");
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    setProgress(pausedRef.current
      ? "Pause requested. The current request will finish, then processing will stop before the next step."
      : "Resuming article generation...");
  }

  async function requestOutline(article) {
    const settingsForGen = articleSettings(article);
    const jobKey = `article:${article.id}:outline`;
    setOutlineWorkingId(article.id);
    setProgress(`Generating outline: ${article.title}`);
    const started = await saveStatus(article, {
      queueStatus: "generating",
      workflowStatus: "generating-outline",
      requireOutlineApproval: true,
      articleBrief: settingsForGen.articleBrief,
      outlineApproved: false,
      errorMessage: "",
      generationStep: "outline",
      generationCheckpoint: {
        ...(article.generationCheckpoint || {}),
        stage: "outline",
        updatedAt: new Date().toISOString()
      },
      estimatedCost: estimate?.perArticle ?? article.estimatedCost ?? null,
      actualKnownCost: article.actualKnownCost ?? null,
      costCurrency: estimate?.costCurrency || article.costCurrency || "USD",
      costCalculationVersion: estimate?.costCalculationVersion || article.costCalculationVersion || null
    });
    try {
      const outline = await electronAPI.generateArticleOutline({
        prompt: buildOutlinePrompt({ ...started, articleBrief: settingsForGen.articleBrief, articleLength: settingsForGen.articleLength }, settingsForGen),
        settings: settingsForGen,
        jobKey
      });
      return await saveStatus(started, {
        outline,
        queueStatus: "outline-review",
        workflowStatus: "awaiting-outline-approval",
        requireOutlineApproval: true,
        outlineApproved: false,
        generationStep: "",
        generationCheckpoint: {
          ...(started.generationCheckpoint || {}),
          stage: "outline-ready",
          outline,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      await saveStatus(started, {
        queueStatus: "error",
        workflowStatus: "failed",
        errorMessage: isAuthError(error) ? `${error.message}. Check your Replicate API token in Settings.` : error.message
      });
      throw error;
    } finally {
      setOutlineWorkingId("");
      await refreshArticles();
    }
  }

  async function saveOutline(article, outline) {
    if (outlineSectionCount(outline) < 3) {
      setProgress("Keep at least three outline sections before saving.");
      return;
    }
    await saveStatus(article, {
      outline,
      queueStatus: "outline-review",
      workflowStatus: "awaiting-outline-approval",
      requireOutlineApproval: true,
      outlineApproved: false,
      generationCheckpoint: {
        ...(article.generationCheckpoint || {}),
        stage: "outline-ready",
        outline,
        updatedAt: new Date().toISOString()
      }
    });
    setProgress(`Outline saved: ${article.title}`);
    await refreshArticles();
  }

  async function cancelOutline(article) {
    await saveStatus(article, {
      queueStatus: "cancelled",
      workflowStatus: "cancelled",
      outlineApproved: false,
      errorMessage: ""
    });
    setProgress(`Cancelled: ${article.title}`);
    await refreshArticles();
  }

  async function approveOutlineAndContinue(article, outline) {
    if (runningRef.current || outlineSectionCount(outline) < 3) return;
    runningRef.current = true;
    setRunning(true);
    setOutlineWorkingId(article.id);
    const approved = await saveStatus(article, {
      outline,
      queueStatus: "generating",
      workflowStatus: "generating-content",
      requireOutlineApproval: true,
      outlineApproved: true,
      errorMessage: "",
      generationCheckpoint: {
        ...(article.generationCheckpoint || {}),
        stage: "outline-approved",
        outline,
        outlineApprovedAt: new Date().toISOString()
      },
      estimatedCost: estimate?.perArticle ?? article.estimatedCost ?? null,
      actualKnownCost: article.actualKnownCost ?? null,
      costCurrency: estimate?.costCurrency || article.costCurrency || "USD",
      costCalculationVersion: estimate?.costCalculationVersion || article.costCalculationVersion || null
    });
    try {
      setProgress(`Outline approved. Generating article: ${article.title}`);
      await generateOne(approved);
    } catch (error) {
      const recoveryArticle = error.recoveryArticle || approved;
      await saveStatus(recoveryArticle, {
        queueStatus: "error",
        workflowStatus: "failed",
        errorMessage: isAuthError(error) ? `${error.message}. Check your Replicate API token in Settings.` : error.message
      });
    } finally {
      runningRef.current = false;
      setRunning(false);
      setOutlineWorkingId("");
      await refreshArticles();
    }
  }

  async function generateOne(article) {
    const isListicle = article.type === "listicle";
    const promisedRecipeCount = parsePromisedRecipeCount(article.title);
    const isRecipeCollection = isListicle || promisedRecipeCount >= 6;
    const settingsForGen = articleSettings(article);
    const jobKey = `article:${article.id}:gen`;
    let workingArticle = { ...article, articleBrief: settingsForGen.articleBrief };
    let checkpoint = { ...(article.generationCheckpoint || {}) };
    const resumingSavedDraft = Boolean(checkpoint.content);

    if (isRecipeCollection) {
      const listicleItemCount = promisedRecipeCount || parseItemCountFromTitle(article.title);
      const listicleCategory = promisedRecipeCount ? "food" : (article.category || settingsForGen.listicleCategory);
      settingsForGen.articlePrompt = buildListiclePrompt(article.title, listicleCategory, listicleItemCount, settingsForGen);
      settingsForGen.listicleCategory = listicleCategory;
      settingsForGen.listicleItemCount = listicleItemCount;
    }
    settingsForGen.articleType = isRecipeCollection ? "listicle" : (article.type || "article");
    settingsForGen.articlePrompt = preparePrompt(settingsForGen.articlePrompt, settingsForGen);

    settingsForGen.affiliateProvider = "amazon";
    settingsForGen.affiliateProviderFallback = false;
    settingsForGen.affiliateLinks = (settingsForGen.affiliateLinks || []).filter((item) => item.source !== "impact");
    const affiliateProvider = "amazon";
    const impactReady = false;
    const exactAmazonProductReady = (settingsForGen.affiliateLinks || []).some((item) =>
      item?.enabled !== false
      && item?.source === "amazon"
      && item?.trackingVerified === true
      && item?.amazonLinkType === "product"
      && /^[A-Z0-9]{10}$/i.test(String(item?.amazonAsin || ""))
    );
    const amazonReady = Boolean(
      settingsForGen.amazonPartnerTag
      && ((settingsForGen.amazonCredentialId && settingsForGen.amazonCredentialSecret) || exactAmazonProductReady)
    );
    const selectedProviderReady = affiliateProvider === "both"
      ? impactReady || amazonReady
      : affiliateProvider === "amazon"
        ? amazonReady
        : impactReady;
    const fallbackProviderReady = settingsForGen.affiliateProviderFallback !== false
      && (impactReady || amazonReady);
    const affiliateDiscoveryEnabled = settingsForGen.affiliateEnabled !== false
      && settingsForGen.affiliateAutoDiscover !== false
      && settingsForGen.affiliateAutoInsert !== false
      && (selectedProviderReady || fallbackProviderReady);
    let totalStages = 4
      + (settingsForGen.enableIntextImages ? 1 + Math.max(0, Number(settingsForGen.intextImageCount ?? 1)) : 0)
      + (affiliateDiscoveryEnabled ? 1 : 0);

    async function saveCheckpoint(stage, patch = {}) {
      checkpoint = {
        ...checkpoint,
        ...patch,
        stage,
        updatedAt: new Date().toISOString()
      };
      const workflowStatus = workflowStatusForGenerationStep(stage);
      workingArticle = {
        ...checkpointArticleDraft(workingArticle, checkpoint),
        queueStatus: deriveLegacyQueueStatus(workflowStatus),
        workflowStatus,
        generationStep: stage,
        generationCheckpoint: checkpoint,
        errorMessage: ""
      };
      await electronAPI.saveArticle({ ...workingArticle, updatedAt: new Date().toISOString() });
    }

    try {
      let baseContent = checkpoint.content || "";
      if (!baseContent || checkpoint.collectionQualityWarning) {
        setGenerationStage(`Generating article: ${article.title} (1/${totalStages})`, 1, totalStages);
        await waitWhilePaused(() => saveCheckpoint("paused-before-article"));
        const generated = await electronAPI.generateArticle({ title: article.title, settings: settingsForGen, jobKey });
        baseContent = finalizeArticleContent(generated.content, article.title, settingsForGen);
        await saveCheckpoint("article", {
          content: baseContent,
          recipeCollection: generated.recipeCollection || null,
          qualityPassApplied: !!generated.qualityPassApplied,
          recipeCardRepairApplied: !!generated.recipeCardRepairApplied,
          recipeCardQualityWarning: generated.recipeCardQualityWarning || "",
          collectionQualityWarning: generated.collectionQualityWarning || "",
          editorialChecks: generated.editorialChecks || null
        });
      }
      if (checkpoint.collectionQualityWarning) throw new Error(`Saved draft needs the promised recipe collection repaired: ${checkpoint.collectionQualityWarning}`);

      const recipeReady = await electronAPI.prepareArticleRecipe({ article: { ...workingArticle, ...completeGenerationMetadata(workingArticle, checkpoint), content: baseContent }, settings: settingsForGen, repair: resumingSavedDraft || !checkpoint.recipeCardQualityWarning, jobKey: `${jobKey}:recipe-validation` });
      baseContent = finalizeArticleContent(recipeReady.patch.content, article.title, settingsForGen);
      await saveCheckpoint("recipe-validation", {
        content: baseContent,
        recipeCardRepairApplied: recipeReady.repaired || checkpoint.recipeCardRepairApplied,
        recipeCardQualityWarning: recipeReady.patch.recipeCardQualityWarning || ""
      });
      if (!recipeReady.success) throw new Error(recipeReady.patch.recipeCardQualityWarning || "Recipe needs review before images are generated.");

      const affiliateDiscoveryTask = async () => {
        if (checkpoint.affiliateDiscoveryResult) return checkpoint.affiliateDiscoveryResult;
        const result = await electronAPI.discoverAffiliates({
            article: { ...article, content: baseContent },
            settings: settingsForGen,
            jobKey: `article:${article.id}:affiliate`
          }).catch((error) => ({
            success: false,
            affiliates: [],
            error: error.message || "Affiliate discovery failed."
          }));
        if (result.success) await saveCheckpoint("affiliate-planning", { affiliateDiscoveryResult: result });
        return result;
      };

      let generatedTitle = checkpoint.generatedTitle || "";
      let featuredImagePrompt = checkpoint.featuredImagePrompt || "";
      if (!generatedTitle || !featuredImagePrompt) {
        setGenerationStage(`Planning title and images: ${article.title} (2/${totalStages})`, 2, totalStages);
        await waitWhilePaused();
        const titleTask = generatedTitle
          ? Promise.resolve(generatedTitle)
          : settingsForGen.keepOriginalTitles
            ? Promise.resolve(sanitizeTitleText(article.title))
            : electronAPI.generateArticleTitle({
                title: article.title,
                content: baseContent,
                settings: settingsForGen,
                jobKey: `${jobKey}:title`
              }).then(sanitizeTitleText);
        const featuredPromptTask = featuredImagePrompt
          ? Promise.resolve(featuredImagePrompt)
          : electronAPI.generateFeaturedImagePrompt({
              content: baseContent,
              title: article.title,
              settings: settingsForGen,
              jobKey: `${jobKey}:featured-prompt`
            });
        const planned = await checkpointParallelTasks({ generatedTitle: titleTask, featuredImagePrompt: featuredPromptTask },
          (patch) => saveCheckpoint("content-planning", patch));
        ({ generatedTitle, featuredImagePrompt } = planned);
      }

      let featured = checkpoint.featured || null;
      let prompts = Array.isArray(checkpoint.imagePrompts) ? checkpoint.imagePrompts : [];
      const needsFeatured = featured?.localMediaMissing
        || (!featured?.displayUrl && !featured?.localImageUrl && !featured?.imageUrl);
      const needsImagePrompts = settingsForGen.enableIntextImages && !prompts.length;
      if (needsFeatured || needsImagePrompts) {
        setGenerationStage(`Preparing article media: ${article.title} (3/${totalStages})`, 3, totalStages);
        await waitWhilePaused();
        const featuredTask = needsFeatured
          ? electronAPI.generateImage({
              prompt: featuredImagePrompt,
              aspectRatio: settingsForGen.featuredImageRatio,
              settings: settingsForGen,
              jobKey: `${jobKey}:featured-image`
            })
          : Promise.resolve(featured);
        const imagePromptsTask = needsImagePrompts
          ? electronAPI.generateImagePrompts({
              content: baseContent,
              title: article.title,
              count: Number(settingsForGen.intextImageCount ?? 1),
              settings: settingsForGen,
              isListicle: isRecipeCollection,
              category: isRecipeCollection ? "food" : (article.category || settingsForGen.listicleCategory),
              jobKey: `${jobKey}:image-prompts`
            })
          : Promise.resolve(prompts);
        const planned = await checkpointParallelTasks({ featured: featuredTask, imagePrompts: imagePromptsTask },
          (patch) => saveCheckpoint("media-planning", patch));
        featured = planned.featured;
        prompts = planned.imagePrompts;
        if (featured?.ratioNotice) setProgress(featured.ratioNotice);
      }

      let images = Array.isArray(checkpoint.images) ? [...checkpoint.images] : [];
      if (settingsForGen.enableIntextImages && prompts.length) {
        totalStages = 4 + prompts.length + (affiliateDiscoveryEnabled ? 1 : 0);
        const missingIndexes = prompts
          .map((_, index) => index)
          .filter((index) => images[index]?.localMediaMissing
            || (!images[index]?.url && !images[index]?.displayUrl && !images[index]?.localPath));
        for (let start = 0; start < missingIndexes.length; start += 2) {
          const batchIndexes = missingIndexes.slice(start, start + 2);
          setGenerationStage(
            `Generating article image${batchIndexes.length > 1 ? "s" : ""} ${batchIndexes.map((index) => index + 1).join(" and ")} of ${prompts.length}: ${article.title}`,
            4 + batchIndexes[0],
            totalStages
          );
          await waitWhilePaused();
          const results = await Promise.allSettled(batchIndexes.map((index) =>
            electronAPI.generateImage({
              prompt: prompts[index],
              aspectRatio: settingsForGen.intextImageRatio,
              settings: settingsForGen,
              jobKey: `${jobKey}:in-text-${index + 1}`
            })
          ));
          let firstError = null;
          results.forEach((result, resultIndex) => {
            const index = batchIndexes[resultIndex];
            if (result.status === "rejected") {
              firstError ||= result.reason;
              return;
            }
            const image = result.value;
            images[index] = {
              id: `image-${index + 1}`,
              url: image.displayUrl || image.localImageUrl || image.imageUrl,
              remoteImageUrl: image.remoteImageUrl || image.imageUrl,
              localUrl: image.localImageUrl || "",
              displayUrl: image.displayUrl || image.localImageUrl || image.imageUrl,
              localPath: image.localPath,
              prompt: prompts[index],
              requestedAspectRatio: image.requestedAspectRatio || settingsForGen.intextImageRatio,
              aspectRatio: image.aspectRatio || settingsForGen.intextImageRatio,
              ratioAdjusted: image.ratioAdjusted === true,
              ratioNotice: image.ratioNotice || "",
              altText: settingsForGen.imageSeoProMode !== false
                ? buildSeoImageAlt({ ...article, generatedTitle }, { prompt: prompts[index] }, index, "in-text image")
                : `${article.seoBrief?.targetKeyword || article.title} - ${prompts[index]}`,
              seoFileName: settingsForGen.imageSeoProMode !== false
                ? buildSeoImageFilename({ ...article, generatedTitle }, { prompt: prompts[index] }, index, "recipe image")
                : ""
            };
          });
          await saveCheckpoint(`in-text-images-${batchIndexes.map((index) => index + 1).join("-")}`, { images });
          if (firstError) {
            throw firstError instanceof Error ? firstError : new Error(String(firstError || "Image generation failed."));
          }
        }
      }
      baseContent = insertArticleImages(baseContent, images);

      let internalLinks = [];
      let internalLinkSite = null;
      if (settingsForGen.enableInternalLinks !== false && Number(settingsForGen.internalLinkCount ?? 3) > 0) {
        internalLinkSite = resolveArticleSite(article, settingsForGen);
        if (internalLinkSite?.url) {
          let linkSite = internalLinkSite;
          if (!linkSite.internalLinkPosts?.length && linkSite.username && linkSite.apiKey) {
            setProgress(`Syncing internal link posts: ${linkSite.name || linkSite.url}`);
            const cacheKey = linkSite.id || linkSite.url;
            try {
              let cached = internalLinkPostsCacheRef.current.get(cacheKey);
              if (!cached) {
                cached = electronAPI.syncWordPressPosts({
                  wordpressUrl: linkSite.url,
                  wordpressUsername: linkSite.username,
                  wordpressApiKey: linkSite.apiKey,
                  categories: linkSite.categories || [],
                  maxPosts: settingsForGen.internalLinkMaxPosts || 500
                });
                internalLinkPostsCacheRef.current.set(cacheKey, cached);
              }
              const result = await cached;
              internalLinkPostsCacheRef.current.set(cacheKey, result);
              linkSite = { ...linkSite, internalLinkPosts: result.posts || [] };
            } catch {
              internalLinkPostsCacheRef.current.delete(cacheKey);
              linkSite = internalLinkSite;
            }
          }
          const suggestions = buildInternalLinkSuggestions({ article, content: baseContent, site: linkSite, settings: settingsForGen });
          const linked = applyInternalLinksToHtml(baseContent, suggestions);
          baseContent = linked.html;
          internalLinks = linked.applied;
        }
      }

      let affiliateLinks = [];
      let affiliateDiscovery = {
        status: affiliateDiscoveryEnabled ? "no-match" : "disabled",
        reviewedProducts: 0,
        qualifiedProducts: 0,
        queries: []
      };
      if (affiliateDiscoveryEnabled) {
        const affiliateStage = totalStages;
        setGenerationStage(`Finding the best affiliate products: ${article.title} (${affiliateStage}/${totalStages})`, affiliateStage, totalStages);
        await waitWhilePaused();
        const discovery = await affiliateDiscoveryTask();
        if (!discovery.success && /cancelled/i.test(discovery.error || "")) throw new Error("Cancelled by user");
        affiliateDiscovery = {
          status: discovery.success ? (discovery.affiliates?.length ? "applied" : "no-match") : "error",
          error: discovery.success ? "" : discovery.error || "Affiliate discovery failed.",
          reviewedProducts: Number(discovery.reviewedProducts || 0),
          qualifiedProducts: Number(discovery.qualifiedProducts || 0),
          queries: discovery.queries || [],
          providers: discovery.providers || [],
          providerErrors: discovery.providerErrors || [],
          fallbackUsed: discovery.fallbackUsed === true,
          notice: discovery.notice || "",
          discoveredCount: discovery.affiliates?.length || 0,
          completedAt: new Date().toISOString()
        };
        const availableAffiliateLinks = [
          ...(settingsForGen.affiliateLinks || []),
          ...(discovery.success ? discovery.affiliates || [] : [])
        ].filter((item) => item?.trackingVerified !== false);
        if (availableAffiliateLinks.length) {
          const affiliateLibrary = availableAffiliateLinks
            .filter((item, index, items) => items.findIndex((candidate) =>
              (item.id && candidate.id === item.id)
              || (item.url && candidate.url === item.url)
            ) === index);
          const affiliateSettings = {
            ...settingsForGen,
            affiliateLinks: affiliateLibrary
          };
          const linkedArticle = applyAffiliateLinksToArticle(
            { ...article, generatedTitle, content: baseContent },
            affiliateSettings
          );
          baseContent = linkedArticle.content;
          affiliateLinks = linkedArticle.affiliateLinks || [];
          affiliateDiscovery.status = affiliateLinks.length ? "applied" : "products-found-no-placement";
          affiliateDiscovery.appliedCount = affiliateLinks.length;
        }
      }
      baseContent = applyReaderRetentionElements(
        { ...article, generatedTitle, content: baseContent },
        settingsForGen
      ).content;

      const finalRecipe = await electronAPI.prepareArticleRecipe({ article: { ...workingArticle, ...completeGenerationMetadata(workingArticle, checkpoint), content: baseContent, generatedTitle }, settings: settingsForGen, repair: false });
      if (!finalRecipe.success) throw new Error(finalRecipe.patch.recipeCardQualityWarning || "Final recipe validation failed.");
      const completedArticle = {
        ...workingArticle,
        ...completeGenerationMetadata(workingArticle, checkpoint),
        // Non-food articles come back with recipeCardEnabled false; keep that so no recipe blocker applies.
        ...(finalRecipe.skipped === "non-food" ? { recipeCardEnabled: false, recipeRequired: false } : {}),
        content: baseContent,
        generatedTitle,
        featuredImage: featured.displayUrl || featured.localImageUrl || featured.imageUrl,
        featuredImageRemoteUrl: featured.remoteImageUrl || featured.imageUrl,
        featuredImageLocalUrl: featured.localImageUrl || "",
        featuredImageDisplay: featured.displayUrl || featured.localImageUrl || featured.imageUrl,
        featuredImageLocalPath: featured.localPath,
        featuredImagePrompt,
        featuredImageRequestedAspectRatio: featured.requestedAspectRatio || settingsForGen.featuredImageRatio,
        featuredImageAspectRatio: featured.aspectRatio || settingsForGen.featuredImageRatio,
        featuredImageAlt: settingsForGen.imageSeoProMode !== false
          ? buildSeoImageAlt({ ...article, generatedTitle }, { prompt: featuredImagePrompt }, 0, "featured")
          : `${article.seoBrief?.targetKeyword || generatedTitle} featured image`,
        featuredImageSeoFileName: settingsForGen.imageSeoProMode !== false
          ? buildSeoImageFilename({ ...article, generatedTitle }, { prompt: featuredImagePrompt }, 0, "featured")
          : "",
        images,
        imageRatioAdjustments: [featured, ...images]
          .filter((image) => image?.ratioAdjusted)
          .map((image) => ({
            requestedRatio: image.requestedAspectRatio,
            ratio: image.aspectRatio,
            notice: image.ratioNotice,
            model: settingsForGen.imageModel
          })),
        queueStatus: checkpoint.recipeCardQualityWarning ? "error" : "completed",
        workflowStatus: "needs-review",
        recipeRequired: finalRecipe.skipped !== "non-food",
        editorialQualityPassApplied: !!checkpoint.qualityPassApplied,
        recipeCardRepairApplied: !!checkpoint.recipeCardRepairApplied,
        recipeCardQualityWarning: "",
        recipeValidation: finalRecipe.patch.recipeValidation,
        errorMessage: checkpoint.recipeCardQualityWarning || "",
        generationStep: "",
        generationCheckpoint: null,
        internalLinks,
        affiliateLinks,
        affiliateDiscovery,
        affiliateDisclosureApplied: affiliateLinks.length > 0,
        affiliateLinksAppliedAt: affiliateLinks.length ? new Date().toISOString() : "",
        internalLinksAppliedAt: internalLinks.length ? new Date().toISOString() : article.internalLinksAppliedAt || "",
        internalLinkSiteId: internalLinkSite?.id || internalLinkSite?.url || article.internalLinkSiteId || ""
      };
      const metadata = buildMetadata(completedArticle, baseContent);
      const structuredData = buildRecipeSchema({ ...completedArticle, ...metadata });
      const enriched = { ...completedArticle, ...metadata, structuredData };
      const seo = scoreArticle(enriched, baseContent);
      const imageQa = qaArticleImages(enriched);
      const qualityReport = buildArticleQualityReport(
        { ...enriched, seoScore: seo.score, seoChecks: seo.checks, imageQa },
        {
          maxAffiliateLinks: settingsForGen.affiliateMaxLinks,
          requireFeaturedImage: true,
          site: internalLinkSite
        }
      );

      await saveStatus(workingArticle, {
        ...enriched,
        seoScore: seo.score,
        seoChecks: seo.checks,
        imageQa,
        qualityReport,
        rankMathMeta: buildRankMathMeta(enriched)
      });
    } catch (error) {
      error.recoveryArticle = workingArticle;
      throw error;
    }
  }

  async function generateAll() {
    if (!pending.length || runningRef.current) return;
    if (!isElectronApp) {
      setProgress("Open the Electron app to run real Replicate generation. Browser preview mode will not generate articles or images.");
      return;
    }
    let cost = estimate;
    if (!cost) {
      try {
        cost = await electronAPI.estimateCost({
          articleCount: pending.length,
          settings,
          extraTextCalls: extraCollectionTextCalls,
          outlineCalls
        });
        setEstimate(cost);
        setEstimateError("");
      } catch (error) {
        setEstimateError(error.message || "Could not calculate the approximate cost.");
        if (settings.strictSpendingLimitEnabled === true) {
          setProgress("Generation is blocked because strict budget protection is on and the cost estimate failed.");
          return;
        }
      }
    }
    const strictLimit = Math.max(0.01, Number(settings.strictSpendingLimit || 5));
    if (cost && settings.strictSpendingLimitEnabled === true && cost.estimatedCost > strictLimit) {
      setProgress(`Batch blocked. Approximate cost ${formatUsd(cost.estimatedCost)} exceeds the strict ${formatUsd(strictLimit)} limit.`);
      return;
    }
    const warningLimit = Math.max(0, Number(settings.costBudgetWarning ?? 1));
    if (
      cost
      && warningLimit > 0
      && cost.estimatedCost > warningLimit
      && !await confirmAction({
        title: "Batch cost warning",
        message: `Approximate batch cost is ${formatUsd(cost.estimatedCost)}. Continue?`,
        confirmLabel: "Continue"
      })
    ) return;
    runningRef.current = true;
    cancelRequestedRef.current = false;
    setRunning(true);
    let finishedInRun = 0;
    setBatchProgress({
      active: true,
      baseCompleted: completed.length,
      finishedInRun,
      unitsDone: 0,
      unitsTotal: 1
    });
    try {
      for (const article of pending) {
        await waitWhilePaused();
        if (cancelRequestedRef.current) break;
        const settingsForArticle = articleSettings(article);
        const entryAction = articleGenerationEntryAction(article, settingsForArticle);
        if (entryAction !== "generate-content") {
          try {
            if (entryAction === "await-outline-approval") {
              await saveStatus(article, {
                queueStatus: "outline-review",
                workflowStatus: "awaiting-outline-approval",
                requireOutlineApproval: true,
                outlineApproved: false,
                errorMessage: ""
              });
            } else {
              await requestOutline(article);
            }
            setProgress(`Outline ready for review: ${article.title}`);
          } catch (error) {
            setProgress(`Outline generation failed: ${error.message}`);
          }
          continue;
        }
        const started = await saveStatus(article, {
          queueStatus: "generating",
          workflowStatus: "generating-content",
          errorMessage: "",
          estimatedCost: cost?.perArticle ?? article.estimatedCost ?? null,
          actualKnownCost: article.actualKnownCost ?? null,
          costCurrency: cost?.costCurrency || article.costCurrency || "USD",
          costCalculationVersion: cost?.costCalculationVersion || article.costCalculationVersion || null
        });
        await refreshArticles();
        if (cancelRequestedRef.current) {
          await saveStatus(started, { queueStatus: "pending", workflowStatus: "queued", errorMessage: "" });
          break;
        }
        let cancelled = false;
        try {
          await generateOne(started);
        } catch (error) {
          const recoveryArticle = error.recoveryArticle || article;
          if ((error.message || "").includes("Cancelled by user")) {
            await saveStatus(recoveryArticle, { queueStatus: "pending", workflowStatus: "queued", errorMessage: "" });
            setProgress("Generation cancelled.");
            cancelled = true;
            break;
          }
          await saveStatus(recoveryArticle, {
            queueStatus: "error",
            workflowStatus: "failed",
            errorMessage: isAuthError(error) ? `${error.message}. Check your Replicate API token in Settings.` : error.message
          });
        }
        if (!cancelled) {
          finishedInRun += 1;
          setBatchProgress((current) => ({
            ...current,
            finishedInRun,
            unitsDone: 0,
            unitsTotal: 1
          }));
        }
        await refreshArticles();
      }
    } finally {
      pausedRef.current = false;
      cancelRequestedRef.current = false;
      runningRef.current = false;
      setPaused(false);
      setRunning(false);
      setBatchProgress((current) => ({ ...current, active: false, unitsDone: 0, unitsTotal: 1 }));
      await refreshArticles();
    }
  }

  async function cancel() {
    if (!runningRef.current) return;
    cancelRequestedRef.current = true;
    await electronAPI.cancelJobsByPrefix?.(["article:"]);
    pausedRef.current = false;
    setPaused(false);
    setProgress("Cancelling current job...");
  }

  async function clearErrors() {
    if (!failed.length || !await confirmAction({
      title: "Clear errored articles",
      message: `Delete ${failed.length} errored article${failed.length === 1 ? "" : "s"} from local storage?`,
      confirmLabel: "Delete",
      tone: "danger"
    })) return;
    for (const article of failed) {
      await electronAPI.deleteArticle(article.id);
    }
    await refreshArticles();
  }

  async function retryErrors() {
    if (!failed.length) return;
    for (const article of failed) {
      await saveStatus(article, {
        queueStatus: "pending",
        workflowStatus: "queued",
        errorMessage: ""
      });
    }
    setProgress(`${failed.length} errored article${failed.length === 1 ? "" : "s"} returned to the queue.`);
    await refreshArticles();
  }

  return (
    <section className="animate-fade-in">
      <SectionHeader
        eyebrow={embedded ? "Workflow" : "Queue"}
        title={embedded ? "Generation Pipeline" : "Article Queue"}
        action={
          <div className="flex flex-wrap gap-2">
            {running ? (
              <>
                <Button variant="secondary" onClick={togglePause}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? "Resume" : "Pause after current step"}</Button>
                <Button variant="warning" onClick={cancel}><Ban className="h-4 w-4" />Cancel remaining</Button>
              </>
            ) : (
              <Button onClick={generateAll} disabled={!pending.length || !isElectronApp}><Play className="h-4 w-4" />Generate All</Button>
            )}
            <Button variant="secondary" onClick={refreshArticles}><RefreshCw className="h-4 w-4" />Refresh</Button>
            <Button variant="secondary" onClick={retryErrors} disabled={!failed.length}><RotateCcw className="h-4 w-4" />Retry Errors</Button>
            <Button variant="secondary" onClick={clearErrors} disabled={!failed.length}><Trash2 className="h-4 w-4" />Clear Errors</Button>
          </div>
        }
      >
        {pending.length} pending / {completed.length} completed / {failed.length} errors
      </SectionHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="soft-card rounded-lg p-4"><div className="text-2xl font-black text-slate-900">{pending.length}</div><div className="text-sm font-semibold text-slate-500">Pending</div></div>
        <div className="soft-card rounded-lg p-4"><div className="text-xl font-black text-slate-900">{estimateLoading ? "Calculating..." : estimate ? formatUsd(estimate.estimatedTextCost) : "Unavailable"}</div><div className="text-sm font-semibold text-slate-500">Approx. text</div></div>
        <div className="soft-card rounded-lg p-4"><div className="text-xl font-black text-slate-900">{estimateLoading ? "Calculating..." : estimate ? formatUsd(estimate.estimatedImageCost) : "Unavailable"}</div><div className="text-sm font-semibold text-slate-500">Approx. images</div></div>
        <div className="soft-card rounded-lg p-4"><div className="text-xl font-black text-slate-900">{estimateLoading ? "Calculating..." : estimate ? formatUsd(estimate.estimatedCost) : "Unavailable"}</div><div className="text-sm font-semibold text-slate-500">Approx. total</div></div>
        <div className="soft-card rounded-lg p-4"><div className="text-2xl font-black text-slate-900">{estimate?.expectedImages ?? (settings.enableIntextImages ? pending.length * (1 + Number(settings.intextImageCount ?? 1)) : pending.length)}</div><div className="text-sm font-semibold text-slate-500">Expected images</div></div>
        <div className="soft-card rounded-lg p-4"><div className="truncate text-sm font-black text-slate-900">{estimate?.models?.text || settings.aiModel}</div><div className="mt-1 truncate text-sm font-black text-slate-700">{estimate?.models?.image || settings.imageModel}</div><div className="mt-1 text-xs font-semibold text-slate-500">Models</div></div>
      </div>

      {estimateError ? (
        <div className="mb-4 flex flex-col gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{estimateError}</span>
          <Button variant="secondary" onClick={retryCostEstimate} disabled={estimateLoading}><RefreshCw className="h-4 w-4" />Retry estimate</Button>
        </div>
      ) : pending.length ? (
        <div className="mb-4 text-xs font-semibold text-slate-500">
          Cost is approximate and may differ from the provider invoice. No exact cost is stored unless a provider reports it.
        </div>
      ) : null}

      {!isElectronApp ? (
        <div className="mb-4 rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700">
          Real generation is disabled in browser preview mode. Run `npm.cmd run electron:dev` and use the desktop window.
        </div>
      ) : null}

      {(progress || running) ? (
        <div className="mb-5 rounded-lg border border-indigo-200 bg-indigo-50/70 p-5 shadow-lg shadow-indigo-200/30">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-indigo-600 ring-1 ring-indigo-100">
                <Clock3 className="h-6 w-6" />
              </div>
              <div>
                <div className="text-lg font-black text-indigo-950">{running ? "Bulk Generation in Progress" : "Queue Status"}</div>
                <div className="text-sm font-semibold text-indigo-700">{progress || "Ready to generate."}</div>
                {running ? <div className="mt-1 text-xs font-semibold text-indigo-600">Pause lets the current request finish and stops before the next step.</div> : null}
              </div>
            </div>
            <div className="rounded-md bg-white/70 px-4 py-3 text-center text-sm font-black text-indigo-700 ring-1 ring-indigo-100">{progressPercent}% done</div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-indigo-100">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}

      {!activeRows.length ? (
        <EmptyState title={allowedStatuses?.includes("error") ? "No errors" : "Nothing in this stage"}>Add article titles, then they will move through this workflow.</EmptyState>
      ) : (
        <div className="soft-card overflow-hidden rounded-lg">
          <div className="hidden grid-cols-[1fr_140px_130px_240px] border-b border-slate-200 bg-slate-50 px-5 py-4 text-sm font-black text-slate-900 md:grid">
            <div>Title</div>
            <div>Status</div>
            <div>Created</div>
            <div className="text-right">Actions</div>
          </div>
          {activeRows.map((article) => (
            <div key={article.id}>
              <div className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-[1fr_140px_130px_240px] md:items-center">
                <div className="min-w-0">
                  <div className="text-base font-black text-slate-900 md:truncate">{article.generatedTitle || article.title}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                    <span>{article.type}</span>
                    {article.category ? <span>/ {article.category}</span> : null}
                    {article.seoBrief?.targetKeyword ? <span>/ keyword: {article.seoBrief.targetKeyword}</span> : null}
                    {article.workflowStatus ? <span>/ {article.workflowStatus}</span> : null}
                    {article.seoScore != null ? <span>/ SEO {article.seoScore}/100</span> : null}
                    {article.queueStatus === "error" && article.generationCheckpoint?.stage ? <span>/ saved step: {article.generationCheckpoint.stage}</span> : null}
                    {article.errorMessage ? <span className="text-slate-700">/ {article.errorMessage}</span> : null}
                  </div>
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black capitalize ${
                    article.queueStatus === "completed" ? "bg-violet-100 text-violet-700" :
                    article.queueStatus === "error" ? "bg-slate-200 text-slate-700" :
                    article.queueStatus === "generating" ? "bg-indigo-100 text-indigo-700" :
                    article.queueStatus === "outline-review" ? "bg-amber-100 text-amber-800" :
                    "bg-slate-100 text-slate-600"
                  }`}>{article.queueStatus}</span>
                </div>
                <div className="text-sm font-medium text-slate-500">{article.createdAt ? new Date(article.createdAt).toLocaleDateString() : "-"}</div>
                <div className="flex flex-wrap justify-end gap-2">
                  {article.queueStatus === "error" ? (
                    <>
                      <Button variant="secondary" onClick={() => electronAPI.saveArticle({ ...article, queueStatus: "pending", workflowStatus: "queued", errorMessage: "" }).then(refreshArticles)}>Retry Saved Step</Button>
                      <Button variant="secondary" onClick={() => electronAPI.saveArticle({ ...article, queueStatus: "pending", workflowStatus: "queued", generationCheckpoint: null, generationStep: "", errorMessage: "" }).then(refreshArticles)}>Restart Article</Button>
                    </>
                  ) : article.queueStatus === "cancelled" ? (
                    <Button variant="secondary" onClick={() => electronAPI.saveArticle({ ...article, queueStatus: "pending", workflowStatus: "queued", errorMessage: "" }).then(refreshArticles)}>Return to Queue</Button>
                  ) : article.queueStatus === "completed" ? (
                    <Button variant="danger" onClick={() => electronAPI.deleteArticle(article.id).then(refreshArticles)}><Trash2 className="h-4 w-4" /></Button>
                  ) : null}
                </div>
              </div>
              {article.queueStatus === "outline-review" ? (
                <OutlineReviewCard
                  article={article}
                  busy={outlineWorkingId === article.id || running}
                  onSave={saveOutline}
                  onApprove={approveOutlineAndContinue}
                  onRegenerate={requestOutline}
                  onCancel={cancelOutline}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-ink/10 bg-white/90 p-2 backdrop-blur">
        <Button className="w-full" onClick={() => { setArticlesWorkflowStage?.("add"); setActiveScreen("articles"); }}>Add more titles</Button>
      </div>
    </section>
  );
}
