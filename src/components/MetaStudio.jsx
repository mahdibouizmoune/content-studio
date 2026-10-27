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

function matchKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\/+$/, "");
}

function displaySourceImage(source = {}) {
  const safeSource = source || {};
  return safeSource.localUrl || safeSource.url || safeSource.publicUrl || safeSource.remoteUrl || "";
}

function metaSourceScore(source = {}) {
  const kind = String(source.kind || "").toLowerCase();
  let score = kind === "pin" ? 500 : kind === "article-featured" ? 300 : 0;
  if (source.dimensionsVerified) score += 80;
  if (source.publicUrlVerified) score += 40;
  if (source.localPath || source.localUrl) score += 40;
  if (source.publicUrl || source.remoteUrl) score += 30;
  return score;
}

function preferredMetaSource(sources = []) {
  return sources.reduce((best, source) => (!best || metaSourceScore(source) > metaSourceScore(best) ? source : best), null);
}

function hasReusableMetaAsset(asset = {}) {
  return Boolean(asset.filePath || asset.fileUrl || asset.publicUrl || asset.imgbbUrl || asset.hostedImageUrl || asset.remoteImageUrl || asset.imageUrl);
}

function hasPlatformMetaAssets(assets = []) {
  return (Array.isArray(assets) ? assets : []).some((asset) => (
    hasReusableMetaAsset(asset)
    && asset.sourceKind === "pin"
    && Boolean(asset.sourcePinId && asset.sourceSha256 && asset.sourceFingerprint)
    && asset.id === "meta-social-portrait"
    && Number(asset.width || 0) === 1080
    && Number(asset.height || 0) === 1350
  ));
}

function matchingPinsForArticle(article, pins = []) {
  if (!article) return [];
  const articleUrls = [article.wordpressPostUrl, article.sourceUrl].map(matchKey).filter(Boolean);
  return (Array.isArray(pins) ? pins : []).filter((pin) => (
    (pin.articleId && String(pin.articleId) === String(article.id))
    || (pin.url && articleUrls.includes(matchKey(pin.url)))
  ));
}

function pinterestCopySource(article, pins = []) {
  const pin = [...matchingPinsForArticle(article, pins)].sort((left, right) => {
    const score = (item) => (
      (item.imageQa?.dimensionsVerified === true ? 100 : 0)
      + (item.imageQa?.publicUrlVerified === true ? 50 : 0)
      + (item.localPath || item.localImageUrl ? 30 : 0)
      + (item.status === "completed" ? 20 : 0)
    );
    return score(right) - score(left);
  })[0];
  if (!pin) return null;
  return {
    pinId: pin.id || "",
    pinterestTitle: pin.title || pin.sourceTitle || "",
    pinterestDescription: pin.description || "",
    pinterestKeywords: pin.csvKeywords || ""
  };
}

