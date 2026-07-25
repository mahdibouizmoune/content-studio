import { Clipboard, Download, Facebook, Hash, Image, Instagram, Link2, Mail, MessageCircle, Save, Search, Sparkles, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { Button, EmptyState, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { addUtmParams } from "@/lib/utm";

const platformOptions = [
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "facebook", label: "Facebook", icon: Facebook },
  { id: "threads", label: "Threads", icon: MessageCircle },
  { id: "reddit", label: "Reddit", icon: MessageCircle },
  { id: "pinterest", label: "Pinterest", icon: Hash },
  { id: "email", label: "Email", icon: Mail }
];

const campaignStyles = [
  { id: "traffic", label: "Traffic Builder" },
  { id: "recipe-save", label: "Recipe Save" },
  { id: "viral-hook", label: "Viral Hook" },
  { id: "seasonal", label: "Seasonal Push" },
  { id: "healthy", label: "Healthy Angle" },
  { id: "comfort", label: "Comfort Food" }
];

const imageSourceOptions = [
  { id: "auto", label: "Auto" },
  { id: "pin", label: "Pin Image" },
  { id: "article-featured", label: "Article Featured Image" },
  { id: "article-inline", label: "Article In-Text Image" }
];

function textFromPack(pack) {
  const data = pack.content || {};
  return [
    data.socialPost?.caption,
    data.instagram?.caption,
    data.facebook?.pagePost,
    ...(data.threads?.posts || []),
    data.reddit?.postTitle,
    data.reddit?.body,
    data.reddit?.commentSeed,
    data.pinterest?.description,
    data.email?.body
  ].filter(Boolean).join("\n\n");
}

function firstPackPlatform(pack) {
  return pack.content?.socialPost?.platforms?.[0] || pack.platforms?.[0] || "instagram";
}

function trackedPackSource(pack, contentId = "post_1") {
  return addUtmParams(pack.sourceUrl || "", firstPackPlatform(pack), pack.articleTitle || "social_post", contentId, "organic_social");
}

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="space-y-3 text-sm leading-6 text-slate-700">{children}</div>
    </div>
  );
}

function CopyButton({ text, onCopied }) {
  return (
    <Button
      variant="secondary"
      className="h-9 px-3"
      onClick={async () => {
        await navigator.clipboard.writeText(text || "");
        onCopied?.();
      }}
      disabled={!text}
    >
      <Clipboard className="h-4 w-4" />Copy
    </Button>
  );
}

function SocialField({ label, value, onChange, rows = 4, hint = "" }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase text-slate-500">{label}</span>
      <textarea className={`${inputClass} resize-y leading-6`} rows={rows} value={value || ""} onChange={(event) => onChange(event.target.value)} />
      {hint ? <span className="mt-1 block text-xs font-medium text-slate-500">{hint}</span> : null}
    </label>
  );
}

function hashtagText(value) {
  return Array.isArray(value) ? value.join(" ") : String(value || "");
}

function parseHashtags(value) {
  return String(value || "")
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.startsWith("#") ? tag : `#${tag}`);
}

