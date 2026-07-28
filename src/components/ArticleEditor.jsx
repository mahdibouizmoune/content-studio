import { BadgeDollarSign, ExternalLink, Image, Link2, PackageCheck, Plus, RefreshCw, RotateCcw, Save, Search, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { buildMetadata, buildRankMathMeta, buildRecipeSchema, buildSeoImageAlt, buildSeoImageFilename, insertArticleImages, qaArticleImages, scoreArticle } from "@/lib/articlePostProcess.mjs";
import { applyInternalLinksToHtml, buildInternalLinkSuggestions } from "@/lib/internalLinks";
import { categoryNeedsReview, matchWordPressCategory } from "@/lib/wordpressCategories";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { inferSmartIntent } from "@/lib/smartContentEngine";
import { applyAffiliateLinksToArticle, findAffiliateOpportunities, removeManagedAffiliateLinks } from "@/lib/affiliateLinks.mjs";
import { buildArticleBrief } from "@/lib/articleBrief.mjs";
import { buildArticleQualityReport } from "@/lib/articleQuality.mjs";
import { applyReaderRetentionElements } from "@/lib/readerRetention.mjs";
import { listArticleSections, recordArticleRevision, replaceArticleSection, restoreArticleRevision } from "@/lib/articleRevisions.mjs";

export default function ArticleEditor({ article, settings, saveSettings, onClose, refreshArticles }) {
  const [draft, setDraft] = useState(article);
  const [status, setStatus] = useState("");
  const [assetWorking, setAssetWorking] = useState(false);
  const [assetImageSource, setAssetImageSource] = useState("auto");
  const [assetPlatforms, setAssetPlatforms] = useState(["instagram", "facebook", "threads", "reddit", "pinterest"]);
  const [impactQuery, setImpactQuery] = useState("");
  const [impactProducts, setImpactProducts] = useState([]);
  const [impactBusy, setImpactBusy] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [sectionInstruction, setSectionInstruction] = useState("");
  const [sectionProposal, setSectionProposal] = useState(null);
  const [sectionBusy, setSectionBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const lastSavedRef = useRef(article);

  const socialPlatformOptions = [
    { id: "instagram", label: "Instagram" },
    { id: "facebook", label: "Facebook" },
    { id: "threads", label: "Threads" },
    { id: "reddit", label: "Reddit" },
    { id: "pinterest", label: "Pinterest" },
    { id: "email", label: "Email" }
  ];

  const imageSourceOptions = [
    { id: "auto", label: "Auto" },
    { id: "pin", label: "Pin Image" },
    { id: "article-featured", label: "Article Featured Image" },
    { id: "article-inline", label: "Article In-Text Image" }
  ];

  const featuredImageSrc = draft.featuredImageDisplay || draft.featuredImageLocalUrl || draft.featuredImage || "";
  const articleSections = useMemo(() => listArticleSections(draft.content || ""), [draft.content]);
  const affiliateOpportunities = useMemo(() => findAffiliateOpportunities({
    article: draft,
    content: draft.content || "",
    settings: {
      ...settings,
      affiliateLinks: draft.affiliateLinks?.length ? draft.affiliateLinks : settings.affiliateLinks
    }
  }), [draft, settings]);

  function rescore(nextDraft, options = {}) {
    let workingDraft = { ...nextDraft };
    workingDraft.articleBrief = buildArticleBrief({
      article: workingDraft,
      resolvedSettings: {
        ...settings,
        articleLength: workingDraft.articleLength || settings.articleLength,
        seoBrief: workingDraft.seoBrief || {}
      }
    });
    if (settings.imageSeoProMode !== false) {
      workingDraft = {
        ...workingDraft,
        featuredImageAlt: workingDraft.featuredImageAlt || buildSeoImageAlt(workingDraft, { prompt: workingDraft.featuredImagePrompt }, 0, "featured"),
        featuredImageSeoFileName: workingDraft.featuredImageSeoFileName || buildSeoImageFilename(workingDraft, { prompt: workingDraft.featuredImagePrompt }, 0, "featured"),
        images: (workingDraft.images || []).map((image, index) => ({
          ...image,
          altText: image.altText || buildSeoImageAlt(workingDraft, image, index, "in-text image"),
          seoFileName: image.seoFileName || buildSeoImageFilename(workingDraft, image, index, "recipe image")
        }))
      };
    }
    workingDraft.content = insertArticleImages(workingDraft.content || "", workingDraft.images || []);
    workingDraft = applyReaderRetentionElements(workingDraft, settings);
    const metadata = buildMetadata(workingDraft, workingDraft.content || "");
    const generatedStructuredData = buildRecipeSchema({ ...workingDraft, ...metadata });
    const structuredData = options.rebuildSchema
      ? generatedStructuredData
      : (workingDraft.structuredData || generatedStructuredData);
    const enriched = { ...workingDraft, ...metadata, structuredData };
    const seo = scoreArticle(enriched, workingDraft.content || "");
    const imageQa = qaArticleImages(enriched);
    const qualityReport = buildArticleQualityReport(
      { ...enriched, seoScore: seo.score, seoChecks: seo.checks, imageQa },
      { maxAffiliateLinks: settings.affiliateMaxLinks, requireFeaturedImage: true }
    );
    return { ...enriched, seoScore: seo.score, seoChecks: seo.checks, imageQa, qualityReport, rankMathMeta: buildRankMathMeta(enriched) };
  }

  useEffect(() => {
    setDraft((current) => (current.seoChecks?.length && current.imageQa ? current : rescore(current)));
  }, []);

  async function save(next = draft, revisionMeta = {}) {
    const rescored = rescore(next);
    const revised = recordArticleRevision(lastSavedRef.current, rescored, {
      changedSection: revisionMeta.changedSection || "Article review",
      sectionId: revisionMeta.sectionId || "",
      scope: revisionMeta.scope || "article",
      previousContent: revisionMeta.previousContent,
      newContent: revisionMeta.newContent,
      changeSource: revisionMeta.changeSource || "user",
      modelUsed: revisionMeta.modelUsed || "",
      action: revisionMeta.action || "save",
      reason: revisionMeta.reason || ""
    });
    await electronAPI.saveArticle(revised);
    lastSavedRef.current = revised;
    setDraft(revised);
    await refreshArticles();
    setStatus("Article saved.");
    return revised;
  }

  async function approve() {
    let next = rescore({ ...draft, workflowStatus: "approved" });
    if (next.qualityReport?.blockers?.length) {
      const reason = window.prompt(
        `${next.qualityReport.blockers.length} critical quality issue${next.qualityReport.blockers.length === 1 ? "" : "s"} remain. Enter an administrative override reason, or cancel and fix them.`
      );
      if (!reason?.trim()) {
        setDraft(next);
        setStatus("Approval paused. Fix the critical issues or provide an override reason.");
        return;
      }
      next = {
        ...next,
        qualityOverride: {
          reason: reason.trim().slice(0, 500),
          action: "approve",
          blockerIds: next.qualityReport.blockers.map((blocker) => blocker.id),
          recordedAt: new Date().toISOString()
        }
      };
    }
    await save(next);
    setStatus("Article approved for publishing.");
  }

  async function requestChanges() {
    const reason = window.prompt("Describe the changes this article needs.");
    if (!reason?.trim()) return;
    await save(
      { ...draft, workflowStatus: "changes-requested", changesRequestedReason: reason.trim().slice(0, 1000) },
      { changedSection: "Workflow", action: "request-changes", reason: reason.trim() }
    );
    setStatus("Changes requested and recorded in revision history.");
  }

  async function regenerateMetadata() {
    const next = rescore({
      ...draft,
      metaTitle: "",
      metaDescription: "",
      rankMathTitle: "",
      rankMathDescription: "",
      openGraphTitle: "",
      openGraphDescription: "",
      pinterestTitle: "",
      pinterestDescription: ""
    });
    await save(next, {
      changedSection: "SEO metadata",
      changeSource: "automated",
      action: "regenerate-metadata",
      reason: "Rebuilt metadata from the saved article brief and current article content."
    });
    setStatus("SEO, Open Graph, and Pinterest metadata regenerated.");
  }

  async function repairRecipeSchema() {
    const next = rescore(draft, { rebuildSchema: true });
    if (!next.structuredData) {
      setDraft(next);
      setStatus("No complete recipe card was found. Add ingredients, instructions, timing, and yield before repairing schema.");
      return;
    }
    await save(next, {
      changedSection: "Recipe schema",
      changeSource: "automated",
      action: "repair-schema",
      reason: "Rebuilt Recipe JSON-LD from the visible recipe card."
    });
    setStatus("Recipe schema rebuilt from the visible recipe card.");
  }

  async function replaceArticleImage(kind, index = -1) {
    const result = await electronAPI.selectArticleImage();
    if (!result?.success) return;
    const next = { ...draft };
    if (kind === "featured") {
      next.featuredImage = result.localImageUrl;
      next.featuredImageDisplay = result.localImageUrl;
      next.featuredImageLocalUrl = result.localImageUrl;
      next.featuredImageLocalPath = result.localPath;
    } else {
      const previous = next.images?.[index] || {};
      const images = [...(next.images || [])];
      images[index] = {
        ...previous,
        url: result.localImageUrl,
        displayUrl: result.localImageUrl,
        localUrl: result.localImageUrl,
        localPath: result.localPath
      };
      next.images = images;
      const previousSources = [previous.url, previous.displayUrl, previous.localUrl].filter(Boolean);
      next.content = previousSources.reduce(
        (html, source) => html.split(source).join(result.localImageUrl),
        next.content || ""
      );
    }
    await save(next, {
      changedSection: kind === "featured" ? "Featured image" : `In-text image ${index + 1}`,
      changeSource: "user",
      action: "replace-image",
      reason: "Replaced the image with a user-selected local file."
    });
    setStatus(`${kind === "featured" ? "Featured image" : `Image ${index + 1}`} replaced.`);
  }

  async function proposeSectionRegeneration() {
    const selected = articleSections.find((section) => section.id === sectionId) || articleSections[0];
    if (!selected) {
      setStatus("No article section is available to regenerate.");
      return;
    }
    setSectionBusy(true);
    setStatus(`Preparing a replacement for ${selected.label}...`);
    const jobKey = `article:${draft.id}:section:${selected.id}`;
    try {
      const result = await electronAPI.regenerateArticleSection({
        title: draft.generatedTitle || draft.title,
        sectionLabel: selected.label,
        currentHtml: selected.html,
        articleBrief: draft.articleBrief,
        outline: draft.outline,
        instructions: sectionInstruction,
        settings,
        jobKey
      });
      setSectionId(selected.id);
      setSectionProposal({
        sectionId: selected.id,
        sectionLabel: selected.label,
        previousHtml: selected.html,
        proposedHtml: result.html,
        model: result.model || settings.aiModel,
        predictionId: result.predictionId || ""
      });
      setStatus("Replacement ready. Compare it with the current section before accepting.");
    } catch (error) {
      setStatus(error.message || "Could not regenerate the selected section.");
    } finally {
      setSectionBusy(false);
    }
  }

  async function acceptSectionProposal() {
    if (!sectionProposal) return;
    const next = {
      ...draft,
      content: replaceArticleSection(draft.content || "", sectionProposal.sectionId, sectionProposal.proposedHtml)
    };
    await save(next, {
      changedSection: sectionProposal.sectionLabel,
      sectionId: sectionProposal.sectionId,
      scope: "section",
      previousContent: sectionProposal.previousHtml,
      newContent: sectionProposal.proposedHtml,
      changeSource: "ai",
      modelUsed: sectionProposal.model,
      action: "regenerate-section",
      reason: sectionInstruction || "Accepted the proposed section replacement."
    });
    setSectionProposal(null);
    setSectionInstruction("");
    setStatus(`${sectionProposal.sectionLabel} replaced and revision saved.`);
  }

  async function restoreRevision(revision) {
    const restored = restoreArticleRevision(draft, revision);
    await save(restored, {
      changedSection: revision.changedSection || "Article",
      changeSource: "user",
      action: "restore-revision",
      reason: `Restored revision from ${new Date(revision.timestamp).toLocaleString()}.`
    });
    setStatus("Previous revision restored.");
  }

  async function regenerateArticleImage(kind, index = -1) {
    const image = kind === "featured" ? null : draft.images?.[index];
    const prompt = kind === "featured" ? draft.featuredImagePrompt : image?.prompt;
    if (!prompt) {
      setStatus("This image has no saved prompt to regenerate.");
      return;
    }
    const workingKey = kind === "featured" ? "featured" : `image-${index}`;
    setImageBusy(workingKey);
    setStatus(`Regenerating ${kind === "featured" ? "featured image" : `image ${index + 1}`}...`);
    try {
      const result = await electronAPI.generateImage({
        prompt,
        aspectRatio: kind === "featured" ? (draft.featuredImageAspectRatio || settings.featuredImageRatio || "3:2") : (image.aspectRatio || settings.intextImageRatio || "4:3"),
        settings,
        jobKey: `article:${draft.id}:${workingKey}:regenerate`
      });
      const displayUrl = result.displayUrl || result.localImageUrl || result.imageUrl || "";
      if (!displayUrl && !result.localPath) throw new Error("The image provider returned no usable image.");
      let next;
      if (kind === "featured") {
        next = {
          ...draft,
          featuredImage: displayUrl,
          featuredImageDisplay: displayUrl,
          featuredImageLocalUrl: result.localImageUrl || "",
          featuredImageLocalPath: result.localPath || "",
          featuredImageRemoteUrl: result.remoteImageUrl || result.imageUrl || "",
          featuredImageAspectRatio: result.aspectRatio || draft.featuredImageAspectRatio
        };
      } else {
        const images = [...(draft.images || [])];
        const previousSources = [image.displayUrl, image.localUrl, image.url].filter(Boolean);
        images[index] = {
          ...image,
          url: displayUrl,
          displayUrl,
          localUrl: result.localImageUrl || "",
          localPath: result.localPath || "",
          remoteImageUrl: result.remoteImageUrl || result.imageUrl || "",
          aspectRatio: result.aspectRatio || image.aspectRatio
        };
        let content = draft.content || "";
        previousSources.forEach((source) => {
          content = content.split(source).join(displayUrl);
        });
        next = { ...draft, images, content };
      }
      await save(next, {
        changedSection: kind === "featured" ? "Featured image" : `In-text image ${index + 1}`,
        changeSource: "ai",
        modelUsed: settings.imageModel,
        action: "regenerate-image",
        reason: "User requested a replacement image from the saved prompt."
      });
      setStatus("Replacement image generated and saved.");
    } catch (error) {
      setStatus(error.message || "Image regeneration failed.");
    } finally {
      setImageBusy("");
    }
  }

  async function applyInternalLinksToDraft(inputDraft, site, shouldSave = true) {
    let linkSite = site;
    if (!linkSite?.url) throw new Error("Choose a WordPress site first.");
    if (!linkSite.internalLinkPosts?.length && linkSite.username && linkSite.apiKey) {
      setStatus(`Syncing internal link posts for ${linkSite.name || linkSite.url}...`);
      const result = await electronAPI.syncWordPressPosts({
        wordpressUrl: linkSite.url,
        wordpressUsername: linkSite.username,
        wordpressApiKey: linkSite.apiKey,
        categories: linkSite.categories || [],
        maxPosts: settings.internalLinkMaxPosts || 500
      });
      linkSite = { ...linkSite, internalLinkPosts: result.posts || [] };
    }
    const suggestions = buildInternalLinkSuggestions({ article: inputDraft, content: inputDraft.content || "", site: linkSite, settings });
    const linked = applyInternalLinksToHtml(inputDraft.content || "", suggestions);
    if (!linked.applied.length) throw new Error("No relevant internal links found for this article.");
    const next = rescore({
      ...inputDraft,
      content: linked.html,
      internalLinks: linked.applied,
      internalLinksAppliedAt: new Date().toISOString(),
      internalLinkSiteId: linkSite.id || linkSite.url
    });
    if (shouldSave) {
      await electronAPI.saveArticle(next);
      setDraft(next);
      await refreshArticles();
      setStatus(`Added ${linked.applied.length} internal link${linked.applied.length === 1 ? "" : "s"}.`);
    }
    return next;
  }

  async function applyAffiliateLinks(inputDraft = draft, shouldSave = true) {
    const affiliateLinks = inputDraft.affiliateLinks?.length ? inputDraft.affiliateLinks : settings.affiliateLinks;
    const next = rescore(applyAffiliateLinksToArticle(inputDraft, { ...settings, affiliateLinks }));
    if (!next.affiliateLinks?.length) throw new Error("No relevant affiliate opportunities matched this article.");
    if (shouldSave) {
      await electronAPI.saveArticle(next);
      setDraft(next);
      await refreshArticles();
      setStatus(`Added ${next.affiliateLinks.length} relevant affiliate link${next.affiliateLinks.length === 1 ? "" : "s"} with disclosure.`);
    }
    return next;
  }

  async function removeAffiliateLinks() {
    const next = rescore(removeManagedAffiliateLinks(draft));
    await electronAPI.saveArticle(next);
    setDraft(next);
    await refreshArticles();
    setStatus("Removed Content Studio affiliate links and disclosure.");
  }

  async function removeAffiliateRecommendation(id) {
    const remaining = (draft.affiliateLinks || []).filter((item) => item.id !== id);
    const stripped = removeManagedAffiliateLinks(draft);
    const next = remaining.length
      ? rescore(applyAffiliateLinksToArticle(stripped, { ...settings, affiliateLinks: remaining }))
      : rescore(stripped);
    await electronAPI.saveArticle(next);
    setDraft(next);
    await refreshArticles();
    setStatus(remaining.length ? "Recommendation removed and remaining placements refreshed." : "Affiliate recommendation removed.");
  }

  async function searchImpactProducts() {
    if (impactQuery.trim().length < 2) {
      setStatus("Enter a product, ingredient, or kitchen tool to search Impact.");
      return;
    }
    setImpactBusy("search");
    setStatus("Searching your approved Impact products...");
    try {
      const result = await electronAPI.searchImpactProducts({ keyword: impactQuery.trim() });
      if (!result.success) throw new Error(result.error || "Impact product search failed.");
      setImpactProducts(result.products || []);
      setStatus(`${(result.products || []).length} Impact product${(result.products || []).length === 1 ? "" : "s"} found.`);
    } catch (error) {
      setImpactProducts([]);
      setStatus(error.message || "Impact product search failed.");
    } finally {
      setImpactBusy("");
    }
  }

  async function importImpactProduct(product) {
    if (!saveSettings) {
      setStatus("Open Settings to import Impact products.");
      return;
    }
    setImpactBusy(`import-${product.id}`);
    setStatus(`Preparing the tracking link for ${product.name}...`);
    try {
      const result = await electronAPI.createImpactAffiliateLink({ product });
      if (!result.success) throw new Error(result.error || "Impact tracking link creation failed.");
      const existing = settings.affiliateLinks || [];
      const duplicateIndex = existing.findIndex((item) =>
        (result.affiliate.id && item.id === result.affiliate.id) ||
        (result.affiliate.url && item.url === result.affiliate.url)
      );
      const affiliateLinks = [...existing];
      if (duplicateIndex >= 0) affiliateLinks[duplicateIndex] = result.affiliate;
      else affiliateLinks.push(result.affiliate);
      await saveSettings({ ...settings, affiliateLinks });
      setImpactProducts((current) => current.filter((item) => item.id !== product.id));
      setStatus(`${product.name} added to the Affiliate Library. Natural article matches are ready below.`);
    } catch (error) {
      setStatus(error.message || "Impact product import failed.");
    } finally {
      setImpactBusy("");
    }
  }

  async function autoDiscoverImpact() {
    setImpactBusy("auto");
    setStatus("Analyzing this article and searching the selected affiliate provider...");
    try {
      const discovery = await electronAPI.discoverAffiliates({
        article: draft,
        settings,
        jobKey: `article:${draft.id}:affiliate-manual`
      });
      if (!discovery.success) throw new Error(discovery.error || "Automatic affiliate discovery failed.");
      if (!discovery.affiliates?.length) {
        setStatus(`No strong affiliate match found after reviewing ${discovery.reviewedProducts || 0} products. Nothing was inserted.`);
        const next = {
          ...draft,
          affiliateDiscovery: {
            status: "no-match",
            reviewedProducts: discovery.reviewedProducts || 0,
            qualifiedProducts: discovery.qualifiedProducts || 0,
            queries: discovery.queries || [],
            completedAt: new Date().toISOString()
          }
        };
        await electronAPI.saveArticle(next);
        setDraft(next);
        await refreshArticles();
        return;
      }
      const affiliateSettings = { ...settings, affiliateLinks: discovery.affiliates };
      const linked = rescore(applyAffiliateLinksToArticle(draft, affiliateSettings));
      const next = {
        ...linked,
        affiliateDiscovery: {
          status: linked.affiliateLinks?.length ? "applied" : "products-found-no-placement",
          reviewedProducts: discovery.reviewedProducts || 0,
          qualifiedProducts: discovery.qualifiedProducts || 0,
          discoveredCount: discovery.affiliates.length,
          appliedCount: linked.affiliateLinks?.length || 0,
          queries: discovery.queries || [],
          completedAt: new Date().toISOString()
        }
      };
      await electronAPI.saveArticle(next);
      setDraft(next);
      await refreshArticles();
      setStatus(linked.affiliateLinks?.length
        ? `Added ${linked.affiliateLinks.length} relevant affiliate recommendation${linked.affiliateLinks.length === 1 ? "" : "s"} with disclosure.`
        : "Relevant products were found, but no safe natural placement was available. Nothing was forced into the article.");
    } catch (error) {
      setStatus(error.message || "Automatic affiliate discovery failed.");
    } finally {
      setImpactBusy("");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this article?")) return;
    await electronAPI.deleteArticle(article.id);
    await refreshArticles();
    onClose();
  }

  async function publish(site, publishOptions = {}) {
    if (publishOptions.status === "future") {
      const scheduledDate = new Date(publishOptions.scheduledAt || scheduleAt);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
        setStatus("Choose a future date and time before scheduling.");
        return;
      }
    }
    setStatus(`Publishing to ${site.name || site.url}...`);
    let publishSite = site;
    const prePublishWarnings = [];
    if (!publishSite.categories?.length && publishSite.url) {
      try {
        setStatus(`Syncing categories from ${publishSite.name || publishSite.url}...`);
        const synced = await electronAPI.syncWordPressCategories({
          wordpressUrl: publishSite.url,
          wordpressUsername: publishSite.username,
          wordpressApiKey: publishSite.apiKey
        });
        if (synced?.categories?.length) publishSite = { ...publishSite, categories: synced.categories };
      } catch (error) {
        prePublishWarnings.push(`Categories could not be synced: ${error.message || "unknown error"}`);
      }
    }
    let workingDraft = draft;
    if (settings.enableInternalLinks !== false && Number(settings.internalLinkCount ?? 3) > 0) {
      try {
        workingDraft = await applyInternalLinksToDraft(workingDraft, publishSite, false);
      } catch (error) {
        prePublishWarnings.push(`Internal links could not be refreshed: ${error.message || "unknown error"}`);
      }
    }
    if (settings.affiliateEnabled !== false && settings.affiliateAutoInsert !== false) {
      const articleAffiliateLinks = (workingDraft.affiliateLinks || []).filter((item) => item?.url);
      const affiliateLinks = articleAffiliateLinks.length ? articleAffiliateLinks : (settings.affiliateLinks || []);
      if (affiliateLinks.length) {
        workingDraft = applyAffiliateLinksToArticle(workingDraft, { ...settings, affiliateLinks });
      }
    }
    let readyDraft = rescore(workingDraft);
    const publishQualityReport = buildArticleQualityReport(readyDraft, {
      maxAffiliateLinks: settings.affiliateMaxLinks,
      requireFeaturedImage: true,
      requireSite: true,
      site: publishSite
    });
    readyDraft = { ...readyDraft, qualityReport: publishQualityReport };
    if (publishQualityReport.blockers.length) {
      const reason = window.prompt(
        `${publishQualityReport.blockers.length} critical publish issue${publishQualityReport.blockers.length === 1 ? "" : "s"} remain. Enter an administrative override reason, or cancel and fix them.`
      );
      if (!reason?.trim()) {
        setDraft(readyDraft);
        setStatus("Publishing paused. Fix the critical quality issues or provide an override reason.");
        return;
      }
      readyDraft = {
        ...readyDraft,
        qualityOverride: {
          reason: reason.trim().slice(0, 500),
          action: "publish",
          blockerIds: publishQualityReport.blockers.map((blocker) => blocker.id),
          recordedAt: new Date().toISOString()
        }
      };
    }
    if ((readyDraft.seoScore || 0) < 80 && !window.confirm(`SEO score is ${readyDraft.seoScore}/100. Publish anyway?`)) {
      setDraft(readyDraft);
      setStatus("Publishing paused. Fix SEO checks or publish again to confirm.");
      return;
    }
    if (readyDraft.imageQa?.criticalIssues && !window.confirm("Image QA found missing required images. Publish anyway?")) {
      setDraft(readyDraft);
      setStatus("Publishing paused. Fix image QA issues or publish again to confirm.");
      return;
    }
    const match = readyDraft.wordpressCategoryId
      ? { category: publishSite.categories?.find((category) => String(category.id) === String(readyDraft.wordpressCategoryId)), confidence: 100, reason: "Manual category" }
      : matchWordPressCategory(readyDraft, publishSite);
    const articleForPublish = {
      ...readyDraft,
      publishStatusOverride: publishOptions.status || settings.publishStatus || "publish",
      scheduledAt: publishOptions.status === "future" ? (publishOptions.scheduledAt || scheduleAt) : "",
      wordpressCategoryId: readyDraft.wordpressCategoryId || match.category?.id,
      autoCategory: match
    };
    setStatus(match.category?.id ? `Publishing to ${publishSite.name || publishSite.url} in ${match.category.name}...` : `Publishing to ${publishSite.name || publishSite.url}...`);
    const result = await electronAPI.pushToWordPress({ article: articleForPublish, site: publishSite });
    const isPublic = result.status === "publish";
    const isScheduled = result.status === "future";
    const publicPostUrl = isPublic ? (result.postUrl || readyDraft.wordpressPostUrl) : readyDraft.wordpressPostUrl;
    const next = {
      ...articleForPublish,
      publishStatusOverride: "",
      workflowStatus: result.success ? (isPublic ? "published" : isScheduled ? "approved" : "needs-review") : readyDraft.workflowStatus,
      wordpressPublishStatus: result.status || readyDraft.wordpressPublishStatus || "",
      wordpressPostId: result.postId || readyDraft.wordpressPostId,
      wordpressPostUrl: publicPostUrl,
      wordpressDraftUrl: isPublic ? "" : (result.postUrl || readyDraft.wordpressDraftUrl || ""),
      sourceUrl: publicPostUrl || readyDraft.sourceUrl,
      rankMathStatus: result.rankMathStatus || "not-run",
      rankMathWarning: result.rankMathWarning || "",
      mediaWarnings: result.mediaWarnings || [],
      publishHistory: [
        ...(readyDraft.publishHistory || []),
        { siteId: site.id || site.url, siteName: site.name || site.url, status: result.status || "publish", postUrl: publicPostUrl, categoryId: result.categoryId, categoryName: match.category?.name, rankMathStatus: result.rankMathStatus, publishedAt: new Date().toISOString() }
      ]
    };
    await save(next);
    const warnings = [...prePublishWarnings, result.rankMathWarning, ...(result.mediaWarnings || [])].filter(Boolean);
    setStatus(warnings.length
      ? `${isPublic ? "Published" : isScheduled ? "Scheduled" : "Saved as draft"} with warning: ${warnings.join(" ")}`
      : isPublic
      ? (result.postUrl ? `Published: ${result.postUrl}` : "Published to WordPress.")
      : isScheduled
      ? `Scheduled for ${new Date(publishOptions.scheduledAt || scheduleAt).toLocaleString()}. It will be sent to Pin Creator only after a confirmed public publish.`
      : "Saved as a WordPress draft. It was not sent to Pin Creator because it is not public.");
    return next;
  }

  async function createOnePinPack(inputDraft = draft) {
    const readyDraft = rescore(inputDraft);
    await save(readyDraft);
    const url = readyDraft.wordpressPostUrl || readyDraft.sourceUrl || `content-studio://article/${encodeURIComponent(readyDraft.id)}?title=${encodeURIComponent(readyDraft.generatedTitle || readyDraft.title)}`;
    const interests = [
      readyDraft.rankMathFocusKeyword,
      ...(readyDraft.tags || []),
      ...String(readyDraft.seoBrief?.secondaryKeywords || "").split(",")
    ].map((item) => item?.trim()).filter(Boolean).slice(0, 8);
    const jobKey = `pin-pack-${readyDraft.id}-${Date.now()}`;
    try {
      setStatus("Creating one-pin pack: prompt...");
      const promptResult = await electronAPI.generatePrompt(url, interests, "closeup", jobKey);
      if (!promptResult.success) throw new Error(promptResult.error || "Pin prompt failed.");
      setStatus("Creating one-pin pack: title and description...");
      const titleResult = await electronAPI.generateTitleDescription(url, interests, "closeup", jobKey);
      if (!titleResult.success) throw new Error(titleResult.error || "Pin title and description failed.");
      setStatus("Creating one-pin pack: image...");
      const imageResult = await electronAPI.generateImage(promptResult.prompt, "9:16", "ideogram", url, jobKey);
      if (!imageResult.success) throw new Error(imageResult.error || "Pin image failed.");
      const pinPack = {
        createdAt: new Date().toISOString(),
        url,
        interests,
        prompt: promptResult.prompt,
        title: titleResult.title,
        description: titleResult.description,
        imageUrl: imageResult.imageUrl,
        hostedImageUrl: imageResult.imgurUrl || "",
        board: ""
      };
      const next = { ...readyDraft, pinPack };
      await electronAPI.saveArticle(next);
      setDraft(next);
      await electronAPI.appendPinQueue([{ url, articleId: readyDraft.id, title: readyDraft.generatedTitle || readyDraft.title, excerpt: readyDraft.excerpt || readyDraft.metaDescription || "", targetKeyword: readyDraft.rankMathFocusKeyword || readyDraft.seoBrief?.targetKeyword || "", interests: [readyDraft.seoBrief?.targetKeyword, ...(readyDraft.tags || []), ...String(readyDraft.seoBrief?.secondaryKeywords || "").split(",")].filter(Boolean).slice(0, 15), smartPinStyle: readyDraft.smartPinStyle || inferSmartIntent(readyDraft).pinStyle, csvBoard: readyDraft.recommendedPinterestBoard || "", queueType: "article", addedAt: new Date().toISOString() }]);
      await electronAPI.openPinCreator?.();
      await refreshArticles();
      setStatus("One-pin pack created and sent to Pin Creator.");
    } catch (error) {
      setStatus(error.message || "Could not create one-pin pack.");
    }
  }

  async function runOneClickWorkflow(site) {
    setAssetWorking(true);
    try {
      setStatus("Running one-click workflow: WordPress...");
      const publishedDraft = site?.url ? await publish(site) : draft;
      if (site?.url && !publishedDraft?.wordpressPostUrl) throw new Error("WordPress did not return a public post URL.");
      setStatus("Running one-click workflow: Pinterest pin...");
      await createOnePinPack(publishedDraft || draft);
      setStatus("Running one-click workflow: social pack...");
      await createArticleSocialPack(publishedDraft || draft);
      await electronAPI.openRepurposeStudio?.();
      setStatus("One-click workflow finished: WordPress update, pin, and GHL-ready social pack created.");
    } catch (error) {
      setStatus(error.message || "One-click workflow failed.");
    } finally {
      setAssetWorking(false);
    }
  }

  function toggleAssetPlatform(platformId) {
    setAssetPlatforms((current) => current.includes(platformId) ? current.filter((item) => item !== platformId) : [...current, platformId]);
  }

  async function createArticleSocialPack(inputDraft = draft) {
    if (!assetPlatforms.length) {
      setStatus("Choose at least one platform.");
      return;
    }
    setAssetWorking(true);
    try {
      const readyDraft = rescore(inputDraft);
      await save(readyDraft);
      setStatus("Creating article social pack...");
      const result = await electronAPI.generateRepurposePack({
        article: readyDraft,
        platforms: assetPlatforms,
        campaignStyle: "traffic",
        settings,
        jobKey: `article-assets-${readyDraft.id}-${Date.now()}`
      });
      if (!result?.pack) throw new Error(result?.error || "Could not create social pack.");
      await electronAPI.saveRepurposePacks?.({ packs: [result.pack], replace: false, source: "articleEditor" });
      const next = {
        ...readyDraft,
        socialPacks: [
          result.pack,
          ...(readyDraft.socialPacks || []).filter((pack) => pack.id !== result.pack.id)
        ].slice(0, 10)
      };
      await electronAPI.saveArticle(next);
      setDraft(next);
      await refreshArticles();
      setStatus("Social pack created from this article.");
    } catch (error) {
      setStatus(error.message || "Could not create social pack.");
    } finally {
      setAssetWorking(false);
    }
  }

  async function reuseArticleImagesForAssets() {
    const packs = draft.socialPacks?.length
      ? draft.socialPacks
      : [{
          id: `article-pack-${draft.id}`,
          articleId: draft.id,
          articleTitle: draft.generatedTitle || draft.title,
          sourceUrl: draft.wordpressPostUrl || draft.sourceUrl || "",
          platforms: assetPlatforms,
          content: {}
        }];
    setAssetWorking(true);
    setStatus("Creating social image sizes from existing article assets...");
    try {
      const pinResult = await electronAPI.getPinCreatorPins?.();
      const result = await electronAPI.createRepurposeImageVariants({
        packs,
        pins: pinResult?.pins || [],
        articles: [draft],
        platforms: assetPlatforms,
        imageSource: assetImageSource
      });
      if (!result.success) throw new Error(result.error || "Could not create image sizes.");
      const next = { ...draft, socialPacks: result.packs || packs };
      await electronAPI.saveArticle(next);
      setDraft(next);
      await refreshArticles();
      const missingText = result.missing?.length ? ` Missing images for ${result.missing.length} pack${result.missing.length === 1 ? "" : "s"}.` : "";
      setStatus(`Social image sizes created.${missingText}`);
    } catch (error) {
      setStatus(error.message || "Could not create social image sizes.");
    } finally {
      setAssetWorking(false);
    }
  }

  async function exportArticleAssetPack() {
    const packs = draft.socialPacks || [];
    if (!packs.length) {
      setStatus("Create a social pack first.");
      return;
    }
    setAssetWorking(true);
    setStatus("Exporting GoHighLevel CSV...");
    try {
      const result = await electronAPI.exportRepurposePacks({ packs });
      if (result.success) {
        const imageNote = result.missingImageCount ? ` ${result.missingImageCount} row${result.missingImageCount === 1 ? "" : "s"} need image URLs added in GHL.` : "";
        setStatus(`GoHighLevel CSV exported: ${result.filePath}.${imageNote}`);
      }
      else if (result.canceled) setStatus("Export canceled.");
      else throw new Error(result.error || "Export failed.");
    } catch (error) {
      setStatus(error.message || "Could not export article asset pack.");
    } finally {
      setAssetWorking(false);
    }
  }

  async function sendInternalLinksToPinQueue(site) {
    try {
      const siteUrl = new URL(site.url);
      const doc = new DOMParser().parseFromString(draft.content || "", "text/html");
      const urls = Array.from(doc.querySelectorAll("a[href]"))
        .map((link) => link.getAttribute("href") || "")
        .filter(Boolean)
        .map((href) => {
          if (href.startsWith("/")) return `${siteUrl.origin}${href}`;
          try {
            const parsed = new URL(href);
            return parsed.origin === siteUrl.origin ? parsed.href : "";
          } catch {
            return "";
          }
        })
        .filter(Boolean);
      const uniqueUrls = [...new Set(urls)];
      if (!uniqueUrls.length) {
        setStatus("No same-domain internal links found for that site.");
        return;
      }
      await electronAPI.appendPinQueue(uniqueUrls.map((url) => ({ url, articleId: draft.id, queueType: "internal-link", addedAt: new Date().toISOString() })));
      setStatus(`Added ${uniqueUrls.length} internal link${uniqueUrls.length === 1 ? "" : "s"} to Pin Creator.`);
    } catch (error) {
      setStatus(error.message || "Could not add links to Pin Creator.");
    }
  }

  function updateImage(index, patch) {
    const images = [...(draft.images || [])];
    images[index] = { ...images[index], ...patch };
    setDraft({ ...draft, images });
  }

  return createPortal((
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/35 p-4 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl rounded-lg bg-paper p-5 shadow-panel">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Editor</div>
            <h3 className="mt-1 truncate text-2xl font-black text-ink">{draft.generatedTitle || draft.title}</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-black uppercase">
              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">SEO {draft.seoScore ?? 0}/100</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{draft.workflowStatus || "needs-review"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button variant="secondary" onClick={approve}>Approve</Button>
            <Button variant="secondary" onClick={requestChanges}>Request Changes</Button>
            <Button variant="danger" onClick={remove}><Trash2 className="h-4 w-4" />Delete</Button>
            <Button onClick={() => save()}><Save className="h-4 w-4" />Save</Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <div className="soft-card rounded-lg p-4">
              <div className="mb-3 text-lg font-black text-slate-900">Article</div>
              <div className="space-y-3">
                <Field label="Generated title"><input className={inputClass} value={draft.generatedTitle || ""} onChange={(event) => setDraft({ ...draft, generatedTitle: event.target.value })} /></Field>
                <Field label="Original title"><input className={inputClass} value={draft.title || ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
                <Field label="HTML content"><textarea className={`${inputClass} min-h-96 resize-y font-mono text-xs leading-5`} value={draft.content || ""} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></Field>
              </div>
            </div>

            <div className="soft-card rounded-lg p-4">
              <div className="mb-1 text-lg font-black text-slate-900">Section Review</div>
              <div className="mb-3 text-sm font-medium text-slate-500">Generate a proposal for one section. The current article stays unchanged until you accept it.</div>
              <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
                <Field label="Section">
                  <select className={inputClass} value={sectionId || articleSections[0]?.id || ""} onChange={(event) => setSectionId(event.target.value)}>
                    {articleSections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
                  </select>
                </Field>
                <Field label="Improvement instruction">
                  <input className={inputClass} value={sectionInstruction} onChange={(event) => setSectionInstruction(event.target.value)} placeholder="Example: add clearer doneness cues and a rescue tip" />
                </Field>
              </div>
              <div className="mt-3">
                <Button variant="secondary" onClick={proposeSectionRegeneration} disabled={sectionBusy || !articleSections.length}>
                  <Sparkles className="h-4 w-4" />{sectionBusy ? "Preparing..." : "Regenerate Selected Section"}
                </Button>
              </div>
              {sectionProposal ? (
                <div className="mt-4 space-y-3 rounded-md border border-violet-200 bg-violet-50 p-3">
                  <div className="font-black text-violet-900">Compare {sectionProposal.sectionLabel}</div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <Field label="Current version">
                      <textarea className={`${inputClass} min-h-48 resize-y font-mono text-xs`} value={sectionProposal.previousHtml} readOnly />
                    </Field>
                    <Field label="Proposed replacement">
                      <textarea className={`${inputClass} min-h-48 resize-y font-mono text-xs`} value={sectionProposal.proposedHtml} onChange={(event) => setSectionProposal({ ...sectionProposal, proposedHtml: event.target.value })} />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={acceptSectionProposal}><Save className="h-4 w-4" />Accept Replacement</Button>
                    <Button variant="secondary" onClick={() => setSectionProposal(null)}>Reject</Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="soft-card rounded-lg p-4">
              <div className="mb-1 text-lg font-black text-slate-900">Article Brief</div>
              <div className="mb-3 text-sm font-medium text-slate-500">This brief belongs to this article and guides the outline, draft, SEO, images, links, and review.</div>
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Primary keyword">
                    <input className={inputClass} value={draft.articleBrief?.primaryKeyword || ""} onChange={(event) => setDraft({
                      ...draft,
                      rankMathFocusKeyword: event.target.value,
                      seoBrief: { ...(draft.seoBrief || {}), targetKeyword: event.target.value },
                      articleBrief: { ...(draft.articleBrief || {}), primaryKeyword: event.target.value }
                    })} />
                  </Field>
                  <Field label="Search intent">
                    <select className={inputClass} value={draft.articleBrief?.searchIntent || "informational"} onChange={(event) => setDraft({
                      ...draft,
                      seoBrief: { ...(draft.seoBrief || {}), searchIntent: event.target.value },
                      articleBrief: { ...(draft.articleBrief || {}), searchIntent: event.target.value }
                    })}>
                      <option value="informational">Informational</option>
                      <option value="commercial">Commercial</option>
                      <option value="transactional">Transactional</option>
                      <option value="navigational">Navigational</option>
                    </select>
                  </Field>
                </div>
                <Field label="Target audience">
                  <textarea className={`${inputClass} min-h-20 resize-y`} value={draft.articleBrief?.targetAudience || ""} onChange={(event) => setDraft({ ...draft, articleBrief: { ...(draft.articleBrief || {}), targetAudience: event.target.value } })} />
                </Field>
                <Field label="Reader problem">
                  <textarea className={`${inputClass} min-h-20 resize-y`} value={draft.articleBrief?.readerProblem || ""} onChange={(event) => setDraft({ ...draft, articleBrief: { ...(draft.articleBrief || {}), readerProblem: event.target.value } })} />
                </Field>
                <Field label="Article promise and unique angle">
                  <textarea className={`${inputClass} min-h-24 resize-y`} value={[draft.articleBrief?.articlePromise, draft.articleBrief?.uniqueAngle].filter(Boolean).join("\n\n")} onChange={(event) => {
                    const [articlePromise = "", ...angleParts] = event.target.value.split(/\n\n+/);
                    setDraft({ ...draft, articleBrief: { ...(draft.articleBrief || {}), articlePromise, uniqueAngle: angleParts.join("\n\n") } });
                  }} />
                </Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Secondary keywords" hint="One per line">
                    <textarea className={`${inputClass} min-h-28 resize-y`} value={(draft.articleBrief?.secondaryKeywords || []).join("\n")} onChange={(event) => setDraft({ ...draft, articleBrief: { ...(draft.articleBrief || {}), secondaryKeywords: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) } })} />
                  </Field>
                  <Field label="Questions to answer" hint="One per line">
                    <textarea className={`${inputClass} min-h-28 resize-y`} value={(draft.articleBrief?.keyQuestions || []).join("\n")} onChange={(event) => setDraft({ ...draft, articleBrief: { ...(draft.articleBrief || {}), keyQuestions: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) } })} />
                  </Field>
                </div>
                {draft.articleBrief?.cannibalizationConflicts?.length ? (
                  <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700">
                    Possible overlap: {draft.articleBrief.cannibalizationConflicts.map((item) => `${item.title} (${item.score}%)`).join(", ")}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="soft-card rounded-lg p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-lg font-black text-slate-900">Rank Math SEO Fields</div>
                <Button variant="secondary" onClick={regenerateMetadata}><RefreshCw className="h-4 w-4" />Regenerate Metadata</Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="SEO title"><input className={inputClass} value={draft.rankMathTitle || draft.metaTitle || ""} onChange={(event) => setDraft({ ...draft, rankMathTitle: event.target.value, metaTitle: event.target.value })} /></Field>
                <Field label="Slug"><input className={inputClass} value={draft.slug || ""} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /></Field>
              </div>
              <div className="mt-3 space-y-3">
                <Field label="Focus keyword"><input className={inputClass} value={draft.rankMathFocusKeyword || draft.seoBrief?.targetKeyword || ""} onChange={(event) => setDraft({ ...draft, rankMathFocusKeyword: event.target.value })} /></Field>
                <Field label="SEO description"><textarea className={`${inputClass} min-h-24 resize-y`} value={draft.rankMathDescription || draft.metaDescription || ""} onChange={(event) => setDraft({ ...draft, rankMathDescription: event.target.value, metaDescription: event.target.value })} /></Field>
                <Field label="Tags"><input className={inputClass} value={(draft.tags || []).join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>
              </div>
            </div>

            <div className="soft-card rounded-lg p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-slate-900">Helpful Content Review</div>
                  <div className="text-sm font-medium text-slate-500">Separate, explainable checks instead of one mysterious score.</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-black ${draft.qualityReport?.blockers?.length ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {draft.qualityReport?.status || "needs-review"}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(draft.qualityReport?.categories || []).map((category) => (
                  <div key={category.id} className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-slate-800">{category.label}</span>
                      <span className="text-sm font-black text-violet-700">{category.score}/100</span>
                    </div>
                    {category.issues[0] ? <div className="mt-1 text-xs font-semibold text-slate-500">{category.issues[0].reason}</div> : <div className="mt-1 text-xs font-semibold text-emerald-600">No issue found</div>}
                  </div>
                ))}
              </div>
              {draft.qualityReport?.blockers?.length ? (
                <div className="mt-3 space-y-2">
                  {draft.qualityReport.blockers.map((blocker) => (
                    <div key={blocker.id} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                      <div className="text-sm font-black text-rose-800">{blocker.reason}</div>
                      <div className="mt-1 text-xs font-semibold text-rose-700">Fix: {blocker.fix}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="soft-card rounded-lg p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-lg font-black text-slate-900">SEO Score Before Publish</div>
                <span className={`rounded-full px-3 py-1 text-sm font-black ${(draft.seoScore || 0) >= 80 ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"}`}>{draft.seoScore ?? 0}/100</span>
              </div>
              <div className="space-y-2">
                {(draft.seoChecks || []).map((check) => (
                  <div key={check.id} className={`rounded-md px-3 py-2 text-sm font-bold ${check.ok ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-700"}`}>
                    {check.ok ? "Pass" : "Fix"} - {check.label}
                  </div>
                ))}
                {!draft.seoChecks?.length ? <div className="text-sm text-slate-500">Save once to calculate SEO checks.</div> : null}
              </div>
            </div>

            <div className="soft-card rounded-lg p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-lg font-black text-slate-900">Internal Links</div>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-black text-violet-700">{(draft.internalLinks || []).length}</span>
              </div>
              {(draft.internalLinks || []).length ? (
                <div className="space-y-2">
                  {draft.internalLinks.map((link, index) => (
                    <div key={`${link.url}-${index}`} className="rounded-md bg-white px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
                      <span className="block truncate">{link.title || link.anchor}</span>
                      <span className="block truncate text-xs font-medium text-slate-500">{link.url}</span>
                      <span className="mt-1 block text-xs font-semibold text-violet-700">
                        {link.reason || "topic relationship"}{link.score ? ` / confidence ${Math.min(100, Math.round(link.score))}%` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm font-medium text-slate-500">Use Add Internal Links after syncing WordPress posts, or let the app add them during generation and publish.</div>
              )}
            </div>

            <div className="soft-card rounded-lg p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <BadgeDollarSign className="h-5 w-5 text-violet-600" />
                  Affiliate Recommendations
                </div>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-black text-violet-700">{affiliateOpportunities.length}</span>
              </div>
              {(settings.affiliateProvider || "impact") !== "amazon" ? (
                <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    className={inputClass}
                    value={impactQuery}
                    onChange={(event) => setImpactQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        searchImpactProducts();
                      }
                    }}
                    placeholder="Search Impact products for this article"
                  />
                  <Button variant="secondary" disabled={!!impactBusy} onClick={searchImpactProducts}>
                    <Search className="h-4 w-4" />{impactBusy === "search" ? "Searching..." : "Find on Impact"}
                  </Button>
                </div>
              ) : null}
              <div className="mb-3 flex flex-wrap gap-2">
                <Button disabled={!!impactBusy} onClick={autoDiscoverImpact}>
                  <Sparkles className="h-4 w-4" />{impactBusy === "auto" ? "Analyzing..." : "Re-run Affiliate Match"}
                </Button>
              </div>
              {impactProducts.length ? (
                <div className="mb-3 max-h-64 space-y-2 overflow-auto pr-1">
                  {impactProducts.slice(0, 12).map((product) => (
                    <div key={`${product.campaignId}-${product.id}`} className="flex items-center gap-3 rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-slate-800">{product.name}</div>
                        <div className="truncate text-xs font-medium text-slate-500">
                          {[product.campaignName, product.currentPrice, product.currency].filter(Boolean).join(" | ")}
                        </div>
                      </div>
                      <Button variant="secondary" disabled={!!impactBusy} onClick={() => importImpactProduct(product)}>
                        <Plus className="h-4 w-4" />{impactBusy === `import-${product.id}` ? "Adding..." : "Add"}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              {affiliateOpportunities.length ? (
                <div className="space-y-2">
                  {affiliateOpportunities.slice(0, 6).map((opportunity) => (
                    <div key={opportunity.id} className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-slate-800">{opportunity.name}</div>
                          <div className="truncate text-xs font-medium text-slate-500">{opportunity.reason}</div>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">Match {opportunity.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm font-medium text-slate-500">No library item naturally matches this article. Add products and match terms in Settings.</div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => applyAffiliateLinks().catch((error) => setStatus(error.message))} disabled={!affiliateOpportunities.length}>
                  <BadgeDollarSign className="h-4 w-4" />Apply Best Matches
                </Button>
                <Button variant="secondary" onClick={removeAffiliateLinks} disabled={!draft.affiliateLinks?.length}>Remove Affiliate Links</Button>
              </div>
              <div className="mt-3 text-xs font-semibold leading-5 text-slate-500">
                {(draft.affiliateLinks || []).length} managed link{(draft.affiliateLinks || []).length === 1 ? "" : "s"} in this article. {(draft.affiliateLinks || []).filter((item) => item.trackingVerified).length} verified affiliate link{(draft.affiliateLinks || []).filter((item) => item.trackingVerified).length === 1 ? "" : "s"}. Disclosure and sponsored attributes are added automatically.
              </div>
              <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Matching through the selected provider runs automatically before a generated article moves to Completed. The controls above are optional repair tools.
              </div>
              {(draft.affiliateLinks || []).length ? (
                <div className="mt-3 space-y-2">
                  <div className="text-sm font-black text-slate-800">Applied recommendation review</div>
                  {(draft.affiliateLinks || []).map((item) => (
                    <div key={item.id} className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-slate-900">{item.name}</div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">
                            Merchant: {item.manufacturer || item.impactCampaignName || (item.source === "amazon" ? "Amazon" : "Not supplied")}
                          </div>
                          <div className="text-xs font-semibold text-slate-500">
                            Provider: {item.source || settings.affiliateProvider || "affiliate library"} / Placement: {item.matchedTerm || item.matchedTerms?.[0] || "best relevant paragraph"}
                          </div>
                          <div className="text-xs font-semibold text-slate-500">
                            Reason: {item.reason || "Relevant to a problem discussed in the article"}
                          </div>
                          <div className="text-xs font-semibold text-slate-500">
                            Availability: {item.stockAvailability || item.availability || "Check merchant"} / Last checked: {item.lastCheckedAt ? new Date(item.lastCheckedAt).toLocaleDateString() : "Not supplied"}
                          </div>
                          <a className="mt-1 block truncate text-xs font-bold text-violet-700 underline" href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
                          <div className="mt-1 text-xs font-black text-emerald-700">
                            {item.trackingVerified === true ? "Tracking verified" : "Tracking not explicitly verified"} / {draft.affiliateDisclosureApplied ? "Disclosure applied" : "Disclosure missing"}
                          </div>
                        </div>
                        <Button variant="danger" onClick={() => removeAffiliateRecommendation(item.id)}>Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {draft.affiliateDiscovery ? (
                <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-100">
                  The selected provider reviewed {draft.affiliateDiscovery.reviewedProducts || 0} products, qualified {draft.affiliateDiscovery.qualifiedProducts || 0}, and applied {draft.affiliateDiscovery.appliedCount || draft.affiliateLinks?.length || 0}.
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {settings.wordpressSites?.map((site) => (
                <span key={site.id || site.url} className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => publish(site, { status: "draft" })}><Send className="h-4 w-4" />Draft to {site.name || "WordPress"}</Button>
                  <Button variant="secondary" onClick={() => publish(site, { status: "future", scheduledAt: scheduleAt })}><Send className="h-4 w-4" />Schedule on {site.name || "WordPress"}</Button>
                  <Button onClick={() => publish(site, { status: "publish" })}><Send className="h-4 w-4" />Publish to {site.name || "WordPress"}</Button>
                  <Button onClick={() => runOneClickWorkflow(site)} disabled={assetWorking}><PackageCheck className="h-4 w-4" />Update + Pin + GHL Pack</Button>
                  <Button variant="secondary" onClick={() => applyInternalLinksToDraft(draft, site)}><Link2 className="h-4 w-4" />Add Internal Links</Button>
                  <Button variant="secondary" onClick={() => sendInternalLinksToPinQueue(site)}><Link2 className="h-4 w-4" />Send Internal Links</Button>
                </span>
              ))}
            </div>
            {settings.wordpressSites?.length ? (
              <Field label="Scheduled publication time" hint="Used only by Schedule. WordPress receives the exact selected time.">
                <input type="datetime-local" className={inputClass} value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
              </Field>
            ) : null}
            {draft.wordpressPostUrl || draft.workflowStatus === "published" ? (
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700 ring-1 ring-emerald-100">
                Post already published{draft.wordpressPostUrl ? `: ${draft.wordpressPostUrl}` : "."}
              </div>
            ) : null}
            {status ? <div className={`rounded-md px-3 py-2 text-sm font-bold ring-1 ${/published/i.test(status) ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-violet-50 text-violet-700 ring-violet-100"}`}>{status}</div> : null}
          </div>

          <div className="space-y-4">
            <div className="soft-card rounded-lg p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-slate-900">Article Assets</div>
                  <div className="text-sm font-medium text-slate-500">Start here to turn this article into pins, social posts, resized images, and exports.</div>
                </div>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">{(draft.socialPacks || []).length} pack{(draft.socialPacks || []).length === 1 ? "" : "s"}</span>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Platforms">
                  <div className="grid grid-cols-2 gap-2">
                    {socialPlatformOptions.map((platform) => (
                      <button
                        key={platform.id}
                        type="button"
                        onClick={() => toggleAssetPlatform(platform.id)}
                        className={`rounded-md px-3 py-2 text-sm font-black ring-1 transition ${assetPlatforms.includes(platform.id) ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
                      >
                        {platform.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Image source" hint="Auto uses pin image first, then featured image, then first in-text image.">
                  <select className={inputClass} value={assetImageSource} onChange={(event) => setAssetImageSource(event.target.value)}>
                    {imageSourceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={createOnePinPack} disabled={assetWorking}><PackageCheck className="h-4 w-4" />Create Pinterest Pin</Button>
                <Button onClick={() => runOneClickWorkflow(settings.wordpressSites?.[0])} disabled={assetWorking}><PackageCheck className="h-4 w-4" />One-Click Workflow</Button>
                <Button variant="secondary" onClick={createArticleSocialPack} disabled={assetWorking}><Sparkles className="h-4 w-4" />Create Social Pack</Button>
                <Button variant="secondary" onClick={reuseArticleImagesForAssets} disabled={assetWorking}><Image className="h-4 w-4" />Reuse Images</Button>
                <Button variant="secondary" onClick={exportArticleAssetPack} disabled={assetWorking || !(draft.socialPacks || []).length}><ExternalLink className="h-4 w-4" />Export GHL CSV</Button>
              </div>

              {(draft.socialPacks || []).length ? (
                <div className="mt-4 space-y-3">
                  {(draft.socialPacks || []).slice(0, 3).map((pack) => (
                    <div key={pack.id} className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="font-black text-slate-900">{pack.articleTitle || draft.generatedTitle || draft.title}</div>
                      <div className="mt-1 text-xs font-bold uppercase text-slate-500">{(pack.platforms || []).join(", ") || "social pack"}</div>
                      {pack.imageAssets?.length ? (
                        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                          {pack.imageAssets.slice(0, 4).map((asset, index) => (
                            <div key={`${asset.filePath}-${index}`} className="rounded-md bg-slate-50 p-2 text-xs font-bold text-slate-600">
                              <img className="aspect-square w-full rounded object-cover" src={asset.fileUrl} alt={asset.label || ""} />
                              <div className="mt-1 truncate">{asset.label}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="soft-card rounded-lg p-4">
              <div className="mb-3 text-lg font-black text-slate-900">WordPress Category</div>
              <div className="space-y-3">
                {settings.wordpressSites?.length ? (
                  settings.wordpressSites.map((site) => {
                    const match = matchWordPressCategory(draft, site);
                    return (
                      <div key={site.id || site.url} className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="font-black text-slate-900">{site.name || site.url}</div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${categoryNeedsReview(match) ? "bg-slate-100 text-slate-700" : "bg-violet-50 text-violet-700"}`}>
                            {match.category?.name || "No match"} / {match.confidence}%
                          </span>
                        </div>
                        <Field label="Category override">
                          <select className={inputClass} value={draft.wordpressCategoryId || ""} onChange={(event) => setDraft({ ...draft, wordpressCategoryId: event.target.value, workflowStatus: event.target.value ? "approved" : draft.workflowStatus })}>
                            <option value="">Auto: {match.category?.name || "No category"}</option>
                            {(site.categories || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                          </select>
                        </Field>
                        <div className="mt-2 text-xs font-semibold text-slate-500">{match.reason}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-slate-500">Add and sync a WordPress site in Settings to enable category matching.</div>
                )}
              </div>
            </div>
            {featuredImageSrc ? (
              <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-ink/10">
                <img className="aspect-[3/2] w-full object-cover" src={featuredImageSrc} alt={draft.featuredImageAlt || ""} />
              </div>
            ) : null}
            <div className="soft-card rounded-lg p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-lg font-black text-slate-900">Image Alt Text</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => replaceArticleImage("featured")} disabled={!!imageBusy}>
                    <Image className="h-4 w-4" />Replace
                  </Button>
                  <Button variant="secondary" onClick={() => regenerateArticleImage("featured")} disabled={imageBusy === "featured" || !draft.featuredImagePrompt}>
                    <RefreshCw className="h-4 w-4" />{imageBusy === "featured" ? "Regenerating..." : "Regenerate Featured"}
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                <Field label="Featured image alt"><input className={inputClass} value={draft.featuredImageAlt || ""} onChange={(event) => setDraft({ ...draft, featuredImageAlt: event.target.value })} /></Field>
                <Field label="Featured image SEO filename"><input className={inputClass} value={draft.featuredImageSeoFileName || ""} onChange={(event) => setDraft({ ...draft, featuredImageSeoFileName: event.target.value })} placeholder="keyword-rich-featured-image.webp" /></Field>
                {(draft.images || []).map((image, index) => (
                  <div key={`${image.localPath || image.url || index}`} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <Field label={`Image ${index + 1} alt`}>
                      <input className={inputClass} value={image.altText || ""} onChange={(event) => updateImage(index, { altText: event.target.value })} />
                    </Field>
                    <Field label={`Image ${index + 1} SEO filename`}>
                      <input className={inputClass} value={image.seoFileName || ""} onChange={(event) => updateImage(index, { seoFileName: event.target.value })} placeholder="keyword-rich-image.webp" />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => replaceArticleImage("in-text", index)} disabled={!!imageBusy}>
                        <Image className="h-4 w-4" />Replace
                      </Button>
                      <Button variant="secondary" onClick={() => regenerateArticleImage("in-text", index)} disabled={imageBusy === `image-${index}` || !image.prompt}>
                        <RefreshCw className="h-4 w-4" />{imageBusy === `image-${index}` ? "Working..." : "Regenerate"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="soft-card rounded-lg p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-lg font-black text-slate-900">Image QA Check</div>
                <span className={`rounded-full px-3 py-1 text-sm font-black ${(draft.imageQa?.score || 0) >= 80 ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"}`}>{draft.imageQa?.score ?? 0}/100</span>
              </div>
              <div className="space-y-2">
                {(draft.imageQa?.checks || []).map((check) => (
                  <div key={check.id} className={`rounded-md px-3 py-2 text-sm font-bold ${check.ok ? "bg-violet-50 text-violet-700" : check.severity === "critical" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`}>
                    {check.ok ? "Pass" : check.severity === "critical" ? "Missing" : "Check"} - {check.label}
                  </div>
                ))}
                {!draft.imageQa?.checks?.length ? <div className="text-sm text-slate-500">Save once to run image QA.</div> : null}
              </div>
            </div>
            {draft.structuredData ? (
              <div className="soft-card rounded-lg p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-lg font-black text-slate-900">Recipe Schema JSON-LD</div>
                  <Button variant="secondary" onClick={repairRecipeSchema}><RefreshCw className="h-4 w-4" />Repair from Recipe Card</Button>
                </div>
                <textarea className={`${inputClass} min-h-48 resize-y font-mono text-xs`} value={draft.structuredData || ""} onChange={(event) => setDraft({ ...draft, structuredData: event.target.value })} />
              </div>
            ) : null}
            {draft.pinPack ? (
              <div className="soft-card rounded-lg p-4">
                <div className="mb-3 flex items-center gap-2 text-lg font-black text-slate-900"><Sparkles className="h-5 w-5 text-violet-600" />One-Pin Pack</div>
                {draft.pinPack.imageUrl ? <img className="mb-3 max-h-96 w-full rounded-md object-contain bg-slate-100" src={draft.pinPack.imageUrl} alt="" /> : null}
                <Field label="Pin title"><input className={inputClass} value={draft.pinPack.title || ""} readOnly /></Field>
                <Field label="Pin description"><textarea className={`${inputClass} min-h-24 resize-y`} value={draft.pinPack.description || ""} readOnly /></Field>
              </div>
            ) : null}
            <div className="article-preview rounded-lg bg-white p-5 shadow-sm ring-1 ring-ink/10" dangerouslySetInnerHTML={{ __html: sanitizeHtml(draft.content || "<p>No content generated yet.</p>") }} />
            {(draft.revisions || []).length ? (
              <div className="soft-card rounded-lg p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-lg font-black text-slate-900">Revision History</div>
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">{draft.revisionCount || draft.revisions.length}</span>
                </div>
                <div className="max-h-80 space-y-2 overflow-auto pr-1">
                  {draft.revisions.map((revision) => (
                    <div key={revision.id} className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-black text-slate-800">{revision.changedSection || "Article edit"}</div>
                        <div className="text-xs font-semibold text-slate-500">
                          {new Date(revision.timestamp).toLocaleString()} / {revision.changeSource || "user"}{revision.modelUsed ? ` / ${revision.modelUsed}` : ""} / {revision.action || "edit"}
                        </div>
                        {revision.reason ? <div className="mt-1 text-xs font-medium text-slate-600">{revision.reason}</div> : null}
                      </div>
                      <Button variant="secondary" onClick={() => restoreRevision(revision)}><RotateCcw className="h-4 w-4" />Restore</Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {draft.publishHistory?.length ? (
              <div className="soft-card rounded-lg p-4">
                <div className="mb-3 text-lg font-black text-slate-900">Publish History</div>
                <div className="space-y-2">
                  {draft.publishHistory.map((item, index) => (
                    <div key={`${item.publishedAt}-${index}`} className="text-sm font-semibold text-slate-600">{item.siteName} - {item.status} - {item.categoryName || "no category"} - {item.postUrl || "no URL"}</div>
                  ))}
                </div>
              </div>
            ) : null}
            {draft.featuredImageLocalPath ? (
              <Button variant="secondary" onClick={() => electronAPI.openPath(draft.featuredImageLocalPath)}><ExternalLink className="h-4 w-4" />Show featured image</Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