function pinterestImageSource(pin = {}) {
  const publicUrl = [
    pin.imageQa?.publicValidatedUrl,
    pin.hostedImageUrl,
    pin.csvMediaUrl,
    pin.imgurUrl,
    pin.remoteImageUrl,
    pin.imageUrl,
    pin.displayUrl
  ].find((value) => /^https:\/\//i.test(String(value || ""))) || "";
  return {
    id: `pin:${pin.id || publicUrl}`,
    kind: "pin",
    label: "Pinterest Generated Image",
    sourceRevision: pin.imageQa?.sha256 || pin.imageQa?.perceptualHash || "",
    pinId: pin.id || "",
    localPath: pin.localPath || "",
    localUrl: pin.localImageUrl || pin.displayUrl || "",
    url: pin.localImageUrl || pin.displayUrl || publicUrl,
    publicUrl,
    remoteUrl: pin.remoteImageUrl || publicUrl,
    pinterestTitle: pin.title || pin.sourceTitle || "",
    pinterestDescription: pin.description || "",
    pinterestKeywords: pin.csvKeywords || "",
    dimensionsVerified: pin.imageQa?.dimensionsVerified === true,
    publicUrlVerified: pin.imageQa?.publicUrlVerified === true
  };
}

function metaSourceCandidates(article, pins = []) {
  if (!article) return [];
  const seen = new Set();
  return matchingPinsForArticle(article, pins).map(pinterestImageSource)
    .filter((source) => source.localPath || displaySourceImage(source))
    .filter((source) => {
      if (seen.has(source.pinId)) return false;
      seen.add(source.pinId);
      return true;
    });
}

function sourceContext(source, article) {
  return {
    pinId: source?.pinId || "",
    title: source?.pinterestTitle || article?.generatedTitle || article?.title || "",
    description: source?.pinterestDescription || article?.metaDescription || article?.excerpt || "",
    keywords: source?.pinterestKeywords || "",
    imageSourceId: source?.id || "",
    imageSourceLabel: source?.label || ""
  };
}

async function freeMetaContent(source, article) {
  const result = await electronAPI.getMetaCaptionDraft({ article, source: source || {} });
  if (!result?.success) throw new Error(result?.error || 'Could not prepare recipe captions.');
  return result.content;
}

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

function projectPack({ projectId, article, goal, content, imageAssets, source }) {
  const title = article?.generatedTitle || article?.title || content?.campaignTitle || "Meta campaign";
  return {
    id: projectId || `meta-${article?.id || Date.now()}`,
    articleId: article?.id || "",
    articleTitle: title,
    sourceUrl: article?.wordpressPostUrl || article?.sourceUrl || "",
    includeSourceLink: false,
    campaignStyle: `meta-${goal}`,
    platforms: ["instagram", "facebook"],
    createdAt: new Date().toISOString(),
    sourceContext: sourceContext(source, article),
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

export default function MetaStudio({ articles, settings, activeScreen }) {
  const confirmAction = useConfirmDialog();
  const [query, setQuery] = useState("");
  const [articleId, setArticleId] = useState("");
  const [geo, setGeo] = useState("US");
  const [goal, setGoal] = useState("traffic");
  const [research, setResearch] = useState(null);
  const [content, setContent] = useState(null);
  const [imageAssets, setImageAssets] = useState([]);
  const [sourcePins, setSourcePins] = useState([]);
  const completedArticles = useMemo(() => articles.filter((article) => article.queueStatus === "completed" && metaSourceCandidates(article, sourcePins).length > 0), [articles, sourcePins]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [ghlHeaders, setGhlHeaders] = useState([]);
  const [ghlRows, setGhlRows] = useState([]);
  const [showGhlEditor, setShowGhlEditor] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [intervalHours, setIntervalHours] = useState(String(Math.max(1, Math.round(Number(settings?.pinCreator?.postInterval || 120) / 60))));
  const [bulkArticleIds, setBulkArticleIds] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);

  useEffect(() => {
    if (activeScreen !== "meta-studio") return;
    electronAPI.getMetaProjects?.().then((result) => {
      if (result?.success) setProjects(result.projects || []);
    }).catch(() => {});
    electronAPI.getPinCreatorPins?.().then((result) => {
      if (result?.success) setSourcePins(result.pins || []);
    }).catch(() => {});
    electronAPI.getMetaBulkGhlDraft?.().then((result) => {
      const draft = result?.draft;
      if (!draft) return;
      setBulkProgress(draft);
      if (draft.status === "complete" && draft.rows?.length) {
        setGhlHeaders(draft.headers || []);
        setGhlRows(draft.rows || []);
        setStartTime(formatDateTimeLocal(draft.rows?.[0]?.[0]));
        setShowGhlEditor(true);
      }
    }).catch(() => {});
  }, [activeScreen]);

  useEffect(() => {
    if (activeScreen !== "meta-studio") return undefined;
    return electronAPI.onMetaBulkProgress?.((progress) => {
      setBulkProgress(progress);
      if (progress?.status === "complete" && progress.rows?.length) {
        setGhlHeaders(progress.headers || []);
        setGhlRows(progress.rows || []);
        setStartTime(formatDateTimeLocal(progress.rows?.[0]?.[0]));
        setShowGhlEditor(true);
      }
    });
  }, [activeScreen]);

  useEffect(() => {
    if (!articleId && completedArticles.length) setArticleId(completedArticles[0].id);
  }, [articleId, completedArticles]);

  const filteredArticles = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return completedArticles;
    return completedArticles.filter((article) => [article.title, article.generatedTitle, article.wordpressPostUrl, article.sourceUrl].join(" ").toLowerCase().includes(value));
  }, [completedArticles, query]);
  const completedArticleIds = useMemo(() => completedArticles.map((item) => String(item.id)), [completedArticles]);
  const selectedBulkIds = bulkArticleIds === null ? completedArticleIds : bulkArticleIds;
  const selectedBulkSet = useMemo(() => new Set(selectedBulkIds), [selectedBulkIds]);
  const article = completedArticles.find((item) => item.id === articleId) || null;
  const articleProject = projects.find((item) => item.id === projectId)
    || projects.find((item) => String(item.articleId) === String(articleId))
    || null;
  const sourceCandidates = useMemo(
    () => metaSourceCandidates(article, sourcePins),
    [article, sourcePins]
  );
  const automaticSource = preferredMetaSource(sourceCandidates);
  const selectedSource = sourceCandidates.find((source) => source.id === selectedSourceId) || automaticSource || null;
  const selectedPinterestSource = pinterestCopySource(article, sourcePins);
  const imageSource = selectedSource;
  const copySource = selectedPinterestSource || imageSource;

  useEffect(() => {
    if (!articleId || projectId) return;
    const saved = projects.find((item) => String(item.articleId) === String(articleId));
    if (!saved) return;
    setProjectId(saved.id);
    setGeo(saved.geo || "US");
    setGoal(saved.goal || "traffic");
    setResearch(saved.research || null);
    setContent(saved.content || null);
    setImageAssets(saved.imageAssets || []);
    setSelectedSourceId(saved.selectedSource?.id || saved.sourceContext?.imageSourceId || "");
    setStatus(saved.autoCreated
      ? "Automatic Meta draft loaded. It prefers the finished Pinterest image and creates one shared 4:5 crop with no new AI generation."
      : "Saved Meta campaign loaded.");
  }, [articleId, projectId, projects]);

  useEffect(() => {
    if (!sourceCandidates.length) {
      setSelectedSourceId("");
      return;
    }
    if (!sourceCandidates.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(automaticSource?.id || sourceCandidates[0].id);
    }
  }, [automaticSource?.id, selectedSourceId, sourceCandidates]);

  useEffect(() => {
    if (!article || content) return;
    let active = true;
    freeMetaContent(copySource, article).then((draft) => { if (active) setContent(draft); }).catch((error) => { if (active) setStatus(error.message); });
    return () => { active = false; };
  }, [article, content, copySource]);

  function clearOutputForArticle(nextArticleId) {
    setArticleId(nextArticleId);
    setProjectId("");
    setResearch(null);
    setContent(null);
    setImageAssets([]);
    setSelectedSourceId("");
    setGhlRows([]);
    setShowGhlEditor(false);
  }

  function toggleBulkArticle(id) {
    const articleKey = String(id);
    setBulkArticleIds((current) => {
      const selected = new Set(current === null ? completedArticleIds : current);
      if (selected.has(articleKey)) selected.delete(articleKey);
      else selected.add(articleKey);
      return completedArticleIds.filter((itemId) => selected.has(itemId));
    });
  }

  async function prepareBulkGhl({ download = false } = {}) {
    if (!selectedBulkIds.length) return setStatus("Select at least one completed article.");
    setWorking(true);
    setBulkProgress({ status: "running", current: 0, total: selectedBulkIds.length, percent: 0, failures: [] });
    setStatus(`Preparing Meta posts for ${selectedBulkIds.length} article${selectedBulkIds.length === 1 ? "" : "s"}...`);
    try {
      const result = await electronAPI.prepareMetaBulkGhlRows?.({ articleIds: selectedBulkIds });
      if (!result?.success) throw new Error(result?.error || "Could not prepare the Meta batch.");
      setBulkProgress(result);
      setGhlHeaders(result.headers || []);
      setGhlRows(result.rows || []);
      setStartTime(formatDateTimeLocal(result.rows?.[0]?.[0]));
      setShowGhlEditor(true);
      const failureNote = result.failures?.length ? ` ${result.failures.length} article or image issue${result.failures.length === 1 ? "" : "s"} were skipped.` : "";
      if (!download) {
        setStatus(`${result.postCount} Facebook and Instagram posts are ready to edit.${failureNote}`);
        return;
      }
      const exported = await electronAPI.exportRepurposeGhlRows?.({ headers: result.headers, rows: result.rows, includeSourceLink: false });
      setStatus(exported?.success
        ? `Combined GHL CSV saved with ${exported.rowCount || result.postCount} posts: ${exported.filePath}.${failureNote}`
        : exported?.error || "GHL export canceled.");
    } catch (error) {
      setStatus(error.message || "Meta batch preparation failed.");
    } finally {
      setWorking(false);
    }
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
      const result = await electronAPI.generateMetaContent?.({
        article,
        research: currentResearch || {},
        goal,
        settings,
        sourceContext: sourceContext(selectedPinterestSource || selectedSource, article),
        jobKey: `meta-content-${Date.now()}`
      });
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

  function chooseSource(sourceId) {
    if (sourceId === selectedSourceId) return;
    setSelectedSourceId(sourceId);
    setImageAssets([]);
    setGhlRows([]);
    setShowGhlEditor(false);
    setStatus("Image changed. GHL will resize and host this selection automatically.");
  }

  async function reuseImage() {
    if (!article) return setStatus("Choose a completed article first.");
    if (!selectedSource) return setStatus("Generate a finished Pinterest Pin before repurposing it.");
    setWorking(true);
    setStatus("Cropping the selected image to one 1080 x 1350 Meta portrait with no new AI generation...");
    try {
      const nextContent = content || await freeMetaContent(copySource, article);
      if (!content) setContent(nextContent);
      const pack = projectPack({ projectId, article, goal, content: nextContent, imageAssets, source: copySource });
      const result = await electronAPI.createRepurposeImageVariants?.({
        packs: [pack],
        pins: sourcePins,
        articles,
        platforms: ["instagram", "facebook"],
        imageSource: selectedSource.kind,
        sourceAsset: selectedSource,
        sharedMetaPortrait: true
      });
      if (!result?.success) throw new Error(result?.error || "Could not reuse an image.");
      const nextAssets = result.packs?.[0]?.imageAssets || [];
      setImageAssets(nextAssets);
      if (!nextAssets.length) {
        setStatus("No reusable image was found for this article.");
        return;
      }
      const saved = await electronAPI.saveMetaProject?.({
        id: projectId,
        articleId: article.id,
        articleTitle: article.generatedTitle || article.title,
        sourceUrl: article.wordpressPostUrl || article.sourceUrl || "",
        geo,
        goal,
        research,
        content: nextContent,
        imageAssets: nextAssets,
        sourceContext: sourceContext(copySource, article),
        selectedSource: {
          id: selectedSource.id,
          kind: selectedSource.kind,
          label: selectedSource.label,
          pinId: selectedSource.pinId || ""
        },
        createdAt: projects.find((item) => item.id === projectId)?.createdAt || new Date().toISOString()
      });
      if (saved?.success) {
        setProjectId(saved.project.id);
        setProjects(saved.projects || []);
      }
      setStatus("Meta pack saved with one shared 4:5 Pinterest image for Facebook and Instagram.");
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
        sourceContext: sourceContext(copySource, article),
        selectedSource: selectedSource ? {
          id: selectedSource.id,
          kind: selectedSource.kind,
          label: selectedSource.label,
          pinId: selectedSource.pinId || ""
        } : null,
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
    setSelectedSourceId(project.selectedSource?.id || project.sourceContext?.imageSourceId || "");
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

  async function buildReadyGhlRows() {
    if (!article) throw new Error("Choose a completed article first.");
    if (!imageSource || imageSource.kind !== "pin") {
      throw new Error("Generate a finished Pinterest Pin before repurposing it.");
    }

    const nextContent = content || await freeMetaContent(copySource, article);
    if (!content) setContent(nextContent);
    let nextAssets = imageAssets;

    if (!hasPlatformMetaAssets(nextAssets)) {
      setStatus("Creating and hosting one shared 1080 x 1350 Meta image from the selected Pinterest artwork...");
      const initialPack = projectPack({
        projectId,
        article,
        goal,
        content: nextContent,
        imageAssets: nextAssets,
        source: copySource
      });
      const imageResult = await electronAPI.createRepurposeImageVariants?.({
        packs: [initialPack],
        pins: sourcePins,
        articles,
        platforms: ["instagram", "facebook"],
        imageSource: imageSource.kind,
        sourceAsset: imageSource,
        sharedMetaPortrait: true
      });
      if (!imageResult?.success) throw new Error(imageResult?.error || "Could not prepare the selected image.");
      nextAssets = imageResult.packs?.[0]?.imageAssets || [];
      if (!hasPlatformMetaAssets(nextAssets)) {
        throw new Error("The shared 4:5 Meta image could not be prepared. Choose another saved image and try again.");
      }
      setImageAssets(nextAssets);
    }

    const saved = await electronAPI.saveMetaProject?.({
      id: projectId,
      articleId: article.id,
      articleTitle: article.generatedTitle || article.title,
      sourceUrl: article.wordpressPostUrl || article.sourceUrl || "",
      geo,
      goal,
      research,
      content: nextContent,
      imageAssets: nextAssets,
      sourceContext: sourceContext(copySource, article),
      selectedSource: imageSource ? {
        id: imageSource.id,
        kind: imageSource.kind,
        label: imageSource.label,
        pinId: imageSource.pinId || ""
      } : null,
      systemPrepared: true,
      createdAt: projects.find((item) => item.id === projectId)?.createdAt || new Date().toISOString()
    });
    if (saved?.success) {
      setProjectId(saved.project.id);
      setProjects(saved.projects || []);
    }

    const readyPack = projectPack({
      projectId: saved?.project?.id || projectId,
      article,
      goal,
      content: nextContent,
      imageAssets: nextAssets,
      source: copySource
    });
    const result = await electronAPI.prepareRepurposeGhlRows?.({ packs: [readyPack] });
    if (!result?.success) throw new Error(result?.error || "Could not prepare GHL rows.");
    if (result.missingImageCount) {
      throw new Error("The Meta image could not be hosted publicly. Check the ImgBB key or WordPress media connection, then try again.");
    }

    const headers = result.headers || [];
    const rows = result.rows || [];
    setGhlHeaders(headers);
    setGhlRows(rows);
    setStartTime(formatDateTimeLocal(rows?.[0]?.[0]));
    return { headers, rows, result };
  }

  async function prepareGhl() {
    if (!article) return setStatus("Choose a completed article first.");
    let nextContent;
    try { nextContent = content || await freeMetaContent(copySource, article); }
    catch (error) { setStatus(error.message || 'Could not prepare recipe captions.'); return; }
    const nextQuality = scoreMetaContent(nextContent, {
      sourceUrl: article.wordpressPostUrl || article.sourceUrl || "",
      imageAssets
    });
    if (nextQuality.score < 70 && !await confirmAction({
      title: "Prepare lower-quality content",
      message: `Meta quality is ${nextQuality.score}/100. Prepare the GHL rows anyway?`,
      confirmLabel: "Prepare Anyway"
    })) return;
    setWorking(true);
    setStatus("Preparing the selected image and dedicated Facebook and Instagram posts...");
    try {
      const { rows } = await buildReadyGhlRows();
      setShowGhlEditor(true);
      setStatus(`GHL editor ready with ${rows.length} platform-specific posts and a public image URL.`);
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

  async function exportGhl(useEditedRows = false) {
    if (!article) return setStatus("Choose a completed article first.");
    setWorking(true);
    setStatus("Preparing the image and post text for the GHL CSV...");
    try {
      const prepared = useEditedRows && ghlRows.length
        ? { headers: ghlHeaders, rows: ghlRows }
        : await buildReadyGhlRows();
      setShowGhlEditor(true);
      const result = await electronAPI.exportRepurposeGhlRows?.({ headers: prepared.headers, rows: prepared.rows, includeSourceLink: false });
      setStatus(result?.success
        ? `GHL CSV saved with ${result.rowCount || prepared.rows.length} Facebook and Instagram posts: ${result.filePath}`
        : result?.error || "GHL export canceled.");
    } catch (error) {
      setStatus(error.message || "GHL export failed.");
    } finally {
      setWorking(false);
    }
  }

  async function uploadGhl(useEditedRows = false) {
    if (!article) return setStatus("Choose a completed article first.");
    setWorking(true);
    setStatus("Preparing the image and post text, then sending both posts to GHL...");
    try {
      const prepared = useEditedRows && ghlRows.length
        ? { headers: ghlHeaders, rows: ghlRows }
        : await buildReadyGhlRows();
      setShowGhlEditor(true);
      const result = await electronAPI.uploadRepurposeGhlRows?.({ headers: prepared.headers, rows: prepared.rows, includeSourceLink: false });
      if (result?.success) {
        const count = result.createdCount || prepared.rows.length;
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

  const activeImage = imageAssets.find(hasReusableMetaAsset);
  const activeImageUrl = activeImage
    ? activeImage.fileUrl || activeImage.publicUrl || activeImage.imgbbUrl || activeImage.remoteImageUrl || activeImage.imageUrl
    : displaySourceImage(imageSource);
  const preparedMetaAssets = imageAssets.filter((asset) => (
    hasReusableMetaAsset(asset) && ["instagram", "facebook"].includes(String(asset.platform || "").toLowerCase())
  ));
  const quality = useMemo(() => scoreMetaContent(content || {}, {
    sourceUrl: article?.wordpressPostUrl || article?.sourceUrl || "",
    imageAssets
  }), [article, content, imageAssets]);

  return (
    <section className="meta-workspace animate-fade-in">
      <SectionHeader eyebrow="Meta" title="Meta Studio" />

      <div className="meta-setup mb-5 grid min-w-0 items-start gap-5">
        <div className="workspace-band min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-indigo-600">Batch Workflow</div>
              <h2 className="mt-1 text-lg font-black text-slate-900">All Articles to GHL</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{selectedBulkIds.length} of {completedArticles.length} completed articles selected / {selectedBulkIds.length * 2} Facebook and Instagram posts</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="h-9 px-3" onClick={() => setBulkArticleIds(null)} disabled={!completedArticles.length}>Select All</Button>
              <Button variant="secondary" className="h-9 px-3" onClick={() => setBulkArticleIds([])} disabled={!selectedBulkIds.length}>Clear</Button>
            </div>
          </div>
          <div className="mt-4 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white">
            {completedArticles.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 hover:bg-slate-50">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" checked={selectedBulkSet.has(String(item.id))} onChange={() => toggleBulkArticle(item.id)} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-900">{item.generatedTitle || item.title}</span>
                </span>
              </label>
            ))}
            {!completedArticles.length ? <p className="p-4 text-sm font-semibold text-slate-500">No completed articles are available.</p> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => prepareBulkGhl({ download: true })} disabled={working || !selectedBulkIds.length}><Download className="h-4 w-4" />Create and Download All</Button>
            <Button variant="secondary" onClick={() => prepareBulkGhl({ download: false })} disabled={working || !selectedBulkIds.length}><Save className="h-4 w-4" />Prepare All for Editing</Button>
          </div>
          {bulkProgress?.status === "running" || bulkProgress?.status === "hosting" ? (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 text-sm font-black text-slate-700"><span className="truncate">{bulkProgress.title || "Preparing Meta batch"}</span><span>{bulkProgress.percent || 0}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-gradient-to-r from-indigo-600 to-violet-500 transition-[width]" style={{ width: `${bulkProgress.percent || 0}%` }} /></div>
              <p className="mt-2 text-xs font-bold text-slate-500">{bulkProgress.current || 0} of {bulkProgress.total || selectedBulkIds.length} articles prepared</p>
            </div>
          ) : null}
          {bulkProgress?.failures?.length ? (
            <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-100">
              {bulkProgress.failures.length} item{bulkProgress.failures.length === 1 ? "" : "s"} need attention. Successful articles remain in the combined CSV.
            </div>
          ) : null}
        </div>
        <div className="workspace-band min-w-0">
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
            <>
              <div className="rounded-md bg-slate-50 p-4 ring-1 ring-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-black uppercase text-indigo-600">Selected article</div>
                  {articleProject?.autoCreated ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">Meta draft ready / 0 credits</span>
                  ) : null}
                </div>
                <h2 className="mt-1 text-lg font-black text-slate-900">{article.generatedTitle || article.title}</h2>
                {articleProject?.autoCreated ? (
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Facebook and Instagram copy were stored automatically. A matching finished Pinterest image is preferred for the shared Meta crop.</p>
                ) : null}
              </div>
              <div className="mt-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-black text-slate-900">Pinterest Image for Meta</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">The finished Pinterest Pin is selected first, then fitted whole into 1080 x 1350 (4:5) over a softened copy of itself, so the headline and button are never cut. Facebook and Instagram share that same image.</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">No image credits</span>
                </div>
                {sourceCandidates.length ? (
                  <div className="mt-3 grid gap-3">
                    {sourceCandidates.map((source) => (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => chooseSource(source.id)}
                        className={`overflow-hidden rounded-md border text-left transition-colors ${
                          imageSource?.id === source.id
                            ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200"
                            : "border-slate-200 bg-white hover:border-violet-300"
                        }`}
                      >
                        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                          <img src={displaySourceImage(source)} alt={source.label} className="aspect-[3/2] h-full w-full bg-slate-100 object-contain" />
                          <div className="p-3 sm:pl-0">
                          <div className="text-xs font-black uppercase text-indigo-600">{source.label}</div>
                          {source.pinterestTitle ? <p className="mt-1 line-clamp-2 text-sm font-black leading-5 text-slate-900">{source.pinterestTitle}</p> : null}
                          {source.pinterestDescription ? <p className="mt-1 line-clamp-3 text-xs font-semibold leading-5 text-slate-500">{source.pinterestDescription}</p> : null}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm font-semibold text-slate-500">No finished Pinterest Pin is available.</p>
                )}
              </div>
            </>
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
            <Button onClick={generateContent} disabled={working || !article}><Sparkles className="h-4 w-4" />Optional AI Improvement</Button>
            <Button variant="secondary" onClick={reuseImage} disabled={working || !article || !selectedSource}><ImageIcon className="h-4 w-4" />Create 4:5 Meta Image</Button>
            <Button onClick={() => exportGhl(false)} disabled={working || !article || (!imageSource && !imageAssets.some(hasReusableMetaAsset))}><Download className="h-4 w-4" />Create and Download GHL CSV</Button>
            <Button variant="secondary" onClick={saveProject} disabled={working || !content}><Save className="h-4 w-4" />Save Campaign</Button>
          </div>
          {status ? <div className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{status}</div> : null}
        </div>

        <div className="workspace-band meta-campaign-library min-w-0">
          <h2 className="text-lg font-black text-slate-900">Campaign Library</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Saved independently from Repurpose Studio.</p>
          <div className="mt-4 space-y-2">
            {!projects.length ? <p className="rounded-md bg-slate-50 p-3 text-sm font-semibold text-slate-500">No saved Meta campaigns yet.</p> : projects.map((project) => (
              <div key={project.id} className={`rounded-md p-3 ring-1 ${projectId === project.id ? "bg-violet-50 ring-violet-200" : "bg-white ring-slate-200"}`}>
                <button type="button" className="w-full text-left" onClick={() => loadProject(project)}>
                  <div className="truncate text-sm font-black text-slate-900">{project.articleTitle || project.content?.campaignTitle}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-slate-500">
                    <span>{project.geo || "US"} / {project.goal || "traffic"}</span>
                    {project.autoCreated ? <span className="text-emerald-700">Automatic / 0 credits</span> : null}
                  </div>
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
                <p className="mt-1 text-sm font-semibold text-slate-500">Every Facebook and Instagram post is listed below in one vertical workflow.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-black ${quality.score >= 85 ? "bg-emerald-100 text-emerald-700" : quality.score >= 70 ? "bg-violet-100 text-violet-700" : "bg-rose-100 text-rose-700"}`}>
                  {quality.score >= 85 ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  Quality {quality.score}/100
                </div>
                <span className="rounded-md bg-slate-100 px-3 py-2 text-sm font-black text-slate-600">Facebook {quality.facebookScore}</span>
                <span className="rounded-md bg-slate-100 px-3 py-2 text-sm font-black text-slate-600">Instagram {quality.instagramScore}</span>
              </div>
            </div>

            <div className="mb-5 grid gap-4">
              <div className="grid gap-3 rounded-md bg-slate-50 p-4">
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

            <div className="space-y-6">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="mb-4 flex items-center gap-2 text-base font-black text-slate-900"><Facebook className="h-5 w-5 text-indigo-600" />Facebook Posts</h3>
                <div className="grid gap-4">
                <TextField label="Facebook Page Post" value={content.facebook?.primaryPost} onChange={(value) => updateFacebook("primaryPost", value)} rows={8} />
                <TextField label="Short Post" value={content.facebook?.shortPost} onChange={(value) => updateFacebook("shortPost", value)} rows={5} />
                <TextField label="Group Post" value={content.facebook?.groupPost} onChange={(value) => updateFacebook("groupPost", value)} rows={7} />
                <TextField label="Facebook Reel Caption" value={content.facebook?.reelCaption} onChange={(value) => updateFacebook("reelCaption", value)} rows={5} />
                <TextField label="Link Headline" value={content.facebook?.linkHeadline} onChange={(value) => updateFacebook("linkHeadline", value)} rows={2} />
                <TextField label="CTA" value={content.facebook?.cta} onChange={(value) => updateFacebook("cta", value)} rows={2} />
                <TextField label="Hashtags" value={hashtagsToText(content.facebook?.hashtags)} onChange={(value) => updateFacebook("hashtags", parseHashtags(value, 2))} rows={2} hint="Maximum 2." />
                <TextField label="Image Alt Text" value={content.facebook?.imageAltText} onChange={(value) => updateFacebook("imageAltText", value)} rows={2} />
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="mb-4 flex items-center gap-2 text-base font-black text-slate-900"><Instagram className="h-5 w-5 text-indigo-600" />Instagram Posts</h3>
                <div className="grid gap-4">
                  <TextField label="Instagram Feed Caption" value={content.instagram?.feedCaption} onChange={(value) => updateInstagram("feedCaption", value)} rows={8} />
                  <TextField label="Instagram Reel Caption" value={content.instagram?.reelCaption} onChange={(value) => updateInstagram("reelCaption", value)} rows={6} />
                  <TextField label="Reel Hook" value={content.instagram?.reelHook} onChange={(value) => updateInstagram("reelHook", value)} rows={2} />
                  <TextField label="Reel Voiceover" value={content.instagram?.reelVoiceover} onChange={(value) => updateInstagram("reelVoiceover", value)} rows={5} />
                  <TextField label="Reel Scenes" value={(content.instagram?.reelScenes || []).join("\n")} onChange={(value) => updateInstagram("reelScenes", value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 6))} rows={6} hint="One 9:16 scene per line. Use 3 to 6 scenes." />
                  <TextField label="Reel Production Notes" value={content.instagram?.reelProductionNotes} onChange={(value) => updateInstagram("reelProductionNotes", value)} rows={5} hint="Cover audio, captions, safe zones, and watermark use." />
                  <TextField label="CTA" value={content.instagram?.cta} onChange={(value) => updateInstagram("cta", value)} rows={2} />
                  <TextField label="Hashtags" value={hashtagsToText(content.instagram?.hashtags)} onChange={(value) => updateInstagram("hashtags", parseHashtags(value, 8))} rows={2} hint="Use 5 to 8 specific hashtags." />
                  <TextField label="Image Alt Text" value={content.instagram?.imageAltText} onChange={(value) => updateInstagram("imageAltText", value)} rows={2} />
                </div>
                <div className="mt-4 rounded-md bg-slate-50 p-4 ring-1 ring-slate-100">
                  <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-black text-slate-900">Carousel Slides</h3><Button variant="secondary" className="h-9 px-3" onClick={addCarouselSlide}>Add Slide</Button></div>
                  <div className="grid gap-3">{(content.instagram?.carouselSlides || []).map((slide, index) => (
                    <div key={index} className="rounded-md bg-white p-3 ring-1 ring-slate-200">
                      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-black uppercase text-slate-500">Slide {index + 1}</span><button type="button" title="Delete slide" onClick={() => removeCarouselSlide(index)} className="text-slate-400 hover:text-slate-700"><Trash2 className="h-4 w-4" /></button></div>
                      <input className={inputClass} value={slide.heading || ""} onChange={(event) => updateCarousel(index, "heading", event.target.value)} placeholder="Heading" />
                      <textarea className={`${inputClass} mt-2 resize-y`} rows={3} value={slide.body || ""} onChange={(event) => updateCarousel(index, "body", event.target.value)} placeholder="Slide body" />
                    </div>
                  ))}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-5 grid gap-4">
            <div className="soft-card rounded-lg p-4">
              <h2 className="text-lg font-black text-slate-900">Shared Meta Image</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">The selected Pinterest artwork is center-cropped once to 4:5 and shared by Facebook and Instagram.</p>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
                <span className="text-sm font-bold text-slate-700">{imageSource?.label || "No image selected"}</span>
                {imageSource ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">Selected automatically</span> : null}
              </div>
              <Button variant="secondary" className="mt-3 w-full" onClick={reuseImage} disabled={working || !imageSource}><ImageIcon className="h-4 w-4" />Refresh 4:5 Meta Image</Button>
              {preparedMetaAssets.length ? (
                <div className="mt-4 grid gap-4">
                  {preparedMetaAssets.map((asset) => (
                    <figure key={`${asset.platform}-${asset.filePath || asset.publicUrl || asset.imageUrl}`}>
                      <img
                        src={asset.fileUrl || asset.publicUrl || asset.imgbbUrl || asset.remoteImageUrl || asset.imageUrl}
                        alt={`${asset.platform} prepared post`}
                        className={`w-full rounded-md bg-slate-100 object-cover ${String(asset.platform).toLowerCase() === "facebook" ? "aspect-[1.91/1]" : "aspect-[4/5]"}`}
                      />
                      <figcaption className="mt-2 text-sm font-black text-slate-700">{asset.label} / {asset.width} x {asset.height}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : activeImageUrl ? <img src={activeImageUrl} alt={activeImage?.label || imageSource?.label || "Meta campaign"} className="mt-4 aspect-[3/2] w-full rounded-md bg-slate-100 object-contain" /> : null}
            </div>
            <div className="soft-card rounded-lg p-4">
              <h2 className="text-lg font-black text-slate-900">Schedule and Export</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">The app adds one Facebook row and one Instagram row, both pointing to the same verified 4:5 image URL.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={prepareGhl} disabled={working}><Download className="h-4 w-4" />Review GHL</Button>
                <Button onClick={() => exportGhl(false)} disabled={working}><Download className="h-4 w-4" />Download GHL CSV</Button>
                <Button onClick={() => uploadGhl(false)} disabled={working}><UploadCloud className="h-4 w-4" />Push to GHL</Button>
                <Button variant="secondary" onClick={saveProject} disabled={working}><Save className="h-4 w-4" />Save Campaign</Button>
              </div>
              {showGhlEditor ? (
                <div className="mt-4">
                  <div className="mb-3 flex flex-wrap items-end gap-2">
                    <Field label="Start Time"><input type="datetime-local" className={`${inputClass} w-56`} value={startTime} onChange={(event) => setStartTime(event.target.value)} /></Field>
                    <Field label="Interval Hours"><input type="number" min="1" className={`${inputClass} w-32`} value={intervalHours} onChange={(event) => setIntervalHours(event.target.value)} /></Field>
                    <Button variant="secondary" onClick={applySchedule}>Apply Time</Button>
                    <Button variant="secondary" onClick={() => exportGhl(true)}><Download className="h-4 w-4" />Export Edited CSV</Button>
                    <Button onClick={() => uploadGhl(true)} disabled={working}><UploadCloud className="h-4 w-4" />Upload Edited Rows</Button>
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
