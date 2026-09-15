import { Clipboard, ExternalLink, HardDrive, Image as ImageIcon, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { Button, EmptyState, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";

function articleImages(article) {
  const title = article.generatedTitle || article.title || "Untitled article";
  const items = [];
  const featuredUrl = article.featuredImageDisplay || article.featuredImageLocalUrl || article.featuredImage || "";
  if (featuredUrl || article.featuredImageLocalPath) {
    items.push({
      id: `${article.id}-featured`,
      source: "Article",
      type: "Featured",
      title,
      url: featuredUrl,
      path: article.featuredImageLocalPath || "",
      alt: article.featuredImageAlt || ""
    });
  }
  (article.images || []).forEach((image, index) => {
    const url = image.displayUrl || image.localUrl || image.url || "";
    if (!url && !image.localPath) return;
    items.push({
      id: `${article.id}-inline-${index}`,
      source: "Article",
      type: `In-Text ${index + 1}`,
      title,
      url,
      path: image.localPath || "",
      alt: image.altText || ""
    });
  });
  return items;
}

function pinImages(pin) {
  const url = pin.hostedImageUrl || pin.imgurUrl || pin.localImageUrl || pin.imageUrl || pin.remoteImageUrl || "";
  if (!url && !pin.localPath) return [];
  return [{
    id: `pin-${pin.id || pin.url || url}`,
    source: "Pin Creator",
    type: "Pinterest Pin",
    title: pin.title || pin.url || "Generated pin",
    url,
    path: pin.localPath || "",
    alt: pin.description || ""
  }];
}

function packImages(pack) {
  return (pack.imageAssets || []).map((asset, index) => ({
    id: `pack-${pack.id}-${index}`,
    source: "Repurpose",
    type: asset.label || asset.platform || "Social Image",
    title: pack.articleTitle || "Social pack",
    url: asset.fileUrl || "",
    path: asset.filePath || "",
    alt: `${asset.width || ""} x ${asset.height || ""}`.trim()
  }));
}

function bytes(value) {
  const amount = Number(value || 0);
  if (amount < 1024 * 1024) return `${Math.round(amount / 1024)} KB`;
  return `${(amount / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageLibrary({ articles, settings }) {
  const [pins, setPins] = useState([]);
  const [packs, setPacks] = useState([]);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("");
  const [storage, setStorage] = useState(null);
  const [cleanupReady, setCleanupReady] = useState(false);

  const loadStorage = useCallback(async () => {
    const result = await electronAPI.getMediaStorageStats?.({ olderThanDays: settings?.mediaRetentionDays || 7 });
    if (result?.success) setStorage(result);
  }, [settings?.mediaRetentionDays]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [pinResult, packResult] = await Promise.all([
        electronAPI.getPinCreatorPins?.(),
        electronAPI.getRepurposePacks?.()
      ]);
      if (!active) return;
      setPins(pinResult?.pins || []);
      setPacks(packResult?.packs || []);
      await loadStorage();
    })().catch((error) => setStatus(error.message || "Could not load image library."));
    return () => { active = false; };
  }, [loadStorage]);

  const images = useMemo(() => [
    ...(articles || []).flatMap(articleImages),
    ...pins.flatMap(pinImages),
    ...packs.flatMap(packImages)
  ].filter((item) => item.url || item.path), [articles, pins, packs]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return images.filter((item) => {
      const sourceMatches = source === "all" || item.source === source;
      const textMatches = [item.title, item.type, item.alt, item.url, item.path].join(" ").toLowerCase().includes(q);
      return sourceMatches && textMatches;
    });
  }, [images, query, source]);

  async function copy(value) {
    await navigator.clipboard.writeText(value || "");
    setStatus("Copied image reference.");
  }

  async function cleanUnused() {
    if (!cleanupReady) {
      const preview = await electronAPI.cleanupUnusedMedia?.({ olderThanDays: settings?.mediaRetentionDays || 7, dryRun: true });
      setCleanupReady(true);
      setStatus(preview?.unusedCount ? `${preview.unusedCount} unreferenced file${preview.unusedCount === 1 ? "" : "s"} can be removed. Click Clean Unused again to confirm.` : "No old unreferenced media was found.");
      return;
    }
    const result = await electronAPI.cleanupUnusedMedia?.({ olderThanDays: settings?.mediaRetentionDays || 7, dryRun: false });
    setCleanupReady(false);
    setStatus(result?.success ? `Removed ${result.deletedCount || 0} unused file${result.deletedCount === 1 ? "" : "s"} and freed ${bytes(result.deletedBytes)}.` : result?.errors?.[0] || "Media cleanup could not finish.");
    await loadStorage();
  }

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="Media" title="Image Library">
        Browse article images, generated Pinterest pins, and resized social assets from one place.
      </SectionHeader>

      <div className="mb-5 soft-card rounded-lg p-4">
        {storage ? <div className="mb-3 flex flex-col gap-3 rounded-md bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><HardDrive className="h-5 w-5 text-violet-600" /><div><div className="text-sm font-black text-slate-900">{storage.fileCount} managed files, {bytes(storage.totalBytes)}</div><div className="text-xs font-semibold text-slate-500">{storage.unusedCount} unreferenced files older than {storage.olderThanDays} days</div></div></div><Button variant={cleanupReady ? "danger" : "secondary"} onClick={cleanUnused} disabled={!storage.unusedCount}><Trash2 className="h-4 w-4" />{cleanupReady ? "Confirm Cleanup" : "Clean Unused"}</Button></div> : null}
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} h-12 pl-12`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search images, titles, alt text, paths..." />
          </label>
          <select className={`${inputClass} h-12`} value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">All sources</option>
            <option value="Article">Article</option>
            <option value="Pin Creator">Pin Creator</option>
            <option value="Repurpose">Repurpose</option>
          </select>
        </div>
        {status ? <div className="mt-3 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700">{status}</div> : null}
      </div>

      {!filtered.length ? (
        <EmptyState title="No images found">Generate articles, pins, or social image sizes, then they will appear here.</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((item) => (
            <article key={item.id} className="soft-card overflow-hidden rounded-lg">
              <div className="aspect-square bg-slate-100">
                {item.url ? <img src={item.url} alt={item.alt || item.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-400"><ImageIcon className="h-10 w-10" /></div>}
              </div>
              <div className="p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-700">{item.source}</span>
                  <span className="text-xs font-black uppercase text-slate-400">{item.type}</span>
                </div>
                <h2 className="line-clamp-2 min-h-12 text-sm font-black leading-6 text-slate-900">{item.title}</h2>
                <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-500">{item.alt || item.path || item.url}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" className="h-9 px-3" onClick={() => copy(item.url || item.path)}><Clipboard className="h-4 w-4" />Copy</Button>
                  {item.path ? <Button variant="secondary" className="h-9 px-3" onClick={() => electronAPI.openPath(item.path)}><ExternalLink className="h-4 w-4" />Open</Button> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
