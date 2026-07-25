import { BadgeDollarSign, ExternalLink, Image, Link2, PackageCheck, Plus, Save, Search, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { buildMetadata, buildRankMathMeta, buildRecipeSchema, buildSeoImageAlt, buildSeoImageFilename, insertArticleImages, qaArticleImages, scoreArticle } from "@/lib/articlePostProcess.mjs";
import { applyInternalLinksToHtml, buildInternalLinkSuggestions } from "@/lib/internalLinks";
import { categoryNeedsReview, matchWordPressCategory } from "@/lib/wordpressCategories";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { inferSmartIntent } from "@/lib/smartContentEngine";
import { applyAffiliateLinksToArticle, findAffiliateOpportunities, removeManagedAffiliateLinks } from "@/lib/affiliateLinks.mjs";

export default function ArticleEditor({ article, settings, saveSettings, onClose, refreshArticles }) {
  const [draft, setDraft] = useState(article);
  const [status, setStatus] = useState("");
  const [assetWorking, setAssetWorking] = useState(false);
  const [assetImageSource, setAssetImageSource] = useState("auto");
  const [assetPlatforms, setAssetPlatforms] = useState(["instagram", "facebook", "threads", "reddit", "pinterest"]);
  const [impactQuery, setImpactQuery] = useState("");
  const [impactProducts, setImpactProducts] = useState([]);
  const [impactBusy, setImpactBusy] = useState("");

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
  const affiliateOpportunities = useMemo(() => findAffiliateOpportunities({
    article: draft,
    content: draft.content || "",
    settings: {
      ...settings,
      affiliateLinks: draft.affiliateLinks?.length ? draft.affiliateLinks : settings.affiliateLinks
    }
  }), [draft, settings]);

  function rescore(nextDraft) {
    let workingDraft = { ...nextDraft };
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
    const metadata = buildMetadata(workingDraft, workingDraft.content || "");
    const structuredData = buildRecipeSchema({ ...workingDraft, ...metadata });
    const enriched = { ...workingDraft, ...metadata, structuredData };
    const seo = scoreArticle(enriched, workingDraft.content || "");
    const imageQa = qaArticleImages(enriched);
    return { ...enriched, seoScore: seo.score, seoChecks: seo.checks, imageQa, rankMathMeta: buildRankMathMeta(enriched) };
  }

  useEffect(() => {
    setDraft((current) => (current.seoChecks?.length && current.imageQa ? current : rescore(current)));
  }, []);

  async function save(next = draft) {
    const rescored = rescore(next);
    await electronAPI.saveArticle(rescored);
    setDraft(rescored);
    await refreshArticles();
    setStatus("Article saved.");
    return rescored;
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

  async function publish(site) {
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
    const readyDraft = rescore(workingDraft);
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
      wordpressCategoryId: readyDraft.wordpressCategoryId || match.category?.id,
      autoCategory: match
    };
    setStatus(match.category?.id ? `Publishing to ${publishSite.name || publishSite.url} in ${match.category.name}...` : `Publishing to ${publishSite.name || publishSite.url}...`);
    const result = await electronAPI.pushToWordPress({ article: articleForPublish, site: publishSite });
    const isPublic = result.status === "publish";
    const publicPostUrl = isPublic ? (result.postUrl || readyDraft.wordpressPostUrl) : readyDraft.wordpressPostUrl;
    const next = {
      ...articleForPublish,
      workflowStatus: result.success ? (isPublic ? "published" : "draft") : readyDraft.workflowStatus,
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
      ? `${isPublic ? "Published" : "Saved as draft"} with warning: ${warnings.join(" ")}`
      : isPublic
      ? (result.postUrl ? `Published: ${result.postUrl}` : "Published to WordPress.")
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

  return (
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
            <Button variant="secondary" onClick={() => save({ ...draft, workflowStatus: "ready-to-publish" })}>Mark Ready</Button>
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
              <div className="mb-3 text-lg font-black text-slate-900">Rank Math SEO Fields</div>
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
              {draft.affiliateDiscovery ? (
                <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-100">
                  The selected provider reviewed {draft.affiliateDiscovery.reviewedProducts || 0} products, qualified {draft.affiliateDiscovery.qualifiedProducts || 0}, and applied {draft.affiliateDiscovery.appliedCount || draft.affiliateLinks?.length || 0}.
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {settings.wordpressSites?.map((site) => (
                <span key={site.id || site.url} className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => publish(site)}><Send className="h-4 w-4" />{site.name || "WordPress"}</Button>
                  <Button onClick={() => runOneClickWorkflow(site)} disabled={assetWorking}><PackageCheck className="h-4 w-4" />Update + Pin + GHL Pack</Button>
                  <Button variant="secondary" onClick={() => applyInternalLinksToDraft(draft, site)}><Link2 className="h-4 w-4" />Add Internal Links</Button>
                  <Button variant="secondary" onClick={() => sendInternalLinksToPinQueue(site)}><Link2 className="h-4 w-4" />Send Internal Links</Button>
                </span>
              ))}
            </div>
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
                          <select className={inputClass} value={draft.wordpressCategoryId || ""} onChange={(event) => setDraft({ ...draft, wordpressCategoryId: event.target.value, workflowStatus: event.target.value ? "ready-to-publish" : draft.workflowStatus })}>
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
              <div className="mb-3 text-lg font-black text-slate-900">Image Alt Text</div>
              <div className="space-y-3">
                <Field label="Featured image alt"><input className={inputClass} value={draft.featuredImageAlt || ""} onChange={(event) => setDraft({ ...draft, featuredImageAlt: event.target.value })} /></Field>
                <Field label="Featured image SEO filename"><input className={inputClass} value={draft.featuredImageSeoFileName || ""} onChange={(event) => setDraft({ ...draft, featuredImageSeoFileName: event.target.value })} placeholder="keyword-rich-featured-image.webp" /></Field>
                {(draft.images || []).map((image, index) => (
                  <div key={`${image.localPath || image.url || index}`} className="grid gap-3 md:grid-cols-2">
                    <Field label={`Image ${index + 1} alt`}>
                      <input className={inputClass} value={image.altText || ""} onChange={(event) => updateImage(index, { altText: event.target.value })} />
                    </Field>
                    <Field label={`Image ${index + 1} SEO filename`}>
                      <input className={inputClass} value={image.seoFileName || ""} onChange={(event) => updateImage(index, { seoFileName: event.target.value })} placeholder="keyword-rich-image.webp" />
                    </Field>
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
                <div className="mb-3 text-lg font-black text-slate-900">Recipe Schema JSON-LD</div>
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
  );
}