function updateNestedValue(source, path, value) {
  const [key, ...rest] = path;
  if (!key) return value;
  return {
    ...(source || {}),
    [key]: rest.length ? updateNestedValue(source?.[key], rest, value) : value
  };
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

function PackPreview({ pack, onCopied, onEdit, onSave, dirty }) {
  const data = pack.content || {};
  const sourceUrl = trackedPackSource(pack);
  return (
    <article className="soft-card rounded-lg p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase text-indigo-600">{pack.campaignStyle}</div>
          <h2 className="mt-1 text-xl font-black leading-tight text-slate-900">{pack.articleTitle}</h2>
          {sourceUrl ? <div className="mt-1 truncate text-sm font-medium text-slate-500">{sourceUrl}</div> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={textFromPack(pack)} onCopied={onCopied} />
          {(data.instagram || data.facebook) ? (
            <Button onClick={onSave} disabled={!dirty}><Save className="h-4 w-4" />{dirty ? "Save Social Edits" : "Saved"}</Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {pack.imageAssets?.length ? (
          <Section title="Shared Social Image">
            <div className="grid grid-cols-2 gap-3">
              {pack.imageAssets.map((asset, index) => (
                <div key={`${asset.filePath}-${index}`} className="rounded-md bg-slate-50 p-2">
                  <img src={asset.fileUrl} alt={asset.label} className="aspect-square w-full rounded-md object-cover" />
                  <div className="mt-2 text-xs font-black text-slate-900">{asset.label}</div>
                  <div className="text-xs font-medium text-slate-500">{asset.width} x {asset.height}</div>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {data.socialPost && !data.instagram && !data.facebook ? (
          <Section title="GHL Post">
            <p className="whitespace-pre-line">{data.socialPost.caption}</p>
            <p className="font-bold text-indigo-600">{(data.socialPost.hashtags || []).join(" ")}</p>
            <p><strong>Platforms:</strong> {(data.socialPost.platforms || ["Instagram", "Facebook"]).join(", ")}</p>
          </Section>
        ) : null}

        {data.instagram ? (
          <Section title="Instagram Content">
            <SocialField label="Feed Caption" value={data.instagram.caption} onChange={(value) => onEdit(["content", "instagram", "caption"], value)} rows={7} hint="Strong first line, useful recipe detail, natural spacing, then one save CTA." />
            <SocialField label="Hashtags" value={hashtagText(data.instagram.hashtags)} onChange={(value) => onEdit(["content", "instagram", "hashtags"], parseHashtags(value))} rows={2} hint="Use 5 to 8 specific hashtags." />
            <SocialField label="Image Alt Text" value={data.instagram.altText} onChange={(value) => onEdit(["content", "instagram", "altText"], value)} rows={2} />
            <div className="rounded-md bg-slate-50 p-3">
              <div className="mb-1 font-black text-slate-900">Carousel</div>
              {(data.instagram.carouselSlides || []).map((slide, index) => (
                <p key={index}><strong>{index + 1}. {slide.heading}</strong>: {slide.body}</p>
              ))}
            </div>
            {data.instagram.reelScript ? (
              <div className="space-y-3 rounded-md bg-slate-50 p-3">
                <div className="mb-1 font-black text-slate-900">Reel</div>
                <SocialField label="Hook" value={data.instagram.reelScript.hook} onChange={(value) => onEdit(["content", "instagram", "reelScript", "hook"], value)} rows={2} />
                <SocialField label="Reel Caption" value={data.instagram.reelScript.caption} onChange={(value) => onEdit(["content", "instagram", "reelScript", "caption"], value)} rows={3} />
                <SocialField label="Voiceover" value={data.instagram.reelScript.voiceover} onChange={(value) => onEdit(["content", "instagram", "reelScript", "voiceover"], value)} rows={4} />
                <SocialField label="CTA" value={data.instagram.reelScript.cta} onChange={(value) => onEdit(["content", "instagram", "reelScript", "cta"], value)} rows={2} />
              </div>
            ) : null}
          </Section>
        ) : null}

        {data.facebook ? (
          <Section title="Facebook Content">
            <SocialField label="Page Post" value={data.facebook.pagePost} onChange={(value) => onEdit(["content", "facebook", "pagePost"], value)} rows={7} hint="Useful takeaway, one natural question, and a clear link CTA." />
            <SocialField label="Short Post" value={data.facebook.shortPost} onChange={(value) => onEdit(["content", "facebook", "shortPost"], value)} rows={4} />
            <SocialField label="Group Post" value={data.facebook.groupPost} onChange={(value) => onEdit(["content", "facebook", "groupPost"], value)} rows={6} hint="Discussion-first copy. Check each group's link rules before posting." />
            <SocialField label="Hashtags" value={hashtagText(data.facebook.hashtags)} onChange={(value) => onEdit(["content", "facebook", "hashtags"], parseHashtags(value))} rows={2} hint="Use zero to two relevant hashtags." />
            <SocialField label="Image Alt Text" value={data.facebook.altText} onChange={(value) => onEdit(["content", "facebook", "altText"], value)} rows={2} />
          </Section>
        ) : null}

        {data.threads ? (
          <Section title="Threads">
            {(data.threads.posts || []).map((post, index) => <p key={index}>{index + 1}. {post}</p>)}
          </Section>
        ) : null}

        {data.reddit ? (
          <Section title="Reddit">
            <p><strong>Post title:</strong> {data.reddit.postTitle}</p>
            <p className="whitespace-pre-line">{data.reddit.body}</p>
            <p><strong>Subreddit ideas:</strong> {(data.reddit.subredditIdeas || []).join(", ")}</p>
            <p><strong>First comment angle:</strong> {data.reddit.commentSeed}</p>
          </Section>
        ) : null}

        {data.pinterest ? (
          <Section title="Pinterest">
            <p><strong>Title:</strong> {data.pinterest.title}</p>
            <p><strong>Description:</strong> {data.pinterest.description}</p>
            <p><strong>Overlay:</strong> {data.pinterest.overlayText}</p>
            <p><strong>Keywords:</strong> {(data.pinterest.keywords || []).join(", ")}</p>
          </Section>
        ) : null}

        {data.email ? (
          <Section title="Email">
            <p><strong>Subject:</strong> {data.email.subject}</p>
            <p><strong>Preview:</strong> {data.email.previewText}</p>
            <p className="whitespace-pre-line">{data.email.body}</p>
          </Section>
        ) : null}
      </div>
    </article>
  );
}

export default function RepurposeStudio({ articles, settings, repurposeRefreshKey }) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [platforms, setPlatforms] = useState(["instagram", "facebook", "threads", "reddit", "pinterest"]);
  const [campaignStyle, setCampaignStyle] = useState("traffic");
  const [imageSource, setImageSource] = useState("auto");
  const [packs, setPacks] = useState([]);
  const [ghlHeaders, setGhlHeaders] = useState([]);
  const [ghlRows, setGhlRows] = useState([]);
  const [showGhlEditor, setShowGhlEditor] = useState(false);
  const [ghlStartTime, setGhlStartTime] = useState("");
  const [ghlIntervalHours, setGhlIntervalHours] = useState(String(Math.max(1, Math.round(Number(settings?.pinCreator?.postInterval || 120) / 60))));
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [dirtyPackIds, setDirtyPackIds] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await electronAPI.getRepurposePacks?.();
      if (!active || !result?.success || !result.packs?.length) return;
      setPacks(result.packs);
      setStatus(`Loaded ${result.packs.length} saved social pack${result.packs.length === 1 ? "" : "s"}.`);
    })().catch(() => {});
    return () => { active = false; };
  }, [repurposeRefreshKey]);

  const completed = useMemo(() => articles.filter((article) => article.queueStatus === "completed"), [articles]);
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return completed.filter((article) => [article.title, article.generatedTitle, article.wordpressPostUrl, article.sourceUrl].join(" ").toLowerCase().includes(q));
  }, [completed, query]);
  const selectedArticles = filtered.filter((article) => selectedIds.includes(article.id));

  function togglePlatform(id) {
    setPlatforms((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleArticle(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAll() {
    const ids = filtered.map((article) => article.id);
    const allSelected = ids.length && ids.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])]);
  }

  async function saveSharedPacks(nextPacks) {
    setPacks(nextPacks);
    setDirtyPackIds([]);
    setGhlRows([]);
    setShowGhlEditor(false);
    await electronAPI.saveRepurposePacks?.({ packs: nextPacks, replace: true, source: "repurposeStudio" });
  }

  function editPack(packId, path, value) {
    setPacks((current) => current.map((pack) => pack.id === packId ? updateNestedValue(pack, path, value) : pack));
    setDirtyPackIds((current) => current.includes(packId) ? current : [...current, packId]);
    setGhlRows([]);
    setShowGhlEditor(false);
  }

  async function saveSocialEdits() {
    setWorking(true);
    try {
      const result = await electronAPI.saveRepurposePacks?.({ packs, replace: true, source: "repurposeStudio" });
      if (!result?.success) throw new Error(result?.error || "Could not save social edits.");
      setDirtyPackIds([]);
      setStatus("Facebook and Instagram content saved. Reopen the GHL editor to use the updated copy.");
    } catch (error) {
      setStatus(error.message || "Could not save social edits.");
    } finally {
      setWorking(false);
    }
  }

  async function generatePacks() {
    if (!selectedArticles.length) {
      setStatus("Select at least one completed article.");
      return;
    }
    if (!platforms.length) {
      setStatus("Choose at least one platform.");
      return;
    }
    setWorking(true);
    setStatus("");
    try {
      const nextPacks = [];
      for (let index = 0; index < selectedArticles.length; index++) {
        const article = selectedArticles[index];
        setStatus(`Creating social pack ${index + 1}/${selectedArticles.length}: ${article.generatedTitle || article.title}`);
        const result = await electronAPI.generateRepurposePack({
          article,
          platforms,
          campaignStyle,
          settings,
          jobKey: `repurpose-${article.id}-${Date.now()}`
        });
        if (result?.pack) nextPacks.push(result.pack);
        if (result?.warning) setStatus(`Created with fallback: ${result.warning}`);
      }
      await saveSharedPacks(nextPacks);
      setStatus(`Created ${nextPacks.length} social pack${nextPacks.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error.message || "Could not create social packs.");
    } finally {
      setWorking(false);
    }
  }

  async function exportPacks() {
    if (!packs.length) {
      setStatus("Create or load social packs before editing the GHL CSV.");
      return;
    }
    setWorking(true);
    setStatus("Preparing editable GoHighLevel CSV...");
    try {
      const result = await electronAPI.prepareRepurposeGhlRows({ packs });
      if (result.success) {
        if (Array.isArray(result.packs) && result.packs.length) await saveSharedPacks(result.packs);
        setGhlHeaders(result.headers || []);
        setGhlRows(result.rows || []);
        setGhlStartTime(formatDateTimeLocal(result.rows?.[0]?.[0]));
        setGhlIntervalHours(String(Math.max(1, Math.round(Number(settings?.pinCreator?.postInterval || 120) / 60))));
        setShowGhlEditor(true);
        const imageNote = result.missingImageCount ? ` ${result.missingImageCount} row${result.missingImageCount === 1 ? "" : "s"} need image URLs added before upload.` : "";
        setStatus(`Editable GoHighLevel CSV is ready.${imageNote}`);
      }
      else setStatus(result.error || "Export failed.");
    } catch (error) {
      setStatus(error.message || "Could not prepare the CSV editor.");
    } finally {
      setWorking(false);
    }
  }

  function updateGhlCell(rowIndex, columnIndex, value) {
    setGhlRows((rows) => rows.map((row, index) => {
      if (index !== rowIndex) return row;
      const next = [...row];
      next[columnIndex] = value;
      return next;
    }));
  }

  function applyGhlSchedule() {
    const minStart = new Date(Date.now() + 30 * 60 * 1000);
    const parsedStart = parseScheduleDate(ghlStartTime);
    const start = parsedStart < minStart ? minStart : parsedStart;
    const intervalHours = Math.max(1, Number(ghlIntervalHours || 1));
    const intervalMs = intervalHours * 60 * 60 * 1000;
    setGhlRows((rows) => rows.map((row, index) => {
      const next = [...row];
      next[0] = formatScheduleDate(new Date(start.getTime() + index * intervalMs));
      return next;
    }));
    setStatus(`Applied ${intervalHours}-hour spacing to ${ghlRows.length} row${ghlRows.length === 1 ? "" : "s"}.`);
  }

  async function exportEditedPacks() {
    if (!ghlRows.length) {
      setStatus("Open the GHL CSV editor first.");
      return;
    }
    setWorking(true);
    setStatus("Saving edited GoHighLevel CSV...");
    try {
      const result = await electronAPI.exportRepurposeGhlRows({ headers: ghlHeaders, rows: ghlRows });
      if (result.success) {
        const imageNote = result.missingImageCount ? ` ${result.missingImageCount} row${result.missingImageCount === 1 ? "" : "s"} need image URLs added in GHL.` : "";
        setStatus(`Saved edited GoHighLevel CSV: ${result.filePath}.${imageNote}`);
      }
      else if (result.canceled) setStatus("Export canceled.");
      else setStatus(result.error || "Export failed.");
    } catch (error) {
      setStatus(error.message || "Export failed.");
    } finally {
      setWorking(false);
    }
  }

  async function uploadEditedPacks() {
    if (!ghlRows.length) {
      setStatus("Open the GHL CSV editor first.");
      return;
    }
    const hasSocialAccounts = settings?.ghlSocialAccountIds || settings?.ghlInstagramAccountIds || settings?.ghlFacebookAccountIds;
    if (!settings?.ghlApiToken || !settings?.ghlLocationId || !hasSocialAccounts || !settings?.ghlUserId) {
      setStatus("Add your GoHighLevel token, Location ID, Social Account IDs, and User ID in Settings first.");
      return;
    }
    setWorking(true);
    setStatus("Scheduling posts in GoHighLevel Social Planner...");
    try {
      const result = await electronAPI.uploadRepurposeGhlRows({ headers: ghlHeaders, rows: ghlRows });
      if (result.success) {
        const imageNote = result.missingImageCount ? ` ${result.missingImageCount} row${result.missingImageCount === 1 ? "" : "s"} uploaded without image URLs.` : "";
        const count = result.createdCount || result.rowCount || ghlRows.length;
        const verificationNote = result.unverifiedCount
          ? ` ${result.verifiedCount || 0} verified in the planner; ${result.unverifiedCount} accepted but not yet confirmed.`
          : ` ${result.verifiedCount || count} verified in the planner.`;
        setStatus(`Scheduled ${count} post${count === 1 ? "" : "s"} in GoHighLevel Social Planner.${verificationNote}${imageNote}`);
      }
      else setStatus(result.error || "GoHighLevel upload failed.");
    } catch (error) {
      setStatus(error.message || "GoHighLevel upload failed.");
    } finally {
      setWorking(false);
    }
  }

  async function createImageVariants() {
    if (!packs.length) {
      setStatus("Create social packs before resizing images.");
      return;
    }
    if (!platforms.includes("instagram") && !platforms.includes("facebook")) {
      setStatus("Choose Instagram or Facebook to create image sizes.");
      return;
    }
    setWorking(true);
    setStatus("Finding Pin Creator images and resizing locally...");
    try {
      const pinResult = await electronAPI.getPinCreatorPins?.();
      const pins = pinResult?.pins || [];
      const fallbackPins = (() => {
        try { return JSON.parse(localStorage.getItem("pins") || "[]"); } catch { return []; }
      })();
      const result = await electronAPI.createRepurposeImageVariants({
        packs,
        pins: pins.length ? pins : fallbackPins,
        articles,
        platforms,
        imageSource
      });
      if (!result.success) {
        setStatus(result.error || "Could not resize Pin Creator images.");
        return;
      }
      await saveSharedPacks(result.packs || packs);
      const missingText = result.missing?.length ? ` Missing images for ${result.missing.length} article${result.missing.length === 1 ? "" : "s"}.` : "";
      setStatus(`Created one shared Instagram/Facebook image per pack from ${imageSourceOptions.find((item) => item.id === imageSource)?.label || "selected images"}.${missingText}`);
    } catch (error) {
      setStatus(error.message || "Could not resize Pin Creator images.");
    } finally {
      setWorking(false);
    }
  }

  async function sendToPinCreator() {
    const pinterestPacks = packs.filter((pack) => pack.content?.pinterest);
    if (!pinterestPacks.length) {
      setStatus("Generate Pinterest content first.");
      return;
    }
    const items = pinterestPacks.map((pack) => ({
      url: trackedPackSource(pack, "pin_1") || pack.sourceUrl || `content-studio://article/${encodeURIComponent(pack.articleId)}`,
      articleId: pack.articleId,
      title: pack.articleTitle,
      queueType: "article",
      addedAt: new Date().toISOString()
    }));
    await electronAPI.appendPinQueue(items);
    await electronAPI.openPinCreator?.();
    setStatus(`Sent ${items.length} link${items.length === 1 ? "" : "s"} to Pin Creator.`);
  }

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="Repurpose" title="Repurpose Studio">
        Create dedicated Instagram and Facebook content from each article, reuse your existing image, then edit and schedule each platform separately.
      </SectionHeader>

      <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="soft-card rounded-lg p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative block flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} h-12 pl-12`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search completed articles..." />
            </label>
            <label className="flex items-center gap-3 text-sm font-black text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={filtered.length > 0 && filtered.every((article) => selectedIds.includes(article.id))} onChange={toggleAll} />
              {selectedArticles.length} selected
            </label>
          </div>

          <div className="max-h-[460px] overflow-auto rounded-lg border border-slate-200">
            {!filtered.length ? (
              <div className="p-5"><EmptyState title="No completed articles">Generate articles first, then come back here to repurpose them.</EmptyState></div>
            ) : filtered.map((article) => (
              <label key={article.id} className="grid cursor-pointer gap-3 border-b border-slate-100 p-4 last:border-b-0 sm:grid-cols-[24px_1fr_auto] sm:items-center hover:bg-slate-50">
                <input type="checkbox" className="mt-1 h-5 w-5 sm:mt-0" checked={selectedIds.includes(article.id)} onChange={() => toggleArticle(article.id)} />
                <span className="min-w-0">
                  <span className="block truncate text-base font-black text-slate-900">{article.generatedTitle || article.title}</span>
                  <span className="mt-1 block truncate text-sm font-medium text-slate-500">{article.wordpressPostUrl || article.sourceUrl || "Local article"}</span>
                </span>
                <span className="text-xs font-black uppercase text-indigo-600">{article.type || "article"}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="soft-card rounded-lg p-4">
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-bold text-slate-700">Campaign Style</label>
            <select className={inputClass} value={campaignStyle} onChange={(event) => setCampaignStyle(event.target.value)}>
              {campaignStyles.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
            </select>
          </div>

          <div className="mb-5">
            <div className="mb-2 text-sm font-bold text-slate-700">Platforms</div>
            <div className="grid grid-cols-2 gap-2">
              {platformOptions.map((platform) => {
                const Icon = platform.icon;
                const active = platforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => togglePlatform(platform.id)}
                    className={`flex items-center gap-2 rounded-md px-3 py-3 text-sm font-black ring-1 transition ${active ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
                  >
                    <Icon className="h-4 w-4" />{platform.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-bold text-slate-700">Image Source</label>
            <select className={inputClass} value={imageSource} onChange={(event) => setImageSource(event.target.value)}>
              {imageSourceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <p className="mt-1.5 text-xs font-medium leading-5 text-slate-500">Auto uses pin image first, then featured image, then the first in-text image.</p>
          </div>

          <div className="grid gap-2">
            <Button onClick={generatePacks} disabled={working || !selectedArticles.length}><Sparkles className="h-4 w-4" />Create Social Pack</Button>
            <Button variant="secondary" onClick={createImageVariants} disabled={working || !packs.length}><Image className="h-4 w-4" />Reuse Existing Images</Button>
            <Button variant="secondary" onClick={exportPacks} disabled={working || !packs.length}><Download className="h-4 w-4" />Edit GHL CSV</Button>
            <Button variant="secondary" onClick={exportEditedPacks} disabled={working || !ghlRows.length}><Download className="h-4 w-4" />Export Edited CSV</Button>
            <Button variant="secondary" onClick={uploadEditedPacks} disabled={working || !ghlRows.length}><UploadCloud className="h-4 w-4" />Upload to GHL</Button>
            <Button variant="secondary" onClick={sendToPinCreator} disabled={working || !packs.length}><Link2 className="h-4 w-4" />Send to Pin Creator</Button>
          </div>
          {status ? <div className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{status}</div> : null}
        </div>
      </div>

      {showGhlEditor ? (
        <div className="mb-5 soft-card rounded-lg p-4">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">GoHighLevel CSV Editor</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{ghlRows.length} row{ghlRows.length === 1 ? "" : "s"} ready. Edit any field before export.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block text-xs font-black uppercase text-slate-500">
                Start Time
                <input className={`${inputClass} mt-1 h-10 w-56`} type="datetime-local" value={ghlStartTime} onChange={(event) => setGhlStartTime(event.target.value)} />
              </label>
              <label className="block text-xs font-black uppercase text-slate-500">
                Interval Hours
                <input className={`${inputClass} mt-1 h-10 w-36`} type="number" min="1" step="1" value={ghlIntervalHours} onChange={(event) => setGhlIntervalHours(event.target.value)} />
              </label>
              <Button variant="secondary" className="h-10" onClick={applyGhlSchedule} disabled={!ghlRows.length}>Apply Time</Button>
              <Button className="h-10" onClick={exportEditedPacks} disabled={working || !ghlRows.length}><Download className="h-4 w-4" />Export Edited CSV</Button>
              <Button variant="secondary" className="h-10" onClick={uploadEditedPacks} disabled={working || !ghlRows.length}><UploadCloud className="h-4 w-4" />Upload to GHL</Button>
            </div>
          </div>
          <div className="max-h-[560px] overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-max border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  {ghlHeaders.map((header, index) => (
                    <th key={`${header}-${index}`} className="border-b border-slate-200 px-3 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ghlRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-slate-100 align-top last:border-b-0">
                    {ghlHeaders.map((header, columnIndex) => {
                      const isLong = /content|comment/i.test(header);
                      return (
                        <td key={`${rowIndex}-${columnIndex}`} className="px-3 py-3">
                          {isLong ? (
                            <textarea
                              className={`${inputClass} h-28 min-w-[360px] resize-y text-sm leading-6`}
                              value={row[columnIndex] || ""}
                              onChange={(event) => updateGhlCell(rowIndex, columnIndex, event.target.value)}
                            />
                          ) : (
                            <input
                              className={`${inputClass} h-10 min-w-[190px] text-sm`}
                              value={row[columnIndex] || ""}
                              onChange={(event) => updateGhlCell(rowIndex, columnIndex, event.target.value)}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4">
        {!packs.length ? (
          <EmptyState title="No social packs yet">Create pins first, then send them from Pin Creator to Repurpose Studio.</EmptyState>
        ) : packs.map((pack) => (
          <PackPreview
            key={pack.id}
            pack={pack}
            dirty={dirtyPackIds.includes(pack.id)}
            onEdit={(path, value) => editPack(pack.id, path, value)}
            onSave={saveSocialEdits}
            onCopied={() => setStatus("Copied to clipboard.")}
          />
        ))}
      </div>
    </section>
  );
}
