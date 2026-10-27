import { Calendar, Filter, Grid3X3, Image as ImageIcon, Link2, List, Send, Search, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import ArticleEditor from "@/components/ArticleEditor";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import SectionHeader from "@/components/SectionHeader";
import { Button, EmptyState, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { buildMetadata, buildRankMathMeta, buildRecipeSchema, buildSeoImageAlt, buildSeoImageFilename, insertArticleImages, qaArticleImages, scoreArticle } from "@/lib/articlePostProcess.mjs";
import { inferSmartIntent } from "@/lib/smartContentEngine";
import { matchWordPressCategory, manualCategoryForSite } from "@/lib/wordpressCategories";
import { applyAffiliateLinksToArticle } from "@/lib/affiliateLinks.mjs";
import { isArticlePublished } from "@/lib/articlePublication.mjs";
import { buildArticleQualityReport } from "@/lib/articleQuality.mjs";
import { applyReaderRetentionElements } from "@/lib/readerRetention.mjs";
import { buildPinSourceSnapshot } from "@/lib/pinterestSource.mjs";

function wordsFromHtml(html = "") {
  return html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function publishReadyArticle(article, settings = {}) {
  let workingArticle = { ...article };
  if (settings.affiliateEnabled !== false && settings.affiliateAutoInsert !== false) {
    const articleAffiliateLinks = (workingArticle.affiliateLinks || []).filter((item) => item?.url);
    const affiliateLinks = articleAffiliateLinks.length ? articleAffiliateLinks : (settings.affiliateLinks || []);
    if (affiliateLinks.length) {
      workingArticle = applyAffiliateLinksToArticle(workingArticle, { ...settings, affiliateLinks });
    }
  }
  if (settings.imageSeoProMode !== false) {
    workingArticle = {
      ...workingArticle,
      featuredImageAlt: workingArticle.featuredImageAlt || buildSeoImageAlt(workingArticle, { prompt: workingArticle.featuredImagePrompt }, 0, "featured"),
      featuredImageSeoFileName: workingArticle.featuredImageSeoFileName || buildSeoImageFilename(workingArticle, { prompt: workingArticle.featuredImagePrompt }, 0, "featured"),
      images: (workingArticle.images || []).map((image, index) => ({
        ...image,
        altText: image.altText || buildSeoImageAlt(workingArticle, image, index, "in-text image"),
        seoFileName: image.seoFileName || buildSeoImageFilename(workingArticle, image, index, "recipe image")
      }))
    };
  }
  workingArticle.content = insertArticleImages(workingArticle.content || "", workingArticle.images || []);
  workingArticle = applyReaderRetentionElements(workingArticle, settings);
  const metadata = buildMetadata(workingArticle, workingArticle.content || "");
  const structuredData = buildRecipeSchema({ ...workingArticle, ...metadata });
  const enriched = { ...workingArticle, ...metadata, structuredData };
  const seo = scoreArticle(enriched, workingArticle.content || "");
  const imageQa = qaArticleImages(enriched);
  const qualityReport = buildArticleQualityReport(
    { ...enriched, seoScore: seo.score, seoChecks: seo.checks, imageQa },
    { maxAffiliateLinks: settings.affiliateMaxLinks, requireFeaturedImage: true }
  );
  return { ...enriched, seoScore: seo.score, seoChecks: seo.checks, imageQa, qualityReport, rankMathMeta: buildRankMathMeta(enriched) };
}

function articleImageSrc(article) {
  return article.featuredImageDisplay || article.featuredImageLocalUrl || article.featuredImage || "";
}

export default function ArticlesList({ articles, settings, saveSettings, refreshArticles, publicationFilter = "all" }) {
  const confirmAction = useConfirmDialog();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkSiteId, setBulkSiteId] = useState(settings.wordpressSites?.[0]?.id || settings.wordpressSites?.[0]?.url || "");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkWorking, setBulkWorking] = useState("");
  const bulkPublishRef = useRef(false);
  const [bulkProgress, setBulkProgress] = useState({ active: false, current: 0, total: 0, label: "" });
  const completed = articles.filter((article) => article.queueStatus === "completed");
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return completed.filter((article) => {
      const matchesQuery = [article.title, article.generatedTitle, article.type].join(" ").toLowerCase().includes(q);
      const matchesType = typeFilter === "all" || article.type === typeFilter;
      const matchesPublication = publicationFilter === "published"
        ? isArticlePublished(article)
        : publicationFilter === "local"
        ? !isArticlePublished(article)
        : true;
      return matchesQuery && matchesType && matchesPublication;
    });
  }, [completed, query, typeFilter, publicationFilter]);

  async function remove(article) {
    if (!await confirmAction({
      title: "Delete article",
      message: `Delete "${article.generatedTitle || article.title}" from local storage?`,
      confirmLabel: "Delete",
      tone: "danger"
    })) return;
    await electronAPI.deleteArticle(article.id);
    setSelectedIds((current) => current.filter((id) => id !== article.id));
    if (selected?.id === article.id) setSelected(null);
    await refreshArticles();
  }

  const selectedArticles = filtered.filter((article) => selectedIds.includes(article.id));
  const bulkSite = settings.wordpressSites?.find((site) => (site.id || site.url) === bulkSiteId);
  const bulkProgressPercent = bulkProgress.total ? Math.round((bulkProgress.current / bulkProgress.total) * 100) : 0;

  function toggleSelected(articleId) {
    setSelectedIds((current) => current.includes(articleId) ? current.filter((id) => id !== articleId) : [...current, articleId]);
  }

  function toggleAllVisible() {
    const visibleIds = filtered.map((article) => article.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !visibleIds.includes(id)) : [...new Set([...selectedIds, ...visibleIds])]);
  }

  async function bulkPublishToWordPress() {
    if (bulkWorking || bulkPublishRef.current) return;
    if (!bulkSite) {
      setBulkStatus("Choose a WordPress site first.");
      return;
    }
    if (!selectedArticles.length) {
      setBulkStatus("Select at least one completed article.");
      return;
    }
    if (!await confirmAction({
      title: "Publish selected articles",
      message: `Publish ${selectedArticles.length} article${selectedArticles.length === 1 ? "" : "s"} to ${bulkSite.name || bulkSite.url}?`,
      confirmLabel: "Publish"
    })) return;
    if (bulkPublishRef.current) return;
    bulkPublishRef.current = true;
    setBulkWorking("publish");
    setBulkProgress({ active: true, current: 0, total: selectedArticles.length, label: "Starting WordPress publishing..." });

    try {
    let siteForPublish = bulkSite;
    let categorySyncWarning = "";
    if (!siteForPublish.categories?.length && siteForPublish.url) {
      try {
        const synced = await electronAPI.syncWordPressCategories({
          wordpressUrl: siteForPublish.url,
          wordpressUsername: siteForPublish.username,
          wordpressApiKey: siteForPublish.apiKey
        });
        if (synced?.categories?.length) siteForPublish = { ...siteForPublish, categories: synced.categories };
      } catch (error) {
        categorySyncWarning = `Categories could not be synced: ${error.message || "unknown error"}`;
      }
    }

    let published = 0;
    let needsReview = 0;
    const failures = [];
    const warnings = [];
    if (categorySyncWarning) warnings.push(categorySyncWarning);
    for (const article of selectedArticles) {
      let readyArticle = article;
      const itemNumber = published + needsReview + failures.length + 1;
      try {
        readyArticle = publishReadyArticle(article, settings);
        // Match the single-article editor: critical quality blockers need a recorded override.
        const blockers = readyArticle.qualityReport?.blockers || [];
        if (blockers.length && !article.qualityOverride?.reason) {
          needsReview++;
          warnings.push(`${readyArticle.generatedTitle || readyArticle.title}: not published. ${blockers.length} critical quality issue${blockers.length === 1 ? "" : "s"}: ${blockers.map((blocker) => blocker.reason || blocker.id).join("; ")}`);
          continue;
        }
        const manualCategory = manualCategoryForSite(readyArticle, siteForPublish);
        const match = manualCategory
          ? { category: siteForPublish.categories?.find((category) => String(category.id) === String(manualCategory)), confidence: 100, reason: "Manual category" }
          : matchWordPressCategory(readyArticle, siteForPublish);
        setBulkStatus(`Publishing ${itemNumber}/${selectedArticles.length}: ${readyArticle.generatedTitle || readyArticle.title}`);
        setBulkProgress({ active: true, current: itemNumber - 1, total: selectedArticles.length, label: readyArticle.generatedTitle || readyArticle.title });
        const articleForPublish = { ...readyArticle, wordpressCategoryId: manualCategory || match.category?.id, wordpressCategorySiteUrl: siteForPublish.url.replace(/\/+$/, ""), autoCategory: match };
        const result = await electronAPI.pushToWordPress({ article: articleForPublish, site: siteForPublish });
        if (!result?.success) throw new Error(result?.error || 'WordPress did not confirm the publication.');
        const isPublic = result.status === "publish";
        const publicPostUrl = isPublic ? (result.postUrl || readyArticle.wordpressPostUrl) : readyArticle.wordpressPostUrl;
        await electronAPI.saveArticle({
          ...articleForPublish,
          ...(result.recipeArticlePatch || {}),
          workflowStatus: result.success ? (isPublic ? "published" : "needs-review") : readyArticle.workflowStatus,
          wordpressPublishStatus: result.status || readyArticle.wordpressPublishStatus || "",
          wordpressPostId: result.postId || readyArticle.wordpressPostId,
          wordpressSiteUrl: siteForPublish.url.replace(/\/+$/, ""),
          wordpressPostUrl: publicPostUrl,
          wordpressDraftUrl: isPublic ? "" : (result.postUrl || readyArticle.wordpressDraftUrl || ""),
          sourceUrl: publicPostUrl || readyArticle.sourceUrl,
          rankMathStatus: result.rankMathStatus || "not-run",
          rankMathWarning: result.rankMathWarning || "",
          mediaWarnings: result.mediaWarnings || [],
          publishHistory: [
            ...(readyArticle.publishHistory || []),
            { siteId: siteForPublish.id || siteForPublish.url, siteName: siteForPublish.name || siteForPublish.url, status: result.status || "publish", postUrl: publicPostUrl, categoryId: result.categoryId, categoryName: match.category?.name, rankMathStatus: result.rankMathStatus, publishedAt: new Date().toISOString() }
          ]
        });
        if (result.rankMathWarning || result.mediaWarnings?.length) {
          warnings.push(`${readyArticle.generatedTitle || readyArticle.title}: ${[result.rankMathWarning, ...(result.mediaWarnings || [])].filter(Boolean).join(" ")}`);
        }
        if (isPublic) published++;
        else needsReview++;
      } catch (error) {
        if (/RECIPE_REVIEW_REQUIRED/.test(error.message || "")) {
          needsReview++;
          warnings.push(`${readyArticle.generatedTitle || readyArticle.title}: ${error.message}`);
        } else failures.push(`${readyArticle.generatedTitle || readyArticle.title}: ${error.message}`);
      } finally {
        setBulkProgress((current) => ({ ...current, current: Math.min(current.total || selectedArticles.length, itemNumber) }));
      }
    }
    await refreshArticles();
    setBulkStatus(`Published ${published}. Needs review ${needsReview}. Warnings ${warnings.length}. Failed ${failures.length}${failures.length ? ` - ${failures[0]}` : warnings.length ? ` - ${warnings[0]}` : ""}`);
    setBulkProgress({ active: false, current: selectedArticles.length, total: selectedArticles.length, label: failures.length ? "Finished with errors" : needsReview ? "Finished with posts needing review" : warnings.length ? "Published with warnings" : "Publishing finished" });
    } catch (error) {
      setBulkStatus(`Publishing stopped: ${error.message || "Could not finish the batch."}`);
    } finally {
      bulkPublishRef.current = false;
      setBulkWorking("");
      setBulkProgress((current) => ({ ...current, active: false }));
    }
  }

  async function bulkSendToPinCreator() {
    if (bulkWorking) return;
    if (!selectedArticles.length) {
      setBulkStatus("Select at least one completed article.");
      return;
    }
    const items = selectedArticles
      .map((article) => ({
        url: article.wordpressPostUrl || article.sourceUrl || `content-studio://article/${encodeURIComponent(article.id)}?title=${encodeURIComponent(article.generatedTitle || article.title)}`,
        articleId: article.id,
        title: article.generatedTitle || article.title,
        excerpt: article.excerpt || article.metaDescription || "",
        targetKeyword: article.rankMathFocusKeyword || article.seoBrief?.targetKeyword || "",
        interests: [article.seoBrief?.targetKeyword, ...(article.tags || []), ...String(article.seoBrief?.secondaryKeywords || "").split(",")].filter(Boolean).slice(0, 15),
        smartPinStyle: article.smartPinStyle || inferSmartIntent(article).pinStyle,
        csvBoard: article.recommendedPinterestBoard || "",
        interestProfile: article.interestProfile || {},
        relatedTopics: article.pinterestRelatedTopics || article.interestProfile?.relatedTopics || [],
        sourceSnapshot: buildPinSourceSnapshot(article),
        queueType: "article",
        addedAt: new Date().toISOString()
      }))
      .filter((item) => item.url);
    if (!items.length) {
      setBulkStatus("Selected articles need a WordPress URL or source URL before sending to Pin Creator.");
      return;
    }
    setBulkWorking("pin");
    try {
      const result = await electronAPI.appendPinQueue(items);
      await electronAPI.openPinCreator?.();
      const skipped = result?.skippedCount ? ` ${result.skippedCount} duplicate${result.skippedCount === 1 ? "" : "s"} skipped.` : "";
      setBulkStatus(`Sent ${result?.addedCount ?? items.length} article URL${(result?.addedCount ?? items.length) === 1 ? "" : "s"} to Pin Creator.${skipped}`);
    } catch (error) {
      setBulkStatus(error.message || "Could not send articles to Pin Creator.");
    } finally {
      setBulkWorking("");
    }
  }

  async function bulkDeleteSelected() {
    if (!selectedArticles.length) {
      setBulkStatus("Select at least one completed article.");
      return;
    }
    if (!await confirmAction({
      title: "Delete selected articles",
      message: `Delete ${selectedArticles.length} selected article${selectedArticles.length === 1 ? "" : "s"} from local storage?`,
      confirmLabel: "Delete",
      tone: "danger"
    })) return;
    for (const article of selectedArticles) {
      await electronAPI.deleteArticle(article.id);
    }
    setSelectedIds([]);
    if (selected && selectedArticles.some((article) => article.id === selected.id)) setSelected(null);
    await refreshArticles();
    setBulkStatus(`Deleted ${selectedArticles.length} article${selectedArticles.length === 1 ? "" : "s"}.`);
  }

  async function clearPublished() {
    const published = completed.filter(isArticlePublished);
    if (!published.length) {
      setBulkStatus("No published articles to clear.");
      return;
    }
    if (!await confirmAction({
      title: "Clear published articles",
      message: `Clear ${published.length} published article${published.length === 1 ? "" : "s"} from the local completed list? This does not delete them from WordPress.`,
      confirmLabel: "Clear",
      tone: "danger"
    })) return;
    for (const article of published) {
      await electronAPI.deleteArticle(article.id);
    }
    setSelectedIds((current) => current.filter((id) => !published.some((article) => article.id === id)));
    if (selected && published.some((article) => article.id === selected.id)) setSelected(null);
    await refreshArticles();
    setBulkStatus(`Cleared ${published.length} published article${published.length === 1 ? "" : "s"} locally.`);
  }

  return (
    <section className="article-library animate-fade-in">
      <SectionHeader
        eyebrow={publicationFilter === "published" ? "Published" : "Completed"}
        title={publicationFilter === "published" ? "Published Articles" : "Completed Articles"}
      >
        {completed.length} total • {completed.filter((article) => !isArticlePublished(article)).length} local only • {completed.filter(isArticlePublished).length} in WordPress
      </SectionHeader>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input aria-label="Search articles" className={`${inputClass} pl-12`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search articles..." />
        </label>
        <Filter className="hidden h-6 w-6 text-slate-500 lg:block" />
        <select aria-label="Article type" className={`${inputClass} lg:w-48`} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All Articles</option>
          <option value="article">Classic Articles</option>
          <option value="listicle">Listicles</option>
        </select>
        <div className="flex rounded-md bg-white p-1 ring-1 ring-slate-200">
          <button type="button" title="Grid view" onClick={() => setView("grid")} className={`rounded-md p-3 ${view === "grid" ? "bg-slate-100 text-indigo-600" : "text-slate-500"}`}><Grid3X3 className="h-5 w-5" /></button>
          <button type="button" title="List view" onClick={() => setView("list")} className={`rounded-md p-3 ${view === "list" ? "bg-slate-100 text-indigo-600" : "text-slate-500"}`}><List className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex shrink-0 items-center gap-3 text-sm font-black text-slate-700">
            <input type="checkbox" className="h-5 w-5" checked={filtered.length > 0 && filtered.every((article) => selectedIds.includes(article.id))} onChange={toggleAllVisible} />
            {selectedArticles.length} selected
          </label>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <select className={`${inputClass} h-11 sm:w-72`} value={bulkSiteId} onChange={(event) => setBulkSiteId(event.target.value)}>
              {settings.wordpressSites?.length ? (
                settings.wordpressSites.map((site) => <option key={site.id || site.url} value={site.id || site.url}>{site.name || site.url}</option>)
              ) : (
                <option value="">Add WordPress site in Settings</option>
              )}
            </select>
            <Button variant="secondary" onClick={bulkPublishToWordPress} disabled={!!bulkWorking || !selectedArticles.length || !settings.wordpressSites?.length}><Send className="h-4 w-4" />Publish Selected</Button>
            <Button onClick={bulkSendToPinCreator} disabled={!!bulkWorking || !selectedArticles.length}><Link2 className="h-4 w-4" />{bulkWorking === "pin" ? "Sending..." : "Send Selected to Pin Creator"}</Button>
            <Button variant="secondary" onClick={clearPublished} disabled={!!bulkWorking || !completed.some(isArticlePublished)}><Trash2 className="h-4 w-4" />Clear Published</Button>
            <Button variant="danger" onClick={bulkDeleteSelected} disabled={!!bulkWorking || !selectedArticles.length}><Trash2 className="h-4 w-4" />Delete Selected</Button>
          </div>
        </div>
        {bulkStatus ? <div className="mt-3 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{bulkStatus}</div> : null}
        {(bulkWorking === "publish" || bulkProgress.total > 0) ? (
          <div className="mt-3 rounded-md border border-indigo-100 bg-indigo-50/70 p-3">
            <div className="flex items-center justify-between gap-3 text-sm font-black text-indigo-800">
              <span className="min-w-0 truncate">{bulkProgress.label || "WordPress publishing"}</span>
              <span className="shrink-0">{bulkProgress.current}/{bulkProgress.total || selectedArticles.length} ({bulkProgressPercent}%)</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 transition-all" style={{ width: `${Math.max(0, bulkProgressPercent)}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      {!filtered.length ? (
        <EmptyState title="No completed articles yet">Generated articles will appear here after the queue finishes.</EmptyState>
      ) : view === "grid" ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((article) => (
            <div key={article.id} className="soft-card overflow-hidden rounded-lg transition hover:-translate-y-0.5">
              {articleImageSrc(article) ? <img className="aspect-[16/10] w-full object-cover" src={articleImageSrc(article)} alt="" loading="lazy" /> : <div className="grid aspect-[16/10] place-items-center bg-slate-100 text-slate-400"><ImageIcon className="h-8 w-8" /></div>}
              <div className="p-4">
                <div className="mb-2 flex flex-wrap gap-2 text-xs font-black uppercase">
                  <span className="text-indigo-600">{article.type}</span>
                  {isArticlePublished(article) ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Published</span> : null}
                </div>
                <h3 className="text-base font-semibold leading-snug text-slate-900">{article.generatedTitle || article.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{(article.content || "").replace(/<[^>]+>/g, " ").slice(0, 150)}...</p>
                <div className="mt-4 flex gap-2">
                  <Button onClick={() => setSelected(article)}>View</Button>
                  <Button variant="danger" onClick={() => remove(article)}><Trash2 className="h-4 w-4" />Delete</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="soft-card overflow-hidden rounded-lg">
          {filtered.map((article) => (
            <div key={article.id} className="grid gap-4 border-b border-slate-100 p-4 last:border-b-0 lg:grid-cols-[24px_80px_minmax(0,1fr)_auto] lg:items-center">
              <input type="checkbox" className="mt-1 h-5 w-5 lg:mt-0" checked={selectedIds.includes(article.id)} onChange={() => toggleSelected(article.id)} aria-label={`Select ${article.title}`} />
              {articleImageSrc(article) ? (
                <img className="h-20 w-20 rounded-md object-cover" src={articleImageSrc(article)} alt="" loading="lazy" />
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-md bg-slate-100 text-slate-400"><ImageIcon className="h-6 w-6" /></div>
              )}
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="min-w-0 text-sm font-semibold leading-snug text-slate-900">{article.generatedTitle || article.title}</h3>
                  {isArticlePublished(article) ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">Published</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-slate-500">
                  <span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4" />{article.createdAt ? new Date(article.createdAt).toLocaleString() : "-"}</span>
                  <span>{wordsFromHtml(article.content)} words</span>
                  <span className="inline-flex items-center gap-1"><ImageIcon className="h-4 w-4" />{(article.images || []).length + (article.featuredImage ? 1 : 0)}</span>
                  <span className="capitalize">{article.type}</span>
                </div>
              </div>
              <div className="flex gap-2 lg:justify-end">
                <Button onClick={() => setSelected(article)}>View</Button>
                <Button variant="danger" onClick={() => remove(article)}><Trash2 className="h-4 w-4" />Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected ? <ArticleEditor article={selected} settings={settings} saveSettings={saveSettings} refreshArticles={refreshArticles} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
