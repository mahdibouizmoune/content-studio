import { Ban, Clock3, Pause, Play, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { Button, EmptyState } from "@/components/ui";
import { electronAPI, isElectronApp } from "@/lib/electron";
import {
  buildMetadata,
  buildSeoImageAlt,
  buildSeoImageFilename,
  buildRankMathMeta,
  buildRecipeSchema,
  finalizeArticleContent,
  insertArticleImages,
  preparePrompt,
  qaArticleImages,
  sanitizeTitleText,
  scoreArticle
} from "@/lib/articlePostProcess.mjs";
import { applyInternalLinksToHtml, buildInternalLinkSuggestions, resolveArticleSite } from "@/lib/internalLinks";
import { buildSmartGenerationSettings } from "@/lib/smartContentEngine";
import { resolveArticleGenerationSettings } from "@/lib/articleGenerationSettings.mjs";
import { deriveLegacyQueueStatus, workflowStatusForGenerationStep } from "@/lib/articleWorkflow.mjs";
import { usesCompactRecipeCollection } from "@/lib/recipeTitle.mjs";
import { applyAffiliateLinksToArticle } from "@/lib/affiliateLinks.mjs";
import { buildListiclePrompt, parseItemCountFromTitle, parsePromisedRecipeCount } from "@/prompts";

function isAuthError(error) {
  return /401|403|api token|unauthorized|forbidden/i.test(error?.message || "");
}

async function saveStatus(article, patch) {
  return electronAPI.saveArticle({ ...article, ...patch, updatedAt: new Date().toISOString() });
}

export default function Queue({ articles, settings, saveSettings, refreshArticles, setActiveScreen, setArticlesWorkflowStage, embedded = false, rowStatusFilter = "all" }) {
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
  const pending = useMemo(() => articles.filter((article) => article.queueStatus === "pending"), [articles]);
  const extraCollectionTextCalls = useMemo(() => pending.reduce((total, article) => {
    const count = parsePromisedRecipeCount(article.title);
    const articleLength = articleSettings(article).articleLength;
    return count >= 6 && !usesCompactRecipeCollection(count, articleLength)
      ? total + Math.ceil(count / 5)
      : total;
  }, 0), [pending, settings]);
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
      return;
    }
    electronAPI.estimateCost({ articleCount: pending.length, settings, extraTextCalls: extraCollectionTextCalls }).then(setEstimate).catch(() => setEstimate(null));
  }, [pending.length, extraCollectionTextCalls, settings]);

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

  async function waitWhilePaused() {
    while (pausedRef.current) {
      setProgress("Article generation paused. Click Resume to continue.");
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    setProgress(pausedRef.current ? "Article generation paused. Click Resume to continue." : "Resuming article generation...");
  }

  function articleSettings(article) {
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
    return {
      ...resolved,
      brandVoice,
      outline: article.outlineApproved ? article.outline : ""
    };
  }

  async function generateOne(article) {
    const isListicle = article.type === "listicle";
    const promisedRecipeCount = parsePromisedRecipeCount(article.title);
    const isRecipeCollection = isListicle || promisedRecipeCount >= 6;
    const settingsForGen = articleSettings(article);
    const jobKey = `article:${article.id}:gen`;
    let workingArticle = { ...article };
    let checkpoint = { ...(article.generationCheckpoint || {}) };

    if (isRecipeCollection) {
      const listicleItemCount = promisedRecipeCount || parseItemCountFromTitle(article.title);
      const listicleCategory = promisedRecipeCount ? "food" : (article.category || settingsForGen.listicleCategory);
      settingsForGen.articlePrompt = buildListiclePrompt(article.title, listicleCategory, listicleItemCount, settingsForGen);
      settingsForGen.listicleCategory = listicleCategory;
      settingsForGen.listicleItemCount = listicleItemCount;
    }
    settingsForGen.articleType = isRecipeCollection ? "listicle" : (article.type || "article");
    settingsForGen.articlePrompt = preparePrompt(settingsForGen.articlePrompt, settingsForGen);

    const affiliateProvider = settingsForGen.affiliateProvider || "impact";
    const impactReady = Boolean(settingsForGen.impactAccountSid && settingsForGen.impactAuthToken);
    const amazonReady = Boolean(settingsForGen.amazonPartnerTag);
    const selectedProviderReady = affiliateProvider === "both"
      ? impactReady || amazonReady
      : affiliateProvider === "amazon"
        ? amazonReady
        : impactReady;
    const affiliateDiscoveryEnabled = settingsForGen.affiliateEnabled !== false
      && settingsForGen.affiliateAutoDiscover !== false
      && settingsForGen.affiliateAutoInsert !== false
      && selectedProviderReady;
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
        ...workingArticle,
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
      if (!baseContent) {
        setGenerationStage(`Generating article: ${article.title} (1/${totalStages})`, 1, totalStages);
        await waitWhilePaused();
        const generated = await electronAPI.generateArticle({ title: article.title, settings: settingsForGen, jobKey });
        baseContent = finalizeArticleContent(generated.content, article.title, settingsForGen);
        await saveCheckpoint("article", {
          content: baseContent,
          recipeCollection: generated.recipeCollection || null,
          qualityPassApplied: !!generated.qualityPassApplied,
          recipeCardRepairApplied: !!generated.recipeCardRepairApplied,
          recipeCardQualityWarning: generated.recipeCardQualityWarning || ""
        });
      }

      const affiliateDiscoveryTask = affiliateDiscoveryEnabled
        ? electronAPI.discoverAffiliates({
            article: { ...article, content: baseContent },
            settings: settingsForGen,
            jobKey: `article:${article.id}:affiliate`
          }).catch((error) => ({
            success: false,
            affiliates: [],
            error: error.message || "Affiliate discovery failed."
          }))
        : null;

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
        [generatedTitle, featuredImagePrompt] = await Promise.all([titleTask, featuredPromptTask]);
        await saveCheckpoint("content-planning", { generatedTitle, featuredImagePrompt });
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
        [featured, prompts] = await Promise.all([featuredTask, imagePromptsTask]);
        await saveCheckpoint("media-planning", { featured, imagePrompts: prompts });
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
        const discovery = await affiliateDiscoveryTask;
        if (!discovery.success && /cancelled/i.test(discovery.error || "")) throw new Error("Cancelled by user");
        affiliateDiscovery = {
          status: discovery.success ? (discovery.affiliates?.length ? "applied" : "no-match") : "error",
          error: discovery.success ? "" : discovery.error || "Affiliate discovery failed.",
          reviewedProducts: Number(discovery.reviewedProducts || 0),
          qualifiedProducts: Number(discovery.qualifiedProducts || 0),
          queries: discovery.queries || [],
          discoveredCount: discovery.affiliates?.length || 0,
          completedAt: new Date().toISOString()
        };
        const availableAffiliateLinks = [
          ...(settingsForGen.affiliateLinks || []),
          ...(discovery.success ? discovery.affiliates || [] : [])
        ];
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

      const completedArticle = {
        ...workingArticle,
        content: baseContent,
        generatedTitle,
        featuredImage: featured.displayUrl || featured.localImageUrl || featured.imageUrl,
        featuredImageRemoteUrl: featured.remoteImageUrl || featured.imageUrl,
        featuredImageLocalUrl: featured.localImageUrl || "",
        featuredImageDisplay: featured.displayUrl || featured.localImageUrl || featured.imageUrl,
        featuredImageLocalPath: featured.localPath,
        featuredImagePrompt,
        featuredImageAlt: settingsForGen.imageSeoProMode !== false
          ? buildSeoImageAlt({ ...article, generatedTitle }, { prompt: featuredImagePrompt }, 0, "featured")
          : `${article.seoBrief?.targetKeyword || generatedTitle} featured image`,
        featuredImageSeoFileName: settingsForGen.imageSeoProMode !== false
          ? buildSeoImageFilename({ ...article, generatedTitle }, { prompt: featuredImagePrompt }, 0, "featured")
          : "",
        images,
        queueStatus: "completed",
        workflowStatus: "needs-review",
        editorialQualityPassApplied: !!checkpoint.qualityPassApplied,
        recipeCardRepairApplied: !!checkpoint.recipeCardRepairApplied,
        recipeCardQualityWarning: checkpoint.recipeCardQualityWarning || "",
        errorMessage: "",
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

      await saveStatus(workingArticle, { ...enriched, seoScore: seo.score, seoChecks: seo.checks, imageQa, rankMathMeta: buildRankMathMeta(enriched) });
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
    const cost = estimate || (await electronAPI.estimateCost({ articleCount: pending.length, settings, extraTextCalls: extraCollectionTextCalls }));
    if (cost.total > 1 && !window.confirm(`Estimated cost is $${cost.total.toFixed(2)}. Continue?`)) return;
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
        await saveStatus(article, { queueStatus: "generating", workflowStatus: "generating-content", errorMessage: "" });
        await refreshArticles();
        if (cancelRequestedRef.current) {
          await saveStatus(article, { queueStatus: "pending", workflowStatus: "queued", errorMessage: "" });
          break;
        }
        let cancelled = false;
        try {
          await generateOne(article);
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
    if (!failed.length || !window.confirm(`Delete ${failed.length} errored article${failed.length === 1 ? "" : "s"} from local storage?`)) return;
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
                <Button variant="secondary" onClick={togglePause}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? "Resume" : "Pause"}</Button>
                <Button variant="warning" onClick={cancel}><Ban className="h-4 w-4" />Cancel</Button>
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

      {!embedded ? <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="soft-card rounded-lg p-4"><div className="text-2xl font-black text-slate-900">{pending.length}</div><div className="text-sm font-semibold text-slate-500">Pending</div></div>
        <div className="soft-card rounded-lg p-4"><div className="text-2xl font-black text-slate-900">{completed.length}</div><div className="text-sm font-semibold text-slate-500">Completed</div></div>
        <div className="soft-card rounded-lg p-4"><div className="text-2xl font-black text-slate-900">{estimate ? `$${estimate.total.toFixed(4)}` : "$0.0000"}</div><div className="text-sm font-semibold text-slate-500">Estimated cost</div></div>
        <div className="soft-card rounded-lg p-4"><div className="text-2xl font-black text-slate-900">{settings.enableIntextImages ? settings.intextImageCount : 0}</div><div className="text-sm font-semibold text-slate-500">Images each</div></div>
      </div> : null}

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
          <div className="hidden grid-cols-[1fr_140px_150px_150px] border-b border-slate-200 bg-slate-50 px-5 py-4 text-sm font-black text-slate-900 md:grid">
            <div>Title</div>
            <div>Status</div>
            <div>Created</div>
            <div className="text-right">Actions</div>
          </div>
          {activeRows.map((article) => (
            <div key={article.id} className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 md:grid-cols-[1fr_140px_150px_150px] md:items-center">
              <div className="min-w-0">
                <div className="text-base font-black text-slate-900 md:truncate">{article.generatedTitle || article.title}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                  <span>{article.type}</span>
                  {article.category ? <span>/ {article.category}</span> : null}
                  {article.seoBrief?.targetKeyword ? <span>/ keyword: {article.seoBrief.targetKeyword}</span> : null}
                  {article.workflowStatus ? <span>/ {article.workflowStatus}</span> : null}
                  {article.seoScore != null ? <span>/ SEO {article.seoScore}/100</span> : null}
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
              <div className="flex justify-end gap-2">
                {article.queueStatus === "error" ? (
                  <Button variant="secondary" onClick={() => electronAPI.saveArticle({ ...article, queueStatus: "pending", errorMessage: "" }).then(refreshArticles)}>Retry</Button>
                ) : article.queueStatus === "completed" ? (
                  <Button variant="danger" onClick={() => electronAPI.deleteArticle(article.id).then(refreshArticles)}><Trash2 className="h-4 w-4" /></Button>
                ) : null}
              </div>
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
