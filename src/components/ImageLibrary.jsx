import { Clipboard, ExternalLink, Image as ImageIcon, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

export default function ImageLibrary({ articles }) {
  const [pins, setPins] = useState([]);
  const [packs, setPacks] = useState([]);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("");

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
    })().catch((error) => setStatus(error.message || "Could not load image library."));
    return () => { active = false; };
  }, []);

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

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="Media" title="Image Library">
        Browse article images, generated Pinterest pins, and resized social assets from one place.
      </SectionHeader>

      <div className="mb-5 soft-card rounded-lg p-4">
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
